import { describe, expect, it } from 'vitest';

import type { Change } from './change.js';
import { Origin } from './finding.js';
import type { Finding } from './finding.js';
import { Axis, Detect, Severity } from './rule.js';
import type { Rule } from './rule.js';
import { Grade, gradeFor, score, scoringSchema } from './score.js';

const scoring = scoringSchema.parse({});

function rule(id: string, axis: Rule['axis'], severity: Rule['severity']): Rule {
	return {
		id,
		lang: 'ts',
		axis,
		category: 'test',
		severity,
		ignore: [],
		why: 'because',
		message: id,
		good: [],
		bad: [],
		path: `${id}.md`,
		detect: Detect.AST,
		ast: {},
	};
}

function finding(ruleId: string, line: number, confidence = 1): Finding {
	return {
		ruleId,
		path: 'src/a.ts',
		line,
		endLine: line,
		quote: 'x',
		message: ruleId,
		confidence,
		origin: Origin.AST,
	};
}

function change(scoredLines: number): Change {
	return {
		path: 'src/a.ts',
		lang: 'ts',
		source: '',
		changedLines: new Set(),
		scoredLines,
	};
}

const RULES = [
	rule('ts.hacky.cast', Axis.HACKY, Severity.MAJOR),
	rule('ts.hacky.swallow', Axis.HACKY, Severity.CRITICAL),
	rule('ts.futureproof.bool', Axis.FUTUREPROOF, Severity.MAJOR),
	rule('ts.idiom.default', Axis.IDIOM, Severity.MINOR),
];

// the worked example from the plan: 240 lines, six casts, one swallowed error, one judge finding, two default exports
const FINDINGS = [
	...Array.from({ length: 6 }, (_, index) => finding('ts.hacky.cast', index + 1)),
	finding('ts.hacky.swallow', 10),
	finding('ts.futureproof.bool', 20, 0.85),
	finding('ts.idiom.default', 30),
	finding('ts.idiom.default', 31),
];

function repeated(ruleId: string, count: number): Finding[] {
	return Array.from({ length: count }, (_, index) => finding(ruleId, index + 1));
}

describe('score', () => {
	it('reproduces the worked example', () => {
		const report = score(FINDINGS, [change(240)], RULES, scoring);

		// six casts weigh sqrt(6) casts: 8 * 2.449 + 20 for the swallowed error
		expect(report.axes.hacky.points).toBeCloseTo(39.6, 1);
		expect(report.axes.futureproof.points).toBeCloseTo(6.8);
		expect(report.axes.idiom.points).toBeCloseTo(4.24, 2);
		expect(report.axes.hacky.score).toBeCloseTo(74.7, 0);
		expect(report.overall).toBe(41);
		expect(report.grade).toBe(Grade.C);
		expect(report.floor).toBe(26);
		expect(report.scoredLines).toBe(240);
	});

	it('scores the same findings lower in a larger diff, down to the floor its critical finding sets', () => {
		const small = score(FINDINGS, [change(240)], RULES, scoring);
		const large = score(FINDINGS, [change(1000)], RULES, scoring);

		expect(large.overall).toBeLessThan(small.overall);
		expect(large.overall).toBe(large.floor);
		expect(large.grade).toBe(Grade.C);
	});

	it('floors the line count so tiny diffs are not catastrophic', () => {
		const tiny = score([finding('ts.hacky.cast', 1)], [change(3)], RULES, scoring);
		const floored = score([finding('ts.hacky.cast', 1)], [change(scoring.minScoredLines)], RULES, scoring);

		expect(tiny.overall).toBe(floored.overall);
	});

	it('caps the line count so a huge diff cannot dilute its findings', () => {
		const findings = repeated('ts.hacky.cast', 200);
		const capped = score(findings, [change(scoring.maxScoredLines)], RULES, scoring);
		const huge = score(findings, [change(50_000)], RULES, scoring);

		expect(huge.overall).toBe(capped.overall);
		expect(huge.grade).toBe(Grade.B);
	});

	it('damps repeated findings of one rule to the square root of their count', () => {
		const one = score([finding('ts.hacky.cast', 1)], [change(100)], RULES, scoring);
		const hundred = score(repeated('ts.hacky.cast', 100), [change(100)], RULES, scoring);

		expect(hundred.axes.hacky.points).toBeCloseTo(10 * one.axes.hacky.points, 5);
	});

	it('lets critical findings set a grade floor whatever the size of the diff', () => {
		const one = score([finding('ts.hacky.swallow', 1)], [change(100_000)], RULES, scoring);
		const three = score(repeated('ts.hacky.swallow', 3), [change(100_000)], RULES, scoring);
		const none = score(repeated('ts.hacky.cast', 3), [change(100_000)], RULES, scoring);

		expect(one).toMatchObject({ overall: 26, grade: Grade.C, floor: 26 });
		expect(three).toMatchObject({ overall: 71, grade: Grade.F, floor: 71 });
		expect(none).toMatchObject({ grade: Grade.A, floor: 0 });
	});

	it('ranks findings by contribution, then severity, then location', () => {
		const report = score(FINDINGS, [change(240)], RULES, scoring);

		expect(report.findings.map(item => item.ruleId).slice(0, 3)).toEqual([
			'ts.hacky.swallow',
			'ts.hacky.cast',
			'ts.futureproof.bool',
		]);
		// the second default export adds 3 * (sqrt(2) - 1), less than the sixth cast's 8 * (sqrt(6) - sqrt(5))
		expect(report.findings.at(-1)?.ruleId).toBe('ts.idiom.default');
		expect(report.findings.at(-1)?.points).toBeCloseTo(1.243, 3);
	});

	it('returns a clean report for no findings', () => {
		const report = score([], [change(100)], RULES, scoring);

		expect(report.overall).toBe(0);
		expect(report.grade).toBe(Grade.A);
		expect(report.floor).toBe(0);
		expect(report.findings).toEqual([]);
	});

	it('rejects findings for unknown rules', () => {
		expect(() => score([finding('ts.nope', 1)], [change(100)], RULES, scoring)).toThrow(/unknown rule/);
	});
});

describe('gradeFor', () => {
	it('maps band edges inclusively', () => {
		expect(gradeFor(0)).toBe(Grade.A);
		expect(gradeFor(10)).toBe(Grade.A);
		expect(gradeFor(11)).toBe(Grade.B);
		expect(gradeFor(45)).toBe(Grade.C);
		expect(gradeFor(46)).toBe(Grade.D);
		expect(gradeFor(71)).toBe(Grade.F);
		expect(gradeFor(100)).toBe(Grade.F);
	});
});
