import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { RuleLang, fenceLang, ruleAppliesTo, ruleLangValues } from './lang.js';
import type { Lang } from './lang.js';
import { RuleError } from './shared/errors.js';

export const Axis = {
	IDIOM: 'idiom',
	HACKY: 'hacky',
	FUTUREPROOF: 'futureproof',
} as const;

export type Axis = (typeof Axis)[keyof typeof Axis];

export const axisValues = Object.values(Axis) as [Axis, ...Axis[]];

export const Severity = {
	INFO: 'info',
	MINOR: 'minor',
	MAJOR: 'major',
	CRITICAL: 'critical',
} as const;

export type Severity = (typeof Severity)[keyof typeof Severity];

export const severityValues = Object.values(Severity) as [Severity, ...Severity[]];

export const Detect = {
	AST: 'ast',
	JUDGE: 'judge',
} as const;

export type Detect = (typeof Detect)[keyof typeof Detect];

// deterministic checks that a judge finding must pass before it counts; implemented in confirm.ts
export const Confirm = {
	CALL_COUNT: 'callCount',
	IMPL_COUNT: 'implCount',
	REF_COUNT: 'refCount',
} as const;

export type Confirm = (typeof Confirm)[keyof typeof Confirm];

const confirmValues = Object.values(Confirm) as [Confirm, ...Confirm[]];

// an ast-grep rule body exactly as its YAML reference defines it. ast-grep validates the shape when matching,
// so this schema only guards the envelope.
const astMatcherSchema = z
	.object({
		rule: z.record(z.string(), z.unknown()),
		constraints: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
		utils: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
	})
	.strict();

export type AstMatcher = z.infer<typeof astMatcherSchema>;

const astByLangSchema = z
	.object({
		ts: astMatcherSchema.optional(),
		go: astMatcherSchema.optional(),
	})
	.strict();

const commonFrontmatter = {
	severity: z.enum(severityValues),
	ignore: z.array(z.string()).default([]),
};

const frontmatterSchema = z.discriminatedUnion('detect', [
	z
		.object({
			detect: z.literal(Detect.AST),
			ast: z.union([astMatcherSchema, astByLangSchema]),
			...commonFrontmatter,
		})
		.strict(),
	z
		.object({
			detect: z.literal(Detect.JUDGE),
			confirm: z.enum(confirmValues).optional(),
			falsePositives: z.array(z.string()).default([]),
			// measured on the rule's own fixtures by scripts/jev-thresholds.ts; absent means Jev is not asked
			jev: z
				.object({ threshold: z.number().min(0).max(1) })
				.strict()
				.optional(),
			...commonFrontmatter,
		})
		.strict(),
]);

// a fenced code block from a rule's Good or Bad section. expectLines are the 1-based lines that carried a
// `// BAD:` marker (the marker line itself is removed, so the line now holds the offending code).
export type Example = {
	lang: Lang;
	source: string;
	expectLines: readonly number[];
};

type RuleBase = {
	id: string;
	lang: RuleLang;
	axis: Axis;
	category: string;
	severity: Severity;
	ignore: readonly string[];
	why: string;
	message: string;
	good: readonly Example[];
	bad: readonly Example[];
	path: string;
};

export type AstRule = RuleBase & {
	detect: typeof Detect.AST;
	ast: Partial<Record<Lang, AstMatcher>>;
};

export type JudgeRule = RuleBase & {
	detect: typeof Detect.JUDGE;
	confirm?: Confirm;
	falsePositives: readonly string[];
	// violation probability at which a Jev verdict counts, measured on this rule's fixtures
	jevThreshold?: number;
};

export type Rule = AstRule | JudgeRule;

const RULE_EXTENSION = '.md';
const MARKER_PATTERN = /^\s*\/\/\s*(GOOD|BAD):/;
const FENCE_OPEN_PATTERN = /^```(\w*)\s*$/;
const FENCE_CLOSE = '```';
const SECTION_PREFIX = '## ';

const Section = {
	WHY: 'why',
	BAD: 'bad',
	GOOD: 'good',
	MESSAGE: 'message',
} as const;

export async function loadRules(rulesDir: string): Promise<Rule[]> {
	const entries = await readdir(rulesDir, { recursive: true, withFileTypes: true });
	const paths = entries
		.filter(entry => entry.isFile() && entry.name.endsWith(RULE_EXTENSION))
		.map(entry => join(entry.parentPath, entry.name))
		.sort();

	return Promise.all(paths.map(async path => parseRule(rulesDir, path, await readFile(path, 'utf-8'))));
}

// parses one rule file. identity comes from the path: rules/<lang>/<axis>/<category>/<slug>.md
export function parseRule(rulesDir: string, path: string, content: string): Rule {
	const identity = parseIdentity(rulesDir, path);
	const { data, content: body } = matter(content);
	const frontmatter = frontmatterSchema.safeParse(data);

	if (!frontmatter.success) {
		const issues = frontmatter.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);

		throw new RuleError(path, `invalid frontmatter: ${issues.join('; ')}`);
	}

	const sections = splitSections(body);
	const why = requireSection(path, sections, Section.WHY);
	const good = parseExamples(path, identity.lang, sections.get(Section.GOOD), Section.GOOD);
	const bad = parseExamples(path, identity.lang, sections.get(Section.BAD), Section.BAD);
	const message = sections.get(Section.MESSAGE)?.trim() ?? firstSentence(why);

	const base: RuleBase = {
		...identity,
		severity: frontmatter.data.severity,
		ignore: frontmatter.data.ignore,
		why,
		message,
		good,
		bad,
		path,
	};

	if (frontmatter.data.detect === Detect.AST) {
		return {
			...base,
			detect: Detect.AST,
			ast: normalizeAst(path, identity.lang, frontmatter.data.ast),
		};
	}

	return {
		...base,
		detect: Detect.JUDGE,
		...(frontmatter.data.confirm && { confirm: frontmatter.data.confirm }),
		...(frontmatter.data.jev && { jevThreshold: frontmatter.data.jev.threshold }),
		falsePositives: frontmatter.data.falsePositives,
	};
}

type Identity = Pick<RuleBase, 'id' | 'lang' | 'axis' | 'category'>;

function parseIdentity(rulesDir: string, path: string): Identity {
	const segments = relative(rulesDir, path).split(sep);
	const [lang, axis, category, file] = segments;

	if (segments.length !== 4 || !lang || !axis || !category || !file) {
		throw new RuleError(path, 'expected path rules/<lang>/<axis>/<category>/<slug>.md');
	}

	if (!isRuleLang(lang)) {
		throw new RuleError(path, `unknown language directory "${lang}"`);
	}

	if (!isAxis(axis)) {
		throw new RuleError(path, `unknown axis directory "${axis}"`);
	}

	const slug = file.slice(0, -RULE_EXTENSION.length);

	return {
		id: `${lang}.${axis}.${slug}`,
		lang,
		axis,
		category,
	};
}

function isRuleLang(value: string): value is RuleLang {
	return (ruleLangValues as readonly string[]).includes(value);
}

function isAxis(value: string): value is Axis {
	return (axisValues as readonly string[]).includes(value);
}

// a lang-specific rule writes `ast: { rule: ... }`; a lang-agnostic rule writes `ast: { ts: {...}, go: {...} }`
function normalizeAst(
	path: string,
	lang: RuleLang,
	ast: z.infer<typeof astMatcherSchema> | z.infer<typeof astByLangSchema>
): Partial<Record<Lang, AstMatcher>> {
	const isSingle = 'rule' in ast;

	if (lang === RuleLang.ANY) {
		if (isSingle) {
			throw new RuleError(path, 'lang-agnostic rules must give ast.ts and/or ast.go');
		}

		if (!ast.ts && !ast.go) {
			throw new RuleError(path, 'ast must define at least one of ts, go');
		}

		return ast;
	}

	if (!isSingle) {
		throw new RuleError(path, `${lang} rules must give ast.rule directly`);
	}

	return { [lang]: ast };
}

// splits the markdown body into `## Heading` sections keyed by lowercase heading, ignoring headings inside fences
function splitSections(body: string): Map<string, string> {
	const sections = new Map<string, string>();
	let current: string | undefined;
	let lines: string[] = [];
	let inFence = false;

	for (const line of body.split('\n')) {
		if (line.startsWith(FENCE_CLOSE)) {
			inFence = !inFence;
		}

		if (!inFence && line.startsWith(SECTION_PREFIX)) {
			if (current !== undefined) {
				sections.set(current, lines.join('\n'));
			}

			current = line.slice(SECTION_PREFIX.length).trim().toLowerCase();
			lines = [];

			continue;
		}

		lines.push(line);
	}

	if (current !== undefined) {
		sections.set(current, lines.join('\n'));
	}

	return sections;
}

function requireSection(path: string, sections: Map<string, string>, name: string): string {
	const text = sections.get(name)?.trim();

	if (!text) {
		throw new RuleError(path, `missing "## ${capitalize(name)}" section`);
	}

	return text;
}

function parseExamples(path: string, ruleLang: RuleLang, section: string | undefined, name: string): Example[] {
	const examples = [...fencedBlocks(section ?? '')].map(block => toExample(path, ruleLang, block));

	if (examples.length === 0) {
		throw new RuleError(path, `"## ${capitalize(name)}" needs at least one fenced code block`);
	}

	return examples;
}

type FencedBlock = {
	info: string;
	lines: readonly string[];
};

function* fencedBlocks(section: string): Generator<FencedBlock> {
	let open: FencedBlock | undefined;
	let lines: string[] = [];

	for (const line of section.split('\n')) {
		const fence = FENCE_OPEN_PATTERN.exec(line);

		if (open === undefined) {
			if (fence?.[1] !== undefined) {
				open = { info: fence[1], lines: [] };
				lines = [];
			}

			continue;
		}

		if (line.startsWith(FENCE_CLOSE)) {
			yield { ...open, lines };
			open = undefined;

			continue;
		}

		lines.push(line);
	}
}

function toExample(path: string, ruleLang: RuleLang, block: FencedBlock): Example {
	const lang = fenceLang(block.info);

	if (lang === undefined) {
		throw new RuleError(path, `code fence needs a ts or go language tag, got "${block.info}"`);
	}

	if (!ruleAppliesTo(ruleLang, lang)) {
		throw new RuleError(path, `${lang} example in a ${ruleLang} rule`);
	}

	const kept: string[] = [];
	const expectLines: number[] = [];

	for (const line of block.lines) {
		const marker = MARKER_PATTERN.exec(line);

		if (marker === null) {
			kept.push(line);

			continue;
		}

		if (marker[1] === 'BAD') {
			expectLines.push(kept.length + 1);
		}
	}

	return {
		lang,
		source: kept.join('\n'),
		expectLines,
	};
}

// a sentence ends at punctuation followed by whitespace, so `!` inside backticks does not cut it short
function firstSentence(text: string): string {
	return text.split(/(?<=[.!?])\s+/, 1)[0]?.trim() ?? text;
}

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}
