import { BadRequestError } from '@typesafe-ai/sdk';
import type { ChoiceCriteria, ChoiceQuestion, JsonValue, TypeSafeClient } from '@typesafe-ai/sdk';
import { z } from 'zod';

import type { Analyzer } from '../analyzer.js';
import type { Change } from '../change.js';
import { isIgnored } from '../change.js';
import { Origin } from '../finding.js';
import type { Finding } from '../finding.js';
import { Lang, detectLang } from '../lang.js';
import { Detect } from '../rule.js';
import type { JudgeRule, Rule } from '../rule.js';
import { mapConcurrent } from '../shared/concurrency.js';
import { trackedFiles } from '../shared/git.js';
import { logger } from '../shared/log.js';
import { countRepo, extractUnits } from '../units.js';
import type { RepoCounts, Unit } from '../units.js';

// the decision model a configuration names when it names none
export const DEFAULT_DECISION_MODEL = 'typesafe/jev-latest';

// the decision APIs take at most this many questions per call
const MAX_QUESTIONS_PER_CALL = 64;
// a call asks a group of rules about a group of units. by default one unit beside the whole rulebook: on two labeled
// repositories that found 14 of 17 real findings where eight units by eight rules found 10, for twice the tokens.
const DEFAULT_MAX_UNITS_PER_CALL = 1;
// estimated tokens one call may carry. services reject requests somewhere past 60k and the estimate runs low on
// code, so the budget leaves room; a call that is still rejected is split in two and asked again.
const CALL_TOKEN_BUDGET = 40_000;
const CHARS_PER_TOKEN = 4;
const CONCURRENT_CALLS = 4;

export const decisionConfigSchema = z
	.object({
		// the decision model runs whenever its provider's key is set; this turns it off regardless
		enabled: z.boolean().default(true),
		// "<provider>/<model id>", such as openrouter/cloudflare/clef. a rule is asked only when it has a threshold
		// measured for this spec.
		model: z.string().default(DEFAULT_DECISION_MODEL),
		// without a verifier, findings under this confidence are dropped; with one, every finding is checked instead.
		// measured on two repositories: wrong findings sat at 0.47 to 0.50, right ones from 0.59.
		confidenceFloor: z.number().min(0).max(1).default(0.6),
		// how a call groups its questions, for models that judge worse in company: the most rules one call asks about
		// (unset fills the question cap) and the most units (unset, one). a model that weighs each rule better alone
		// takes one rule and several units.
		maxRulesPerCall: z.number().int().positive().optional(),
		maxUnitsPerCall: z.number().int().positive().max(MAX_QUESTIONS_PER_CALL).optional(),
	})
	.strict();

export type DecisionConfig = z.infer<typeof decisionConfigSchema>;

export const decisionSummarySchema = z.object({
	model: z.string(),
	// rules with a threshold measured for the model; none means the model was never asked anything
	rules: z.number().int().nonnegative(),
	units: z.number().int().nonnegative(),
	calls: z.number().int().nonnegative(),
	inputTokens: z.number().int().nonnegative(),
});

export type DecisionSummary = z.infer<typeof decisionSummarySchema>;

export type Decider = {
	analyze: Analyzer;
	summary(): DecisionSummary;
};

export type DeciderOptions = {
	// created with the decision model as its default
	client: TypeSafeClient;
	config: DecisionConfig;
	repo: string;
	ignore: readonly string[];
};

// how one call groups its questions
export type Batching = {
	// the most rules one call asks about; unset fills the question cap
	maxRulesPerCall?: number;
	// the most units one call asks about; unset, one
	maxUnitsPerCall?: number;
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

export type Decided = {
	judgments: Judgment[];
	calls: number;
	inputTokens: number;
};

// asks a decision model every askable rule about each changed unit, several units per call, and keeps the answers
// over the rule's threshold for that model as findings
export function createDecider(options: DeciderOptions): Decider {
	const summary: Omit<DecisionSummary, 'rules'> = {
		model: options.config.model,
		units: 0,
		calls: 0,
		inputTokens: 0,
	};
	const measured = new Set<string>();
	let hasWarnedUnmeasured = false;
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

	// a model nobody measured thresholds for is asked nothing; say so once rather than pass for a clean scan
	function warnUnmeasured(rules: readonly Rule[]): void {
		if (hasWarnedUnmeasured || !rules.some(isAskable)) {
			return;
		}

		hasWarnedUnmeasured = true;
		logger.warn(
			{ model: options.config.model },
			'no rule has a threshold for this decision model; measure them with scripts/decision-thresholds.ts'
		);
	}

	async function analyze(change: Change, rules: readonly Rule[]): Promise<Finding[]> {
		const thresholds = measuredThresholds(rules, options.config.model);

		if (thresholds.size === 0) {
			warnUnmeasured(rules);

			return [];
		}

		for (const rule of thresholds.keys()) {
			measured.add(rule.id);
		}

		const units = extractUnits(change.lang, change.path, change.source, await countsFor(change.lang)).filter(unit =>
			hasChangedLines(unit, change)
		);
		summary.units += units.length;

		const decided = await decide(options.client, change.lang, units, [...thresholds.keys()], {
			maxRulesPerCall: options.config.maxRulesPerCall,
			maxUnitsPerCall: options.config.maxUnitsPerCall,
		});
		summary.calls += decided.calls;
		summary.inputTokens += decided.inputTokens;

		return decided.judgments
			.filter(judgment => judgment.probability >= (thresholds.get(judgment.rule) ?? Number.POSITIVE_INFINITY))
			.map(toFinding);
	}

	return {
		analyze,
		summary: () => ({
			...summary,
			rules: measured.size,
		}),
	};
}

// a judge rule a decision model can answer. a rule with a confirm predicate needs the symbol a finding is about, which
// a decision model does not name, so every finding it gave would be dropped; it is not asked at all
export function isAskable(rule: Rule): rule is JudgeRule {
	return rule.detect === Detect.JUDGE && rule.confirm === undefined;
}

// the askable rules with a threshold measured for this model spec, each with that threshold
function measuredThresholds(rules: readonly Rule[], model: string): Map<JudgeRule, number> {
	const thresholds = new Map<JudgeRule, number>();

	for (const rule of rules) {
		if (!isAskable(rule)) {
			continue;
		}

		const threshold = rule.decisionThresholds[model];

		if (threshold !== undefined) {
			thresholds.set(rule, threshold);
		}
	}

	return thresholds;
}

// asks every rule about every unit, in calls of up to the question cap grouped as the batching says
export async function decide(
	client: TypeSafeClient,
	lang: Lang,
	units: readonly Unit[],
	rules: readonly JudgeRule[],
	batching: Batching = {}
): Promise<Decided> {
	const session: Session = {
		client,
		lang,
		decided: {
			judgments: [],
			calls: 0,
			inputTokens: 0,
		},
	};

	await mapConcurrent(pack(units, rules, batching), batch => ask(session, batch), {
		concurrency: CONCURRENT_CALLS,
	});

	return session.decided;
}

// everything one run shares across its calls: the client, the language, and the answers so far
type Session = {
	readonly client: TypeSafeClient;
	readonly lang: Lang;
	readonly decided: Decided;
};

// one call: these rules asked about these units
type Batch = {
	readonly rules: readonly JudgeRule[];
	readonly units: readonly Unit[];
};

async function ask(session: Session, batch: Batch): Promise<void> {
	const { client, lang, decided } = session;
	const questions: Record<string, ChoiceQuestion> = Object.fromEntries(
		batch.units.flatMap((_unit, u) =>
			batch.rules.map((_rule, r) => [
				questionKey(u, r),
				contrastQuestion(`rules.${ruleKey(r)}`, `units.${unitKey(u)}.code`),
			])
		)
	);

	try {
		const { answers, usage } = await client.systemOne({
			state: {
				language: languageName(lang),
				units: Object.fromEntries(batch.units.map((unit, u) => [unitKey(u), unitState(unit)])),
				rules: rulesState(batch.rules),
			},
			questions,
		});

		decided.calls += 1;
		decided.inputTokens += usage.input_tokens;
		collect(answers, batch, decided);
	} catch (error) {
		if (!(error instanceof BadRequestError)) {
			throw error;
		}

		await retrySmaller(session, batch);
	}
}

// reads one call's answers back into judgments, one per unit and rule
function collect(
	answers: Record<string, { type: string; probabilities?: Record<string, number>; confidence: number } | undefined>,
	batch: Batch,
	decided: Decided
): void {
	batch.units.forEach((unit, u) => {
		batch.rules.forEach((rule, r) => {
			const answer = answers[questionKey(u, r)];

			if (answer?.type === 'choice') {
				decided.judgments.push({
					unit,
					rule,
					probability: answer.probabilities?.[Verdict.VIOLATES] ?? 0,
					confidence: answer.confidence,
				});
			}
		});
	});
}

// the service refused the call for size: the estimate ran low, so halve the units and ask both halves again.
// a single unit that is still refused is too large for any call and is skipped for these rules.
async function retrySmaller(session: Session, batch: Batch): Promise<void> {
	const [only] = batch.units;

	if (batch.units.length === 1 && only !== undefined) {
		logger.warn(
			{
				path: only.path,
				line: only.line,
				lines: only.facts.lines,
				rules: batch.rules.length,
			},
			'unit too large for one decision call; skipped'
		);

		return;
	}

	const half = Math.ceil(batch.units.length / 2);
	await Promise.all([
		ask(session, {
			rules: batch.rules,
			units: batch.units.slice(0, half),
		}),
		ask(session, {
			rules: batch.rules,
			units: batch.units.slice(half),
		}),
	]);
}

// splits the rules into groups that fill the question cap beside the units, then fills calls for each group in file
// order, up to the token budget: the group's rules once, then each unit with its questions
function pack(units: readonly Unit[], rules: readonly JudgeRule[], batching: Batching): Batch[] {
	const unitsPerCall = Math.max(1, Math.min(units.length, batching.maxUnitsPerCall ?? DEFAULT_MAX_UNITS_PER_CALL));
	const rulesPerCall = Math.min(
		Math.floor(MAX_QUESTIONS_PER_CALL / unitsPerCall),
		batching.maxRulesPerCall ?? Number.POSITIVE_INFINITY
	);

	return chunk(rules, rulesPerCall).flatMap(group => packUnits(units, group, unitsPerCall));
}

function packUnits(units: readonly Unit[], rules: readonly JudgeRule[], unitsPerCall: number): Batch[] {
	const fixed = estimateTokens(JSON.stringify(rulesState(rules)));
	const perQuestion = estimateTokens(JSON.stringify(contrastQuestion('rules.r0', 'units.u0.code')));
	const batches: Batch[] = [];
	let current: Unit[] = [];
	let used = fixed;

	for (const unit of units) {
		const cost = estimateTokens(JSON.stringify(unitState(unit))) + rules.length * perQuestion;

		if (current.length === unitsPerCall || (current.length > 0 && used + cost > CALL_TOKEN_BUDGET)) {
			batches.push({
				rules,
				units: current,
			});
			current = [];
			used = fixed;
		}

		current.push(unit);
		used += cost;
	}

	if (current.length > 0) {
		batches.push({
			rules,
			units: current,
		});
	}

	return batches;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
	const chunks: T[][] = [];

	for (let start = 0; start < items.length; start += size) {
		chunks.push(items.slice(start, start + size));
	}

	return chunks;
}

// the rulebook a call carries, keyed the way its questions refer to it
function rulesState(rules: readonly JudgeRule[]): Record<string, JsonValue> {
	return Object.fromEntries(rules.map((rule, r) => [ruleKey(r), ruleState(rule)]));
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
		origin: Origin.DECISION,
	};
}

// a unit is asked about when this change touched any of its lines
function hasChangedLines(unit: Unit, change: Change): boolean {
	for (const line of change.changedLines) {
		if (line >= unit.line && line <= unit.endLine) {
			return true;
		}
	}

	return false;
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
	return lang === Lang.TS ? 'TypeScript' : 'Go';
}
