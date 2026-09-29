// scores real ranges in local repositories and compares the grade with what a human expected, so the
// scoring constants can be tuned against judgment rather than intuition. repos stay where they are;
// nothing is copied into this project.
//
//   pnpm script scripts/calibrate.ts [--fixtures fixtures/calibration.yml] [--judge]

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import pc from 'picocolors';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { createJudge } from '../src/analyzers/judge.js';
import { loadConfig } from '../src/config.js';
import { resolveModel } from '../src/model.js';
import { loadRules } from '../src/rule.js';
import { scan } from '../src/scan.js';
import { Grade } from '../src/score.js';
import { logger } from '../src/shared/log.js';
import { PACKAGE_ROOT, RULES_DIR } from '../src/shared/paths.js';

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
	},
	strict: true,
});

async function main(): Promise<void> {
	const { ranges } = fixturesSchema.parse(parseYaml(await readFile(values.fixtures, 'utf-8')));
	const rules = await loadRules(values.rules);
	let misses = 0;

	for (const range of ranges) {
		const repo = resolve(PACKAGE_ROOT, range.repo);
		const config = await loadConfig(repo);
		const judge = values.judge
			? createJudge({
					config: config.judge,
					model: resolveModel(config.judge.model),
					cacheDir: join(PACKAGE_ROOT, '.slopscan-cache', 'calibrate'),
				})
			: undefined;

		const report = await scan({
			repo,
			range: { base: range.base, head: range.head },
			config,
			rules,
			...(judge && { judge }),
		});

		const hit = within(report.grade, range.expect);
		misses += hit ? 0 : 1;

		const axes = `idiom ${Math.round(report.axes.idiom.score)} hacky ${Math.round(report.axes.hacky.score)} futureproof ${Math.round(report.axes.futureproof.score)}`;
		process.stdout.write(
			`${hit ? pc.green('hit ') : pc.red('miss')} ${range.name.padEnd(28)} got ${report.overall} (${report.grade})  expected ${range.expect.padEnd(4)} ${pc.dim(`${axes}; ${report.findings.length} findings over ${report.scoredLines} lines`)}\n`
		);
	}

	process.stdout.write(`\n${ranges.length - misses}/${ranges.length} within expectation\n`);
	process.exitCode = misses === 0 ? 0 : 1;
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
