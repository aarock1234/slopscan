import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configSchema } from './config.js';
import { reportSchema } from './report.js';
import { loadRules } from './rule.js';
import { scan } from './scan.js';
import { Grade } from './score.js';
import { PACKAGE_ROOT, RULES_DIR } from './shared/paths.js';

const PLANTED = join(PACKAGE_ROOT, 'fixtures', 'planted');

// the whole pipeline against a real git repo: a clean baseline on main, a branch of planted slop
let repo: string;

function git(...args: string[]): void {
	execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { cwd: repo });
}

beforeAll(async () => {
	repo = await mkdtemp(join(tmpdir(), 'slopscan-scan-'));
	git('init', '-q', '-b', 'main');
	await cp(join(PLANTED, 'before'), repo, { recursive: true });
	git('add', '-A');
	git('commit', '-qm', 'clean baseline');
	git('checkout', '-qb', 'feature');
	await cp(join(PLANTED, 'after'), repo, { recursive: true });
	git('add', '-A');
	git('commit', '-qm', 'slopped feature');
});

afterAll(async () => {
	await rm(repo, { recursive: true, force: true });
});

describe('scan', () => {
	it('finds every planted violation on its line and nothing on untouched code', async () => {
		const rules = await loadRules(RULES_DIR);
		const report = await scan({
			repo,
			range: { base: 'main', head: 'feature' },
			config: configSchema.parse({}),
			rules,
		});

		const found = new Set(report.findings.map(finding => `${finding.ruleId}@${finding.path}:${finding.line}`));

		for (const planted of [
			'any.idiom.no-section-banners@src/users.ts:5',
			'ts.hacky.no-explicit-any@src/users.ts:6',
			'ts.idiom.no-default-export@src/users.ts:6',
			'ts.hacky.no-non-null-assertion@src/users.ts:7',
			'ts.idiom.no-nested-ternary@src/users.ts:8',
			'ts.hacky.empty-catch@src/users.ts:11',
			'go.idiom.no-this-receiver@pkg/server.go:7',
			'go.hacky.no-map-string-any@pkg/server.go:8',
			'go.idiom.capitalized-error-message@pkg/server.go:10',
		]) {
			expect(found).toContain(planted);
		}

		// the baseline's own code is untouched by this diff
		expect(report.findings.filter(finding => finding.line <= 3)).toEqual([]);
		expect(report.grade === Grade.D || report.grade === Grade.F).toBe(true);
		expect(report.files).toBe(2);
		expect(reportSchema.parse(JSON.parse(JSON.stringify(report)))).toEqual(report);
	});

	it('scores an empty range as a clean A', async () => {
		const rules = await loadRules(RULES_DIR);
		const report = await scan({
			repo,
			range: { base: 'main', head: 'main' },
			config: configSchema.parse({}),
			rules,
		});

		expect(report).toMatchObject({ overall: 0, grade: Grade.A, files: 0, findings: [] });
	});

	it('reports the delta against a baseline range', async () => {
		const rules = await loadRules(RULES_DIR);
		const report = await scan({
			repo,
			range: { base: 'feature', head: 'feature' },
			config: configSchema.parse({}),
			rules,
			baseline: 'main',
		});

		expect(report.overall).toBe(0);
		expect(report.baseline?.overall).toBeGreaterThan(45);
	});
});
