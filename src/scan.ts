import { collectFindings } from './analyzer.js';
import type { Analyzer } from './analyzer.js';
import { astAnalyzer } from './analyzers/ast.js';
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
import type { JevTier } from './tiers.js';
import type { Verified } from './verify.js';

export type ScanOptions = {
	repo: string;
	range: Range;
	config: Config;
	rules: readonly Rule[];
	// absent when running with --no-judge
	judge?: Judge;
	// absent when running with --no-jev or without a TypeSafe key
	jev?: JevTier;
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
		...(options.jev && { jev: options.jev.analyzer.summary() }),
		...(options.jev?.verifier && { verifier: options.jev.verifier.summary() }),
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
		...(options.jev ? [options.jev.analyzer.analyze] : []),
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
	const verifier = options.jev?.verifier;
	const verified = verifier
		? await verifier.verify(confirmed.kept, changes, enabled)
		: unverified(confirmed.kept, options.config.jev.confidenceFloor);

	return {
		scored: score(verified.kept, changes, enabled, options.config.scoring),
		rejected: [...confirmed.rejected, ...verified.rejected],
	};
}

// without a verifier no second opinion is coming, so a jev finding under the floor does not count
function unverified(findings: readonly Finding[], floor: number): Verified {
	const kept: Finding[] = [];
	const rejected: Finding[] = [];

	for (const finding of findings) {
		(finding.origin === Origin.JEV && finding.confidence < floor ? rejected : kept).push(finding);
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
