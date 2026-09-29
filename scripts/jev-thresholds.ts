// measures, per judge rule, where Jev's violation probability falls for the rule's own bad and good fixtures,
// and writes the midpoint of the gap into the rule's frontmatter as `jev.threshold`. a rule whose fixtures do not
// separate gets no threshold, which the scanner treats as "do not ask Jev about this rule".
//
//   pnpm script scripts/jev-thresholds.ts [--rule <id>] [--dry-run]

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { TypeSafeClient } from '@typesafe-ai/sdk';
import matter from 'gray-matter';

import { Verdict, contrastQuestion, languageName, ruleState } from '../src/analyzers/jev.js';
import { Detect, loadRules } from '../src/rule.js';
import type { Example, JudgeRule } from '../src/rule.js';
import { mapConcurrent } from '../src/shared/concurrency.js';
import { logger } from '../src/shared/log.js';
import { RULES_DIR } from '../src/shared/paths.js';

const { values } = parseArgs({
	options: {
		rule: { type: 'string' },
		'dry-run': { type: 'boolean', default: false },
	},
	strict: true,
});

// the gap below which a rule is not separable enough to trust a single Jev verdict, given ~0.02 of run-to-run jitter
const MIN_GAP = 0.1;
// repeats per fixture, averaged, to smooth the jitter out of the measurement
const REPEATS = 2;

type Measurement = {
	rule: JudgeRule;
	lowestBad: number;
	highestGood: number;
};

async function main(): Promise<void> {
	const client = new TypeSafeClient();
	const rules = (await loadRules(RULES_DIR)).filter(
		(rule): rule is JudgeRule =>
			rule.detect === Detect.JUDGE && (values.rule === undefined || rule.id === values.rule)
	);

	if (rules.length === 0) {
		throw new Error('no judge rules matched');
	}

	const measurements = await mapConcurrent(rules, rule => measure(client, rule), { concurrency: 4 });

	for (const measurement of measurements) {
		const gap = measurement.lowestBad - measurement.highestGood;
		const threshold = gap >= MIN_GAP ? round(measurement.highestGood + gap / 2) : undefined;

		process.stdout.write(
			`${measurement.rule.id.padEnd(46)} bad>=${measurement.lowestBad.toFixed(2)} good<=${measurement.highestGood.toFixed(2)}  ${threshold === undefined ? 'not separable' : `threshold ${threshold}`}\n`
		);

		if (!values['dry-run']) {
			await writeThreshold(measurement.rule, threshold);
		}
	}

	const separable = measurements.filter(item => item.lowestBad - item.highestGood >= MIN_GAP).length;
	logger.info({ rules: measurements.length, separable, written: !values['dry-run'] }, 'done');
}

// the production question against each fixture with that fixture held out of the rule's own examples
async function measure(client: TypeSafeClient, rule: JudgeRule): Promise<Measurement> {
	const bad = await Promise.all(rule.bad.map(example => probability(client, rule, example)));
	const good = await Promise.all(rule.good.map(example => probability(client, rule, example)));

	return { rule, lowestBad: Math.min(...bad), highestGood: Math.max(...good, 0) };
}

async function probability(client: TypeSafeClient, rule: JudgeRule, example: Example): Promise<number> {
	const heldOut: JudgeRule = {
		...rule,
		bad: rule.bad.filter(other => other !== example),
		good: rule.good.filter(other => other !== example),
	};

	const runs = await Promise.all(
		Array.from({ length: REPEATS }, () =>
			client.systemOne({
				state: { language: languageName(example.lang), code: example.source, rule: ruleState(heldOut) },
				questions: { verdict: contrastQuestion() },
			})
		)
	);

	return runs.reduce((sum, run) => sum + (run.answers.verdict.probabilities[Verdict.VIOLATES] ?? 0), 0) / REPEATS;
}

// rewrites only the frontmatter's `jev` block, leaving the body untouched
async function writeThreshold(rule: JudgeRule, threshold: number | undefined): Promise<void> {
	const file = matter(await readFile(rule.path, 'utf-8'));
	const { jev: previous, ...rest } = file.data;
	const data = threshold === undefined ? rest : { ...rest, jev: { threshold } };

	if (previous !== undefined && threshold === undefined) {
		logger.warn({ rule: rule.id }, 'removing threshold: fixtures no longer separate');
	}

	await writeFile(rule.path, matter.stringify(file.content, data));
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

main().catch((error: unknown) => {
	logger.error({ err: error }, 'jev-thresholds failed');
	process.exitCode = 1;
});
