import type { ChoiceCriteria, ChoiceQuestion, EntryType } from '@typesafe-ai/sdk';

import type { Lang } from '../lang.js';
import type { JudgeRule } from '../rule.js';

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

// what the model sees about the code under judgment: the unit itself plus the names around it in the file,
// so questions about colocation, wrappers, and reuse have something to check against
export type CodeState = {
	language: string;
	code: string;
	file?: {
		path: string;
		imports: string[];
		declarations: string[];
	};
};

// the rule as state, the shape that separated fixtures best: everything the rule file says, flat
export function ruleState(rule: JudgeRule): EntryType {
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
