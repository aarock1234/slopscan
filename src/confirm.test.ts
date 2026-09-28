import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { confirm } from './confirm.js';
import type { Finding } from './finding.js';
import { Confirm, Detect } from './rule.js';
import type { Rule } from './rule.js';

let repo: string;

async function commitFile(path: string, content: string): Promise<void> {
	await writeFile(join(repo, path), content);
	execFileSync('git', ['add', path], { cwd: repo });
}

beforeAll(async () => {
	repo = await mkdtemp(join(tmpdir(), 'slopscan-confirm-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	await commitFile(
		'a.ts',
		[
			'function helper(user: User): string {',
			'\treturn user.name;',
			'}',
			'export function main(user: User): string {',
			'\treturn helper(user);',
			'}',
			'export type Port = { send(): void };',
			'class Wire implements Port {',
			'\tsend(): void {}',
			'}',
			'export const unused = 1;',
		].join('\n')
	);
	await commitFile('b.go', 'package b\n\nfunc helper() {}\n\nfunc main() {\n\thelper()\n\thelper()\n}\n');
});

afterAll(async () => {
	await rm(repo, { recursive: true, force: true });
});

function judgeRule(id: string, predicate?: Confirm): Rule {
	return {
		id,
		lang: 'any',
		axis: 'futureproof',
		category: 'abstraction',
		severity: 'minor',
		ignore: [],
		why: 'because',
		message: id,
		good: [],
		bad: [],
		path: `${id}.md`,
		detect: Detect.JUDGE,
		...(predicate && { confirm: predicate }),
		falsePositives: [],
	};
}

const RULES = [
	judgeRule('any.futureproof.single-caller-helper', Confirm.CALL_COUNT),
	judgeRule('any.futureproof.single-impl-interface', Confirm.IMPL_COUNT),
	judgeRule('any.futureproof.dead-export', Confirm.REF_COUNT),
	judgeRule('any.hacky.plain'),
];

function finding(ruleId: string, path: string, symbol?: string): Finding {
	return {
		ruleId,
		path,
		line: 1,
		endLine: 1,
		quote: 'x',
		message: ruleId,
		confidence: 0.9,
		...(symbol && { symbol }),
	};
}

describe('confirm', () => {
	it('keeps a single-caller helper and rejects one with two callers', async () => {
		const result = await confirm(
			[
				finding('any.futureproof.single-caller-helper', 'a.ts', 'helper'),
				finding('any.futureproof.single-caller-helper', 'b.go', 'helper'),
			],
			RULES,
			{ repo, ignore: [] }
		);

		expect(result.kept.map(item => item.path)).toEqual(['a.ts']);
		expect(result.rejected.map(item => item.path)).toEqual(['b.go']);
	});

	it('keeps an interface with one implementation', async () => {
		const result = await confirm([finding('any.futureproof.single-impl-interface', 'a.ts', 'Port')], RULES, {
			repo,
			ignore: [],
		});

		expect(result.kept).toHaveLength(1);
	});

	it('keeps an export referenced only at its definition and rejects a used one', async () => {
		const result = await confirm(
			[
				finding('any.futureproof.dead-export', 'a.ts', 'unused'),
				finding('any.futureproof.dead-export', 'a.ts', 'helper'),
			],
			RULES,
			{ repo, ignore: [] }
		);

		expect(result.kept.map(item => item.symbol)).toEqual(['unused']);
		expect(result.rejected.map(item => item.symbol)).toEqual(['helper']);
	});

	it('rejects a confirmable finding with no symbol and passes rules without a predicate through', async () => {
		const result = await confirm(
			[finding('any.futureproof.single-caller-helper', 'a.ts'), finding('any.hacky.plain', 'a.ts')],
			RULES,
			{ repo, ignore: [] }
		);

		expect(result.kept.map(item => item.ruleId)).toEqual(['any.hacky.plain']);
		expect(result.rejected).toHaveLength(1);
	});

	it('respects ignore globs when counting', async () => {
		const result = await confirm([finding('any.futureproof.single-caller-helper', 'b.go', 'helper')], RULES, {
			repo,
			ignore: ['**/*.go'],
		});

		expect(result.kept).toHaveLength(1);
	});
});
