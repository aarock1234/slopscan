import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { BadRequestError } from '@typesafe-ai/sdk';
import type { ChoiceCriteria, ChoiceQuestion, JsonValue, TypeSafeClient } from '@typesafe-ai/sdk';
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
import { mapConcurrent } from '../shared/concurrency.js';
import { logger } from '../shared/log.js';
import { countRepo, extractUnits } from '../units.js';
import type { RepoCounts, Unit } from '../units.js';

const execFileAsync = promisify(execFile);

export const jevConfigSchema = z
	.object({
		// jev is on whenever TYPESAFE_API_KEY is set; this turns it off regardless
		enabled: z.boolean().default(true),
		model: z.string().default('jev-latest'),
		// findings under this confidence go to the verifier, or are dropped when there is none; at or above it
		// they stand on their own. measured on two repositories: wrong findings sat at 0.47 to 0.50, right ones from 0.59.
		confidenceFloor: z.number().min(0).max(1).default(0.6),
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
	// created with the jev model as its default
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

// one rule's answer about one unit
export type Judgment = {
	unit: Unit;
	rule: JudgeRule;
	probability: number;
	confidence: number;
};

export type Judged = {
	judgments: Judgment[];
	calls: number;
	inputTokens: number;
};

// estimated tokens one call may carry. the service rejects requests somewhere past 60k and the estimate runs
// low on code, so the budget leaves room; a call it still rejects is split in two and asked again.
const CALL_TOKEN_BUDGET = 40_000;
const CHARS_PER_TOKEN = 4;
const CONCURRENT_CALLS = 4;

// judges the changed units of each file with every judge rule that has a measured threshold, several units per
// call, and keeps the answers over the rule's threshold as findings
export function createJev(options: JevOptions): Jev {
	const summary: JevSummary = {
		model: options.config.model,
		units: 0,
		calls: 0,
		inputTokens: 0,
	};
	const counts = new Map<Lang, Promise<RepoCounts>>();

	// one repository count per language, started on first use and shared by every change
	function countsFor(lang: Lang): Promise<RepoCounts> {
		let pending = counts.get(lang);

		if (pending === undefined) {
			pending = countLanguage(lang);
			counts.set(lang, pending);
		}

		return pending;
	}

	async function countLanguage(lang: Lang): Promise<RepoCounts> {
		const paths = await trackedFiles(options.repo);

		return countRepo(
			options.repo,
			lang,
			paths.filter(path => detectLang(path) === lang && !isIgnored(path, options.ignore))
		);
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

		const judged = await judge(options.client, change.lang, units, judgeRules);
		summary.calls += judged.calls;
		summary.inputTokens += judged.inputTokens;

		return judged.judgments
			.filter(judgment => judgment.probability >= (judgment.rule.jevThreshold ?? Number.POSITIVE_INFINITY))
			.map(toFinding);
	}

	return {
		analyze,
		summary: () => ({ ...summary }),
	};
}

// asks every rule about every unit, several units per call with one copy of the rulebook. the rulebook costs
// more than the code it judges, and Jev answers a question the same whether four or forty share the request:
// on the rule fixtures, eight units per call moved P(violates) by 0.008 on average against 0.002 of jitter.
export async function judge(
	client: TypeSafeClient,
	lang: Lang,
	units: readonly Unit[],
	rules: readonly JudgeRule[]
): Promise<Judged> {
	const rulesState = Object.fromEntries(rules.map((rule, index) => [ruleKey(index), ruleState(rule)]));
	const judged: Judged = {
		judgments: [],
		calls: 0,
		inputTokens: 0,
	};

	await mapConcurrent(pack(units, rules, rulesState), batch => ask(client, lang, batch, rules, rulesState, judged), {
		concurrency: CONCURRENT_CALLS,
	});

	return judged;
}

async function ask(
	client: TypeSafeClient,
	lang: Lang,
	batch: readonly Unit[],
	rules: readonly JudgeRule[],
	rulesState: Record<string, JsonValue>,
	judged: Judged
): Promise<void> {
	const questions: Record<string, ChoiceQuestion> = Object.fromEntries(
		batch.flatMap((_, u) =>
			rules.map((_rule, r) => [
				questionKey(u, r),
				contrastQuestion(`rules.${ruleKey(r)}`, `units.${unitKey(u)}.code`),
			])
		)
	);

	try {
		const { answers, usage } = await client.systemOne({
			state: {
				language: languageName(lang),
				units: Object.fromEntries(batch.map((unit, u) => [unitKey(u), unitState(unit)])),
				rules: rulesState,
			},
			questions,
		});

		judged.calls += 1;
		judged.inputTokens += usage.input_tokens;
		collect(answers, batch, rules, judged);
	} catch (error) {
		if (!(error instanceof BadRequestError)) {
			throw error;
		}

		await retrySmaller(client, lang, batch, rules, rulesState, judged);
	}
}

// reads one call's answers back into judgments, one per unit and rule
function collect(
	answers: Record<string, { type: string; probabilities?: Record<string, number>; confidence: number } | undefined>,
	batch: readonly Unit[],
	rules: readonly JudgeRule[],
	judged: Judged
): void {
	batch.forEach((unit, u) => {
		rules.forEach((rule, r) => {
			const answer = answers[questionKey(u, r)];

			if (answer?.type === 'choice') {
				judged.judgments.push({
					unit,
					rule,
					probability: answer.probabilities?.[Verdict.VIOLATES] ?? 0,
					confidence: answer.confidence,
				});
			}
		});
	});
}

// the service refused the call for size: the estimate ran low, so halve the batch and ask both halves again.
// a single unit that is still refused is too large for any call and is skipped.
async function retrySmaller(
	client: TypeSafeClient,
	lang: Lang,
	batch: readonly Unit[],
	rules: readonly JudgeRule[],
	rulesState: Record<string, JsonValue>,
	judged: Judged
): Promise<void> {
	const [only] = batch;

	if (batch.length === 1 && only !== undefined) {
		logger.warn(
			{
				path: only.path,
				line: only.line,
				lines: only.facts.lines,
			},
			'unit too large for one jev call; skipped'
		);

		return;
	}

	const half = Math.ceil(batch.length / 2);
	await Promise.all([
		ask(client, lang, batch.slice(0, half), rules, rulesState, judged),
		ask(client, lang, batch.slice(half), rules, rulesState, judged),
	]);
}

// fills calls up to the token budget in file order: the rulebook once, then each unit with its questions
function pack(units: readonly Unit[], rules: readonly JudgeRule[], rulesState: Record<string, JsonValue>): Unit[][] {
	const fixed = estimateTokens(JSON.stringify(rulesState));
	const perQuestion = estimateTokens(JSON.stringify(contrastQuestion('rules.r00', 'units.u00.code')));
	const batches: Unit[][] = [];
	let current: Unit[] = [];
	let used = fixed;

	for (const unit of units) {
		const cost = estimateTokens(JSON.stringify(unitState(unit))) + rules.length * perQuestion;

		if (current.length > 0 && used + cost > CALL_TOKEN_BUDGET) {
			batches.push(current);
			current = [];
			used = fixed;
		}

		current.push(unit);
		used += cost;
	}

	if (current.length > 0) {
		batches.push(current);
	}

	return batches;
}

function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// short keys keep every reference in every question to a few tokens; the rule's id travels inside its state
function ruleKey(index: number): string {
	return `r${index}`;
}

function unitKey(index: number): string {
	return `u${index}`;
}

function questionKey(unit: number, rule: number): string {
	return `${unitKey(unit)}.${ruleKey(rule)}`;
}

function toFinding({ unit, rule, confidence }: Judgment): Finding {
	return {
		ruleId: rule.id,
		path: unit.path,
		line: unit.line,
		endLine: unit.endLine,
		quote: unit.header,
		message: rule.message,
		confidence,
		origin: Origin.JEV,
	};
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
	const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
		cwd: repo,
		encoding: 'utf-8',
	});

	return stdout.split('\0').filter(path => path.length > 0);
}

// what the model sees about one unit: the code, facts about it, and the names around it in its file, so
// questions about colocation, wrappers, and reuse have something to check against
export function unitState(unit: Unit): Record<string, JsonValue> {
	return {
		code: unit.source,
		facts: { ...unit.facts },
		file: {
			path: unit.path,
			imports: [...unit.imports],
			declarations: [...unit.declarations],
		},
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

// the three-way contrast between a piece of code and a rule, both named by their path in the state. terse on
// purpose: the wording is repeated once per unit and rule, and the short form judged the fixtures the same as
// a long one while firing less on rules that did not apply.
export function contrastQuestion(ref = 'rule', code = 'code'): ChoiceQuestion {
	const criteria: ChoiceCriteria = {
		[Verdict.VIOLATES]: `same problem as ${ref}.examples.bad`,
		[Verdict.FOLLOWS]: `like ${ref}.examples.good, or fits ${ref}.notAViolation`,
		[Verdict.NOT_APPLICABLE]: `${ref}'s subject does not occur in ${code}`,
	};

	return {
		type: 'choice',
		instructions: `Judge ${code} by ${ref}.`,
		criteria,
	};
}

export type QuestionOptions = {
	hasNotApplicable: boolean;
};

// the rule as a structured rubric inside the question, with only the code in the state; kept for the shape eval
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
		...(options.hasNotApplicable && {
			[Verdict.NOT_APPLICABLE]: {
				what: 'the rule is about a construct or situation that does not appear in `code`',
				...(rule.falsePositives.length > 0 && { examples: [...rule.falsePositives] }),
			},
		}),
	};

	return {
		type: 'choice',
		instructions: {
			question: 'Does `code` violate this rule?',
			focus: rule.message,
		},
		criteria,
	};
}

export function languageName(lang: Lang): string {
	return lang === 'ts' ? 'TypeScript' : 'Go';
}
