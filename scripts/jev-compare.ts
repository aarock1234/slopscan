// compares jev-scan outputs against hand-labeled findings: how many known-real findings each variant kept,
// how many known-wrong ones it produced, and how many unlabeled ones are left to review.
//
//   pnpm script scripts/jev-compare.ts <out.json> [...more]

import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { z } from 'zod';

import { PACKAGE_ROOT } from '../src/shared/paths.js';

const labelsSchema = z.object({
	truePositives: z.array(z.string()),
	falsePositives: z.array(z.string()),
});

const findingsSchema = z.array(
	z.object({
		path: z.string(),
		line: z.number(),
		ruleId: z.string(),
		probability: z.number(),
	})
);

async function main(paths: readonly string[]): Promise<void> {
	if (paths.length === 0) {
		throw new Error('give at least one jev-scan output file');
	}

	const labels = labelsSchema.parse(
		JSON.parse(await readFile(join(PACKAGE_ROOT, 'fixtures', 'jev-labels.json'), 'utf-8'))
	);
	const truePositives = new Set(labels.truePositives);
	const falsePositives = new Set(labels.falsePositives);

	process.stdout.write(`${'variant'.padEnd(28)} findings  known-real kept  known-wrong produced  unlabeled\n`);

	for (const path of paths) {
		const findings = findingsSchema.parse(JSON.parse(await readFile(path, 'utf-8')));
		const keys = new Set(findings.map(finding => `${finding.path}:${finding.line} ${finding.ruleId}`));

		const kept = [...truePositives].filter(key => keys.has(key)).length;
		const wrong = [...falsePositives].filter(key => keys.has(key)).length;
		const unlabeled = [...keys].filter(key => !truePositives.has(key) && !falsePositives.has(key)).length;

		process.stdout.write(
			`${basename(path, '.json').padEnd(28)} ${String(findings.length).padStart(8)}  ${`${kept}/${truePositives.size}`.padStart(15)}  ${`${wrong}/${falsePositives.size}`.padStart(20)}  ${String(unlabeled).padStart(9)}\n`
		);
	}
}

main(process.argv.slice(2)).catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
