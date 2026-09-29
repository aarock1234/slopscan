import { describe, expect, it } from 'vitest';

import type { Change } from '../change.js';
import { Detect } from '../rule.js';
import type { JudgeRule } from '../rule.js';
import { validateFindings } from './judge-validate.js';
import type { RawJudgeFinding } from './judge-validate.js';

const SOURCE = [
	'export function greet(user: User): string {',
	'\t// increment the counter',
	'\tcounter += 1;',
	'',
	'\treturn `hello ${getUserName(user)}`;',
	'}',
].join('\n');

const change: Change = {
	path: 'src/a.ts',
	lang: 'ts',
	source: SOURCE,
	changedLines: new Set([2, 3, 5]),
	scoredLines: 3,
};

const rule: JudgeRule = {
	id: 'any.hacky.comment-restates-code',
	lang: 'any',
	axis: 'hacky',
	category: 'comments',
	severity: 'minor',
	ignore: [],
	guide: [],
	why: 'because',
	message: 'comment restates the code',
	good: [],
	bad: [],
	path: 'rule.md',
	detect: Detect.JUDGE,
	falsePositives: [],
};

const rules = new Map([[rule.id, rule]]);

function raw(overrides: Partial<RawJudgeFinding> = {}): RawJudgeFinding {
	return {
		ruleId: rule.id,
		line: 2,
		quote: '// increment the counter',
		message: 'says what the next line says',
		confidence: 0.9,
		symbol: null,
		...overrides,
	};
}

describe('validateFindings', () => {
	it('keeps a finding whose quote is on the reported changed line', () => {
		const [finding] = validateFindings([raw()], change, rules, 0.6);

		expect(finding).toMatchObject({
			ruleId: rule.id,
			path: 'src/a.ts',
			line: 2,
			endLine: 2,
			quote: '\t// increment the counter',
			message: 'says what the next line says',
			confidence: 0.9,
		});
		expect(finding).not.toHaveProperty('symbol');
	});

	it('relocates a quote reported a couple of lines off', () => {
		const [finding] = validateFindings([raw({ line: 4 })], change, rules, 0.6);

		expect(finding?.line).toBe(2);
	});

	it('drops a quote that is not in the file', () => {
		expect(validateFindings([raw({ quote: 'nothing like this' })], change, rules, 0.6)).toEqual([]);
	});

	it('drops a quote found only on an unchanged line', () => {
		const onContext = raw({ line: 1, quote: 'export function greet' });

		expect(validateFindings([onContext], change, rules, 0.6)).toEqual([]);
	});

	it('drops findings under the confidence floor and for unknown rules', () => {
		expect(validateFindings([raw({ confidence: 0.5 })], change, rules, 0.6)).toEqual([]);
		expect(validateFindings([raw({ ruleId: 'nope' })], change, rules, 0.6)).toEqual([]);
	});

	it('keeps the most confident of overlapping findings for one rule', () => {
		const findings = validateFindings([raw({ confidence: 0.7 }), raw({ confidence: 0.95 })], change, rules, 0.6);

		expect(findings).toHaveLength(1);
		expect(findings[0]?.confidence).toBe(0.95);
	});

	it('falls back to the rule message and trims the symbol', () => {
		const [finding] = validateFindings([raw({ message: '  ', symbol: ' getUserName ' })], change, rules, 0.6);

		expect(finding?.message).toBe('comment restates the code');
		expect(finding?.symbol).toBe('getUserName');
	});

	it('spans multi-line quotes', () => {
		const multi = raw({ line: 2, quote: '// increment the counter\ncounter += 1;' });
		const [finding] = validateFindings([multi], change, rules, 0.6);

		expect(finding?.endLine).toBe(3);
		expect(finding?.quote).toBe('\t// increment the counter\n\tcounter += 1;');
	});
});
