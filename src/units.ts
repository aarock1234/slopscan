import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { NapiConfig, SgNode } from '@ast-grep/napi';

import { parseSource } from './analyzers/ast.js';
import { Lang } from './lang.js';
import { mapConcurrent } from './shared/concurrency.js';

// facts code can compute about a unit so a model never has to guess them. "code calculates, Jev judges."
export type UnitFacts = {
	name: string;
	exported: boolean;
	lines: number;
	parameters: number;
	returnsBoolean: boolean;
	// call sites across the repository, not counting the definition
	callers: number;
	// every other mention of the name across the repository: calls, references passed as values, re-exports
	references: number;
};

// a top-level function, method, or module-level arrow function: the granularity a decision model judges at
export type Unit = {
	path: string;
	line: number;
	endLine: number;
	// the first line of the unit, verbatim
	header: string;
	source: string;
	facts: UnitFacts;
	imports: readonly string[];
	// first lines of the file's other top-level declarations, so colocation and reuse questions have context
	declarations: readonly string[];
};

// repository-wide counts by name, the two facts a single file cannot supply
export type RepoCounts = {
	callers(name: string): number;
	references(name: string): number;
};

type Grammar = {
	units: NapiConfig;
	imports: NapiConfig;
	declarations: NapiConfig;
	calls: NapiConfig;
	identifiers: NapiConfig;
	parameters: NapiConfig;
	name: RegExp;
	returnsBoolean: RegExp;
	isExported(node: SgNode, name: string): boolean;
};

const TOP_LEVEL_TS = { any: [{ kind: 'program' }, { kind: 'export_statement' }] };

const GRAMMARS: Readonly<Record<Lang, Grammar>> = {
	[Lang.TS]: {
		// functions, methods, and arrow functions bound at module level; inline callbacks belong to their parent
		units: {
			rule: {
				any: [
					{ kind: 'function_declaration' },
					{ kind: 'method_definition' },
					{
						kind: 'arrow_function',
						inside: {
							kind: 'variable_declarator',
							inside: { kind: 'lexical_declaration', inside: TOP_LEVEL_TS },
						},
					},
				],
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
					{ kind: 'lexical_declaration' },
				],
				inside: TOP_LEVEL_TS,
			},
		},
		calls: { rule: { kind: 'call_expression' } },
		identifiers: { rule: { any: [{ kind: 'identifier' }, { kind: 'property_identifier' }] } },
		parameters: { rule: { kind: 'formal_parameters' } },
		name: /(?:function\s*\*?\s*|(?:const|let)\s+)?([A-Za-z_$][\w$]*)\s*[(=<:]/,
		returnsBoolean: /\)\s*:\s*boolean\b/,
		isExported: node =>
			node.parent()?.kind() === 'export_statement' ||
			node.parent()?.parent()?.parent()?.kind() === 'export_statement',
	},
	[Lang.GO]: {
		units: { rule: { any: [{ kind: 'function_declaration' }, { kind: 'method_declaration' }] } },
		imports: { rule: { kind: 'import_declaration' } },
		declarations: {
			rule: {
				any: [
					{ kind: 'function_declaration' },
					{ kind: 'method_declaration' },
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
		// the parameter list that does not follow another one: for methods the receiver list comes first
		parameters: {
			rule: {
				kind: 'parameter_list',
				not: { follows: { kind: 'parameter_list' } },
				inside: { any: [{ kind: 'function_declaration' }, { kind: 'method_declaration' }] },
			},
		},
		name: /func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*[([]/,
		returnsBoolean: /\)\s*(?:bool|\(bool\b)/,
		isExported: (_node, name) => /^[A-Z]/.test(name),
	},
};

// units longer than this are judged by nobody; a function that long is its own finding
const MAX_UNIT_LINES = 200;

// cuts one file into units, with every fact that the file alone can supply
export function extractUnits(lang: Lang, path: string, source: string, counts: RepoCounts): Unit[] {
	const grammar = GRAMMARS[lang];
	const root = parseSource(lang, source, path);
	const imports = root.findAll(grammar.imports).map(node => node.text());
	const declarations = root.findAll(grammar.declarations).map(firstLine);

	return root
		.findAll(grammar.units)
		.filter(node => node.text().split('\n').length <= MAX_UNIT_LINES)
		.map(node => {
			const header = firstLine(node);
			const name = grammar.name.exec(header)?.[1] ?? header;
			const { start, end } = node.range();

			return {
				path,
				line: start.line + 1,
				endLine: end.line + 1,
				header,
				source: node.text(),
				facts: {
					name,
					exported: grammar.isExported(node, name),
					lines: end.line - start.line + 1,
					parameters: countParameters(node, grammar),
					returnsBoolean: grammar.returnsBoolean.test(header),
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

function firstLine(node: SgNode): string {
	return node.text().split('\n', 1)[0]?.trim() ?? '';
}
