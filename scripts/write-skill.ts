// renders a compact SKILL.md index of every rule for coding agents, so the guide an agent follows
// and the rules the bot enforces are the same source.
//
//   pnpm script scripts/write-skill.ts [--out <path>]

import { writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';

import { Detect, axisValues, loadRules } from '../src/rule.js';
import type { Rule } from '../src/rule.js';
import { logger } from '../src/shared/log.js';
import { PACKAGE_ROOT, RULES_DIR } from '../src/shared/paths.js';

const { values } = parseArgs({
	options: {
		out: { type: 'string', default: join(PACKAGE_ROOT, 'SKILL.md') },
	},
	strict: true,
});

const AXIS_TITLES = {
	idiom: 'Idiom: write the language the way it is written',
	hacky: 'Hacky: shortcuts that work today and bite later',
	futureproof: 'Future-proof: keep the next change small',
} as const;

async function main(): Promise<void> {
	const rules = await loadRules(RULES_DIR);
	const sections = axisValues.map(axis =>
		renderAxis(
			axis,
			rules.filter(rule => rule.axis === axis)
		)
	);

	const content = [
		'---',
		'name: slop-rules',
		'description: Coding rules for TypeScript and Go that slopscan enforces. Use when writing, editing, or reviewing .ts, .tsx, or .go code. Each rule links to its full explanation with good and bad examples.',
		'---',
		'',
		'# Slop rules',
		'',
		'Code is slop when it is hacky, non-idiomatic, or hard to change later, regardless of who wrote it. Each rule below',
		'names a one-line message; the linked file holds the reasoning and examples. Read a rule file when a message is not',
		'self-explanatory.',
		'',
		...sections,
	].join('\n');

	await writeFile(values.out, content);
	logger.info({ rules: rules.length, out: values.out }, 'wrote skill index');
}

function renderAxis(axis: keyof typeof AXIS_TITLES, rules: readonly Rule[]): string {
	const rows = rules
		.toSorted((a, b) => a.id.localeCompare(b.id))
		.map(rule => {
			const path = relative(PACKAGE_ROOT, rule.path).replaceAll('\\', '/');
			const how = rule.detect === Detect.AST ? 'syntax' : 'judgment';

			return `| [${rule.id}](${path}) | ${rule.lang} | ${rule.severity} | ${how} | ${rule.message} |`;
		});

	return [
		`## ${AXIS_TITLES[axis]}`,
		'',
		'| rule | lang | severity | check | message |',
		'| --- | --- | --- | --- | --- |',
		...rows,
		'',
	].join('\n');
}

main().catch((error: unknown) => {
	logger.error({ err: error }, 'write-skill failed');
	process.exitCode = 1;
});
