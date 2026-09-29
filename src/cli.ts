#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { loadConfig } from './config.js';
import { Format, formatValues, isFormat, renderReport } from './report.js';
import { loadRules } from './rule.js';
import { scan } from './scan.js';
import { SlopscanError } from './shared/errors.js';
import { logger } from './shared/log.js';
import { RULES_DIR } from './shared/paths.js';
import { buildTiers } from './tiers.js';

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

	const report = await scan({
		repo,
		range: { base: values.base, head: values.head },
		config,
		rules,
		// the judge flag wins over the config; without either the expensive tier stays off
		...buildTiers(repo, config, {
			judge: values.judge ?? config.judge.enabled,
			jev: values.jev,
			verify: values.verify,
		}),
		...(values.baseline !== undefined && { baseline: values.baseline }),
	});

	process.stdout.write(renderReport(report, { format: values.format, color: process.stdout.isTTY }));

	if (values['json-out'] !== undefined) {
		await writeFile(values['json-out'], renderReport(report, { format: Format.JSON, color: false }));
	}

	logger.debug({ files: report.files, findings: report.findings.length, overall: report.overall }, 'scan complete');

	return report.overall > config.failThreshold ? ExitCode.FAILED_THRESHOLD : ExitCode.OK;
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
