// compares input shapes for Jev on the judge-rule fixtures, all using the contrast choice that won the
// phrasing experiment. every shape is one call per fixture; the fixture under test is never among its own
// reference examples.
//
//   pnpm script scripts/eval-jev-shapes.ts [--rule <id>]

import { parseArgs } from 'node:util';

import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { EntryType } from '@typesafe-ai/sdk';

import { Detect, loadRules } from '../src/rule.js';
import type { Example, JudgeRule } from '../src/rule.js';
import { mapConcurrent } from '../src/shared/concurrency.js';
import { logger } from '../src/shared/log.js';
import { RULES_DIR } from '../src/shared/paths.js';

const { values } = parseArgs({
	options: {
		rule: { type: 'string' },
	},
	strict: true,
});

const Kind = {
	BAD: 'bad',
	GOOD: 'good',
} as const;

type Kind = (typeof Kind)[keyof typeof Kind];

type Fixture = {
	rule: JudgeRule;
	example: Example;
	kind: Kind;
};

// a shape builds the state for one fixture; the question is always the same contrast choice
type Shape = {
	name: string;
	state(fixture: Fixture): EntryType;
	instructions: string;
	violates: string;
	follows: string;
};

type Verdict = {
	ruleId: string;
	kind: Kind;
	probability: ReadonlyMap<string, number>;
};

type ShapeStats = {
	correct: number;
	separable: number;
	meanSeparation: number;
};

function code(example: Example) {
	return {
		language: example.lang === 'ts' ? 'TypeScript' : 'Go',
		source: example.source,
	};
}

function references({ rule, example }: Fixture) {
	return {
		violates: rule.bad.filter(other => other !== example).map(other => other.source),
		follows: rule.good.filter(other => other !== example).map(other => other.source),
	};
}

const SHAPES: readonly Shape[] = [
	{
		name: 'baseline',
		state: fixture => ({
			...code(fixture.example),
			code: fixture.example.source,
			rule: {
				id: fixture.rule.id,
				message: fixture.rule.message,
				why: fixture.rule.why,
				notAViolation: [...fixture.rule.falsePositives],
				examples: { bad: references(fixture).violates, good: references(fixture).follows },
			},
		}),
		instructions: 'With respect to `rule`, which set does `code` belong with?',
		violates: 'code has the same problem as rule.examples.bad',
		follows: 'code is written the way rule.examples.good is, or is an accepted exception in rule.notAViolation',
	},
	{
		name: 'semantic',
		state: fixture => ({
			code: code(fixture.example),
			rule: {
				violation: fixture.rule.message,
				reasoning: fixture.rule.why,
				exceptions: [...fixture.rule.falsePositives],
				...references(fixture),
			},
		}),
		instructions:
			'Does `code` violate `rule` like the examples in `rule.violates`, or follow it like `rule.follows`?',
		violates: 'code contains the violation',
		follows: 'code follows the rule or is one of rule.exceptions',
	},
	{
		name: 'no-reasoning',
		state: fixture => ({
			code: code(fixture.example),
			rule: {
				violation: fixture.rule.message,
				exceptions: [...fixture.rule.falsePositives],
				...references(fixture),
			},
		}),
		instructions:
			'Does `code` violate `rule` like the examples in `rule.violates`, or follow it like `rule.follows`?',
		violates: 'code contains the violation',
		follows: 'code follows the rule or is one of rule.exceptions',
	},
	{
		name: 'no-message',
		state: fixture => ({
			code: code(fixture.example),
			rule: {
				reasoning: fixture.rule.why,
				exceptions: [...fixture.rule.falsePositives],
				...references(fixture),
			},
		}),
		instructions:
			'Does `code` violate `rule` like the examples in `rule.violates`, or follow it like `rule.follows`?',
		violates: 'code contains the violation',
		follows: 'code follows the rule or is one of rule.exceptions',
	},
	{
		name: 'no-exceptions',
		state: fixture => ({
			code: code(fixture.example),
			rule: {
				violation: fixture.rule.message,
				reasoning: fixture.rule.why,
				...references(fixture),
			},
		}),
		instructions:
			'Does `code` violate `rule` like the examples in `rule.violates`, or follow it like `rule.follows`?',
		violates: 'code contains the violation',
		follows: 'code follows the rule',
	},
	{
		name: 'examples-only',
		state: fixture => ({
			code: code(fixture.example),
			...references(fixture),
		}),
		instructions: 'Which set does `code` belong with?',
		violates: 'code shares the problem shown in `violates`',
		follows: 'code is written like `follows`',
	},
];

const THRESHOLD = 0.5;

async function main(): Promise<void> {
	const client = new TypeSafeClient();
	const rules = (await loadRules(RULES_DIR)).filter(
		(rule): rule is JudgeRule =>
			rule.detect === Detect.JUDGE && (values.rule === undefined || rule.id === values.rule)
	);

	if (rules.length === 0) {
		throw new Error('no judge rules matched');
	}

	const fixtures: Fixture[] = rules.flatMap(rule => [
		...rule.bad.map(example => ({ rule, example, kind: Kind.BAD })),
		...rule.good.map(example => ({ rule, example, kind: Kind.GOOD })),
	]);

	let inputTokens = 0;

	const verdicts = await mapConcurrent(
		fixtures,
		async (fixture): Promise<Verdict> => {
			const probability = new Map<string, number>();

			for (const shape of SHAPES) {
				const { answers, usage } = await client.systemOne({
					state: shape.state(fixture),
					questions: {
						verdict: {
							type: 'choice',
							instructions: shape.instructions,
							criteria: { violates: shape.violates, follows: shape.follows },
						},
					},
				});

				inputTokens += usage.input_tokens;
				probability.set(shape.name, answers.verdict.probabilities.violates);
			}

			return { ruleId: fixture.rule.id, kind: fixture.kind, probability };
		},
		{ concurrency: 8 }
	);

	printRuleTable(rules, verdicts);
	printTotals(rules, verdicts);
	logger.info({ calls: verdicts.length * SHAPES.length, inputTokens }, 'done');
}

function separation(shape: string, verdicts: readonly Verdict[]): number {
	const bad = verdicts
		.filter(verdict => verdict.kind === Kind.BAD)
		.map(verdict => verdict.probability.get(shape) ?? 0);
	const good = verdicts
		.filter(verdict => verdict.kind === Kind.GOOD)
		.map(verdict => verdict.probability.get(shape) ?? 0);

	return Math.min(...bad) - Math.max(...good, 0);
}

function isCorrect(verdict: Verdict, shape: string): boolean {
	const probability = verdict.probability.get(shape) ?? 0;

	return verdict.kind === Kind.BAD ? probability >= THRESHOLD : probability < THRESHOLD;
}

function statsFor(shape: string, rules: readonly JudgeRule[], verdicts: readonly Verdict[]): ShapeStats {
	const separations = rules.map(rule =>
		separation(
			shape,
			verdicts.filter(verdict => verdict.ruleId === rule.id)
		)
	);

	return {
		correct: verdicts.filter(verdict => isCorrect(verdict, shape)).length,
		separable: separations.filter(value => value > 0).length,
		meanSeparation: separations.reduce((sum, value) => sum + value, 0) / separations.length,
	};
}

function printRuleTable(rules: readonly JudgeRule[], verdicts: readonly Verdict[]): void {
	const header = SHAPES.map(shape => shape.name.padStart(13)).join(' ');
	process.stdout.write(`${'rule (separation per shape)'.padEnd(46)} ${header}\n`);

	for (const rule of rules) {
		const own = verdicts.filter(verdict => verdict.ruleId === rule.id);
		const cells = SHAPES.map(shape => formatSigned(separation(shape.name, own)).padStart(13)).join(' ');

		process.stdout.write(`${rule.id.padEnd(46)} ${cells}\n`);
	}
}

function printTotals(rules: readonly JudgeRule[], verdicts: readonly Verdict[]): void {
	process.stdout.write('\n');

	for (const shape of SHAPES) {
		const stats = statsFor(shape.name, rules, verdicts);

		process.stdout.write(
			`${shape.name.padEnd(14)} ${stats.correct}/${verdicts.length} correct at ${THRESHOLD}   ${stats.separable}/${rules.length} rules separable   mean separation ${formatSigned(stats.meanSeparation)}\n`
		);
	}
}

function formatSigned(value: number): string {
	return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

main().catch((error: unknown) => {
	logger.error({ err: error }, 'eval-jev-shapes failed');
	process.exitCode = 1;
});
