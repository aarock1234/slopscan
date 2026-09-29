import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SgNode } from '@ast-grep/napi';

import { parseSource } from './analyzers/ast.js';
import { isIgnored } from './change.js';
import type { Change } from './change.js';
import { Origin } from './finding.js';
import type { Finding } from './finding.js';
import { Lang, detectLang } from './lang.js';
import type { Rule } from './rule.js';
import { mapConcurrent } from './shared/concurrency.js';
import { trackedFiles } from './shared/git.js';

// the rule these findings belong to. the judge asks it of one file at a time; this asks it of the repository,
// which is where the second declaration of a shape usually lives.
export const DUPLICATED_SHAPE_RULE = 'ts.futureproof.duplicated-type-shape';

const ShapeKind = {
	TYPE: 'type',
	SCHEMA: 'schema',
} as const;

type ShapeKind = (typeof ShapeKind)[keyof typeof ShapeKind];

// one declared object shape: a type alias with an object type, an interface body, or a z.object call
export type Shape = {
	readonly path: string;
	readonly line: number;
	readonly endLine: number;
	readonly header: string;
	readonly name: string;
	readonly kind: ShapeKind;
	// property names, sorted; two shapes with the same fields are the same concept declared twice
	readonly fields: string;
	// property names with their normalized types, sorted; equal here means the declarations are interchangeable
	readonly signature: string;
};

// fewer fields than this and two shapes agreeing is coincidence, not duplication
const MIN_FIELDS = 3;

// a schema restated with different bounds or descriptions is still the same shape
const SCHEMA_MODIFIERS =
	/\.(?:describe|max|min|optional|nullable|nullish|default|trim|int|length|regex|email|url|uuid)\([^)]*\)/g;

const SAME_SIGNATURE_CONFIDENCE = 1;
const SAME_FIELDS_CONFIDENCE = 0.7;

// finds changed type and schema declarations whose fields another declaration in the repository already has
export async function findDuplicateShapes(
	repo: string,
	changes: readonly Change[],
	rules: readonly Rule[],
	ignore: readonly string[]
): Promise<Finding[]> {
	const rule = rules.find(candidate => candidate.id === DUPLICATED_SHAPE_RULE);
	const changed = changes.filter(change => change.lang === Lang.TS);

	if (rule === undefined || changed.length === 0) {
		return [];
	}

	const bySource = new Map(changed.map(change => [change.path, change.source]));
	const paths = (await trackedFiles(repo)).filter(
		path => detectLang(path) === Lang.TS && !isIgnored(path, ignore) && !isIgnored(path, rule.ignore)
	);
	// changed files from their head-side source, everything else from the working tree
	const shapes = await mapConcurrent(paths, async path =>
		extractShapes(path, bySource.get(path) ?? (await readFile(join(repo, path), 'utf-8')))
	);

	return duplicateFindings(shapes.flat(), changed, rule);
}

// every object shape declared in one file
export function extractShapes(path: string, source: string): Shape[] {
	const root = parseSource(Lang.TS, source, path);
	const lines = source.split('\n');

	const aliases = root
		.findAll({ rule: { kind: 'type_alias_declaration', has: { field: 'value', kind: 'object_type' } } })
		.map(node => typeShape(path, lines, node, node.field('value')));
	const interfaces = root
		.findAll({ rule: { kind: 'interface_declaration' } })
		.map(node => typeShape(path, lines, node, node.field('body')));
	const schemas = root
		.findAll({ rule: { kind: 'call_expression', has: { field: 'function', regex: '^z\\.object$' } } })
		.map(node => schemaShape(path, lines, node));

	return [...aliases, ...interfaces, ...schemas].filter(
		(shape): shape is Shape => shape !== undefined && shape.fields.split(';').length >= MIN_FIELDS
	);
}

// reports every changed declaration of a shape that another declaration already has. the original is an
// unchanged declaration when there is one, else the earliest changed one; it is named, not reported.
export function duplicateFindings(shapes: readonly Shape[], changes: readonly Change[], rule: Rule): Finding[] {
	const changedLines = new Map(changes.map(change => [change.path, change.changedLines]));
	const groups = Map.groupBy(shapes, shape => `${shape.kind}:${shape.fields}`);
	const findings: Finding[] = [];

	for (const group of groups.values()) {
		if (group.length < 2) {
			continue;
		}

		const isChanged = (shape: Shape): boolean => {
			const lines = changedLines.get(shape.path);

			return lines !== undefined && touches(shape, lines);
		};
		const [original, ...later] = group.toSorted(
			(a, b) => Number(isChanged(a)) - Number(isChanged(b)) || compareByPosition(a, b)
		);

		if (original === undefined) {
			continue;
		}

		for (const shape of later) {
			if (!isChanged(shape)) {
				continue;
			}

			const isInterchangeable = original.signature === shape.signature;

			findings.push({
				ruleId: rule.id,
				path: shape.path,
				line: shape.line,
				endLine: shape.endLine,
				quote: shape.header,
				message: `${shape.name} ${isInterchangeable ? 'declares the same shape as' : 'has the same fields as'} ${original.name} in ${original.path}:${original.line}; derive one from the other`,
				confidence: isInterchangeable ? SAME_SIGNATURE_CONFIDENCE : SAME_FIELDS_CONFIDENCE,
				origin: Origin.AST,
			});
		}
	}

	return findings;
}

function typeShape(path: string, lines: readonly string[], node: SgNode, body: SgNode | null): Shape | undefined {
	if (body === null) {
		return undefined;
	}

	const properties = body
		.children()
		.filter(child => child.kind() === 'property_signature')
		.map(property => ({
			name: property.field('name')?.text() ?? '',
			type: normalize(property.field('type')?.text().replace(/^:\s*/, '') ?? ''),
		}));

	return shape(path, lines, node, node.field('name')?.text() ?? '', ShapeKind.TYPE, properties);
}

function schemaShape(path: string, lines: readonly string[], call: SgNode): Shape | undefined {
	const literal = call
		.field('arguments')
		?.children()
		.find(child => child.kind() === 'object');

	if (literal === undefined) {
		return undefined;
	}

	const properties = literal
		.children()
		.filter(child => child.kind() === 'pair')
		.map(pair => ({
			name: pair.field('key')?.text() ?? '',
			type: normalize((pair.field('value')?.text() ?? '').replaceAll(SCHEMA_MODIFIERS, '')),
		}));

	return shape(path, lines, call, declaredName(call) ?? 'z.object', ShapeKind.SCHEMA, properties);
}

type Property = {
	readonly name: string;
	readonly type: string;
};

function shape(
	path: string,
	lines: readonly string[],
	node: SgNode,
	name: string,
	kind: ShapeKind,
	properties: readonly Property[]
): Shape {
	const { start, end } = node.range();
	const sorted = properties.toSorted((a, b) => a.name.localeCompare(b.name));

	return {
		path,
		line: start.line + 1,
		endLine: end.line + 1,
		header: lines[start.line]?.trim() ?? '',
		name,
		kind,
		fields: sorted.map(property => property.name).join(';'),
		signature: sorted.map(property => `${property.name}=${property.type}`).join(';'),
	};
}

// the variable a schema call is assigned to, when it is
function declaredName(call: SgNode): string | undefined {
	for (let node = call.parent(); node !== null; node = node.parent()) {
		if (node.kind() === 'variable_declarator') {
			return node.field('name')?.text();
		}
	}

	return undefined;
}

function normalize(text: string): string {
	return text
		.replace(/\s+/g, ' ')
		.replace(/\breadonly\s+/g, '')
		.trim();
}

function touches(shape: Shape, changedLines: ReadonlySet<number>): boolean {
	for (let line = shape.line; line <= shape.endLine; line += 1) {
		if (changedLines.has(line)) {
			return true;
		}
	}

	return false;
}

function compareByPosition(a: Shape, b: Shape): number {
	return a.path.localeCompare(b.path) || a.line - b.line;
}
