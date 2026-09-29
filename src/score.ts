import { z } from 'zod';

import type { Change } from './change.js';
import { findingSchema } from './finding.js';
import type { Finding } from './finding.js';
import { Axis, Severity, axisValues, severityValues } from './rule.js';
import type { Rule } from './rule.js';

// the knobs. everything else about the score follows from these and the findings.
export const scoringSchema = z
	.object({
		// base points per finding by severity
		points: z
			.object({
				[Severity.INFO]: z.number().nonnegative().default(1),
				[Severity.MINOR]: z.number().nonnegative().default(3),
				[Severity.MAJOR]: z.number().nonnegative().default(8),
				[Severity.CRITICAL]: z.number().nonnegative().default(20),
			})
			.strict()
			.prefault({}),
		// points per 100 changed lines at which an axis reaches 63; the curve is 100 * (1 - e^(-density / scale))
		densityScale: z.number().positive().default(12),
		axisWeights: z
			.object({
				[Axis.IDIOM]: z.number().nonnegative().default(0.25),
				[Axis.HACKY]: z.number().nonnegative().default(0.4),
				[Axis.FUTUREPROOF]: z.number().nonnegative().default(0.35),
			})
			.strict()
			.prefault({}),
		// a floor on changed lines so a three-line diff with one finding is not scored as a disaster
		minScoredLines: z.number().int().positive().default(50),
		// a ceiling on changed lines so a huge diff cannot dilute its findings into an A; past this size the
		// findings are judged as if the diff were this long
		maxScoredLines: z.number().int().positive().default(2000),
	})
	.strict();

export type Scoring = z.infer<typeof scoringSchema>;

export const Grade = {
	A: 'A',
	B: 'B',
	C: 'C',
	D: 'D',
	F: 'F',
} as const;

export type Grade = (typeof Grade)[keyof typeof Grade];

const gradeValues = Object.values(Grade) as [Grade, ...Grade[]];

// upper bound of each band, inclusive
const GRADE_BANDS: readonly (readonly [number, Grade])[] = [
	[10, Grade.A],
	[25, Grade.B],
	[45, Grade.C],
	[70, Grade.D],
	[100, Grade.F],
];

// the overall score can not fall under these for one, two, and three or more critical findings, whatever the
// diff's size: a reviewer requests changes on one swallowed error in a ten-thousand-line diff too
const CRITICAL_FLOORS: readonly number[] = [0, 26, 46, 71];

const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
	[Severity.INFO]: 0,
	[Severity.MINOR]: 1,
	[Severity.MAJOR]: 2,
	[Severity.CRITICAL]: 3,
};

export const scoredFindingSchema = findingSchema.extend({
	axis: z.enum(axisValues),
	severity: z.enum(severityValues),
	// what this finding added to its axis after damping
	points: z.number().nonnegative(),
});

export type ScoredFinding = z.infer<typeof scoredFindingSchema>;

export const axisScoreSchema = z.object({
	score: z.number().min(0).max(100),
	points: z.number().nonnegative(),
	density: z.number().nonnegative(),
	findings: z.number().int().nonnegative(),
});

export type AxisScore = z.infer<typeof axisScoreSchema>;

export const scoreSchema = z.object({
	overall: z.number().int().min(0).max(100),
	grade: z.enum(gradeValues),
	// the size-independent minimum the critical findings imposed on overall; 0 when none did
	floor: z.number().int().min(0).max(100),
	axes: z.object({
		[Axis.IDIOM]: axisScoreSchema,
		[Axis.HACKY]: axisScoreSchema,
		[Axis.FUTUREPROOF]: axisScoreSchema,
	}),
});

export type Score = z.infer<typeof scoreSchema>;

// a score plus the findings that produced it and the size of the diff it was normalized by
export const scoredSchema = scoreSchema.extend({
	files: z.number().int().nonnegative(),
	scoredLines: z.number().int().nonnegative(),
	// ranked by contribution, then severity, then location
	findings: z.array(scoredFindingSchema),
});

export type Scored = z.infer<typeof scoredSchema>;

export function score(
	findings: readonly Finding[],
	changes: readonly Change[],
	rules: readonly Rule[],
	scoring: Scoring
): Scored {
	const rulesById = new Map(rules.map(rule => [rule.id, rule]));
	const scoredLines = changes.reduce((sum, change) => sum + change.scoredLines, 0);
	const normalizer = Math.min(Math.max(scoredLines, scoring.minScoredLines), scoring.maxScoredLines) / 100;

	const scored = dampen(findings, rulesById, scoring).sort(compareByContribution);

	const axes = Object.fromEntries(
		axisValues.map(axis => {
			const own = scored.filter(finding => finding.axis === axis);
			const points = own.reduce((sum, finding) => sum + finding.points, 0);
			const density = points / normalizer;

			return [
				axis,
				{
					score: 100 * (1 - Math.exp(-density / scoring.densityScale)),
					points,
					density,
					findings: own.length,
				},
			];
		})
	) as Record<Axis, AxisScore>;

	const weighted = Math.round(
		axisValues.reduce((sum, axis) => sum + scoring.axisWeights[axis] * axes[axis].score, 0)
	);
	const floor = criticalFloor(scored);
	const overall = Math.max(weighted, floor);

	return {
		overall,
		grade: gradeFor(overall),
		floor,
		axes,
		files: changes.length,
		scoredLines,
		findings: scored,
	};
}

// groups findings by rule and damps within each group, strongest first: the k-th finding of a rule adds
// points * (sqrt(k) - sqrt(k - 1)), so n findings of one rule weigh sqrt(n) findings. repeats keep counting,
// a hundred `any` casts weigh ten, but never swamp the other rules.
function dampen(findings: readonly Finding[], rulesById: Map<string, Rule>, scoring: Scoring): ScoredFinding[] {
	const byRule = Map.groupBy(findings, finding => finding.ruleId);

	return [...byRule.entries()].flatMap(([ruleId, group]) => {
		const rule = rulesById.get(ruleId);

		if (rule === undefined) {
			throw new Error(`finding references unknown rule ${ruleId}`);
		}

		const base = scoring.points[rule.severity];

		return group
			.map(finding => ({ ...finding, raw: base * finding.confidence }))
			.sort((a, b) => b.raw - a.raw)
			.map(({ raw, ...finding }, index) => ({
				...finding,
				axis: rule.axis,
				severity: rule.severity,
				points: raw * (Math.sqrt(index + 1) - Math.sqrt(index)),
			}));
	});
}

function criticalFloor(findings: readonly ScoredFinding[]): number {
	const criticals = findings.filter(finding => finding.severity === Severity.CRITICAL).length;

	return CRITICAL_FLOORS[Math.min(criticals, CRITICAL_FLOORS.length - 1)] ?? 0;
}

function compareByContribution(a: ScoredFinding, b: ScoredFinding): number {
	return (
		b.points - a.points ||
		SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
		a.path.localeCompare(b.path) ||
		a.line - b.line
	);
}

export function gradeFor(overall: number): Grade {
	const band = GRADE_BANDS.find(([upper]) => overall <= upper);

	return band?.[1] ?? Grade.F;
}
