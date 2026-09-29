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

describe('score', () => {
	it('reproduces the worked example', () => {
		const report = score(FINDINGS, [change(240)], RULES, scoring);

		expect(report.axes.hacky.points).toBeCloseTo(35.75);
		expect(report.axes.futureproof.points).toBeCloseTo(6.8);
		expect(report.axes.idiom.points).toBeCloseTo(4.5);
		expect(report.axes.hacky.score).toBeCloseTo(71.1, 0);
		expect(report.overall).toBe(39);
		expect(report.grade).toBe(Grade.C);
		expect(report.scoredLines).toBe(240);
	});

	it('scores the same findings lower in a larger diff', () => {
		const small = score(FINDINGS, [change(240)], RULES, scoring);
		const large = score(FINDINGS, [change(1000)], RULES, scoring);

		expect(large.overall).toBeLessThan(small.overall);
		expect(large.grade).toBe(Grade.B);
	});

	it('floors the line count so tiny diffs are not catastrophic', () => {
		const tiny = score([finding('ts.hacky.cast', 1)], [change(3)], RULES, scoring);
		const floored = score([finding('ts.hacky.cast', 1)], [change(scoring.minScoredLines)], RULES, scoring);

		expect(tiny.overall).toBe(floored.overall);
	});

	it('damps repeated findings of one rule geometrically', () => {
		const one = score([finding('ts.hacky.cast', 1)], [change(100)], RULES, scoring);
		const hundred = score(
			Array.from({ length: 100 }, (_, index) => finding('ts.hacky.cast', index + 1)),
			[change(100)],
			RULES,
			scoring
		);

		expect(hundred.axes.hacky.points).toBeCloseTo(2 * one.axes.hacky.points, 5);
	});

	it('ranks findings by contribution, then severity, then location', () => {
		const report = score(FINDINGS, [change(240)], RULES, scoring);

		expect(report.findings.map(item => item.ruleId).slice(0, 3)).toEqual([
			'ts.hacky.swallow',
			'ts.hacky.cast',
			'ts.futureproof.bool',
		]);
		expect(report.findings.at(-1)).toMatchObject({ ruleId: 'ts.hacky.cast', points: 0.25 });
	});

	it('returns a clean report for no findings', () => {
		const report = score([], [change(100)], RULES, scoring);

		expect(report.overall).toBe(0);
		expect(report.grade).toBe(Grade.A);
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
