// writes `guide: [...]` into rule frontmatter from an alignment report's "Proposed frontmatter" table, whose rows
// read `| <rule id> | \`guide: [a, b]\` | note |`. ids already present on a rule are kept and merged, so the
// TypeScript and Go reports can be applied one after the other to the shared `any` rules.
//
//   pnpm script scripts/apply-guide.ts <report.md> [--dry-run]

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import matter from 'gray-matter';

import { loadRules } from '../src/rule.js';
import { logger } from '../src/shared/log.js';
import { RULES_DIR } from '../src/shared/paths.js';

const { values, positionals } = parseArgs({
	options: {
		'dry-run': { type: 'boolean', default: false },
	},
	allowPositionals: true,
	strict: true,
});

const ROW = /^\|\s*([a-z]+\.[a-z]+\.[a-z0-9-]+)\s*\|\s*`guide: \[([^\]]*)\]`\s*\|/;

async function main(): Promise<void> {
	const [reportPath] = positionals;

	if (reportPath === undefined) {
		throw new Error('usage: apply-guide.ts <report.md> [--dry-run]');
	}

	const proposals = parseProposals(await readFile(reportPath, 'utf-8'));
	const rules = await loadRules(RULES_DIR);
	let written = 0;

	for (const rule of rules) {
		const proposed = proposals.get(rule.id);

		if (proposed === undefined) {
			continue;
		}

		const merged = [...new Set([...rule.guide, ...proposed])].sort();

		if (merged.length === rule.guide.length && merged.every((id, index) => id === rule.guide[index])) {
			continue;
		}

		written += 1;

		if (!values['dry-run']) {
			await writeGuide(rule.path, merged);
		}
	}

	logger.info(
		{ proposals: proposals.size, rules: rules.length, written, dryRun: values['dry-run'] },
		'guide ids applied'
	);
}

function parseProposals(report: string): Map<string, string[]> {
	const proposals = new Map<string, string[]>();

	for (const line of report.split('\n')) {
		const match = ROW.exec(line);

		if (match?.[1] === undefined || match[2] === undefined) {
			continue;
		}

		const ids = match[2]
			.split(',')
			.map(id => id.trim())
			.filter(id => id.length > 0);
		proposals.set(match[1], ids);
	}

	return proposals;
}

// rewrites only the frontmatter, leaving the body untouched
async function writeGuide(path: string, guide: readonly string[]): Promise<void> {
	const file = matter(await readFile(path, 'utf-8'));
	const data = { ...file.data, guide: [...guide] };

	await writeFile(path, matter.stringify(file.content, data));
}

main().catch((error: unknown) => {
	logger.error({ err: error }, 'apply-guide failed');
	process.exitCode = 1;
});
