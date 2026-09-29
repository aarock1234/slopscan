// asks TypeSafe's Jev whether each judge-rule fixture violates its rule, in several phrasings, and measures
// how well bad and good examples separate per rule and per phrasing. two calls per fixture: one with the
// rule's other examples as reference data in the state, one without. cents per run.
//
//   pnpm script scripts/eval-jev.ts [--rule <id>]

import { parseArgs } from 'node:util';

import { TypeSafeClient } from '@typesafe-ai/sdk';

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

const Variant = {
	// question form with the rule's message and why in the instructions
	INLINE: 'inline',
	// generic question, the rule travels as structured state
	STRUCTURED: 'structured',
	// statement form
	STATEMENT: 'statement',
	// criteria spell out the violation and the exceptions
	CRITERIA: 'criteria',
	// the rule's other examples ride along in the state as reference data
	FEWSHOT: 'fewshot',
	// choice between resembling the bad examples or the good ones
	CONTRAST: 'contrast',
	// ordered rubric; mass on the violation levels is the probability
	RUBRIC: 'rubric',
} as const;

type Variant = (typeof Variant)[keyof typeof Variant];

const variantValues = Object.values(Variant) as [Variant, ...Variant[]];

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

type Verdict = {
	ruleId: string;
	kind: Kind;
	probability: Readonly<Record<Variant, number>>;
};

type VariantStats = {
	// share of fixtures on the right side of 0.5
	accuracy: number;
	// smallest bad probability minus largest good probability; positive means some threshold is perfect
	separation: number;
};

type RuleSummary = {
	id: string;
	bad: number;
	good: number;
	stats: Readonly<Record<Variant, VariantStats>>;
	best: Variant;
};

const GLOBAL_THRESHOLD = 0.5;

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
			const [plain, withReferences] = await Promise.all([
				askPlain(client, fixture),
				askWithReferences(client, fixture),
			]);
			inputTokens += plain.usage.input_tokens + withReferences.usage.input_tokens;

			return {
				ruleId: fixture.rule.id,
				kind: fixture.kind,
				probability: {
					[Variant.INLINE]: plain.answers.inline.noul,
					[Variant.STRUCTURED]: plain.answers.structured.noul,
					[Variant.STATEMENT]: plain.answers.statement.noul,
					[Variant.CRITERIA]: plain.answers.criteria.noul,
					[Variant.FEWSHOT]: withReferences.answers.fewshot.noul,
					[Variant.CONTRAST]: withReferences.answers.contrast.probabilities.bad,
					[Variant.RUBRIC]: violationMass(withReferences.answers.rubric.probabilities),
				},
			};
		},
		{ concurrency: 8 }
	);

	const summaries = rules.map(rule =>
		summarize(
			rule,
			verdicts.filter(verdict => verdict.ruleId === rule.id)
		)
	);

	printTable(summaries);
	printTotals(summaries, verdicts);
	logger.info({ calls: verdicts.length * 2, inputTokens }, 'done');
}

function ruleState(rule: JudgeRule) {
	return {
		id: rule.id,
		message: rule.message,
		why: rule.why,
		notAViolation: [...rule.falsePositives],
	};
}

function codeState(example: Example) {
	return {
		language: example.lang === 'ts' ? 'TypeScript' : 'Go',
		code: example.source,
	};
}

function askPlain(client: TypeSafeClient, { rule, example }: Fixture) {
	const exceptions = rule.falsePositives.length > 0 ? rule.falsePositives.join('; ') : 'none';

	return client.systemOne({
		state: { ...codeState(example), rule: ruleState(rule) },
		questions: {
			inline: {
				type: 'noul',
				instructions: `Does the code violate this rule? Rule: ${rule.message}. ${rule.why}`,
			},
			structured: {
				type: 'noul',
				instructions: 'Does `code` violate `rule`?',
			},
			statement: {
				type: 'noul',
				instructions: `The code violates the rule: ${rule.message}.`,
			},
			criteria: {
				type: 'noul',
				instructions: 'Does `code` violate `rule`?',
				criteria: {
					true: `the code shows the problem: ${rule.message}. ${rule.why}`,
					false: `the code follows the rule, or it is one of these accepted cases: ${exceptions}`,
				},
			},
		},
	});
}

// the fixture under test is held out of the reference examples so it never sees itself
function askWithReferences(client: TypeSafeClient, { rule, example }: Fixture) {
	const references = {
		bad: rule.bad.filter(other => other !== example).map(other => other.source),
		good: rule.good.filter(other => other !== example).map(other => other.source),
	};

	return client.systemOne({
		state: { ...codeState(example), rule: { ...ruleState(rule), examples: references } },
		questions: {
			fewshot: {
				type: 'noul',
				instructions:
					'Does `code` have the problem described by `rule`, as shown in `rule.examples.bad` and absent from `rule.examples.good`?',
			},
			contrast: {
				type: 'choice',
				instructions: 'With respect to `rule`, which set does `code` belong with?',
				criteria: {
					bad: 'code has the same problem as rule.examples.bad',
					good: 'code is written the way rule.examples.good is, or is an accepted exception in rule.notAViolation',
				},
			},
			rubric: {
				type: 'score',
				instructions: 'How badly does `code` violate `rule`?',
				criteria: [
					'no violation; the code follows the rule or is an accepted exception',
					'borderline; a reviewer might mention it',
					'clear violation with real reading or maintenance cost',
					'severe violation; misleading or likely to cause a bug',
				],
			},
		},
	});
}

// probability mass on the rubric levels that mean "a violation is present"
function violationMass(probabilities: Readonly<Record<string, number>>): number {
	return Object.entries(probabilities)
		.filter(([level]) => Number(level) >= 1)
		.reduce((sum, [, probability]) => sum + probability, 0);
}

function summarize(rule: JudgeRule, verdicts: readonly Verdict[]): RuleSummary {
	const bad = verdicts.filter(verdict => verdict.kind === Kind.BAD);
	const good = verdicts.filter(verdict => verdict.kind === Kind.GOOD);
	const stats = Object.fromEntries(variantValues.map(variant => [variant, statsFor(variant, bad, good)])) as Record<
		Variant,
		VariantStats
	>;

	const best = variantValues.reduce((leader, variant) =>
		stats[variant].separation > stats[leader].separation ? variant : leader
	);

	return { id: rule.id, bad: bad.length, good: good.length, stats, best };
}

function statsFor(variant: Variant, bad: readonly Verdict[], good: readonly Verdict[]): VariantStats {
	const total = bad.length + good.length;
	const correct = [...bad, ...good].filter(verdict => isCorrect(verdict, variant, GLOBAL_THRESHOLD)).length;
	const lowestBad = Math.min(...bad.map(verdict => verdict.probability[variant]));
	const highestGood = Math.max(...good.map(verdict => verdict.probability[variant]), 0);

	return {
		accuracy: total === 0 ? 0 : correct / total,
		separation: lowestBad - highestGood,
	};
}

function isCorrect(verdict: Verdict, variant: Variant, threshold: number): boolean {
	const probability = verdict.probability[variant];

	return verdict.kind === Kind.BAD ? probability >= threshold : probability < threshold;
}

function printTable(summaries: readonly RuleSummary[]): void {
	const header = variantValues.map(variant => variant.padStart(10)).join(' ');
	process.stdout.write(`${'rule (separation per variant)'.padEnd(46)} ${header}   best\n`);

	for (const summary of summaries) {
		const cells = variantValues
			.map(variant => formatSigned(summary.stats[variant].separation).padStart(10))
			.join(' ');

		process.stdout.write(`${summary.id.padEnd(46)} ${cells}   ${summary.best}\n`);
	}
}

function printTotals(summaries: readonly RuleSummary[], verdicts: readonly Verdict[]): void {
	process.stdout.write('\n');

	for (const variant of variantValues) {
		const correct = verdicts.filter(verdict => isCorrect(verdict, variant, GLOBAL_THRESHOLD)).length;
		const separable = summaries.filter(summary => summary.stats[variant].separation > 0).length;
		const meanSeparation =
			summaries.reduce((sum, summary) => sum + summary.stats[variant].separation, 0) / summaries.length;

		process.stdout.write(
			`${variant.padEnd(11)} ${correct}/${verdicts.length} correct at 0.5   ${separable}/${summaries.length} rules separable   mean separation ${formatSigned(meanSeparation)}\n`
		);
	}

	const bestPerRule = summaries.filter(summary => summary.stats[summary.best].separation > 0).length;
	process.stdout.write(`\nbest variant per rule: ${bestPerRule}/${summaries.length} rules separable\n`);
}

function formatSigned(value: number): string {
	return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

main().catch((error: unknown) => {
	logger.error({ err: error }, 'eval-jev failed');
	process.exitCode = 1;
});
