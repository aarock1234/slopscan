import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { jevConfigSchema } from './analyzers/jev.js';
import { judgeConfigSchema } from './analyzers/judge.js';
import { scoringSchema } from './score.js';
import { ConfigError } from './shared/errors.js';
import { verifyConfigSchema } from './verify.js';

const CONFIG_FILE = '.slopscan.yml';

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
		jev: jevConfigSchema.prefault({}),
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
	const raw = await readConfigFile(path, explicitPath !== undefined);
	const result = configSchema.safeParse(raw);

	if (!result.success) {
		const issues = result.error.issues.map(issue => ` - ${issue.path.join('.')}: ${issue.message}`);

		throw new ConfigError([`invalid config at ${path}:`, ...issues].join('\n'));
	}

	return result.data;
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
