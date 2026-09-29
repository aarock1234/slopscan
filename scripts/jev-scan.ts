// scans a repository's TypeScript or Go with Jev at function granularity and writes the findings as json so
// variants can be compared against hand-labeled results.
//
//   pnpm script scripts/jev-scan.ts --out <file> [--repo <path>] [--lang ts|go] [--shape state|rubric]
//                                   [--primitive choice|score] [--per-rule] [--rule <id>] [--threshold 0.5]
//                                   [--no-context] [--no-facts] [--no-not-applicable] [--include-tests]
//
// shape state:  rule and code both in the state, generic question (the fixture winner)
// shape rubric: code alone in the state, the rule as a structured rubric inside the question
// primitive:    choice gives one violation probability; score gives a level distribution and a confidence
// per-rule:     one call per (unit, rule) instead of one call per unit carrying every rule
// facts:        computed facts about the unit (callers, references, parameters, lines, exported) in the state
// threshold:    the fallback when a rule has no measured jev.threshold of its own

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';

import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { EntryType, Question, SystemOneResult } from '@typesafe-ai/sdk';
import type { NapiConfig, SgNode } from '@ast-grep/napi';

import { parseSource } from '../src/analyzers/ast.js';
import {
	RubricLevel,
	Verdict,
	contrastQuestion,
	languageName,
	rubricQuestion,
	ruleQuestion,
	ruleState,
} from '../src/analyzers/jev.js';
import type { CodeState, UnitFacts } from '../src/analyzers/jev.js';
import { isIgnored } from '../src/change.js';
import { Lang, detectLang, langValues, ruleAppliesTo } from '../src/lang.js';
import { Detect, loadRules } from '../src/rule.js';
import type { JudgeRule } from '../src/rule.js';
import { mapConcurrent } from '../src/shared/concurrency.js';
import { logger } from '../src/shared/log.js';
import { PACKAGE_ROOT, RULES_DIR } from '../src/shared/paths.js';

const execFileAsync = promisify(execFile);

const Shape = {
	STATE: 'state',
	RUBRIC: 'rubric',
} as const;

type Shape = (typeof Shape)[keyof typeof Shape];

const Primitive = {
	CHOICE: 'choice',
	SCORE: 'score',
} as const;

type Primitive = (typeof Primitive)[keyof typeof Primitive];

const { values } = parseArgs({
	options: {
		out: { type: 'string' },
		repo: { type: 'string', default: PACKAGE_ROOT },
		lang: { type: 'string', default: Lang.TS },
		shape: { type: 'string', default: Shape.STATE },
		primitive: { type: 'string', default: Primitive.CHOICE },
		'per-rule': { type: 'boolean', default: false },
		rule: { type: 'string' },
		threshold: { type: 'string' },
		context: { type: 'boolean', default: true },
		facts: { type: 'boolean', default: true },
		'not-applicable': { type: 'boolean', default: true },
		'include-tests': { type: 'boolean', default: false },
	},
	allowNegative: true,
	strict: true,
});

// without an explicit threshold, only rules whose fixtures produced a measured one are asked
const fallbackThreshold = values.threshold === undefined ? undefined : Number(values.threshold);
const repo = resolve(values.repo);
const questionOptions = { notApplicable: values['not-applicable'] };

// a top-level unit of code worth judging on its own, with facts about it and the names around it in its file
type Unit = {
	path: string;
	line: number;
	source: string;
	facts: UnitFacts;
	imports: string[];
	declarations: string[];
};

export type Finding = {
	path: string;
	line: number;
	name: string;
	ruleId: string;
	probability: number;
	confidence?: number;
};

// how to cut a language into units and read facts off them
type Grammar = {
	units: NapiConfig;
	imports: NapiConfig;
	declarations: NapiConfig;
	calls: NapiConfig;
	identifiers: NapiConfig;
	parameters: NapiConfig;
	name: RegExp;
	returnsBoolean: RegExp;
	isTest(path: string): boolean;
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
		isTest: path => /\.test\.tsx?$/.test(path),
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
		// the first parameter_list after the name; for methods the receiver list comes first and is skipped by name
		parameters: {
			rule: {
				kind: 'parameter_list',
				not: { follows: { kind: 'parameter_list' } },
				inside: { any: [{ kind: 'function_declaration' }, { kind: 'method_declaration' }] },
			},
		},
		name: /func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*[([]/,
		returnsBoolean: /\)\s*(?:bool|\(bool\b)/,
		isTest: path => path.endsWith('_test.go'),
		isExported: (_node, name) => /^[A-Z]/.test(name),
	},
};

const MAX_UNIT_LINES = 200;

async function main(): Promise<void> {
	if (values.out === undefined) {
		throw new Error('--out <file> is required');
	}

	if (!isShape(values.shape) || !isPrimitive(values.primitive) || !isLang(values.lang)) {
		throw new Error(
			`lang is one of ${langValues.join(', ')}; shape is one of ${Object.values(Shape).join(', ')}; primitive is one of ${Object.values(Primitive).join(', ')}`
		);
	}

	const lang = values.lang;
	const shape = values.shape;
	const primitive = values.primitive;
	const client = new TypeSafeClient();
	const rules = (await loadRules(RULES_DIR)).filter(
		(rule): rule is JudgeRule =>
			rule.detect === Detect.JUDGE &&
			ruleAppliesTo(rule.lang, lang) &&
			(values.rule === undefined || rule.id === values.rule) &&
			(rule.jevThreshold !== undefined || fallbackThreshold !== undefined)
	);
	const units = await collectUnits(lang);

	logger.info(
		{ repo, lang, units: units.length, rules: rules.length, shape, primitive, perRule: values['per-rule'] },
		'scanning'
	);

	let inputTokens = 0;
	let calls = 0;

	const findings = await mapConcurrent(
		units,
		async (unit): Promise<Finding[]> => {
			const applicable = rules.filter(rule => !isIgnored(unit.path, rule.ignore));
			const batches = values['per-rule'] ? applicable.map(rule => [rule]) : [applicable];
			const found: Finding[] = [];

			for (const batch of batches) {
				if (batch.length === 0) {
					continue;
				}

				const result = await ask(client, lang, shape, primitive, unit, batch);
				inputTokens += result.usage.input_tokens;
				calls += 1;

				for (const rule of batch) {
					const verdict = readAnswer(result, rule.id);

					const threshold = rule.jevThreshold ?? fallbackThreshold ?? Number.POSITIVE_INFINITY;

					if (verdict !== undefined && verdict.probability >= threshold) {
						found.push({
							path: unit.path,
							line: unit.line,
							name: unit.facts.name,
							ruleId: rule.id,
							...verdict,
						});
					}
				}
			}

			return found;
		},
		{ concurrency: 8 }
	);

	const flat = findings.flat().sort((a, b) => b.probability - a.probability);
	await writeFile(values.out, JSON.stringify(flat, null, 2));
	printSummary(flat);
	logger.info({ calls, inputTokens, out: values.out }, 'done');
}

type Answer = {
	probability: number;
	confidence?: number;
};

// a choice answer gives the violation probability directly; a score answer gives it as the mass on the
// violating levels, and a confidence besides
function readAnswer(result: SystemOneResult<Record<string, Question>>, ruleId: string): Answer | undefined {
	const answer = result.answers[ruleId];

	if (answer?.type === 'choice') {
		return { probability: answer.probabilities[Verdict.VIOLATES] ?? 0, confidence: answer.confidence };
	}

	if (answer?.type === 'score') {
		const violating = Object.entries(answer.probabilities)
			.filter(([level]) => Number(level) >= RubricLevel.VIOLATES)
			.reduce((sum, [, probability]) => sum + probability, 0);

		return { probability: violating, confidence: answer.confidence };
	}

	return undefined;
}

// one call: the unit plus the batch of rules, arranged according to the shape and primitive
function ask(
	client: TypeSafeClient,
	lang: Lang,
	shape: Shape,
	primitive: Primitive,
	unit: Unit,
	batch: readonly JudgeRule[]
): Promise<SystemOneResult<Record<string, Question>>> {
	const code: CodeState = {
		language: languageName(lang),
		code: unit.source,
		...(values.facts && { facts: unit.facts }),
		...(values.context && { file: { path: unit.path, imports: unit.imports, declarations: unit.declarations } }),
	};

	if (shape === Shape.RUBRIC) {
		return client.systemOne({
			state: code,
			questions: Object.fromEntries(batch.map(rule => [rule.id, ruleQuestion(rule, questionOptions)])),
		});
	}

	const question = (ref: string): Question =>
		primitive === Primitive.SCORE ? rubricQuestion(ref) : contrastQuestion(questionOptions, ref);

	// a lone rule sits at `rule`; several sit under `rules` and each question names its own
	const [only] = batch;

	if (batch.length === 1 && only !== undefined) {
		return client.systemOne({
			state: { ...code, rule: ruleState(only) },
			questions: { [only.id]: question('rule') },
		});
	}

	const state: EntryType = { ...code, rules: Object.fromEntries(batch.map(rule => [rule.id, ruleState(rule)])) };

	return client.systemOne({
		state,
		questions: Object.fromEntries(batch.map(rule => [rule.id, question(`rules["${rule.id}"]`)])),
	});
}

function isShape(value: string): value is Shape {
	return (Object.values(Shape) as readonly string[]).includes(value);
}

function isPrimitive(value: string): value is Primitive {
	return (Object.values(Primitive) as readonly string[]).includes(value);
}

function isLang(value: string): value is Lang {
	return (langValues as readonly string[]).includes(value);
}

async function collectUnits(lang: Lang): Promise<Unit[]> {
	const grammar = GRAMMARS[lang];
	const { stdout } = await execFileAsync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf-8' });
	const paths = stdout
		.split('\0')
		.filter(path => detectLang(path) === lang)
		.filter(path => !path.startsWith('fixtures/'));

	const roots = await mapConcurrent(paths, async path => ({
		path,
		root: parseSource(lang, await readFile(join(repo, path), 'utf-8'), path),
	}));

	// tests count as callers and references even when they are not judged themselves
	const callers = countByName(
		roots.map(({ root }) => root),
		grammar.calls,
		callee
	);
	const references = countByName(
		roots.map(({ root }) => root),
		grammar.identifiers,
		node => node.text()
	);
	const judged = roots.filter(({ path }) => values['include-tests'] || !grammar.isTest(path));

	return judged.flatMap(({ path, root }) => {
		const imports = root.findAll(grammar.imports).map(node => node.text());
		const declarations = root.findAll(grammar.declarations).map(firstLine);

		return root
			.findAll(grammar.units)
			.filter(node => node.text().split('\n').length <= MAX_UNIT_LINES)
			.map(node => {
				const header = firstLine(node);
				const name = grammar.name.exec(header)?.[1] ?? header;

				return {
					path,
					line: node.range().start.line + 1,
					source: node.text(),
					facts: {
						name,
						exported: grammar.isExported(node, name),
						lines: node.text().split('\n').length,
						parameters: countParameters(node, grammar),
						returnsBoolean: grammar.returnsBoolean.test(header),
						callers: callers.get(name) ?? 0,
						// the definition itself is one of the identifiers counted
						references: Math.max(0, (references.get(name) ?? 0) - 1),
					},
					imports,
					// the unit's own header is not context about it
					declarations: declarations.filter(declaration => declaration !== header),
				};
			});
	});
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

function printSummary(findings: readonly Finding[]): void {
	const byRule = Map.groupBy(findings, finding => finding.ruleId);
	process.stdout.write(`${findings.length} findings\n`);

	for (const [ruleId, group] of [...byRule.entries()].sort((a, b) => b[1].length - a[1].length)) {
		process.stdout.write(`  ${String(group.length).padStart(3)}  ${ruleId}\n`);
	}
}

main().catch((error: unknown) => {
	logger.error({ err: error }, 'jev-scan failed');
	process.exitCode = 1;
});
