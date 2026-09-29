import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { ChoiceCriteria, ChoiceQuestion, JsonValue, ScoreQuestion, TypeSafeClient } from '@typesafe-ai/sdk';
import { z } from 'zod';

import type { Analyzer } from '../analyzer.js';
import type { Change } from '../change.js';
import { isIgnored } from '../change.js';
import { Origin } from '../finding.js';
import type { Finding } from '../finding.js';
import { detectLang } from '../lang.js';
import type { Lang } from '../lang.js';
import { Detect } from '../rule.js';
import type { JudgeRule, Rule } from '../rule.js';
import { countRepo, extractUnits } from '../units.js';
import type { RepoCounts, Unit } from '../units.js';

const execFileAsync = promisify(execFile);

export const jevConfigSchema = z
	.object({
		// jev is on whenever TYPESAFE_API_KEY is set; this turns it off regardless
		enabled: z.boolean().default(true),
		model: z.string().default('jev-latest'),
		// findings under this confidence go to the verifier; at or above it they stand on their own
		confidenceFloor: z.number().min(0).max(1).default(0.45),
	})
	.strict();

export type JevConfig = z.infer<typeof jevConfigSchema>;

export const jevSummarySchema = z.object({
	model: z.string(),
	units: z.number().int().nonnegative(),
	calls: z.number().int().nonnegative(),
	inputTokens: z.number().int().nonnegative(),
});

export type JevSummary = z.infer<typeof jevSummarySchema>;

export type Jev = {
	analyze: Analyzer;
	summary(): JevSummary;
};

export type JevOptions = {
	client: TypeSafeClient;
	config: JevConfig;
	repo: string;
	ignore: readonly string[];
};

// the answer space for one rule against one unit of code. `not_applicable` gives the model somewhere to put
// code the rule has nothing to say about, instead of forcing a coin flip between the other two.
export const Verdict = {
	VIOLATES: 'violates',
	FOLLOWS: 'follows',
	NOT_APPLICABLE: 'not_applicable',
} as const;

export type Verdict = (typeof Verdict)[keyof typeof Verdict];

export type QuestionOptions = {
	notApplicable: boolean;
};

// one Jev call per changed function: the function, computed facts about it, and the names around it in its file
// as state; every applicable judge rule with a measured threshold as a parallel contrast question.
export function createJev(options: JevOptions): Jev {
	const summary: JevSummary = { model: options.config.model, units: 0, calls: 0, inputTokens: 0 };
	const counts = new Map<Lang, Promise<RepoCounts>>();

	function countsFor(lang: Lang): Promise<RepoCounts> {
		let pending = counts.get(lang);

		if (pending === undefined) {
			pending = trackedFiles(options.repo).then(paths =>
				countRepo(
					options.repo,
					lang,
					paths.filter(path => detectLang(path) === lang && !isIgnored(path, options.ignore))
				)
			);
			counts.set(lang, pending);
		}

		return pending;
	}

	async function analyze(change: Change, rules: readonly Rule[]): Promise<Finding[]> {
		const judgeRules = rules.filter(
			(rule): rule is JudgeRule => rule.detect === Detect.JUDGE && rule.jevThreshold !== undefined
		);

		if (judgeRules.length === 0) {
			return [];
		}

		const units = extractUnits(change.lang, change.path, change.source, await countsFor(change.lang)).filter(unit =>
			touchesChange(unit, change)
		);
		summary.units += units.length;

		const perUnit = await Promise.all(units.map(unit => judgeUnit(unit, change.lang, judgeRules)));

		return perUnit.flat();
	}

	async function judgeUnit(unit: Unit, lang: Lang, rules: readonly JudgeRule[]): Promise<Finding[]> {
		const { answers, usage } = await options.client.systemOne({
			model: options.config.model,
			state: {
				...codeState(lang, unit),
				rules: Object.fromEntries(rules.map(rule => [rule.id, ruleState(rule)])),
			},
			questions: Object.fromEntries(
				rules.map(rule => [rule.id, contrastQuestion({ notApplicable: true }, `rules["${rule.id}"]`)])
			),
		});

		summary.calls += 1;
		summary.inputTokens += usage.input_tokens;

		return rules.flatMap(rule => {
			const answer = answers[rule.id];

			if (answer?.type !== 'choice') {
				return [];
			}

			const probability = answer.probabilities[Verdict.VIOLATES] ?? 0;

			if (probability < (rule.jevThreshold ?? Number.POSITIVE_INFINITY)) {
				return [];
			}

			return [
				{
					ruleId: rule.id,
					path: unit.path,
					line: unit.line,
					endLine: unit.endLine,
					quote: unit.header,
					message: rule.message,
					confidence: answer.confidence,
					origin: Origin.JEV,
				},
			];
		});
	}

	return { analyze, summary: () => ({ ...summary }) };
}

// a unit is judged when this change touched any of its lines
function touchesChange(unit: Unit, change: Change): boolean {
	for (const line of change.changedLines) {
		if (line >= unit.line && line <= unit.endLine) {
			return true;
		}
	}

	return false;
}

async function trackedFiles(repo: string): Promise<string[]> {
	const { stdout } = await execFileAsync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf-8' });

	return stdout.split('\0').filter(path => path.length > 0);
}

// what the model sees about the code under judgment: the unit, facts about it, and the names around it in
// its file, so questions about colocation, wrappers, and reuse have something to check against
export function codeState(lang: Lang, unit: Unit): Record<string, JsonValue> {
	return {
		language: languageName(lang),
		code: unit.source,
		facts: { ...unit.facts },
		file: { path: unit.path, imports: [...unit.imports], declarations: [...unit.declarations] },
	};
}

// the rule as state, the shape that separated fixtures best: everything the rule file says, flat
export function ruleState(rule: JudgeRule): Record<string, JsonValue> {
	return {
		id: rule.id,
		message: rule.message,
		why: rule.why,
		notAViolation: [...rule.falsePositives],
		examples: {
			bad: rule.bad.map(example => example.source),
			good: rule.good.map(example => example.source),
		},
	};
}

// the contrast question over `code` and a rule in the state. `ref` is the rule's path in the state, `rule` when
// it is alone and `rules["<id>"]` when several ride in one call.
export function contrastQuestion(options: QuestionOptions, ref = 'rule'): ChoiceQuestion {
	const criteria: ChoiceCriteria = {
		[Verdict.VIOLATES]: `code has the same problem as ${ref}.examples.bad`,
		[Verdict.FOLLOWS]: `code is written the way ${ref}.examples.good is, or is an accepted exception in ${ref}.notAViolation`,
		...(options.notApplicable && {
			[Verdict.NOT_APPLICABLE]: 'the construct or situation the rule is about does not appear in code',
		}),
	};

	return {
		type: 'choice',
		instructions: `With respect to \`${ref}\`, which set does \`code\` belong with?`,
		criteria,
	};
}

// the same judgment as an ordered rubric. the answer is a probability per level plus a confidence, so callers
// can read "how bad" and "how sure" separately instead of one number.
export const RubricLevel = {
	NOT_APPLICABLE: 0,
	FOLLOWS: 1,
	BORDERLINE: 2,
	VIOLATES: 3,
	SEVERE: 4,
} as const;

export function rubricQuestion(ref = 'rule'): ScoreQuestion {
	return {
		type: 'score',
		instructions: `How does \`code\` stand against \`${ref}\`? Use \`facts\` for anything countable.`,
		criteria: [
			{
				summary: 'not applicable',
				signals: 'the construct or situation the rule is about does not appear in code',
			},
			{
				summary: 'follows the rule',
				signals: `code is written the way ${ref}.examples.good is, or fits ${ref}.notAViolation`,
			},
			{ summary: 'borderline', signals: 'a careful reviewer might mention it, or might not' },
			{ summary: 'violates the rule', signals: `code has the same problem as ${ref}.examples.bad` },
			{ summary: 'severe violation', signals: 'the problem is present and will mislead a reader or cause a bug' },
		],
	};
}

// the rule as a structured rubric inside the question, with only the code in the state
export function ruleQuestion(rule: JudgeRule, options: QuestionOptions): ChoiceQuestion {
	const criteria: ChoiceCriteria = {
		[Verdict.VIOLATES]: {
			what: `\`code\` has this problem: ${rule.message}. ${rule.why}`,
			examples: rule.bad.map(example => example.source),
		},
		[Verdict.FOLLOWS]: {
			what: '`code` does the thing this rule is about, and does it the way the rule wants',
			not_for: 'code where the rule does not come up at all',
			examples: rule.good.map(example => example.source),
		},
		...(options.notApplicable && {
			[Verdict.NOT_APPLICABLE]: {
				what: 'the rule is about a construct or situation that does not appear in `code`',
				...(rule.falsePositives.length > 0 && { examples: [...rule.falsePositives] }),
			},
		}),
	};

	return {
		type: 'choice',
		instructions: { question: 'Does `code` violate this rule?', focus: rule.message },
		criteria,
	};
}

export function languageName(lang: Lang): string {
	return lang === 'ts' ? 'TypeScript' : 'Go';
}
