import pc from 'picocolors';
import { z } from 'zod';

import { jevSummarySchema } from './analyzers/jev.js';
import { judgeSummarySchema } from './analyzers/judge.js';
import { findingSchema } from './finding.js';
import { axisValues } from './rule.js';
import { Grade, scoreSchema, scoredSchema } from './score.js';
import { verifySummarySchema } from './verify.js';

// what one scan produces: the score, its findings, and how it was made
export const reportSchema = scoredSchema.extend({
	baseline: scoreSchema.optional(),
	judge: judgeSummarySchema.optional(),
	jev: jevSummarySchema.optional(),
	verifier: verifySummarySchema.optional(),
	// judge findings that failed their confirm predicate; kept for tuning, hidden from humans
	rejected: z.array(findingSchema).optional(),
});

export type Report = z.infer<typeof reportSchema>;

export const Format = {
	TERMINAL: 'terminal',
	JSON: 'json',
	MARKDOWN: 'markdown',
} as const;

export type Format = (typeof Format)[keyof typeof Format];

export const formatValues = Object.values(Format) as [Format, ...Format[]];

export function isFormat(value: string): value is Format {
	return (formatValues as readonly string[]).includes(value);
}

// a pull request comment is read top to bottom; the ranked head is what matters, the tail lives in the json
const MARKDOWN_MAX_FINDINGS = 30;

export type RenderOptions = {
	format: Format;
	color: boolean;
};

export function renderReport(report: Report, options: RenderOptions): string {
	switch (options.format) {
		case Format.TERMINAL:
			return renderTerminal(report, options.color);
		case Format.JSON:
			return renderJson(report);
		case Format.MARKDOWN:
			return renderMarkdown(report);
	}
}

const GRADE_COLOR: Readonly<Record<Grade, (text: string) => string>> = {
	[Grade.A]: pc.green,
	[Grade.B]: pc.green,
	[Grade.C]: pc.yellow,
	[Grade.D]: pc.red,
	[Grade.F]: pc.red,
};

function renderTerminal(report: Report, color: boolean): string {
	const paint = color ? GRADE_COLOR[report.grade] : identity;
	const dim = color ? pc.dim : identity;
	const bold = color ? pc.bold : identity;

	const lines = [
		`${bold('slop score')} ${paint(`${report.overall} (${report.grade})`)}${deltaSuffix(report)}`,
		axisValues.map(axis => `${axis} ${Math.round(report.axes[axis].score)}`).join(dim('  ·  ')),
		dim(`${report.files} files, ${report.scoredLines} scored lines`),
	];

	if (report.judge !== undefined) {
		lines.push(dim(judgeLine(report.judge)));
	}

	if (report.jev !== undefined) {
		lines.push(dim(jevLine(report.jev, report.verifier)));
	}

	lines.push('');

	if (report.findings.length === 0) {
		lines.push(dim('no findings'));

		return `${lines.join('\n')}\n`;
	}

	for (const finding of report.findings) {
		lines.push(
			`${bold(`${finding.path}:${finding.line}`)}  ${dim(`[${finding.severity}]`)} ${finding.ruleId}`,
			`    ${finding.message}`,
			`    ${dim(`> ${finding.quote}`)}`,
			''
		);
	}

	return lines.join('\n');
}

function renderJson(report: Report): string {
	return `${JSON.stringify(report, null, 2)}\n`;
}

function renderMarkdown(report: Report): string {
	const lines = [
		`## Slop score: ${report.overall} (${report.grade})${deltaSuffix(report)}`,
		'',
		'| axis | score | findings |',
		'| --- | ---: | ---: |',
		...axisValues.map(
			axis => `| ${axis} | ${Math.round(report.axes[axis].score)} | ${report.axes[axis].findings} |`
		),
		'',
		`${report.files} files, ${report.scoredLines} scored lines.${report.judge ? ` ${judgeLine(report.judge)}.` : ''}`,
		'',
	];

	if (report.findings.length === 0) {
		lines.push('No findings.', '');

		return lines.join('\n');
	}

	lines.push('| location | severity | rule | message |', '| --- | --- | --- | --- |');

	for (const finding of report.findings.slice(0, MARKDOWN_MAX_FINDINGS)) {
		lines.push(
			`| \`${finding.path}:${finding.line}\` | ${finding.severity} | \`${finding.ruleId}\` | ${escapePipes(finding.message)} |`
		);
	}

	const hidden = report.findings.length - MARKDOWN_MAX_FINDINGS;

	if (hidden > 0) {
		lines.push('', `${hidden} more findings in the JSON report.`);
	}

	lines.push('');

	return lines.join('\n');
}

// "jev jev-latest: 12 functions, 12 calls, 41k tokens; verifier confirmed 3 of 7"
function jevLine(jev: NonNullable<Report['jev']>, verifier: Report['verifier']): string {
	const verified =
		verifier === undefined
			? ''
			: `; verifier ${verifier.model} confirmed ${verifier.confirmed} of ${verifier.checked}`;

	return `jev ${jev.model}: ${jev.units} functions, ${jev.calls} calls, ${jev.inputTokens} in${verified}`;
}

function judgeLine(judge: NonNullable<Report['judge']>): string {
	const skipped = judge.skipped.length > 0 ? `, ${judge.skipped.length} files skipped` : '';

	return `judge ${judge.model} (${judge.promptVersion}): ${judge.calls} calls, ${judge.cachedCalls} cached, ${judge.inputTokens} in / ${judge.outputTokens} out${skipped}`;
}

// "39 (C)  was 45 (C), -6" when a baseline is present
function deltaSuffix(report: Report): string {
	if (report.baseline === undefined) {
		return '';
	}

	const delta = report.overall - report.baseline.overall;
	const sign = delta > 0 ? '+' : '';

	return `  was ${report.baseline.overall} (${report.baseline.grade}), ${sign}${delta}`;
}

function escapePipes(text: string): string {
	return text.replaceAll('|', '\\|');
}

function identity(text: string): string {
	return text;
}
