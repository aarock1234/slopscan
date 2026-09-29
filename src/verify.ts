import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { NoOutputGeneratedError, Output, generateText, stepCountIs, tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';

import { Origin } from './finding.js';
import type { Change } from './change.js';
import type { Finding } from './finding.js';
import { Lang, detectLang } from './lang.js';
import { Detect } from './rule.js';
import type { JudgeRule, Rule } from './rule.js';
import { mapConcurrent } from './shared/concurrency.js';
import { loadPrompt } from './shared/prompts.js';

const execFileAsync = promisify(execFile);

export const verifyConfigSchema = z
	.object({
		enabled: z.boolean().default(true),
		// "<provider>/<model id>"; a small model does this job: on 34 checks across two repositories Luna gave the same
		// verdict as Sol every time, at a twentieth of the price
		model: z.string().default('openrouter/openai/gpt-6-luna'),
		// tool calls the verifier may make before it must answer
		maxSteps: z.number().int().positive().default(6),
	})
	.strict();

export type VerifyConfig = z.infer<typeof verifyConfigSchema>;

export const verifySummarySchema = z.object({
	model: z.string(),
	checked: z.number().int().nonnegative(),
	confirmed: z.number().int().nonnegative(),
	rejected: z.number().int().nonnegative(),
	cachedCalls: z.number().int().nonnegative(),
	inputTokens: z.number().int().nonnegative(),
});

export type VerifySummary = z.infer<typeof verifySummarySchema>;

export type Verified = {
	readonly kept: readonly Finding[];
	readonly rejected: readonly Finding[];
};

export type Verifier = {
	verify(findings: readonly Finding[], changes: readonly Change[], rules: readonly Rule[]): Promise<Verified>;
	summary(): VerifySummary;
};

export type VerifierOptions = {
	model: LanguageModel;
	modelId: string;
	config: VerifyConfig;
	repo: string;
	cacheDir: string;
	// jev findings at or above this confidence pass without a check
	confidenceFloor: number;
};

const VerdictKind = {
	CONFIRMED: 'confirmed',
	REJECTED: 'rejected',
	UNCERTAIN: 'uncertain',
} as const;

const verdictSchema = z.object({
	verdict: z.enum(VerdictKind),
	// one sentence a reviewer can check
	reason: z.string().max(300),
	// the offending line copied verbatim from the code, or null when not confirming
	quote: z.string().nullable(),
});

type Verdict = z.infer<typeof verdictSchema>;

// what a check becomes when the model spends every step on tools and never answers
const OUT_OF_STEPS: Verdict = {
	verdict: VerdictKind.UNCERTAIN,
	reason: 'the verifier ran out of steps before answering',
	quote: null,
};

const MAX_FILE_LINES = 200;
const MAX_REFERENCES = 30;
const CONTEXT_BEFORE = 5;
const CONTEXT_AFTER = 60;
const CONCURRENT_CHECKS = 4;
const PROMPT_NAME = 'verify';

// the LLM judge as a bounded agent over Jev's less confident findings: two tools, a step cap, one structured verdict.
// confirmed findings keep their line but take the verifier's quote; rejected and uncertain ones are dropped.
// the candidate comes from the change's head-side source; the tools read the working tree, as confirm does.
export function createVerifier(options: VerifierOptions): Verifier {
	const summary: VerifySummary = {
		model: options.modelId,
		checked: 0,
		confirmed: 0,
		rejected: 0,
		cachedCalls: 0,
		inputTokens: 0,
	};

	async function verify(
		findings: readonly Finding[],
		changes: readonly Change[],
		rules: readonly Rule[]
	): Promise<Verified> {
		const rulesById = new Map(
			rules.filter((rule): rule is JudgeRule => rule.detect === Detect.JUDGE).map(rule => [rule.id, rule])
		);
		const sources = new Map(changes.map(change => [change.path, change.source]));
		const [trackedPaths] = await Promise.all([
			trackedFiles(options.repo),
			mkdir(options.cacheDir, { recursive: true }),
		]);
		const tracked = new Set(trackedPaths);

		const results = await mapConcurrent(
			findings,
			async finding => {
				const rule = rulesById.get(finding.ruleId);
				const source = sources.get(finding.path);

				if (
					finding.origin !== Origin.JEV ||
					finding.confidence >= options.confidenceFloor ||
					rule === undefined ||
					source === undefined
				) {
					return {
						finding,
						verdict: undefined,
					};
				}

				return {
					finding,
					verdict: await check(finding, rule, source, tracked),
				};
			},
			{ concurrency: CONCURRENT_CHECKS }
		);

		return partition(results);
	}

	// unchecked findings stay; confirmed ones take the verifier's quote and reason; the rest are rejected
	function partition(results: readonly Checked[]): Verified {
		const kept: Finding[] = [];
		const rejected: Finding[] = [];

		for (const { finding, verdict } of results) {
			if (verdict === undefined) {
				kept.push(finding);

				continue;
			}

			summary.checked += 1;

			if (verdict.verdict === VerdictKind.CONFIRMED) {
				summary.confirmed += 1;
				kept.push({
					...finding,
					quote: verdict.quote ?? finding.quote,
					message: verdict.reason,
				});
			} else {
				summary.rejected += 1;
				rejected.push({
					...finding,
					message: verdict.reason,
				});
			}
		}

		return {
			kept,
			rejected,
		};
	}

	async function check(
		finding: Finding,
		rule: JudgeRule,
		source: string,
		tracked: ReadonlySet<string>
	): Promise<Verdict> {
		const cachePath = join(options.cacheDir, `${cacheKey(options.modelId, finding, rule)}.json`);
		const cached = await readCached(cachePath);

		if (cached !== undefined) {
			summary.cachedCalls += 1;

			return cached;
		}

		const result = await generateText({
			model: options.model,
			system: loadPrompt(PROMPT_NAME),
			prompt: renderCandidate(finding, rule, source),
			tools: repositoryTools(options.repo, tracked),
			stopWhen: stepCountIs(options.config.maxSteps),
			// the last step has no tools, so the model must answer instead of reading one more file
			prepareStep: ({ stepNumber }) =>
				stepNumber >= options.config.maxSteps - 1 ? { toolChoice: 'none' } : undefined,
			output: Output.object({
				schema: verdictSchema,
				name: 'verdict',
			}),
			temperature: 0,
			maxRetries: 2,
		});

		summary.inputTokens += result.usage.inputTokens ?? 0;
		const verdict = readVerdict(result);

		if (verdict === undefined) {
			// not cached, so a later run with more steps gets another try
			return OUT_OF_STEPS;
		}

		await writeFile(cachePath, JSON.stringify(verdict, null, 2));

		return verdict;
	}

	return {
		verify,
		summary: () => ({ ...summary }),
	};
}

type Checked = {
	finding: Finding;
	verdict: Verdict | undefined;
};

// the same finding under the same rule text and model answers the same, so a run over an unchanged commit is free
function cacheKey(modelId: string, finding: Finding, rule: JudgeRule): string {
	return createHash('sha256')
		.update(`${modelId}\n${finding.path}:${finding.line}\n${finding.ruleId}\n${rule.why}\n${finding.quote}`)
		.digest('hex');
}

// what the verifier may do besides read the candidate: look at a tracked file, or grep a symbol
function repositoryTools(repo: string, tracked: ReadonlySet<string>) {
	return {
		read_file: tool({
			description: `read a range of a tracked file in the repository, at most ${MAX_FILE_LINES} lines per call`,
			inputSchema: z.object({
				path: z.string(),
				startLine: z.number().int().positive().default(1),
				endLine: z.number().int().positive().optional(),
			}),
			execute: ({ path, startLine, endLine }) => readRange(repo, tracked, path, startLine, endLine),
		}),
		find_references: tool({
			description: `find lines across the repository that mention a symbol, at most ${MAX_REFERENCES} results`,
			inputSchema: z.object({ symbol: z.string().min(1) }),
			execute: ({ symbol }) => findReferences(repo, symbol),
		}),
	};
}

// the sdk throws when a run ends without the structured answer; that is an outcome here, not a crash
function readVerdict(result: { readonly output: Verdict }): Verdict | undefined {
	try {
		return result.output;
	} catch (error) {
		if (NoOutputGeneratedError.isInstance(error)) {
			return undefined;
		}

		throw error;
	}
}

function renderCandidate(finding: Finding, rule: JudgeRule, source: string): string {
	const lines = source.split('\n');
	const start = Math.max(1, finding.line - CONTEXT_BEFORE);
	const end = Math.min(lines.length, finding.line + CONTEXT_AFTER);
	const excerpt = lines
		.slice(start - 1, end)
		.map((text, index) => `${String(start + index).padStart(5)}  ${text}`)
		.join('\n');

	return [
		`Candidate: ${finding.path}:${finding.line}. The classifier's confidence was ${finding.confidence.toFixed(2)}.`,
		'',
		`Rule ${rule.id}: ${rule.message}`,
		rule.why,
		rule.falsePositives.length > 0
			? `Not a violation:\n${rule.falsePositives.map(item => `- ${item}`).join('\n')}`
			: '',
		'',
		`Bad example:\n\`\`\`\n${rule.bad[0]?.source ?? ''}\n\`\`\``,
		`Good example:\n\`\`\`\n${rule.good[0]?.source ?? ''}\n\`\`\``,
		'',
		`Code, ${finding.path} lines ${start}-${end}:`,
		'```',
		excerpt,
		'```',
	].join('\n');
}

async function readCached(path: string): Promise<Verdict | undefined> {
	try {
		return verdictSchema.parse(JSON.parse(await readFile(path, 'utf-8')));
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			return undefined;
		}

		throw error;
	}
}

async function readRange(
	repo: string,
	tracked: ReadonlySet<string>,
	path: string,
	startLine: number,
	endLine?: number
): Promise<string> {
	const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');

	if (!tracked.has(normalized)) {
		return `not a tracked file: ${normalized}`;
	}

	const text = await readWorkingTree(join(repo, normalized));

	if (text === undefined) {
		return `not present in the working tree: ${normalized}`;
	}

	const lines = text.split('\n');
	const last = Math.min(lines.length, endLine ?? startLine + MAX_FILE_LINES - 1, startLine + MAX_FILE_LINES - 1);

	return lines
		.slice(startLine - 1, last)
		.map((text, index) => `${String(startLine + index).padStart(5)}  ${text}`)
		.join('\n');
}

// a tracked file can still be missing on disk, as with a file removed but not yet committed
async function readWorkingTree(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, 'utf-8');
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			return undefined;
		}

		throw error;
	}
}

async function findReferences(repo: string, symbol: string): Promise<string> {
	try {
		const { stdout } = await execFileAsync('git', ['grep', '-n', '-w', '--', symbol], {
			cwd: repo,
			encoding: 'utf-8',
		});
		const hits = stdout.split('\n').filter(line => {
			const path = line.split(':')[0] ?? '';

			return line.length > 0 && (detectLang(path) === Lang.TS || detectLang(path) === Lang.GO);
		});

		return hits.length === 0 ? 'no references' : hits.slice(0, MAX_REFERENCES).join('\n');
	} catch {
		// git grep exits 1 when nothing matches
		return 'no references';
	}
}

async function trackedFiles(repo: string): Promise<string[]> {
	const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
		cwd: repo,
		encoding: 'utf-8',
	});

	return stdout.split('\0').filter(path => path.length > 0);
}
