// scans a repository's TypeScript with Jev at function granularity and writes the findings as json so
// variants can be compared against hand-labeled results.
//
//   pnpm script scripts/jev-scan.ts --out <file> [--repo <path>] [--shape state|rubric] [--primitive choice|score]
//                                   [--per-rule] [--rule <id>] [--threshold 0.5]
//                                   [--no-context] [--no-facts] [--no-not-applicable] [--include-tests]
//
// shape state:  rule and code both in the state, generic question (the fixture winner)
// shape rubric: code alone in the state, the rule as a structured rubric inside the question
// primitive:    choice gives one violation probability; score gives a level distribution and a confidence
// per-rule:     one call per (unit, rule) instead of one call per unit carrying every rule
// facts:        computed facts about the unit (callers, parameters, lines, exported) in the state

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';

import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { EntryType, Question, SystemOneResult } from '@typesafe-ai/sdk';
import type { SgNode } from '@ast-grep/napi';

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
import { Lang, detectLang, ruleAppliesTo } from '../src/lang.js';
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
		shape: { type: 'string', default: Shape.STATE },
		primitive: { type: 'string', default: Primitive.CHOICE },
		'per-rule': { type: 'boolean', default: false },
		rule: { type: 'string' },
		threshold: { type: 'string', default: '0.5' },
		context: { type: 'boolean', default: true },
		facts: { type: 'boolean', default: true },
		'not-applicable': { type: 'boolean', default: true },
		'include-tests': { type: 'boolean', default: false },
	},
	allowNegative: true,
	strict: true,
});

const threshold = Number(values.threshold);
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

// functions, methods, and arrow functions bound at module level; inline callbacks belong to their parent
const UNIT_MATCHER = {
	rule: {
		any: [
			{ kind: 'function_declaration' },
			{ kind: 'method_definition' },
			{
				kind: 'arrow_function',
				inside: {
					kind: 'variable_declarator',
					inside: {
						kind: 'lexical_declaration',
						inside: { any: [{ kind: 'program' }, { kind: 'export_statement' }] },
					},
				},
			},
		],
	},
};

const IMPORT_MATCHER = { rule: { kind: 'import_statement' } };

// the names a reader would see scrolling the file: what is declared at the top level
const DECLARATION_MATCHER = {
	rule: {
		any: [
			{ kind: 'function_declaration' },
			{ kind: 'class_declaration' },
			{ kind: 'type_alias_declaration' },
			{ kind: 'interface_declaration' },
			{ kind: 'lexical_declaration' },
		],
		inside: { any: [{ kind: 'program' }, { kind: 'export_statement' }] },
	},
};

// every call site's callee text, so callers can be counted by name across the repository
const CALL_MATCHER = { rule: { kind: 'call_expression' } };

const IDENTIFIER_MATCHER = { rule: { any: [{ kind: 'identifier' }, { kind: 'property_identifier' }] } };

const NAME_PATTERN = /(?:function\s*\*?\s*|(?:const|let)\s+)?([A-Za-z_$][\w$]*)\s*[(=<:]/;
const BOOLEAN_RETURN_PATTERN = /\)\s*:\s*boolean\b/;
const MAX_UNIT_LINES = 200;

async function main(): Promise<void> {
	if (values.out === undefined) {
		throw new Error('--out <file> is required');
	}

	if (!isShape(values.shape) || !isPrimitive(values.primitive)) {
		throw new Error(
			`shape is one of ${Object.values(Shape).join(', ')}; primitive is one of ${Object.values(Primitive).join(', ')}`
		);
	}

	const shape = values.shape;
	const primitive = values.primitive;
	const client = new TypeSafeClient();
	const rules = (await loadRules(RULES_DIR)).filter(
		(rule): rule is JudgeRule =>
			rule.detect === Detect.JUDGE &&
			ruleAppliesTo(rule.lang, Lang.TS) &&
			(values.rule === undefined || rule.id === values.rule)
	);
	const units = await collectUnits();

	logger.info(
		{ repo, units: units.length, rules: rules.length, shape, primitive, perRule: values['per-rule'] },
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

				const result = await ask(client, shape, primitive, unit, batch);
				inputTokens += result.usage.input_tokens;
				calls += 1;

				for (const rule of batch) {
					const verdict = readAnswer(result, rule.id);

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
	shape: Shape,
	primitive: Primitive,
	unit: Unit,
	batch: readonly JudgeRule[]
): Promise<SystemOneResult<Record<string, Question>>> {
	const code: CodeState = {
		language: languageName(Lang.TS),
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

async function collectUnits(): Promise<Unit[]> {
	const { stdout } = await execFileAsync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf-8' });
	const paths = stdout
		.split('\0')
		.filter(path => detectLang(path) === Lang.TS)
		.filter(path => !path.startsWith('fixtures/'));

	const roots = await mapConcurrent(paths, async path => ({
		path,
		root: parseSource(Lang.TS, await readFile(join(repo, path), 'utf-8'), path),
	}));

	// tests count as callers and references even when they are not judged themselves
	const callers = countCallers(roots.map(({ root }) => root));
	const references = countReferences(roots.map(({ root }) => root));
	const judged = roots.filter(({ path }) => values['include-tests'] || !/\.test\.tsx?$/.test(path));

	return judged.flatMap(({ path, root }) => {
		const imports = root.findAll(IMPORT_MATCHER).map(node => node.text());
		const declarations = root.findAll(DECLARATION_MATCHER).map(firstLine);

		return root
			.findAll(UNIT_MATCHER)
			.filter(node => node.text().split('\n').length <= MAX_UNIT_LINES)
			.map(node => {
				const header = firstLine(node);
				const name = NAME_PATTERN.exec(header)?.[1] ?? header;

				return {
					path,
					line: node.range().start.line + 1,
					source: node.text(),
					facts: {
						name,
						exported: isExported(node),
						lines: node.text().split('\n').length,
						parameters: countParameters(node),
						returnsBoolean: BOOLEAN_RETURN_PATTERN.test(header),
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

// call sites by callee name across the repository: `foo(...)` and `x.foo(...)` both count for `foo`
function countCallers(roots: readonly SgNode[]): Map<string, number> {
	const counts = new Map<string, number>();

	for (const root of roots) {
		for (const call of root.findAll(CALL_MATCHER)) {
			const callee = call.field('function')?.text() ?? '';
			const name = callee.split('.').at(-1) ?? callee;
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
	}

	return counts;
}

// identifier mentions by name across the repository, so a function passed as a value is not mistaken for dead
function countReferences(roots: readonly SgNode[]): Map<string, number> {
	const counts = new Map<string, number>();

	for (const root of roots) {
		for (const identifier of root.findAll(IDENTIFIER_MATCHER)) {
			const name = identifier.text();
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
	}

	return counts;
}

function isExported(node: SgNode): boolean {
	return (
		node.parent()?.kind() === 'export_statement' || node.parent()?.parent()?.parent()?.kind() === 'export_statement'
	);
}

function countParameters(node: SgNode): number {
	const parameters = node.find({ rule: { kind: 'formal_parameters' } });

	return parameters === null ? 0 : parameters.children().filter(child => child.isNamed()).length;
}

function firstLine(node: SgNode): string {
	return node.text().split('\n', 1)[0]?.trim() ?? '';
}

function printSummary(findings: readonly Finding[]): void {
	const byRule = Map.groupBy(findings, finding => finding.ruleId);
	process.stdout.write(`${findings.length} findings at ${threshold}\n`);

	for (const [ruleId, group] of [...byRule.entries()].sort((a, b) => b[1].length - a[1].length)) {
		process.stdout.write(`  ${String(group.length).padStart(3)}  ${ruleId}\n`);
	}
}

main().catch((error: unknown) => {
	logger.error({ err: error }, 'jev-scan failed');
	process.exitCode = 1;
});
