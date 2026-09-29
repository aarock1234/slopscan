import { z } from 'zod';

import { ConfigError } from './errors.js';

export const LogLevel = {
	DEBUG: 'debug',
	INFO: 'info',
	WARN: 'warn',
	ERROR: 'error',
	SILENT: 'silent',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

const logLevelValues = Object.values(LogLevel) as [LogLevel, ...LogLevel[]];

// provider keys are optional here: a scan without the judge needs none,
// and the judge asks for the one it needs with a clear error at use time.
const envSchema = z.object({
	OPENAI_API_KEY: z.string().min(1).optional(),
	OPENROUTER_API_KEY: z.string().min(1).optional(),
	TYPESAFE_API_KEY: z.string().min(1).optional(),
	LOG_LEVEL: z.enum(logLevelValues).default(LogLevel.INFO),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
	// a copied .env.example leaves keys blank; blank means unset, not "the empty string"
	const present = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value));
	const result = envSchema.safeParse(present);

	if (result.success) {
		return result.data;
	}

	const issues = result.error.issues.map(issue => ` - ${issue.path.join('.')}: ${issue.message}`);

	throw new ConfigError(['invalid environment variables:', ...issues].join('\n'));
}

export const env = parseEnv();
