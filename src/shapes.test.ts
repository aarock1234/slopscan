import { describe, expect, it } from 'vitest';

import type { Change } from './change.js';
import { Detect } from './rule.js';
import type { Rule } from './rule.js';
import { DUPLICATED_SHAPE_RULE, duplicateFindings, extractShapes } from './shapes.js';

const rule: Rule = {
	id: DUPLICATED_SHAPE_RULE,
	lang: 'ts',
	axis: 'futureproof',
	category: 'types',
	severity: 'critical',
	ignore: [],
	guide: ['ts.one-definition'],
	why: 'because',
	message: 'type or schema restates a shape that is already defined; derive it from the one definition',
	good: [],
	bad: [],
	path: 'rule.md',
	detect: Detect.JUDGE,
	falsePositives: [],
};

const PLANNED = `export type PlannedElement = {
	name: string;
	requirement: string;
	verification: string;
	equivalents: Equivalent[];
};
`;

const DERIVED = `import type { ElementContest } from './schema.js';

// BAD: restates the planned element
type DerivedElement = {
	name: string;
	requirement: string;
	verification: string;
	equivalents: readonly string[];
};

type Narrow = Pick<DerivedElement, 'name' | 'requirement'>;

interface Authority {
	name: string;
	type: string;
}
`;

const SCHEMAS = `const componentFeedbackSchema = z.object({
	feedback: z.string().max(600).describe('what the student did'),
	takeaway: z.string().max(200).describe('one sentence'),
	version: z.number().int(),
});

const feedbackOutputSchema = z.object({
	feedback: z.string().describe(componentFeedbackSchema.shape.feedback.description!),
	takeaway: z.string(),
	version: z.number(),
});
`;

function change(path: string, source: string): Change {
	return {
		path,
		lang: 'ts',
		source,
		changedLines: new Set(Array.from({ length: source.split('\n').length }, (_, index) => index + 1)),
		scoredLines: 10,
	};
}

describe('extractShapes', () => {
	it('reads type aliases, interfaces, and z.object calls with at least three fields', () => {
		const shapes = extractShapes('src/derived.ts', DERIVED);

		expect(shapes.map(shape => [shape.name, shape.kind, shape.fields])).toEqual([
			['DerivedElement', 'type', 'equivalents;name;requirement;verification'],
		]);
	});

	it('normalizes schema bounds and descriptions away so restated schemas compare equal', () => {
		const [persisted, output] = extractShapes('src/feedback.ts', SCHEMAS);

		expect(persisted?.name).toBe('componentFeedbackSchema');
		expect(output?.name).toBe('feedbackOutputSchema');
		expect(persisted?.fields).toBe(output?.fields);
		expect(persisted?.signature).toBe(output?.signature);
	});
});

describe('duplicateFindings', () => {
	it('flags a changed type that repeats a shape declared elsewhere, naming the original', () => {
		const shapes = [...extractShapes('src/planned.ts', PLANNED), ...extractShapes('src/derived.ts', DERIVED)];
		const findings = duplicateFindings(shapes, [change('src/derived.ts', DERIVED)], rule);

		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			ruleId: DUPLICATED_SHAPE_RULE,
			path: 'src/derived.ts',
			line: 4,
			quote: 'type DerivedElement = {',
			confidence: 0.7,
		});
		expect(findings[0]?.message).toContain('PlannedElement in src/planned.ts:1');
	});

	it('flags a schema restated in the same file as interchangeable', () => {
		const findings = duplicateFindings(
			extractShapes('src/feedback.ts', SCHEMAS),
			[change('src/feedback.ts', SCHEMAS)],
			rule
		);

		expect(findings.map(finding => [finding.line, finding.confidence])).toEqual([[7, 1]]);
	});

	it('treats the unchanged declaration as the original when a changed one repeats it', () => {
		const shapes = [...extractShapes('src/planned.ts', PLANNED), ...extractShapes('src/derived.ts', DERIVED)];
		const findings = duplicateFindings(shapes, [change('src/planned.ts', PLANNED)], rule);

		expect(findings.map(finding => finding.path)).toEqual(['src/planned.ts']);
		expect(findings[0]?.message).toContain('DerivedElement in src/derived.ts:4');
	});

	it('says nothing about a shape declared once', () => {
		expect(
			duplicateFindings(extractShapes('src/derived.ts', DERIVED), [change('src/derived.ts', DERIVED)], rule)
		).toEqual([]);
	});
});
