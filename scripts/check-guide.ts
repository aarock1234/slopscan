// checks every rule's `guide` ids against the style skills' rules.json indexes, and lists the guide sections that
// call for automation but have no rule yet. the guide's prose is the authority; this keeps the rules pointing at it.
//
//   pnpm script scripts/check-guide.ts [--skills <dir with typescript-style/ and go-style/>]

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import pc from 'picocolors';
import { z } from 'zod';

import { loadRules } from '../src/rule.js';
import { logger } from '../src/shared/log.js';
import { RULES_DIR } from '../src/shared/paths.js';

const { values } = parseArgs({
	options: {
		skills: {
			type: 'string',
			default: join(homedir(), '.agents', 'skills'),
		},
		rules: {
			type: 'string',
			default: RULES_DIR,
		},
	},
	strict: true,
});

const Automation = {
	MECHANICAL: 'mechanical-candidate',
	MIXED: 'mixed',
	CONTEXTUAL: 'contextual',
	NONE: 'none',
} as const;

const sectionSchema = z.object({
	id: z.string(),
	kind: z.string(),
	automation: z.enum([Automation.MECHANICAL, Automation.MIXED, Automation.CONTEXTUAL, Automation.NONE]),
	path: z.string(),
});

const indexSchema = z.object({ rules: z.array(sectionSchema) });

type Section = z.infer<typeof sectionSchema>;

const SKILL_DIRS = ['typescript-style', 'go-style'] as const;

// sections that only point elsewhere or describe the toolchain are not rule material
const NOT_RULE_MATERIAL = new Set(['navigation', 'workflow']);

async function main(): Promise<void> {
	const rules = await loadRules(values.rules);
	const sections = new Map<string, Section>();

	for (const dir of SKILL_DIRS) {
		const index = indexSchema.parse(JSON.parse(await readFile(join(values.skills, dir, 'rules.json'), 'utf-8')));

		for (const section of index.rules) {
			sections.set(section.id, section);
		}
	}

	const unknown = rules.flatMap(rule => rule.guide.filter(id => !sections.has(id)).map(id => `${rule.id} -> ${id}`));
	const unanchored = rules.filter(rule => rule.guide.length === 0).map(rule => rule.id);
	const covered = new Set(rules.flatMap(rule => rule.guide));
	const uncovered = [...sections.values()].filter(
		section =>
			!covered.has(section.id) &&
			!NOT_RULE_MATERIAL.has(section.kind) &&
			(section.automation === Automation.MECHANICAL || section.automation === Automation.MIXED)
	);

	if (unknown.length > 0) {
		process.stdout.write(pc.red(`${unknown.length} guide ids not in any rules.json:\n`));
		process.stdout.write(unknown.map(line => `  ${line}\n`).join(''));
	}

	process.stdout.write(`\n${rules.length - unanchored.length}/${rules.length} rules name a guide section\n`);

	if (unanchored.length > 0) {
		process.stdout.write(pc.yellow(`\n${unanchored.length} rules with no guide section:\n`));
		process.stdout.write(unanchored.map(id => `  ${id}\n`).join(''));
	}

	process.stdout.write(`\n${uncovered.length} guide sections asking for automation with no rule:\n`);

	for (const section of uncovered.sort((a, b) => a.id.localeCompare(b.id))) {
		process.stdout.write(`  ${section.id.padEnd(40)} ${section.automation.padEnd(21)} ${section.path}\n`);
	}

	process.exitCode = unknown.length === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
	logger.error({ err: error }, 'check-guide failed');
	process.exitCode = 1;
});
