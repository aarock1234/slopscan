import { z } from 'zod';

import type { Change } from '../change.js';
import { Origin } from '../finding.js';
import type { Finding } from '../finding.js';
import type { JudgeRule } from '../rule.js';

// how far the model's reported line may drift from where the quote is actually found
const LINE_TOLERANCE = 3;
const MAX_QUOTE_LENGTH = 400;
const MAX_MESSAGE_LENGTH = 240;

export function judgeOutputSchema(ruleIds: readonly [string, ...string[]]) {
	return z.object({
		findings: z.array(
			z.object({
				ruleId: z.enum(ruleIds),
				line: z.number().int().positive(),
				quote: z.string().min(1).max(MAX_QUOTE_LENGTH),
				message: z.string().max(MAX_MESSAGE_LENGTH),
				confidence: z.number().min(0).max(1),
				symbol: z.string().nullable(),
			})
		),
	});
}

export type JudgeOutput = z.infer<ReturnType<typeof judgeOutputSchema>>;

export type RawJudgeFinding = JudgeOutput['findings'][number];

// keeps only findings whose quote really appears in the file, on a changed line, near the reported line,
// with enough confidence. one survivor per rule per span.
export function validateFindings(
	raw: readonly RawJudgeFinding[],
	change: Change,
	rules: ReadonlyMap<string, JudgeRule>,
	minConfidence: number
): Finding[] {
	const lines = change.source.split('\n');
	const normalized = lines.map(normalize);

	const located = raw.flatMap(candidate => {
		const rule = rules.get(candidate.ruleId);

		if (rule === undefined || candidate.confidence < minConfidence) {
			return [];
		}

		const line = locate(candidate, normalized);

		if (line === undefined || !change.changedLines.has(line)) {
			return [];
		}

		const quoteLines = candidate.quote.split('\n').length;
		const symbol = candidate.symbol?.trim();
		const finding: Finding = {
			ruleId: candidate.ruleId,
			path: change.path,
			line,
			endLine: Math.min(lines.length, line + quoteLines - 1),
			quote: lines.slice(line - 1, line - 1 + quoteLines).join('\n'),
			message: candidate.message.trim() || rule.message,
			confidence: candidate.confidence,
			origin: Origin.JUDGE,
			...(symbol && { symbol }),
		};

		return [finding];
	});

	return dedupe(located);
}

// the line whose text contains the quote's first line, closest to where the model said it was
function locate(candidate: RawJudgeFinding, normalizedLines: readonly string[]): number | undefined {
	const needle = normalize(candidate.quote.split('\n')[0] ?? '');

	if (needle.length === 0) {
		return undefined;
	}

	let best: number | undefined;

	for (let offset = 0; offset <= LINE_TOLERANCE; offset += 1) {
		for (const line of [candidate.line - offset, candidate.line + offset]) {
			if (normalizedLines[line - 1]?.includes(needle)) {
				best ??= line;
			}
		}

		if (best !== undefined) {
			return best;
		}
	}

	return undefined;
}

// same rule, overlapping span: keep the most confident
function dedupe(findings: readonly Finding[]): Finding[] {
	const kept: Finding[] = [];

	for (const finding of [...findings].sort((a, b) => b.confidence - a.confidence)) {
		const overlaps = kept.some(
			other => other.ruleId === finding.ruleId && other.line <= finding.endLine && finding.line <= other.endLine
		);

		if (!overlaps) {
			kept.push(finding);
		}
	}

	return kept;
}

function normalize(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}
