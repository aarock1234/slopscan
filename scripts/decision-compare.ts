// compares decision-scan outputs against hand-labeled findings: how many known-real findings each variant kept,
// how many known-wrong ones it produced, the precision of what it produced that is labeled, and how many unlabeled
// ones are left to review.
//
//   pnpm script scripts/decision-compare.ts [--labels <file>] <out.json> [...more]
//
// labels: one file per repository and the commit it was labeled at, under fixtures/labels; the default is this
//         repository at 6fdc650. findings of rules with a confirm predicate are not labeled, because decision
//         models are not asked those rules.

import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { PACKAGE_ROOT } from '../src/shared/paths.js';

const { values, positionals } = parseArgs({
	options: {
		labels: {
			type: 'string',
			default: join(PACKAGE_ROOT, 'fixtures', 'labels', 'slopscan-6fdc650.json'),
		},
	},
	allowPositionals: true,
	strict: true,
});

// borderline findings are defensible either way and count for nothing in either direction
const labelsSchema = z.object({
	truePositives: z.array(z.string()),
	borderline: z.array(z.string()).default([]),
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
		throw new Error('give at least one decision-scan output file');
	}

	const labels = labelsSchema.parse(JSON.parse(await readFile(values.labels, 'utf-8')));
	const truePositives = new Set(labels.truePositives);
	const falsePositives = new Set(labels.falsePositives);
	const borderline = new Set(labels.borderline);

	process.stdout.write(
		`${'variant'.padEnd(44)} findings  known-real kept  known-wrong produced  precision  unlabeled\n`
	);

	for (const path of paths) {
		const findings = findingsSchema.parse(JSON.parse(await readFile(path, 'utf-8')));
		const keys = new Set(findings.map(finding => `${finding.path}:${finding.line} ${finding.ruleId}`));

		const kept = [...truePositives].filter(key => keys.has(key)).length;
		const wrong = [...falsePositives].filter(key => keys.has(key)).length;
		const unlabeled = [...keys].filter(
			key => !truePositives.has(key) && !falsePositives.has(key) && !borderline.has(key)
		).length;
		const precision = kept + wrong === 0 ? '-' : `${Math.round((100 * kept) / (kept + wrong))}%`;

		process.stdout.write(
			`${basename(path, '.json').padEnd(44)} ${String(findings.length).padStart(8)}  ${`${kept}/${truePositives.size}`.padStart(15)}  ${`${wrong}/${falsePositives.size}`.padStart(20)}  ${precision.padStart(9)}  ${String(unlabeled).padStart(9)}\n`
		);
	}
}

main(positionals).catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
