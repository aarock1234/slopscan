import goLang from '@ast-grep/lang-go';
import { Lang as Parser, parse, registerDynamicLanguage } from '@ast-grep/napi';
import type { SgNode } from '@ast-grep/napi';

import type { Analyzer } from '../analyzer.js';
import { Origin } from '../finding.js';
import type { Finding } from '../finding.js';
import { Lang } from '../lang.js';
import { Detect, SYMBOL_METAVARIABLE } from '../rule.js';
import type { AstMatcher, AstRule } from '../rule.js';

const GO_PARSER = 'go';
const TSX_EXTENSION = '.tsx';
// the node tree-sitter makes of text it could not parse
const ERROR_KIND = 'ERROR';

// tree-sitter grammars: TypeScript ships with the bindings, Go is loaded from its prebuilt library.
// registration must happen exactly once per process.
registerDynamicLanguage({ [GO_PARSER]: goLang });

const PARSERS: Readonly<Record<Lang, string>> = {
	[Lang.TS]: Parser.TypeScript,
	[Lang.GO]: GO_PARSER,
};

// a matched node's location, 1-based to line up with editors and diffs
export type AstMatch = {
	line: number;
	endLine: number;
	text: string;
	// what the rule bound to $SYMBOL, for its confirm predicate
	symbol?: string;
};

// runs every ast rule for the file's language against one parsed tree and keeps the matches that start on
// a changed line. a match that begins on an untouched line belongs to whoever wrote it, not to this diff, and a
// match that touches a line the parser could not read describes the parser's guess, not the code.
export const astAnalyzer: Analyzer = (change, rules) => {
	const matchers = rules.flatMap(rule => {
		if (rule.detect !== Detect.AST) {
			return [];
		}

		const matcher = rule.ast[change.lang];

		return matcher === undefined ? [] : [{ rule, matcher }];
	});

	if (matchers.length === 0) {
		return Promise.resolve([]);
	}

	const root = parseSource(change.lang, change.source, change.path);
	const unreadable = unreadableLines(root);

	const findings = matchers.flatMap(({ rule, matcher }) =>
		onePerLine(
			matchAst(root, matcher).filter(
				match => change.changedLines.has(match.line) && !touchesAny(match, unreadable)
			)
		).map(match => toFinding(rule, change.path, match))
	);

	return Promise.resolve(findings);
};

// the lines holding text the parser could not read. tree-sitter recovers from syntax its grammar predates, such as
// Go 1.27's generic methods, by misreading the code around it, so nothing on those lines is what it seems.
function unreadableLines(root: SgNode): Set<number> {
	const lines = new Set<number>();

	for (const node of root.findAll({ rule: { kind: ERROR_KIND } })) {
		const { start, end } = node.range();

		for (let line = start.line + 1; line <= end.line + 1; line += 1) {
			lines.add(line);
		}
	}

	return lines;
}

function touchesAny(match: AstMatch, lines: ReadonlySet<number>): boolean {
	for (let line = match.line; line <= match.endLine; line += 1) {
		if (lines.has(line)) {
			return true;
		}
	}

	return false;
}

// a chain like `p.then().catch().finally()` is three matches starting on one line; the reader wants one finding
function onePerLine(matches: readonly AstMatch[]): AstMatch[] {
	const seen = new Set<number>();

	return matches.filter(match => {
		if (seen.has(match.line)) {
			return false;
		}

		seen.add(match.line);

		return true;
	});
}

// parses once so every rule can run against the same tree. tsx has its own grammar.
export function parseSource(lang: Lang, source: string, path = ''): SgNode {
	const parser = lang === Lang.TS && path.endsWith(TSX_EXTENSION) ? Parser.Tsx : PARSERS[lang];

	return parse(parser, source).root();
}

// the matcher is authored as free-form YAML and validated by ast-grep when it compiles it,
// which is why the envelope type is loose and the bindings accept it as-is.
export function matchAst(root: SgNode, matcher: AstMatcher): AstMatch[] {
	return root.findAll(matcher).map(node => {
		const { start, end } = node.range();
		const symbol = node.getMatch(SYMBOL_METAVARIABLE)?.text();

		return {
			line: start.line + 1,
			endLine: end.line + 1,
			text: node.text(),
			...(symbol !== undefined && { symbol }),
		};
	});
}

function toFinding(rule: AstRule, path: string, match: AstMatch): Finding {
	return {
		ruleId: rule.id,
		path,
		line: match.line,
		endLine: match.endLine,
		quote: firstLine(match.text),
		message: rule.message,
		confidence: 1,
		origin: Origin.AST,
		...(match.symbol !== undefined && { symbol: match.symbol }),
	};
}

function firstLine(text: string): string {
	return text.split('\n', 1)[0]?.trim() ?? '';
}
