#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { TypeSafeClient } from '@typesafe-ai/sdk';

import { createJev } from './analyzers/jev.js';
import type { Jev } from './analyzers/jev.js';
import { createJudge } from './analyzers/judge.js';
import type { Judge } from './analyzers/judge.js';
import { loadConfig } from './config.js';
import type { Config } from './config.js';
import { hasKey, resolveModel } from './model.js';
import { Format, formatValues, isFormat, renderReport } from './report.js';
import { loadRules } from './rule.js';
import { scan } from './scan.js';
import { env } from './shared/env.js';
import { SlopscanError } from './shared/errors.js';
import { logger } from './shared/log.js';
import { RULES_DIR } from './shared/paths.js';
import { createVerifier } from './verify.js';
import type { Verifier } from './verify.js';

const HELP = `slopscan - scores a git diff for slop

usage:
  slopscan scan [--base <ref>] [--head <ref>] [--baseline <ref>] [--format <fmt>]
                [--judge] [--no-jev] [--no-verify] [--config <path>]
  slopscan rules

options:
  --base <ref>       ref to diff against (default: main)
  --head <ref>       ref to score (default: HEAD)
  --baseline <ref>   also score baseline..base and show the delta
  --format <fmt>     ${formatValues.join(', ')} (default: ${Format.TERMINAL})
  --judge            run the LLM judge over whole files, the thorough and expensive tier (default: judge.enabled)
  --no-jev           skip the Jev decision model over changed functions and types (on when TYPESAFE_API_KEY is set)
  --no-verify        drop Jev's less confident findings instead of checking them with the verifier model
  --config <path>    path to .slopscan.yml (default: ./.slopscan.yml)
  --rules <dir>      rule directory (default: the bundled rules)
  --json-out <path>  also write the full report as json to this file
  -h, --help         show this help

exit codes: 0 under the fail threshold, 1 over it, 2 on error
`;

const CACHE_DIR = '.slopscan-cache';

const ExitCode = {
	OK: 0,
	FAILED_THRESHOLD: 1,
	ERROR: 2,
} as const;

type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

const Command = {
	SCAN: 'scan',
	RULES: 'rules',
} as const;

const parseOptions = {
	options: {
		base: { type: 'string', default: 'main' },
		head: { type: 'string', default: 'HEAD' },
		baseline: { type: 'string' },
		format: { type: 'string', default: Format.TERMINAL },
		judge: { type: 'boolean' },
		jev: { type: 'boolean', default: true },
		verify: { type: 'boolean', default: true },
		config: { type: 'string' },
		rules: { type: 'string', default: RULES_DIR },
		'json-out': { type: 'string' },
		help: { type: 'boolean', short: 'h', default: false },
	},
	allowPositionals: true,
	allowNegative: true,
	strict: true,
} as const;

type Options = ReturnType<typeof parseArgs<typeof parseOptions>>['values'];

async function main(argv: readonly string[]): Promise<ExitCode> {
	const { values, positionals } = parseArgs({ ...parseOptions, args: [...argv] });
	const command = positionals[0];

	if (values.help || command === undefined) {
		process.stdout.write(HELP);

		return ExitCode.OK;
	}

	switch (command) {
		case Command.SCAN:
			return runScan(values);
		case Command.RULES:
			return listRules(values.rules);
		default:
			throw new Error(`unknown command "${command}"`);
	}
}

async function runScan(values: Options): Promise<ExitCode> {
	if (!isFormat(values.format)) {
		throw new Error(`unknown format "${values.format}"; expected one of ${formatValues.join(', ')}`);
	}

	const repo = process.cwd();
	const [config, rules] = await Promise.all([loadConfig(repo, values.config), loadRules(values.rules)]);
	// the flag wins over the config; without either the expensive tier stays off
	const judge = (values.judge ?? config.judge.enabled) ? buildJudge(repo, config) : undefined;
	const jev =
		values.jev && config.jev.enabled && env.TYPESAFE_API_KEY !== undefined ? buildJev(repo, config) : undefined;
	// without the verifier model's key, low-confidence jev findings are dropped instead of checked
	const verifier =
		jev && values.verify && config.verify.enabled && hasKey(config.verify.model)
			? buildVerifier(repo, config)
			: undefined;

	const report = await scan({
		repo,
		range: { base: values.base, head: values.head },
		config,
		rules,
		...(judge && { judge }),
		...(jev && { jev }),
		...(verifier && { verifier }),
		...(values.baseline !== undefined && { baseline: values.baseline }),
	});

	process.stdout.write(renderReport(report, { format: values.format, color: process.stdout.isTTY }));

	if (values['json-out'] !== undefined) {
		await writeFile(values['json-out'], renderReport(report, { format: Format.JSON, color: false }));
	}

	logger.debug({ files: report.files, findings: report.findings.length, overall: report.overall }, 'scan complete');

	return report.overall > config.failThreshold ? ExitCode.FAILED_THRESHOLD : ExitCode.OK;
}

function buildJudge(repo: string, config: Config): Judge {
	return createJudge({
		config: config.judge,
		model: resolveModel(config.judge.model),
		cacheDir: join(repo, CACHE_DIR, 'judge'),
	});
}

function buildJev(repo: string, config: Config): Jev {
	return createJev({
		client: new TypeSafeClient({ apiKey: env.TYPESAFE_API_KEY, defaultModel: config.jev.model }),
		config: config.jev,
		repo,
		ignore: config.ignore,
	});
}

function buildVerifier(repo: string, config: Config): Verifier {
	return createVerifier({
		model: resolveModel(config.verify.model),
		modelId: config.verify.model,
		config: config.verify,
		repo,
		cacheDir: join(repo, CACHE_DIR, 'verify'),
		confidenceFloor: config.jev.confidenceFloor,
	});
}

async function listRules(rulesDir: string): Promise<ExitCode> {
	const rules = await loadRules(rulesDir);

	for (const rule of rules) {
		process.stdout.write(
			`${rule.id.padEnd(44)} ${rule.severity.padEnd(8)} ${rule.detect.padEnd(5)} ${rule.message}\n`
		);
	}

	return ExitCode.OK;
}

main(process.argv.slice(2))
	.then(code => {
		process.exitCode = code;
	})
	.catch((error: unknown) => {
		// our own errors carry a readable message; anything else is a bug and deserves the stack
		if (error instanceof SlopscanError) {
			process.stderr.write(`error: ${error.message}\n`);
		} else {
			logger.error({ err: error }, 'slopscan failed');
		}

		process.exitCode = ExitCode.ERROR;
	});
