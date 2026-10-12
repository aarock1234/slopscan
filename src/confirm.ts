import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { SgNode } from '@ast-grep/napi';

import { parseSource } from './analyzers/ast.js';
import { isIgnored } from './change.js';
import type { Finding } from './finding.js';
import { Lang, detectLang } from './lang.js';
import { Confirm } from './rule.js';
import type { AstMatcher, Rule } from './rule.js';
import { mapConcurrent } from './shared/concurrency.js';

const execFileAsync = promisify(execFile);

export type ConfirmResult = {
	kept: Finding[];
	rejected: Finding[];
};

export type ConfirmOptions = {
	repo: string;
	ignore: readonly string[];
};

// findings for rules with a `confirm` predicate must pass a deterministic repo-wide check, or they are dropped.
// a finding without a nominated symbol cannot be checked and is dropped too.
export async function confirm(
	findings: readonly Finding[],
	rules: readonly Rule[],
	options: ConfirmOptions
): Promise<ConfirmResult> {
	const predicateByRule = new Map(rules.flatMap(rule => (rule.confirm ? [[rule.id, rule.confirm] as const] : [])));

	const kept: Finding[] = [];
	const rejected: Finding[] = [];
	const repo = new RepoIndex(options);

	for (const finding of findings) {
		const predicate = predicateByRule.get(finding.ruleId);

		if (predicate === undefined) {
			kept.push(finding);

			continue;
		}

		const lang = detectLang(finding.path);
		const passes =
			finding.symbol !== undefined &&
			lang !== undefined &&
			(await PREDICATES[predicate](repo, lang, finding.symbol));

		(passes ? kept : rejected).push(finding);
	}

	return { kept, rejected };
}

type Predicate = (repo: RepoIndex, lang: Lang, symbol: string) => Promise<boolean>;

// each predicate says whether the finding stands, given how the repository uses its symbol
const PREDICATES: Readonly<Record<Confirm, Predicate>> = {
	[Confirm.CALL_COUNT]: async (repo, lang, symbol) => (await repo.count(lang, callMatcher(symbol))) <= 1,
	[Confirm.IMPL_COUNT]: async (repo, lang, symbol) => (await repo.count(lang, implMatcher(lang, symbol))) <= 1,
	[Confirm.REF_COUNT]: async (repo, lang, symbol) => (await repo.count(lang, refMatcher(lang, symbol))) <= 1,
	[Confirm.WRITE_COUNT]: async (repo, lang, symbol) => (await repo.count(lang, writeMatcher(lang, symbol))) >= 1,
};

// call sites: `symbol(...)` or `anything.symbol(...)` in either language
function callMatcher(symbol: string) {
	return {
		rule: {
			kind: 'call_expression',
			has: {
				field: 'function',
				regex: `(^|\\.)${escape(symbol)}$`,
			},
		},
	};
}

// TS: classes that implement the interface. Go: compile-time assertions `var _ Iface = ...`
function implMatcher(lang: Lang, symbol: string) {
	const pattern = `\\b${escape(symbol)}\\b`;

	return lang === Lang.TS
		? { rule: { kind: 'implements_clause', regex: pattern } }
		: { rule: { kind: 'var_spec', regex: `^_\\s+${escape(symbol)}\\b` } };
}

// every identifier spelled exactly like the symbol; the definition counts once
function refMatcher(lang: Lang, symbol: string) {
	const kinds =
		lang === Lang.TS
			? ['identifier', 'type_identifier', 'property_identifier']
			: ['identifier', 'field_identifier', 'type_identifier'];

	return {
		rule: {
			any: kinds.map(kind => ({ kind, regex: `^${escape(symbol)}$` })),
		},
	};
}

// statements that change the collection a variable holds: assigning it or one of its elements, or handing it to a
// builtin or library call that mutates its argument. a local of the same name declared with := is not a write.
function writeMatcher(lang: Lang, symbol: string) {
	const name = `^${escape(symbol)}$`;

	return lang === Lang.TS ? tsWriteMatcher(name) : goWriteMatcher(name);
}

function goWriteMatcher(name: string) {
	const variable = { kind: 'identifier', regex: name };
	const target = {
		any: [variable, { kind: 'index_expression', has: { field: 'operand', ...variable } }],
	};

	return {
		rule: {
			any: [
				{ kind: 'assignment_statement', has: { field: 'left', has: target } },
				{ any: [{ kind: 'inc_statement' }, { kind: 'dec_statement' }], has: target },
				{
					kind: 'call_expression',
					all: [
						{
							has: {
								field: 'function',
								regex: '^(delete|clear|copy|sort\\.\\w+|slices\\.(Sort\\w*|Reverse|Insert|Delete\\w*))$',
							},
						},
						{ has: { field: 'arguments', has: { nthChild: 1, ...variable } } },
					],
				},
			],
		},
	};
}

function tsWriteMatcher(name: string) {
	const variable = { kind: 'identifier', regex: name };
	const target = {
		any: [
			variable,
			{ kind: 'subscript_expression', has: { field: 'object', ...variable } },
			{ kind: 'member_expression', has: { field: 'object', ...variable } },
		],
	};

	return {
		rule: {
			any: [
				{
					any: [{ kind: 'assignment_expression' }, { kind: 'augmented_assignment_expression' }],
					has: { field: 'left', ...target },
				},
				{ kind: 'update_expression', has: target },
				{
					kind: 'call_expression',
					has: {
						field: 'function',
						kind: 'member_expression',
						all: [
							{ has: { field: 'object', ...variable } },
							{
								has: {
									field: 'property',
									regex: '^(push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin|set|delete|clear|add)$',
								},
							},
						],
					},
				},
			],
		},
	};
}

// parses each tracked file of a language once and answers count queries against the trees
class RepoIndex {
	readonly #options: ConfirmOptions;
	readonly #trees = new Map<Lang, Promise<readonly SgNode[]>>();

	constructor(options: ConfirmOptions) {
		this.#options = options;
	}

	async count(lang: Lang, matcher: AstMatcher): Promise<number> {
		const trees = await this.#load(lang);

		return trees.reduce((sum, tree) => sum + tree.findAll(matcher).length, 0);
	}

	#load(lang: Lang): Promise<readonly SgNode[]> {
		let trees = this.#trees.get(lang);

		if (trees === undefined) {
			trees = this.#parseAll(lang);
			this.#trees.set(lang, trees);
		}

		return trees;
	}

	async #parseAll(lang: Lang): Promise<readonly SgNode[]> {
		const paths = (await trackedFiles(this.#options.repo)).filter(
			path => detectLang(path) === lang && !isIgnored(path, this.#options.ignore)
		);

		return mapConcurrent(paths, async path =>
			parseSource(lang, await readFile(join(this.#options.repo, path), 'utf-8'), path)
		);
	}
}

// git knows which files are source and which are ignored, so we ask it rather than walking the tree
async function trackedFiles(repo: string): Promise<string[]> {
	const { stdout } = await execFileAsync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf-8' });

	return stdout.split('\0').filter(path => path.length > 0);
}

function escape(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
