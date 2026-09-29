import { describe, expect, it } from 'vitest';

import { Format, renderReport, reportSchema } from './report.js';
import type { Report } from './report.js';
import { Grade } from './score.js';

const axis = (score: number, findings: number) => ({ score, points: 0, density: 0, findings });

const REPORT: Report = {
	overall: 39,
	grade: Grade.C,
	axes: {
		idiom: axis(14.5, 2),
		hacky: axis(71.1, 7),
		futureproof: axis(21, 1),
	},
	files: 2,
	scoredLines: 240,
	findings: [
		{
			ruleId: 'ts.hacky.empty-catch',
			path: 'src/a.ts',
			line: 11,
			endLine: 11,
			quote: 'catch {}',
			message: 'empty catch swallows the error | handle it',
			confidence: 1,
			origin: 'ast',
			axis: 'hacky',
			severity: 'critical',
			points: 20,
		},
	],
};

describe('renderReport', () => {
	it('renders a terminal summary without color codes when color is off', () => {
		const text = renderReport(REPORT, { format: Format.TERMINAL, color: false });

		expect(text).toContain('slop score 39 (C)');
		expect(text).toContain('idiom 15  ·  hacky 71  ·  futureproof 21');
		expect(text).toContain('src/a.ts:11  [critical] ts.hacky.empty-catch');
		expect(text).not.toContain('\u001b');
	});

	it('renders json that round-trips through the report schema', () => {
		const text = renderReport(REPORT, { format: Format.JSON, color: false });

		expect(reportSchema.parse(JSON.parse(text))).toEqual(REPORT);
	});

	it('renders markdown tables and escapes pipes in messages', () => {
		const text = renderReport(REPORT, { format: Format.MARKDOWN, color: false });

		expect(text).toContain('## Slop score: 39 (C)');
		expect(text).toContain('| hacky | 71 | 7 |');
		expect(text).toContain('empty catch swallows the error \\| handle it');
	});

	it('shows the delta against a baseline', () => {
		const withBaseline: Report = {
			...REPORT,
			baseline: { overall: 45, grade: Grade.C, axes: REPORT.axes },
		};
		const text = renderReport(withBaseline, { format: Format.TERMINAL, color: false });

		expect(text).toContain('slop score 39 (C)  was 45 (C), -6');
	});

	it('says so when there is nothing to report', () => {
		const clean: Report = { ...REPORT, overall: 0, grade: Grade.A, findings: [] };

		expect(renderReport(clean, { format: Format.TERMINAL, color: false })).toContain('no findings');
		expect(renderReport(clean, { format: Format.MARKDOWN, color: false })).toContain('No findings.');
	});
});
