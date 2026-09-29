import goLang from '@ast-grep/lang-go';
import { Lang as Parser, parse, registerDynamicLanguage } from '@ast-grep/napi';
import type { SgNode } from '@ast-grep/napi';

import type { Analyzer } from '../analyzer.js';
import { Origin } from '../finding.js';
import type { Finding } from '../finding.js';
import { Lang } from '../lang.js';
import { Detect } from '../rule.js';
import type { AstMatcher, AstRule } from '../rule.js';

const GO_PARSER = 'go';
const TSX_EXTENSION = '.tsx';

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
};

// runs every ast rule for the file's language against one parsed tree and keeps the matches that start on
// a changed line. a match that begins on an untouched line belongs to whoever wrote it, not to this diff.
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

	const findings = matchers.flatMap(({ rule, matcher }) =>
		onePerLine(matchAst(root, matcher).filter(match => change.changedLines.has(match.line))).map(match =>
			toFinding(rule, change.path, match)
		)
	);

	return Promise.resolve(findings);
};

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

		return {
			line: start.line + 1,
			endLine: end.line + 1,
			text: node.text(),
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
	};
}

function firstLine(text: string): string {
	return text.split('\n', 1)[0]?.trim() ?? '';
}
