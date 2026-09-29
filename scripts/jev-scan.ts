// scans a whole repository with Jev at unit granularity, through the same units, state, questions, and batching
// the product uses on changed units, and writes every judgment over threshold as json so variants can be
// compared against hand-labeled results with jev-compare.
//
//   pnpm script scripts/jev-scan.ts --out <file> [--repo <path>] [--lang ts|go] [--rule <id>] [--threshold <p>]
//                                   [--include-tests]
//
// threshold: the fallback for rules with no measured jev.threshold; without it those rules are not asked

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';

import { TypeSafeClient } from '@typesafe-ai/sdk';

import { judge } from '../src/analyzers/jev.js';
import { isIgnored } from '../src/change.js';
import { Lang, detectLang, langValues, ruleAppliesTo } from '../src/lang.js';
import { Detect, loadRules } from '../src/rule.js';
import type { JudgeRule } from '../src/rule.js';
import { mapConcurrent } from '../src/shared/concurrency.js';
import { logger } from '../src/shared/log.js';
import { PACKAGE_ROOT, RULES_DIR } from '../src/shared/paths.js';
import { countRepo, extractUnits } from '../src/units.js';
import type { Unit } from '../src/units.js';

const execFileAsync = promisify(execFile);

const { values } = parseArgs({
	options: {
		out: { type: 'string' },
		repo: {
			type: 'string',
			default: PACKAGE_ROOT,
		},
		lang: {
			type: 'string',
			default: Lang.TS,
		},
		rule: { type: 'string' },
		threshold: { type: 'string' },
		'include-tests': {
			type: 'boolean',
			default: false,
		},
	},
	strict: true,
});

const fallbackThreshold = values.threshold === undefined ? undefined : Number(values.threshold);
const repo = resolve(values.repo);

export type Finding = {
	path: string;
	line: number;
	name: string;
	ruleId: string;
	probability: number;
	confidence: number;
};

const CONCURRENT_FILES = 2;

const TEST_FILE = {
	[Lang.TS]: /\.test\.tsx?$/,
	[Lang.GO]: /_test\.go$/,
} as const;

async function main(): Promise<void> {
	if (values.out === undefined) {
		throw new Error('--out <file> is required');
	}

	if (!isLang(values.lang)) {
		throw new Error(`lang is one of ${langValues.join(', ')}`);
	}

	const lang = values.lang;
	const client = new TypeSafeClient();
	const rules = (await loadRules(RULES_DIR)).filter(
		(rule): rule is JudgeRule =>
			rule.detect === Detect.JUDGE &&
			ruleAppliesTo(rule.lang, lang) &&
			(values.rule === undefined || rule.id === values.rule) &&
			(rule.jevThreshold !== undefined || fallbackThreshold !== undefined)
	);
	const units = await collectUnits(lang);

	logger.info(
		{
			repo,
			lang,
			units: units.length,
			rules: rules.length,
		},
		'scanning'
	);

	// rules ignore paths, so each file's units are judged with the rules that apply to that file
	const byPath = Map.groupBy(units, unit => unit.path);
	const findings: Finding[] = [];
	let calls = 0;
	let inputTokens = 0;

	// files are independent, so a few run at once; judge bounds the calls within each
	const perFile = await mapConcurrent(
		[...byPath],
		async ([path, fileUnits]) => {
			const applicable = rules.filter(rule => !isIgnored(path, rule.ignore));

			return applicable.length === 0 ? undefined : judge(client, lang, fileUnits, applicable);
		},
		{ concurrency: CONCURRENT_FILES }
	);

	for (const judged of perFile) {
		if (judged === undefined) {
			continue;
		}

		calls += judged.calls;
		inputTokens += judged.inputTokens;

		for (const { unit, rule, probability, confidence } of judged.judgments) {
			if (probability >= (rule.jevThreshold ?? fallbackThreshold ?? Number.POSITIVE_INFINITY)) {
				findings.push({
					path: unit.path,
					line: unit.line,
					name: unit.facts.name,
					ruleId: rule.id,
					probability,
					confidence,
				});
			}
		}
	}

	findings.sort((a, b) => b.probability - a.probability);
	await writeFile(values.out, JSON.stringify(findings, null, 2));
	printSummary(findings);
	logger.info(
		{
			calls,
			inputTokens,
			out: values.out,
		},
		'done'
	);
}

function isLang(value: string): value is Lang {
	return (langValues as readonly string[]).includes(value);
}

async function collectUnits(lang: Lang): Promise<Unit[]> {
	const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
		cwd: repo,
		encoding: 'utf-8',
	});
	const paths = stdout
		.split('\0')
		.filter(path => detectLang(path) === lang)
		.filter(path => !path.startsWith('fixtures/'));

	// tests count as callers and references even when they are not judged themselves
	const counts = await countRepo(repo, lang, paths);
	const judged = paths.filter(path => values['include-tests'] || !TEST_FILE[lang].test(path));

	const perFile = await mapConcurrent(judged, async path =>
		extractUnits(lang, path, await readFile(join(repo, path), 'utf-8'), counts)
	);

	return perFile.flat();
}

function printSummary(findings: readonly Finding[]): void {
	const byRule = Map.groupBy(findings, finding => finding.ruleId);
	process.stdout.write(`${findings.length} findings\n`);

	for (const [ruleId, group] of [...byRule.entries()].sort((a, b) => b[1].length - a[1].length)) {
		process.stdout.write(`  ${String(group.length).padStart(3)}  ${ruleId}\n`);
	}
}

main().catch((error: unknown) => {
	logger.error({ err: error }, 'jev-scan failed');
	process.exitCode = 1;
});
