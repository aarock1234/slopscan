// scans a whole repository with a decision model at unit granularity, through the same units, state, questions, and
// batching the product uses on changed units, and writes every judgment over threshold as json so variants can be
// compared against hand-labeled results with decision-compare.
//
//   pnpm script scripts/decision-scan.ts --out <file> [--model <spec>] [--repo <path>] [--lang ts|go]
//                                        [--max-rules-per-call <n>] [--max-units-per-call <n>]
//                                        [--rule <id>] [--threshold <p>] [--include-tests]
//
// model: a decision.model spec such as openrouter/cloudflare/clef (default: slopscan's default decision model)
// max-rules-per-call, max-units-per-call: decision.maxRulesPerCall and decision.maxUnitsPerCall
// threshold: the fallback for rules with no threshold measured for the model; without it those rules are not asked

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';

import { DEFAULT_DECISION_MODEL, decide, isAskable } from '../src/analyzers/decision.js';
import { isIgnored } from '../src/change.js';
import { Lang, detectLang, langValues, ruleAppliesTo } from '../src/lang.js';
import { resolveDecisionClient } from '../src/model.js';
import { loadRules } from '../src/rule.js';
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
		model: {
			type: 'string',
			default: DEFAULT_DECISION_MODEL,
		},
		'max-rules-per-call': { type: 'string' },
		'max-units-per-call': { type: 'string' },
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

const fallbackThreshold = optionalNumber(values.threshold);
const batching = {
	maxRulesPerCall: optionalNumber(values['max-rules-per-call']),
	maxUnitsPerCall: optionalNumber(values['max-units-per-call']),
};
const repo = resolve(values.repo);

export type Finding = {
	readonly path: string;
	readonly line: number;
	readonly name: string;
	readonly ruleId: string;
	readonly probability: number;
	readonly confidence: number;
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
	const model = values.model;
	const client = resolveDecisionClient(model);
	const rules = (await loadRules(RULES_DIR))
		.filter(isAskable)
		.filter(
			rule =>
				ruleAppliesTo(rule.lang, lang) &&
				(values.rule === undefined || rule.id === values.rule) &&
				thresholdFor(rule, model) !== undefined
		);
	const units = await collectUnits(lang);

	logger.info(
		{
			repo,
			model,
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

			return applicable.length === 0 ? undefined : decide(client, lang, fileUnits, applicable, batching);
		},
		{ concurrency: CONCURRENT_FILES }
	);

	for (const decided of perFile) {
		if (decided === undefined) {
			continue;
		}

		calls += decided.calls;
		inputTokens += decided.inputTokens;

		for (const { unit, rule, probability, confidence } of decided.judgments) {
			if (probability >= (thresholdFor(rule, model) ?? Number.POSITIVE_INFINITY)) {
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

function optionalNumber(value: string | undefined): number | undefined {
	return value === undefined ? undefined : Number(value);
}

function thresholdFor(rule: JudgeRule, model: string): number | undefined {
	return rule.decisionThresholds[model] ?? fallbackThreshold;
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
	logger.error({ err: error }, 'decision-scan failed');
	process.exitCode = 1;
});
