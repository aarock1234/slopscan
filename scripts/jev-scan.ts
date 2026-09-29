// scans a whole repository with Jev at function granularity, the same units, facts, and questions the product's
// jev analyzer uses on changed functions, and writes the findings as json so variants can be compared against
// hand-labeled results with jev-compare.
//
//   pnpm script scripts/jev-scan.ts --out <file> [--repo <path>] [--lang ts|go] [--rule <id>] [--threshold <p>]
//                                   [--per-rule] [--include-tests]
//
// threshold: the fallback for rules with no measured jev.threshold; without it those rules are not asked
// per-rule:  one call per (unit, rule) instead of one call per unit carrying every rule

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';

import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { ChoiceQuestion, SystemOneResult } from '@typesafe-ai/sdk';

import { Verdict, codeState, contrastQuestion, ruleState } from '../src/analyzers/jev.js';
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
		repo: { type: 'string', default: PACKAGE_ROOT },
		lang: { type: 'string', default: Lang.TS },
		rule: { type: 'string' },
		threshold: { type: 'string' },
		'per-rule': { type: 'boolean', default: false },
		'include-tests': { type: 'boolean', default: false },
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

const TEST_FILE = { [Lang.TS]: /\.test\.tsx?$/, [Lang.GO]: /_test\.go$/ } as const;

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

	logger.info({ repo, lang, units: units.length, rules: rules.length, perRule: values['per-rule'] }, 'scanning');

	let inputTokens = 0;
	let calls = 0;

	const findings = await mapConcurrent(
		units,
		async (unit): Promise<Finding[]> => {
			const applicable = rules.filter(rule => !isIgnored(unit.path, rule.ignore));
			const batches = values['per-rule'] ? applicable.map(rule => [rule]) : [applicable];
			const found: Finding[] = [];

			for (const batch of batches) {
				if (batch.length === 0) {
					continue;
				}

				const result = await ask(client, lang, unit, batch);
				inputTokens += result.usage.input_tokens;
				calls += 1;

				for (const rule of batch) {
					const answer = result.answers[rule.id];

					if (answer === undefined) {
						continue;
					}

					const probability = answer.probabilities[Verdict.VIOLATES] ?? 0;
					const threshold = rule.jevThreshold ?? fallbackThreshold ?? Number.POSITIVE_INFINITY;

					if (probability >= threshold) {
						found.push({
							path: unit.path,
							line: unit.line,
							name: unit.facts.name,
							ruleId: rule.id,
							probability,
							confidence: answer.confidence,
						});
					}
				}
			}

			return found;
		},
		{ concurrency: 8 }
	);

	const flat = findings.flat().sort((a, b) => b.probability - a.probability);
	await writeFile(values.out, JSON.stringify(flat, null, 2));
	printSummary(flat);
	logger.info({ calls, inputTokens, out: values.out }, 'done');
}

// one call: a lone rule sits at `rule`; several sit under `rules` and each question names its own
function ask(
	client: TypeSafeClient,
	lang: Lang,
	unit: Unit,
	batch: readonly JudgeRule[]
): Promise<SystemOneResult<Record<string, ChoiceQuestion>>> {
	const code = codeState(lang, unit);
	const [only] = batch;

	if (batch.length === 1 && only !== undefined) {
		return client.systemOne({
			state: { ...code, rule: ruleState(only) },
			questions: { [only.id]: contrastQuestion({ notApplicable: true }) },
		});
	}

	return client.systemOne({
		state: { ...code, rules: Object.fromEntries(batch.map(rule => [rule.id, ruleState(rule)])) },
		questions: Object.fromEntries(
			batch.map(rule => [rule.id, contrastQuestion({ notApplicable: true }, `rules["${rule.id}"]`)])
		),
	});
}

function isLang(value: string): value is Lang {
	return (langValues as readonly string[]).includes(value);
}

async function collectUnits(lang: Lang): Promise<Unit[]> {
	const { stdout } = await execFileAsync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf-8' });
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
