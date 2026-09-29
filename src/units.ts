import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { NapiConfig, SgNode } from '@ast-grep/napi';

import { parseSource } from './analyzers/ast.js';
import { Lang } from './lang.js';
import { mapConcurrent } from './shared/concurrency.js';

// facts code can compute about a unit so a model never has to guess them. "code calculates, Jev judges."
export type UnitFacts = {
	readonly name: string;
	readonly isExported: boolean;
	readonly lines: number;
	readonly parameters: number;
	// declared to return a boolean, the shape a predicate has
	readonly isPredicate: boolean;
	// call sites across the repository, not counting the definition
	readonly callers: number;
	// every other mention of the name across the repository: calls, references passed as values, re-exports
	readonly references: number;
};

// a function, method, module-level arrow function, top-level type, or a module-level value of some size: the
// granularity a decision model judges at. types are units or rules about shapes would never see one; constants
// are units or a prompt written as a string array and a grammar written as regex tables would never be seen.
export type Unit = {
	readonly path: string;
	readonly line: number;
	readonly endLine: number;
	// the first line of the unit, verbatim
	readonly header: string;
	readonly source: string;
	readonly facts: UnitFacts;
	readonly imports: readonly string[];
	// first lines of the file's other top-level declarations, so colocation and reuse questions have context
	readonly declarations: readonly string[];
};

// repository-wide counts by name, the two facts a single file cannot supply
export type RepoCounts = {
	callers(name: string): number;
	references(name: string): number;
};

type Grammar = {
	// callables and types: always units
	units: NapiConfig;
	// module-level values: units when they span at least MIN_VALUE_LINES, otherwise the syntax rules' business
	values: NapiConfig;
	imports: NapiConfig;
	declarations: NapiConfig;
	calls: NapiConfig;
	identifiers: NapiConfig;
	// the parameter list of a unit, never one of a nested callback or a function type
	parameters: NapiConfig;
	// the nodes carrying the name when the unit itself has no `name` field
	declarators: readonly string[];
	// matches a header whose declared return type is boolean
	predicateSignature: RegExp;
	isExported(node: SgNode, name: string): boolean;
};

const TOP_LEVEL_TS = { any: [{ kind: 'program' }, { kind: 'export_statement' }] };
const CALLABLE_TS = [{ kind: 'function_declaration' }, { kind: 'method_definition' }, { kind: 'arrow_function' }];
const CALLABLE_GO = [{ kind: 'function_declaration' }, { kind: 'method_declaration' }];
const ARROW_DECLARATION = {
	kind: 'variable_declarator',
	has: {
		kind: 'arrow_function',
		field: 'value',
	},
};

const GRAMMARS: Readonly<Record<Lang, Grammar>> = {
	[Lang.TS]: {
		// functions and methods anywhere; arrow functions, types, interfaces, and enums bound at module level.
		// an arrow's unit is its whole declaration, so the header carries the name.
		units: {
			rule: {
				any: [
					{ kind: 'function_declaration' },
					{ kind: 'method_definition' },
					{
						kind: 'lexical_declaration',
						inside: TOP_LEVEL_TS,
						has: ARROW_DECLARATION,
					},
					{
						kind: 'type_alias_declaration',
						inside: TOP_LEVEL_TS,
					},
					{
						kind: 'interface_declaration',
						inside: TOP_LEVEL_TS,
					},
					{
						kind: 'enum_declaration',
						inside: TOP_LEVEL_TS,
					},
				],
			},
		},
		values: {
			rule: {
				kind: 'lexical_declaration',
				inside: TOP_LEVEL_TS,
				not: { has: ARROW_DECLARATION },
			},
		},
		imports: { rule: { kind: 'import_statement' } },
		declarations: {
			rule: {
				any: [
					{ kind: 'function_declaration' },
					{ kind: 'class_declaration' },
					{ kind: 'type_alias_declaration' },
					{ kind: 'interface_declaration' },
					{ kind: 'enum_declaration' },
					{ kind: 'lexical_declaration' },
				],
				inside: TOP_LEVEL_TS,
			},
		},
		calls: { rule: { kind: 'call_expression' } },
		identifiers: {
			rule: { any: [{ kind: 'identifier' }, { kind: 'property_identifier' }, { kind: 'type_identifier' }] },
		},
		parameters: {
			rule: {
				kind: 'formal_parameters',
				inside: {
					field: 'parameters',
					any: CALLABLE_TS,
				},
			},
		},
		declarators: ['variable_declarator'],
		predicateSignature: /\)\s*:\s*boolean\b/,
		isExported: node => node.parent()?.kind() === 'export_statement',
	},
	[Lang.GO]: {
		units: {
			rule: {
				any: [
					...CALLABLE_GO,
					{
						kind: 'type_declaration',
						inside: { kind: 'source_file' },
					},
				],
			},
		},
		values: {
			rule: {
				any: [{ kind: 'var_declaration' }, { kind: 'const_declaration' }],
				inside: { kind: 'source_file' },
			},
		},
		imports: { rule: { kind: 'import_declaration' } },
		declarations: {
			rule: {
				any: [
					...CALLABLE_GO,
					{ kind: 'type_declaration' },
					{ kind: 'var_declaration' },
					{ kind: 'const_declaration' },
				],
				inside: { kind: 'source_file' },
			},
		},
		calls: { rule: { kind: 'call_expression' } },
		identifiers: {
			rule: { any: [{ kind: 'identifier' }, { kind: 'field_identifier' }, { kind: 'type_identifier' }] },
		},
		// the `parameters` field, never the receiver list that precedes a method's name
		parameters: {
			rule: {
				kind: 'parameter_list',
				inside: {
					field: 'parameters',
					any: CALLABLE_GO,
				},
			},
		},
		declarators: ['type_spec', 'var_spec', 'const_spec'],
		predicateSignature: /\)\s*(?:bool|\(bool\b)/,
		isExported: (_node, name) => /^[A-Z]/.test(name),
	},
};

// units longer than this are judged by nobody; a function that long is its own finding. the worst functions a
// reviewer requests changes over run two or three hundred lines, so the cap sits well above them.
const MAX_UNIT_LINES = 400;

// a one-line module-level value is a number, a string, or a small object the syntax rules already see; a value that
// wraps onto a second line is a long regex, a prompt, or a table, which is what the design rules are about
const MIN_VALUE_LINES = 2;

// cuts one file into units, with every fact that the file alone can supply
export function extractUnits(lang: Lang, path: string, source: string, counts: RepoCounts): Unit[] {
	const grammar = GRAMMARS[lang];
	const root = parseSource(lang, source, path);
	const imports = root.findAll(grammar.imports).map(node => node.text());
	const declarations = root.findAll(grammar.declarations).map(firstLine);

	const nodes = [
		...root.findAll(grammar.units),
		...root.findAll(grammar.values).filter(node => lineCount(node) >= MIN_VALUE_LINES),
	].sort((a, b) => a.range().start.line - b.range().start.line);

	return nodes
		.filter(node => lineCount(node) <= MAX_UNIT_LINES)
		.map(node => {
			const header = firstLine(node);
			const name = unitName(node, grammar);
			const { start, end } = node.range();

			return {
				path,
				line: start.line + 1,
				endLine: end.line + 1,
				header,
				source: node.text(),
				facts: {
					name,
					isExported: grammar.isExported(node, name),
					lines: end.line - start.line + 1,
					parameters: countParameters(node, grammar),
					isPredicate: grammar.predicateSignature.test(header),
					callers: counts.callers(name),
					// the definition itself is one of the identifiers counted
					references: Math.max(0, counts.references(name) - 1),
				},
				imports,
				// the unit's own header is not context about it
				declarations: declarations.filter(declaration => declaration !== header),
			};
		});
}

// parses every given file once and counts calls and mentions by name; test files count as callers too
export async function countRepo(repo: string, lang: Lang, paths: readonly string[]): Promise<RepoCounts> {
	const grammar = GRAMMARS[lang];
	const roots = await mapConcurrent(paths, async path =>
		parseSource(lang, await readFile(join(repo, path), 'utf-8'), path)
	);

	const callers = countByName(roots, grammar.calls, callee);
	const references = countByName(roots, grammar.identifiers, node => node.text());

	return {
		callers: name => callers.get(name) ?? 0,
		references: name => references.get(name) ?? 0,
	};
}

// the name the grammar gives the unit, or the first declarator's inside it, or the header when nothing is named
function unitName(node: SgNode, grammar: Grammar): string {
	const declarator = node.find({ rule: { any: grammar.declarators.map(kind => ({ kind })) } });
	const named = node.field('name') ?? declarator?.field('name');

	return named?.text() ?? firstLine(node);
}

// the callee's last name segment: `foo(...)`, `x.foo(...)`, and `pkg.Foo(...)` all count for their final name
function callee(call: SgNode): string {
	const text = call.field('function')?.text() ?? '';

	return text.split('.').at(-1) ?? text;
}

function countByName(
	roots: readonly SgNode[],
	matcher: NapiConfig,
	nameOf: (node: SgNode) => string
): Map<string, number> {
	const counts = new Map<string, number>();

	for (const root of roots) {
		for (const node of root.findAll(matcher)) {
			const name = nameOf(node);
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
	}

	return counts;
}

function countParameters(node: SgNode, grammar: Grammar): number {
	const parameters = node.find(grammar.parameters);

	return parameters === null ? 0 : parameters.children().filter(child => child.isNamed()).length;
}

function lineCount(node: SgNode): number {
	const { start, end } = node.range();

	return end.line - start.line + 1;
}

function firstLine(node: SgNode): string {
	return node.text().split('\n', 1)[0]?.trim() ?? '';
}
