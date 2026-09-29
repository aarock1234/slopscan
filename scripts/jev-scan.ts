// scans a repository's TypeScript with Jev at function granularity and writes the findings as json so
// variants can be compared against hand-labeled results.
//
//   pnpm script scripts/jev-scan.ts --out <file> [--repo <path>] [--shape state|rubric] [--per-rule]
//                                   [--threshold 0.5] [--no-context] [--no-not-applicable] [--include-tests]
//
// shape state:  rule and code both in the state, generic contrast question (the fixture winner)
// shape rubric: code alone in the state, the rule as a structured rubric inside the question
// per-rule:     one call per (unit, rule) instead of one call per unit carrying every rule

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';

import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { ChoiceQuestion, EntryType, SystemOneResult } from '@typesafe-ai/sdk';
import type { SgNode } from '@ast-grep/napi';

import { parseSource } from '../src/analyzers/ast.js';
import { Verdict, contrastQuestion, languageName, ruleQuestion, ruleState } from '../src/analyzers/jev.js';
import type { CodeState } from '../src/analyzers/jev.js';
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

const { values } = parseArgs({
	options: {
		out: { type: 'string' },
		repo: { type: 'string', default: PACKAGE_ROOT },
		shape: { type: 'string', default: Shape.STATE },
		'per-rule': { type: 'boolean', default: false },
		threshold: { type: 'string', default: '0.5' },
		context: { type: 'boolean', default: true },
		'not-applicable': { type: 'boolean', default: true },
		'include-tests': { type: 'boolean', default: false },
		rule: { type: 'string' },
	},
	allowNegative: true,
	strict: true,
});

const threshold = Number(values.threshold);
const repo = resolve(values.repo);
const questionOptions = { notApplicable: values['not-applicable'] };

// a top-level unit of code worth judging on its own, with the names around it in its file
type Unit = {
	path: string;
	line: number;
	name: string;
	source: string;
	imports: string[];
	declarations: string[];
};

export type Finding = {
	path: string;
	line: number;
	name: string;
	ruleId: string;
	probability: number;
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

const MAX_UNIT_LINES = 200;

async function main(): Promise<void> {
	if (values.out === undefined) {
		throw new Error('--out <file> is required');
	}

	if (!isShape(values.shape)) {
		throw new Error(`unknown shape; one of ${Object.values(Shape).join(', ')}`);
	}

	const shape = values.shape;
	const client = new TypeSafeClient();
	const rules = (await loadRules(RULES_DIR)).filter(
		(rule): rule is JudgeRule =>
			rule.detect === Detect.JUDGE &&
			ruleAppliesTo(rule.lang, Lang.TS) &&
			(values.rule === undefined || rule.id === values.rule)
	);
	const units = await collectUnits();

	logger.info({ repo, units: units.length, rules: rules.length, shape, perRule: values['per-rule'] }, 'scanning');

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

				const result = await ask(client, shape, unit, batch);
				inputTokens += result.usage.input_tokens;
				calls += 1;

				for (const rule of batch) {
					const answer = result.answers[rule.id];
					const probability = answer?.type === 'choice' ? (answer.probabilities[Verdict.VIOLATES] ?? 0) : 0;

					if (probability >= threshold) {
						found.push({ path: unit.path, line: unit.line, name: unit.name, ruleId: rule.id, probability });
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

// one call: the unit plus the batch of rules, arranged according to the shape
function ask(
	client: TypeSafeClient,
	shape: Shape,
	unit: Unit,
	batch: readonly JudgeRule[]
): Promise<SystemOneResult<Record<string, ChoiceQuestion>>> {
	const code: CodeState = {
		language: languageName(Lang.TS),
		code: unit.source,
		...(values.context && { file: { path: unit.path, imports: unit.imports, declarations: unit.declarations } }),
	};

	if (shape === Shape.RUBRIC) {
		return client.systemOne({
			state: code,
			questions: Object.fromEntries(batch.map(rule => [rule.id, ruleQuestion(rule, questionOptions)])),
		});
	}

	// a lone rule sits at `rule`; several sit under `rules` and each question names its own
	const [only] = batch;

	if (batch.length === 1 && only !== undefined) {
		return client.systemOne({
			state: { ...code, rule: ruleState(only) },
			questions: { [only.id]: contrastQuestion(questionOptions) },
		});
	}

	const state: EntryType = { ...code, rules: Object.fromEntries(batch.map(rule => [rule.id, ruleState(rule)])) };

	return client.systemOne({
		state,
		questions: Object.fromEntries(
			batch.map(rule => [rule.id, contrastQuestion(questionOptions, `rules["${rule.id}"]`)])
		),
	});
}

function isShape(value: string): value is Shape {
	return (Object.values(Shape) as readonly string[]).includes(value);
}

async function collectUnits(): Promise<Unit[]> {
	const { stdout } = await execFileAsync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf-8' });
	const paths = stdout
		.split('\0')
		.filter(path => detectLang(path) === Lang.TS)
		.filter(path => values['include-tests'] || !/\.test\.tsx?$/.test(path))
		.filter(path => !path.startsWith('fixtures/'));

	const perFile = await mapConcurrent(paths, async path => {
		const source = await readFile(join(repo, path), 'utf-8');
		const root = parseSource(Lang.TS, source, path);
		const imports = root.findAll(IMPORT_MATCHER).map(node => node.text());
		const declarations = root.findAll(DECLARATION_MATCHER).map(firstLine);

		return root
			.findAll(UNIT_MATCHER)
			.map(node => ({
				path,
				line: node.range().start.line + 1,
				name: firstLine(node),
				source: node.text(),
				imports,
				// the unit's own header is not context about it
				declarations: declarations.filter(declaration => declaration !== firstLine(node)),
			}))
			.filter(unit => unit.source.split('\n').length <= MAX_UNIT_LINES);
	});

	return perFile.flat();
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
