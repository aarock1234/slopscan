import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Output, generateText } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';

import type { Analyzer } from '../analyzer.js';
import type { Change } from '../change.js';
import type { Finding } from '../finding.js';
import { Detect } from '../rule.js';
import type { JudgeRule, Rule } from '../rule.js';
import { logger } from '../shared/log.js';
import { loadPrompt } from '../shared/prompts.js';
import { chunkChange } from './judge-chunks.js';
import type { Chunk } from './judge-chunks.js';
import { judgeOutputSchema, validateFindings } from './judge-validate.js';
import type { JudgeOutput } from './judge-validate.js';

export const judgeConfigSchema = z
	.object({
		// the judge is the thorough, expensive tier: off unless this or --judge turns it on
		enabled: z.boolean().default(false),
		// "<provider>/<model id>"; see model.ts for providers
		model: z.string().default('openai/gpt-6-sol'),
		// total prompt tokens one run may spend before it starts skipping files
		maxInputTokens: z.number().int().positive().default(500_000),
		// files with fewer changed lines than this skip the judge
		minChangedLines: z.number().int().positive().default(3),
		// prompt tokens of code per model call
		chunkTokens: z.number().int().positive().default(6000),
		minConfidence: z.number().min(0).max(1).default(0.6),
		maxOutputTokens: z.number().int().positive().default(2000),
		// wall-clock cap per model call, retries included
		timeoutMs: z.number().int().positive().default(90_000),
	})
	.strict();

export type JudgeConfig = z.infer<typeof judgeConfigSchema>;

export const SkipReason = {
	BUDGET: 'budget',
	TOO_SMALL: 'too-small',
} as const;

export type SkipReason = (typeof SkipReason)[keyof typeof SkipReason];

export const judgeSummarySchema = z.object({
	model: z.string(),
	promptVersion: z.string(),
	calls: z.number().int().nonnegative(),
	cachedCalls: z.number().int().nonnegative(),
	inputTokens: z.number().int().nonnegative(),
	outputTokens: z.number().int().nonnegative(),
	skipped: z.array(
		z.object({
			path: z.string(),
			reason: z.enum([SkipReason.BUDGET, SkipReason.TOO_SMALL]),
		})
	),
});

export type JudgeSummary = z.infer<typeof judgeSummarySchema>;

export type Judge = {
	analyze: Analyzer;
	summary(): JudgeSummary;
};

export type JudgeOptions = {
	config: JudgeConfig;
	model: LanguageModel;
	cacheDir: string;
};

const PROMPT_NAME = 'judge';
const PROMPT_VERSION_LENGTH = 12;

// one model call per chunk of changed code, with the judge rules for that language as the rubric.
// results are cached by content so the same head commit always produces the same findings.
export function createJudge(options: JudgeOptions): Judge {
	let remainingTokens = options.config.maxInputTokens;
	const summary: JudgeSummary = {
		model: options.config.model,
		promptVersion: '',
		calls: 0,
		cachedCalls: 0,
		inputTokens: 0,
		outputTokens: 0,
		skipped: [],
	};

	async function analyze(change: Change, rules: readonly Rule[]): Promise<Finding[]> {
		const judgeRules = rules.filter((rule): rule is JudgeRule => rule.detect === Detect.JUDGE);
		const ruleIds = judgeRules.map(rule => rule.id);

		if (!isNonEmpty(ruleIds)) {
			return [];
		}

		if (change.changedLines.size < options.config.minChangedLines) {
			summary.skipped.push({ path: change.path, reason: SkipReason.TOO_SMALL });

			return [];
		}

		const astRuleIds = rules.filter(rule => rule.detect === Detect.AST).map(rule => rule.id);
		const system = loadPrompt(PROMPT_NAME, {
			RULES: renderRules(judgeRules),
			HANDLED_BY_AST: astRuleIds.length > 0 ? astRuleIds.join(', ') : 'none',
		});
		summary.promptVersion = hash(system).slice(0, PROMPT_VERSION_LENGTH);

		const schema = judgeOutputSchema(ruleIds);
		const rulesById = new Map(judgeRules.map(rule => [rule.id, rule]));
		const raw: JudgeOutput['findings'] = [];

		for (const chunk of chunkChange(change, options.config.chunkTokens)) {
			const estimated = chunk.estimatedTokens + estimateSystemTokens(system);

			if (estimated > remainingTokens) {
				summary.skipped.push({ path: change.path, reason: SkipReason.BUDGET });

				break;
			}

			const output = await judgeChunk(chunk, system, schema);
			raw.push(...output.findings);
		}

		return validateFindings(raw, change, rulesById, options.config.minConfidence);
	}

	async function judgeChunk(chunk: Chunk, system: string, schema: ReturnType<typeof judgeOutputSchema>) {
		const key = hash(`${options.config.model}\n${system}\n${chunk.text}`);
		const cached = await readCache(options.cacheDir, key, schema);

		if (cached !== undefined) {
			summary.cachedCalls += 1;
			logger.debug({ path: chunk.path, cached: true, findings: cached.findings }, 'judge output');

			return cached;
		}

		const result = await generateText({
			model: options.model,
			output: Output.object({ schema, name: 'findings' }),
			system,
			prompt: chunk.text,
			temperature: 0,
			maxRetries: 2,
			maxOutputTokens: options.config.maxOutputTokens,
			timeout: options.config.timeoutMs,
		});

		summary.calls += 1;
		summary.inputTokens += result.usage.inputTokens ?? 0;
		summary.outputTokens += result.usage.outputTokens ?? 0;
		remainingTokens -= result.usage.inputTokens ?? chunk.estimatedTokens;
		logger.debug({ path: chunk.path, cached: false, findings: result.output.findings }, 'judge output');

		await writeCache(options.cacheDir, key, result.output);

		return result.output;
	}

	return {
		analyze,
		summary: () => structuredClone(summary),
	};
}

// the rubric: id, message, why, the shortest bad and good example, and known false positives
function renderRules(rules: readonly JudgeRule[]): string {
	return rules
		.map(rule => {
			const bad = shortest(rule.bad.map(example => example.source));
			const good = shortest(rule.good.map(example => example.source));
			const falsePositives =
				rule.falsePositives.length > 0
					? `\nNot a violation:\n${rule.falsePositives.map(item => `- ${item}`).join('\n')}`
					: '';
			const symbol = rule.confirm ? '\nProvide `symbol`: the name this finding is about.' : '';

			return [
				`### ${rule.id}`,
				`Message: ${rule.message}`,
				rule.why,
				`Bad:\n\`\`\`\n${bad}\n\`\`\``,
				`Good:\n\`\`\`\n${good}\n\`\`\`${falsePositives}${symbol}`,
			].join('\n\n');
		})
		.join('\n\n');
}

function shortest(sources: readonly string[]): string {
	return sources.reduce((best, source) => (source.length < best.length ? source : best), sources[0] ?? '');
}

const systemTokenCache = new Map<string, number>();

function estimateSystemTokens(system: string): number {
	const cached = systemTokenCache.get(system);

	if (cached !== undefined) {
		return cached;
	}

	const estimate = Math.ceil(system.length / 4);
	systemTokenCache.set(system, estimate);

	return estimate;
}

async function readCache(
	dir: string,
	key: string,
	schema: ReturnType<typeof judgeOutputSchema>
): Promise<JudgeOutput | undefined> {
	try {
		const parsed = schema.safeParse(JSON.parse(await readFile(join(dir, `${key}.json`), 'utf-8')));

		return parsed.success ? parsed.data : undefined;
	} catch (error) {
		if (isMissingFile(error)) {
			return undefined;
		}

		throw error;
	}
}

async function writeCache(dir: string, key: string, output: JudgeOutput): Promise<void> {
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, `${key}.json`), JSON.stringify(output, null, 2));
}

function isMissingFile(error: unknown): boolean {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function hash(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

function isNonEmpty<T>(items: readonly T[]): items is readonly [T, ...T[]] {
	return items.length > 0;
}
