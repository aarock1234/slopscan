import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Change } from '../change.js';
import { Detect } from '../rule.js';
import type { Rule } from '../rule.js';
import { SkipReason, createJudge, judgeConfigSchema } from './judge.js';
import type { JudgeOutput } from './judge-validate.js';

const SOURCE = [
	"import { save } from './save.js';",
	'',
	'export function bump(): void {',
	'\t// increment the counter',
	'\tcounter += 1;',
	'\tsave(counter);',
	'}',
].join('\n');

function change(changedLines: number[]): Change {
	return {
		path: 'src/counter.ts',
		lang: 'ts',
		source: SOURCE,
		changedLines: new Set(changedLines),
		scoredLines: changedLines.length,
	};
}

const judgeRule: Rule = {
	id: 'any.hacky.comment-restates-code',
	lang: 'any',
	axis: 'hacky',
	category: 'comments',
	severity: 'minor',
	ignore: [],
	guide: [],
	why: 'a comment that repeats the code is noise.',
	message: 'comment restates the code',
	good: [{ lang: 'ts', source: '// why', expectLines: [] }],
	bad: [{ lang: 'ts', source: '// what', expectLines: [1] }],
	path: 'rule.md',
	detect: Detect.JUDGE,
	falsePositives: ['doc comments'],
};

const astRule: Rule = {
	...judgeRule,
	id: 'ts.hacky.no-explicit-any',
	detect: Detect.AST,
	ast: { ts: { rule: { kind: 'predefined_type' } } },
};

function mockModel(output: JudgeOutput) {
	return new MockLanguageModelV4({
		doGenerate: () =>
			Promise.resolve({
				content: [{ type: 'text' as const, text: JSON.stringify(output) }],
				finishReason: { unified: 'stop' as const, raw: 'stop' },
				usage: {
					inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
					outputTokens: { total: 30, text: 30, reasoning: undefined },
				},
				warnings: [],
			}),
	});
}

const GOOD_OUTPUT: JudgeOutput = {
	findings: [
		{
			ruleId: judgeRule.id,
			line: 4,
			quote: '// increment the counter',
			message: 'the comment repeats the next line',
			confidence: 0.9,
			symbol: null,
		},
		{
			ruleId: judgeRule.id,
			line: 6,
			quote: 'not in the file',
			message: 'made up',
			confidence: 0.9,
			symbol: null,
		},
	],
};

let cacheDir: string;

beforeEach(async () => {
	cacheDir = await mkdtemp(join(tmpdir(), 'slopscan-judge-'));
});

afterEach(async () => {
	await rm(cacheDir, { recursive: true, force: true });
});

function judgeWith(model: MockLanguageModelV4, overrides: Partial<ReturnType<typeof judgeConfigSchema.parse>> = {}) {
	return createJudge({
		config: { ...judgeConfigSchema.parse({}), ...overrides },
		model,
		cacheDir,
	});
}

describe('createJudge', () => {
	it('sends the changed file to the model and keeps only validated findings', async () => {
		const model = mockModel(GOOD_OUTPUT);
		const judge = judgeWith(model);

		const findings = await judge.analyze(change([4, 5, 6]), [judgeRule, astRule]);

		expect(findings).toEqual([
			{
				ruleId: judgeRule.id,
				path: 'src/counter.ts',
				line: 4,
				endLine: 4,
				quote: '\t// increment the counter',
				message: 'the comment repeats the next line',
				confidence: 0.9,
				origin: 'judge',
			},
		]);

		const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
		expect(prompt).toContain('+    4  \\t// increment the counter');
		expect(prompt).toContain(judgeRule.id);
		expect(prompt).toContain('ts.hacky.no-explicit-any');
		expect(prompt).toContain('doc comments');

		expect(judge.summary()).toMatchObject({
			calls: 1,
			cachedCalls: 0,
			inputTokens: 120,
			outputTokens: 30,
			skipped: [],
		});
		expect(judge.summary().promptVersion).toHaveLength(12);
	});

	it('serves a repeat of the same chunk from the cache', async () => {
		const model = mockModel(GOOD_OUTPUT);
		const judge = judgeWith(model);

		await judge.analyze(change([4, 5, 6]), [judgeRule]);
		const again = await judge.analyze(change([4, 5, 6]), [judgeRule]);

		expect(again).toHaveLength(1);
		expect(model.doGenerateCalls).toHaveLength(1);
		expect(judge.summary()).toMatchObject({ calls: 1, cachedCalls: 1 });
		expect(await readdir(cacheDir)).toHaveLength(1);
	});

	it('skips files with too few changed lines without calling the model', async () => {
		const model = mockModel(GOOD_OUTPUT);
		const judge = judgeWith(model);

		expect(await judge.analyze(change([4]), [judgeRule])).toEqual([]);
		expect(model.doGenerateCalls).toHaveLength(0);
		expect(judge.summary().skipped).toEqual([{ path: 'src/counter.ts', reason: SkipReason.TOO_SMALL }]);
	});

	it('does nothing when no judge rules apply', async () => {
		const model = mockModel(GOOD_OUTPUT);
		const judge = judgeWith(model);

		expect(await judge.analyze(change([4, 5, 6]), [astRule])).toEqual([]);
		expect(model.doGenerateCalls).toHaveLength(0);
	});

	it('stops calling once the token budget is spent', async () => {
		const model = mockModel(GOOD_OUTPUT);
		const judge = judgeWith(model, { maxInputTokens: 10 });

		expect(await judge.analyze(change([4, 5, 6]), [judgeRule])).toEqual([]);
		expect(model.doGenerateCalls).toHaveLength(0);
		expect(judge.summary().skipped).toEqual([{ path: 'src/counter.ts', reason: SkipReason.BUDGET }]);
	});
});
