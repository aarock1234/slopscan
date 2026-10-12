import { collectFindings } from './analyzer.js';
import type { Analyzer } from './analyzer.js';
import { astAnalyzer } from './analyzers/ast.js';
import type { Decider } from './analyzers/decision.js';
import type { Judge } from './analyzers/judge.js';
import { readChanges } from './change.js';
import type { Range } from './change.js';
import type { Config } from './config.js';
import { confirm } from './confirm.js';
import { Origin } from './finding.js';
import type { Finding } from './finding.js';
import type { Report } from './report.js';
import type { Rule } from './rule.js';
import { score } from './score.js';
import { findDuplicateShapes } from './shapes.js';
import type { Scored } from './score.js';
import type { Verified, Verifier } from './verify.js';

export type ScanOptions = {
	repo: string;
	range: Range;
	config: Config;
	rules: readonly Rule[];
	// absent when running with --no-judge
	judge?: Judge;
	// absent when running with --no-decision or without the decision model's key
	decider?: Decider;
	// absent when running with --no-verify or without the verifier model's key
	verifier?: Verifier;
	// an older ref to score as baseline..base, so the report can show the delta
	baseline?: string;
};

export async function scan(options: ScanOptions): Promise<Report> {
	const { scored, rejected } = await scoreRange(options, options.range);

	const baseline =
		options.baseline === undefined
			? undefined
			: pickScore(
					(
						await scoreRange(options, {
							base: options.baseline,
							head: options.range.base,
						})
					).scored
				);

	return {
		...scored,
		...(baseline && { baseline }),
		...(options.judge && { judge: options.judge.summary() }),
		...(options.decider && { decision: options.decider.summary() }),
		...(options.verifier && { verifier: options.verifier.summary() }),
		...(rejected.length > 0 && { rejected }),
	};
}

type RangeResult = {
	scored: Scored;
	rejected: Finding[];
};

async function scoreRange(options: ScanOptions, range: Range): Promise<RangeResult> {
	const enabled = options.rules.filter(rule => options.config.rules[rule.id] !== false);
	const analyzers: Analyzer[] = [
		astAnalyzer,
		...(options.judge ? [options.judge.analyze] : []),
		...(options.decider ? [options.decider.analyze] : []),
	];

	const changes = await readChanges(options.repo, range, options.config.ignore);
	// the shape detector reads the whole repository, so it runs beside the per-file analyzers rather than as one
	const [perFile, duplicates] = await Promise.all([
		collectFindings(changes, enabled, analyzers),
		findDuplicateShapes(options.repo, changes, enabled, options.config.ignore),
	]);
	const findings = [...perFile, ...duplicates];
	const confirmed = await confirm(findings, enabled, {
		repo: options.repo,
		ignore: options.config.ignore,
	});
	const verified = options.verifier
		? await options.verifier.verify(confirmed.kept, changes, enabled)
		: unverified(confirmed.kept, options.config.decision.confidenceFloor);

	return {
		scored: score(verified.kept, changes, enabled, options.config.scoring),
		rejected: [...confirmed.rejected, ...verified.rejected],
	};
}

// without a verifier no second opinion is coming, so a decision finding under the floor does not count. an ast match
// that asks for a check stands unchecked, as syntax findings did before there was a verifier.
function unverified(findings: readonly Finding[], floor: number): Verified {
	const kept: Finding[] = [];
	const rejected: Finding[] = [];

	for (const finding of findings) {
		(finding.origin === Origin.DECISION && finding.confidence < floor ? rejected : kept).push(finding);
	}

	return {
		kept,
		rejected,
	};
}

function pickScore({ overall, grade, floor, axes }: Scored): Report['baseline'] {
	return {
		overall,
		grade,
		floor,
		axes,
	};
}
