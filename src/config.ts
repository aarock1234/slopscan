import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { decisionConfigSchema } from './analyzers/decision.js';
import { judgeConfigSchema } from './analyzers/judge.js';
import { scoringSchema } from './score.js';
import { logger } from './shared/log.js';
import { ConfigError } from './shared/errors.js';
import { verifyConfigSchema } from './verify.js';

const CONFIG_FILE = '.slopscan.yml';
const LEGACY_DECISION_SECTION = 'jev';

// generated and vendored code is never the author's slop
const DEFAULT_IGNORE = [
	'**/node_modules/**',
	'**/dist/**',
	'**/vendor/**',
	'**/*.d.ts',
	'**/*.pb.go',
	'**/*_gen.go',
	'**/*.generated.*',
	'**/pnpm-lock.yaml',
];

export const configSchema = z
	.object({
		// added to the defaults, not replacing them
		ignore: z.array(z.string()).default([]),
		// rule id -> enabled; anything not listed is enabled
		rules: z.record(z.string(), z.boolean()).default({}),
		failThreshold: z.number().min(0).max(100).default(45),
		scoring: scoringSchema.prefault({}),
		judge: judgeConfigSchema.prefault({}),
		decision: decisionConfigSchema.prefault({}),
		verify: verifyConfigSchema.prefault({}),
	})
	.strict()
	.transform(config => ({
		...config,
		ignore: [...DEFAULT_IGNORE, ...config.ignore],
	}));

export type Config = z.infer<typeof configSchema>;

// reads .slopscan.yml from cwd, or the given path. a missing default file means defaults; a missing
// explicit file is a mistake.
export async function loadConfig(cwd: string, explicitPath?: string): Promise<Config> {
	const path = resolve(cwd, explicitPath ?? CONFIG_FILE);
	const raw = withDecisionSection(await readConfigFile(path, explicitPath !== undefined), path);
	const result = configSchema.safeParse(raw);

	if (!result.success) {
		const issues = result.error.issues.map(issue => ` - ${issue.path.join('.')}: ${issue.message}`);

		throw new ConfigError([`invalid config at ${path}:`, ...issues].join('\n'));
	}

	if (result.data.scoring.damping !== undefined) {
		logger.warn({ path }, 'scoring.damping is ignored since 0.4; repeated findings damp by square root');
	}

	return withModelProvider(result.data, path);
}

// the decision section used to be named jev, after the first model it ran; a config that says jev reads the same
function withDecisionSection(raw: unknown, path: string): unknown {
	if (!isRecord(raw) || !(LEGACY_DECISION_SECTION in raw)) {
		return raw;
	}

	if ('decision' in raw) {
		throw new ConfigError(`${path}: ${LEGACY_DECISION_SECTION} is the old name of decision; keep only decision`);
	}

	logger.warn({ path }, `${LEGACY_DECISION_SECTION} is now named decision; read as decision`);
	const { [LEGACY_DECISION_SECTION]: decision, ...rest } = raw;

	return {
		...rest,
		decision,
	};
}

// decision.model used to be a bare TypeSafe model id; it still means that model, spelled with its provider
function withModelProvider(config: Config, path: string): Config {
	const { model } = config.decision;

	if (model.includes('/')) {
		return config;
	}

	logger.warn({ path }, `decision.model "${model}" names no provider; read as typesafe/${model}`);

	return {
		...config,
		decision: {
			...config.decision,
			model: `typesafe/${model}`,
		},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readConfigFile(path: string, required: boolean): Promise<unknown> {
	try {
		return parseYaml(await readFile(path, 'utf-8')) ?? {};
	} catch (error) {
		if (!required && isMissingFile(error)) {
			return {};
		}

		throw new ConfigError(`reading ${path}`, { cause: error });
	}
}

function isMissingFile(error: unknown): boolean {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
