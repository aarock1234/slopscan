// verifies Jev candidates with the LLM judge acting as a bounded agent: for each candidate it can read file
// ranges and find references to a symbol, then it must return one structured verdict. writes the confirmed
// findings in jev-scan's shape so jev-compare can score them.
//
//   pnpm script scripts/jev-verify.ts --in <jev-scan.json> --out <verified.json> [--repo <path>] [--all]
//
// by default only candidates under the confidence floor are verified and confident ones pass through; --all
// sends every candidate, which is what measuring the verifier itself needs.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';

import { Output, generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

import { loadConfig } from '../src/config.js';
import { Lang, detectLang } from '../src/lang.js';
import { resolveModel } from '../src/model.js';
import { Detect, loadRules } from '../src/rule.js';
import type { JudgeRule } from '../src/rule.js';
import { mapConcurrent } from '../src/shared/concurrency.js';
import { logger } from '../src/shared/log.js';
import { RULES_DIR } from '../src/shared/paths.js';

const execFileAsync = promisify(execFile);

const { values } = parseArgs({
	options: {
		in: { type: 'string' },
		out: { type: 'string' },
		repo: { type: 'string', default: process.cwd() },
		all: { type: 'boolean', default: false },
		'confidence-floor': { type: 'string', default: '0.45' },
	},
	strict: true,
});

const repo = resolve(values.repo);
const confidenceFloor = Number(values['confidence-floor']);

const candidateSchema = z.object({
	path: z.string(),
	line: z.number().int().positive(),
	name: z.string(),
	ruleId: z.string(),
	probability: z.number(),
	confidence: z.number().optional(),
});

type Candidate = z.infer<typeof candidateSchema>;

export const Verdict = {
	CONFIRMED: 'confirmed',
	REJECTED: 'rejected',
	UNCERTAIN: 'uncertain',
} as const;

const verdictSchema = z.object({
	verdict: z.enum([Verdict.CONFIRMED, Verdict.REJECTED, Verdict.UNCERTAIN]),
	// one sentence a reviewer can check
	reason: z.string().max(300),
	// the offending line copied verbatim from the code, or null when rejecting
	quote: z.string().nullable(),
});

type Verified = Candidate & z.infer<typeof verdictSchema> & { verified: boolean };

const MAX_STEPS = 6;
const MAX_FILE_LINES = 200;
const MAX_REFERENCES = 30;

const SYSTEM = `You verify one candidate finding produced by a fast classifier that reads one function at a time.
Decide whether the code really violates the rule as the rule describes it. You may read files and find references
when the judgment depends on something outside the function, such as how many callers a symbol has, whether a
schema lives in the same file, or what a type is. Be strict: confirm only when the violation is present as
described and none of the rule's listed exceptions apply; reject when the code is legitimate; say uncertain only
when the information you could reach does not settle it. Quote the offending line verbatim when confirming.`;

async function main(): Promise<void> {
	if (values.in === undefined || values.out === undefined) {
		throw new Error('--in and --out are required');
	}

	const candidates = z.array(candidateSchema).parse(JSON.parse(await readFile(values.in, 'utf-8')));
	const [config, rules] = await Promise.all([loadConfig(repo), loadRules(RULES_DIR)]);
	const rulesById = new Map(
		rules.filter((rule): rule is JudgeRule => rule.detect === Detect.JUDGE).map(rule => [rule.id, rule])
	);
	const model = resolveModel(config.judge.model);
	const tracked = new Set(await trackedFiles());
	const cacheDir = join(repo, '.slopscan-cache', 'verify');
	await mkdir(cacheDir, { recursive: true });

	let calls = 0;
	let inputTokens = 0;

	const verified = await mapConcurrent(
		candidates,
		async (candidate): Promise<Verified> => {
			const rule = rulesById.get(candidate.ruleId);

			if (rule === undefined) {
				throw new Error(`unknown rule ${candidate.ruleId}`);
			}

			// confident candidates pass through unless the run asks to verify everything
			if (!values.all && (candidate.confidence ?? 0) >= confidenceFloor) {
				return {
					...candidate,
					verdict: Verdict.CONFIRMED,
					reason: 'passed through on confidence',
					quote: null,
					verified: false,
				};
			}

			const key = createHash('sha256')
				.update(`${config.judge.model}\n${candidate.path}:${candidate.line}\n${candidate.ruleId}\n${rule.why}`)
				.digest('hex');
			const cachePath = join(cacheDir, `${key}.json`);
			const cached = await readCached(cachePath);

			if (cached !== undefined) {
				return { ...candidate, ...cached, verified: true };
			}

			const source = await readFile(join(repo, candidate.path), 'utf-8');
			const result = await generateText({
				model,
				system: SYSTEM,
				prompt: renderCandidate(candidate, rule, source),
				tools: {
					read_file: tool({
						description: `read a range of a tracked file in the repository, at most ${MAX_FILE_LINES} lines per call`,
						inputSchema: z.object({
							path: z.string(),
							startLine: z.number().int().positive().default(1),
							endLine: z.number().int().positive().optional(),
						}),
						execute: async ({ path, startLine, endLine }) => readRange(tracked, path, startLine, endLine),
					}),
					find_references: tool({
						description: `find lines across the repository that mention a symbol, at most ${MAX_REFERENCES} results`,
						inputSchema: z.object({ symbol: z.string().min(1) }),
						execute: async ({ symbol }) => findReferences(symbol),
					}),
				},
				stopWhen: stepCountIs(MAX_STEPS),
				output: Output.object({ schema: verdictSchema, name: 'verdict' }),
				temperature: 0,
				maxRetries: 2,
			});

			calls += 1;
			inputTokens += result.usage.inputTokens ?? 0;

			await writeFile(cachePath, JSON.stringify(result.output, null, 2));

			return { ...candidate, ...result.output, verified: true };
		},
		{ concurrency: 4 }
	);

	const confirmed = verified.filter(item => item.verdict === Verdict.CONFIRMED);
	await writeFile(values.out, JSON.stringify(confirmed, null, 2));
	printSummary(verified);
	logger.info({ calls, inputTokens, confirmed: confirmed.length, out: values.out }, 'done');
}

function renderCandidate(candidate: Candidate, rule: JudgeRule, source: string): string {
	const lines = source.split('\n');
	const start = Math.max(1, candidate.line - 5);
	const end = Math.min(lines.length, candidate.line + 60);
	const excerpt = lines
		.slice(start - 1, end)
		.map((text, index) => `${String(start + index).padStart(5)}  ${text}`)
		.join('\n');

	return [
		`Candidate: ${candidate.path}:${candidate.line}, function ${candidate.name}. The classifier gave violation probability ${candidate.probability.toFixed(2)}${candidate.confidence === undefined ? '' : ` with confidence ${candidate.confidence.toFixed(2)}`}.`,
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
		`Code, ${candidate.path} lines ${start}-${end}:`,
		'```',
		excerpt,
		'```',
	].join('\n');
}

async function readCached(path: string): Promise<z.infer<typeof verdictSchema> | undefined> {
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
	tracked: ReadonlySet<string>,
	path: string,
	startLine: number,
	endLine?: number
): Promise<string> {
	const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');

	if (!tracked.has(normalized)) {
		return `not a tracked file: ${normalized}`;
	}

	const lines = (await readFile(join(repo, normalized), 'utf-8')).split('\n');
	const last = Math.min(lines.length, endLine ?? startLine + MAX_FILE_LINES - 1, startLine + MAX_FILE_LINES - 1);

	return lines
		.slice(startLine - 1, last)
		.map((text, index) => `${String(startLine + index).padStart(5)}  ${text}`)
		.join('\n');
}

async function findReferences(symbol: string): Promise<string> {
	try {
		const { stdout } = await execFileAsync('git', ['grep', '-n', '-w', '--', symbol], {
			cwd: repo,
			encoding: 'utf-8',
		});
		const hits = stdout
			.split('\n')
			.filter(line => line.length > 0 && detectLang(line.split(':')[0] ?? '') === Lang.TS);

		return hits.length === 0 ? 'no references' : hits.slice(0, MAX_REFERENCES).join('\n');
	} catch {
		// git grep exits 1 when nothing matches
		return 'no references';
	}
}

async function trackedFiles(): Promise<string[]> {
	const { stdout } = await execFileAsync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf-8' });

	return stdout.split('\0').filter(path => path.length > 0);
}

function printSummary(verified: readonly Verified[]): void {
	for (const item of verified) {
		const marker = item.verified ? item.verdict.padEnd(9) : 'passed   ';
		process.stdout.write(
			`${marker} ${item.probability.toFixed(2)}/${(item.confidence ?? 0).toFixed(2)}  ${item.path}:${item.line}  ${item.ruleId}\n          ${item.reason}\n`
		);
	}

	const counts = Map.groupBy(verified, item => (item.verified ? item.verdict : 'passed'));
	process.stdout.write(
		`\n${[...counts.entries()].map(([verdict, items]) => `${verdict} ${items.length}`).join(', ')} of ${verified.length}\n`
	);
}

main().catch((error: unknown) => {
	logger.error({ err: error }, 'jev-verify failed');
	process.exitCode = 1;
});
