// evaluates Jev on the judge-rule fixtures. each shape is one call per fixture; the fixture under test is
// never among its own reference examples. cents per run.
//
//   pnpm script scripts/eval-jev.ts [--rule <id>] [--shape <name>]

import { parseArgs } from 'node:util';

import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { ChoiceQuestion, EntryType } from '@typesafe-ai/sdk';

import { Verdict, languageName, ruleQuestion } from '../src/analyzers/jev.js';
import { Detect, loadRules } from '../src/rule.js';
import type { Example, JudgeRule } from '../src/rule.js';
import { mapConcurrent } from '../src/shared/concurrency.js';
import { logger } from '../src/shared/log.js';
import { RULES_DIR } from '../src/shared/paths.js';

const { values } = parseArgs({
	options: {
		rule: { type: 'string' },
		shape: { type: 'string' },
	},
	strict: true,
});

const THRESHOLD = 0.5;

const Kind = {
	BAD: 'bad',
	GOOD: 'good',
} as const;

type Kind = (typeof Kind)[keyof typeof Kind];

type Fixture = {
	rule: JudgeRule;
	example: Example;
	kind: Kind;
	// 1-based position within the rule's bad or good examples
	index: number;
};

// a shape decides what goes in the state and how the question is asked
type Shape = {
	name: string;
	state(fixture: Fixture): EntryType;
	question(fixture: Fixture): ChoiceQuestion;
};

type Result = {
	ruleId: string;
	kind: Kind;
	index: number;
	probability: ReadonlyMap<string, number>;
};

type ShapeStats = {
	correct: number;
	separable: number;
	meanSeparation: number;
};

// the rule with the fixture under test removed from its own examples
function heldOut({ rule, example }: Fixture): JudgeRule {
	return {
		...rule,
		bad: rule.bad.filter(other => other !== example),
		good: rule.good.filter(other => other !== example),
	};
}

const SHAPES: readonly Shape[] = [
	{
		// the previous winner: rule and examples in the state, generic contrast question
		name: 'baseline',
		state: fixture => {
			const rule = heldOut(fixture);

			return {
				language: languageName(fixture.example.lang),
				code: fixture.example.source,
				rule: {
					id: rule.id,
					message: rule.message,
					why: rule.why,
					notAViolation: [...rule.falsePositives],
					examples: {
						bad: rule.bad.map(example => example.source),
						good: rule.good.map(example => example.source),
					},
				},
			};
		},
		question: () => ({
			type: 'choice',
			instructions: 'With respect to `rule`, which set does `code` belong with?',
			criteria: {
				violates: 'code has the same problem as rule.examples.bad',
				follows:
					'code is written the way rule.examples.good is, or is an accepted exception in rule.notAViolation',
			},
		}),
	},
	{
		// the docs' shape: code alone in the state, the rule as a structured rubric inside the question
		name: 'rubric',
		state: fixture => ({
			code: { language: languageName(fixture.example.lang), path: '', source: fixture.example.source },
		}),
		question: fixture => ruleQuestion(heldOut(fixture), { notApplicable: false }),
	},
	{
		// same, with a third option for code the rule has nothing to say about
		name: 'rubric-na',
		state: fixture => ({
			code: { language: languageName(fixture.example.lang), path: '', source: fixture.example.source },
		}),
		question: fixture => ruleQuestion(heldOut(fixture), { notApplicable: true }),
	},
];

const shapes = SHAPES.filter(shape => values.shape === undefined || shape.name === values.shape);

async function main(): Promise<void> {
	const client = new TypeSafeClient();
	const rules = (await loadRules(RULES_DIR)).filter(
		(rule): rule is JudgeRule =>
			rule.detect === Detect.JUDGE && (values.rule === undefined || rule.id === values.rule)
	);

	if (rules.length === 0) {
		throw new Error('no judge rules matched');
	}

	if (shapes.length === 0) {
		throw new Error(`unknown shape; one of ${SHAPES.map(shape => shape.name).join(', ')}`);
	}

	const fixtures: Fixture[] = rules.flatMap(rule => [
		...rule.bad.map((example, index) => ({ rule, example, kind: Kind.BAD, index: index + 1 })),
		...rule.good.map((example, index) => ({ rule, example, kind: Kind.GOOD, index: index + 1 })),
	]);

	let inputTokens = 0;

	const results = await mapConcurrent(
		fixtures,
		async (fixture): Promise<Result> => {
			const probability = new Map<string, number>();

			for (const shape of shapes) {
				const { answers, usage } = await client.systemOne({
					state: shape.state(fixture),
					questions: { verdict: shape.question(fixture) },
				});

				inputTokens += usage.input_tokens;
				probability.set(shape.name, answers.verdict.probabilities[Verdict.VIOLATES] ?? 0);
			}

			return { ruleId: fixture.rule.id, kind: fixture.kind, index: fixture.index, probability };
		},
		{ concurrency: 8 }
	);

	printRuleTable(rules, results);
	printTotals(rules, results);
	printMisses(results);
	logger.info({ calls: results.length * shapes.length, inputTokens }, 'done');
}

// smallest bad probability minus largest good probability; positive means some threshold is perfect
function separation(shape: string, results: readonly Result[]): number {
	const bad = results.filter(result => result.kind === Kind.BAD).map(result => result.probability.get(shape) ?? 0);
	const good = results.filter(result => result.kind === Kind.GOOD).map(result => result.probability.get(shape) ?? 0);

	return Math.min(...bad) - Math.max(...good, 0);
}

function isCorrect(result: Result, shape: string): boolean {
	const probability = result.probability.get(shape) ?? 0;

	return result.kind === Kind.BAD ? probability >= THRESHOLD : probability < THRESHOLD;
}

function statsFor(shape: string, rules: readonly JudgeRule[], results: readonly Result[]): ShapeStats {
	const separations = rules.map(rule =>
		separation(
			shape,
			results.filter(result => result.ruleId === rule.id)
		)
	);

	return {
		correct: results.filter(result => isCorrect(result, shape)).length,
		separable: separations.filter(value => value > 0).length,
		meanSeparation: separations.reduce((sum, value) => sum + value, 0) / separations.length,
	};
}

function printRuleTable(rules: readonly JudgeRule[], results: readonly Result[]): void {
	const header = shapes.map(shape => shape.name.padStart(11)).join(' ');
	process.stdout.write(`${'rule (separation per shape)'.padEnd(46)} ${header}\n`);

	for (const rule of rules) {
		const own = results.filter(result => result.ruleId === rule.id);
		const cells = shapes.map(shape => formatSigned(separation(shape.name, own)).padStart(11)).join(' ');

		process.stdout.write(`${rule.id.padEnd(46)} ${cells}\n`);
	}
}

function printTotals(rules: readonly JudgeRule[], results: readonly Result[]): void {
	process.stdout.write('\n');

	for (const shape of shapes) {
		const stats = statsFor(shape.name, rules, results);

		process.stdout.write(
			`${shape.name.padEnd(11)} ${stats.correct}/${results.length} correct at ${THRESHOLD}   ${stats.separable}/${rules.length} rules separable   mean separation ${formatSigned(stats.meanSeparation)}\n`
		);
	}
}

// every fixture on the wrong side of the threshold, so the offending example can be read and fixed
function printMisses(results: readonly Result[]): void {
	const misses = results.flatMap(result =>
		shapes
			.filter(shape => !isCorrect(result, shape.name))
			.map(shape => {
				const probability = (result.probability.get(shape.name) ?? 0).toFixed(2);

				return `  ${shape.name.padEnd(11)} ${result.ruleId.padEnd(46)} ${result.kind} example ${result.index} scored ${probability}`;
			})
	);

	if (misses.length > 0) {
		process.stdout.write(`\nmisses at ${THRESHOLD}:\n${misses.join('\n')}\n`);
	}
}

function formatSigned(value: number): string {
	return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

main().catch((error: unknown) => {
	logger.error({ err: error }, 'eval-jev failed');
	process.exitCode = 1;
});
