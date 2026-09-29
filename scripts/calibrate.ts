// scores real ranges in local repositories and compares the grade with what a human expected, so the
// scoring constants and the rules can be tuned against judgment rather than intuition. repos stay where they
// are; nothing is copied into this project. the same tiers run as in the cli: jev and the verifier whenever
// their keys are set, the judge with --judge.
//
//   pnpm script scripts/calibrate.ts [--fixtures fixtures/calibration.yml] [--judge] [--only <name substring>]

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';

import pc from 'picocolors';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { loadConfig } from '../src/config.js';
import { loadRules } from '../src/rule.js';
import { scan } from '../src/scan.js';
import { Grade } from '../src/score.js';
import { logger } from '../src/shared/log.js';
import { PACKAGE_ROOT, RULES_DIR } from '../src/shared/paths.js';
import { buildTiers } from '../src/tiers.js';

const execFileAsync = promisify(execFile);

const gradeValues = Object.values(Grade) as [Grade, ...Grade[]];

const fixtureSchema = z.object({
	name: z.string(),
	repo: z.string(),
	base: z.string(),
	head: z.string(),
	// the grade a careful reviewer would give this range; one letter or an inclusive range like "A-B"
	expect: z.string().regex(/^[A-DF](-[A-DF])?$/),
	note: z.string().optional(),
});

const fixturesSchema = z.object({ ranges: z.array(fixtureSchema) });

const { values } = parseArgs({
	options: {
		fixtures: { type: 'string', default: join(PACKAGE_ROOT, 'fixtures', 'calibration.yml') },
		judge: { type: 'boolean', default: false },
		rules: { type: 'string', default: RULES_DIR },
		only: { type: 'string' },
	},
	strict: true,
});

async function main(): Promise<void> {
	const { ranges } = fixturesSchema.parse(parseYaml(await readFile(values.fixtures, 'utf-8')));
	const rules = await loadRules(values.rules);
	const selected = ranges.filter(range => values.only === undefined || range.name.includes(values.only));
	let misses = 0;

	for (const range of selected) {
		const repo = resolve(PACKAGE_ROOT, range.repo);
		const config = await loadConfig(repo);

		if (!(await workingTreeIsAt(repo, range.head))) {
			// confirm predicates and the verifier's tools read the working tree, so a different checkout skews them
			process.stdout.write(
				pc.yellow(
					`note ${range.name}: working tree is not at ${range.head}; repo-wide checks read the checkout\n`
				)
			);
		}

		const report = await scan({
			repo,
			range: { base: range.base, head: range.head },
			config,
			rules,
			...buildTiers(repo, config, { judge: values.judge, jev: true, verify: true }),
		});

		const hit = within(report.grade, range.expect);
		misses += hit ? 0 : 1;

		const axes = `idiom ${Math.round(report.axes.idiom.score)} hacky ${Math.round(report.axes.hacky.score)} futureproof ${Math.round(report.axes.futureproof.score)}`;
		const floor = report.floor > 0 ? `, floor ${report.floor}` : '';
		process.stdout.write(
			`${hit ? pc.green('hit ') : pc.red('miss')} ${range.name.padEnd(34)} got ${report.overall} (${report.grade})  expected ${range.expect.padEnd(4)} ${pc.dim(`${axes}${floor}; ${report.findings.length} findings over ${report.scoredLines} lines`)}\n`
		);
	}

	process.stdout.write(`\n${selected.length - misses}/${selected.length} within expectation\n`);
	process.exitCode = misses === 0 ? 0 : 1;
}

async function workingTreeIsAt(repo: string, head: string): Promise<boolean> {
	const [current, wanted] = await Promise.all([revParse(repo, 'HEAD'), revParse(repo, head)]);

	return current !== undefined && current === wanted;
}

async function revParse(repo: string, ref: string): Promise<string | undefined> {
	try {
		const { stdout } = await execFileAsync('git', ['rev-parse', ref], { cwd: repo, encoding: 'utf-8' });

		return stdout.trim();
	} catch {
		return undefined;
	}
}

function within(grade: Grade, expected: string): boolean {
	const [low, high = low] = expected.split('-') as [Grade, Grade?];
	const rank = (value: Grade) => gradeValues.indexOf(value);

	return rank(grade) >= rank(low) && rank(grade) <= rank(high);
}

main().catch((error: unknown) => {
	logger.error({ err: error }, 'calibrate failed');
	process.exitCode = 1;
});
