// runs every judge rule against its own good and bad examples and reports precision and recall per rule.
// costs model calls, so it is a script rather than a test. results are cached like a normal scan.
//
//   pnpm script scripts/eval-judge.ts [--rule <id>] [--config <path>]

import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { createJudge } from '../src/analyzers/judge.js';
import type { Change } from '../src/change.js';
import { loadConfig } from '../src/config.js';
import type { Finding } from '../src/finding.js';
import { Lang } from '../src/lang.js';
import { resolveModel } from '../src/model.js';
import { Detect, loadRules } from '../src/rule.js';
import type { Example, JudgeRule } from '../src/rule.js';
import { logger } from '../src/shared/log.js';
import { RULES_DIR } from '../src/shared/paths.js';

const EXTENSIONS: Readonly<Record<Lang, string>> = {
	[Lang.TS]: 'ts',
	[Lang.GO]: 'go',
};

type RuleResult = {
	id: string;
	truePositives: number;
	falseNegatives: number;
	falsePositives: number;
	trueNegatives: number;
};

const { values } = parseArgs({
	options: {
		rule: { type: 'string' },
		config: { type: 'string' },
	},
	strict: true,
});

async function main(): Promise<void> {
	const cwd = process.cwd();
	const [config, rules] = await Promise.all([loadConfig(cwd, values.config), loadRules(RULES_DIR)]);
	const judgeRules = rules.filter(
		(rule): rule is JudgeRule =>
			rule.detect === Detect.JUDGE && (values.rule === undefined || rule.id === values.rule)
	);

	if (judgeRules.length === 0) {
		throw new Error('no judge rules matched');
	}

	const judge = createJudge({
		config: { ...config.judge, minChangedLines: 1 },
		model: resolveModel(config.judge.model),
		cacheDir: join(cwd, '.slopscan-cache', 'eval'),
	});

	const results: RuleResult[] = [];

	for (const rule of judgeRules) {
		const result: RuleResult = {
			id: rule.id,
			truePositives: 0,
			falseNegatives: 0,
			falsePositives: 0,
			trueNegatives: 0,
		};

		for (const [index, example] of rule.bad.entries()) {
			// a judge example is one small violation, so any finding in it is a hit; the marker line is advisory
			// because the model may anchor on the enclosing declaration rather than the line the author marked
			const findings = await judge.analyze(toChange(example), [rule]);
			const hit = findings.length > 0;

			result[hit ? 'truePositives' : 'falseNegatives'] += 1;

			if (!hit) {
				logger.warn(
					{ rule: rule.id, example: index + 1, expectLines: example.expectLines, findings: brief(findings) },
					'bad example missed'
				);
			}
		}

		// a rule with a confirm predicate asks the judge to nominate and lets the repo-wide count decide, so a
		// good example seen in isolation is not a test of the judge; confirm.test.ts covers the predicate
		for (const [index, example] of rule.confirm ? [] : rule.good.entries()) {
			const findings = await judge.analyze(toChange(example), [rule]);

			result[findings.length === 0 ? 'trueNegatives' : 'falsePositives'] += 1;

			if (findings.length > 0) {
				logger.warn({ rule: rule.id, example: index + 1, findings: brief(findings) }, 'good example flagged');
			}
		}

		results.push(result);
		logger.info({ rule: rule.id, ...result }, 'evaluated');
	}

	printTable(results);

	const summary = judge.summary();
	logger.info({ calls: summary.calls, cached: summary.cachedCalls, inputTokens: summary.inputTokens }, 'done');
}

function brief(findings: readonly Finding[]): string[] {
	return findings.map(finding => `${finding.line} (${finding.confidence}) ${finding.quote.split('\n')[0] ?? ''}`);
}

function toChange(example: Example): Change {
	const lineCount = example.source.split('\n').length;

	return {
		path: `example.${EXTENSIONS[example.lang]}`,
		lang: example.lang,
		source: example.source,
		changedLines: new Set(Array.from({ length: lineCount }, (_, index) => index + 1)),
		scoredLines: lineCount,
	};
}

function printTable(results: readonly RuleResult[]): void {
	const rows = results.map(result => {
		const precision = ratio(result.truePositives, result.truePositives + result.falsePositives);
		const recall = ratio(result.truePositives, result.truePositives + result.falseNegatives);

		const good =
			result.falsePositives + result.trueNegatives === 0
				? 'good decided by confirm'
				: `${result.falsePositives}/${result.falsePositives + result.trueNegatives} good flagged`;

		return `${result.id.padEnd(44)} precision ${precision}  recall ${recall}  (${result.truePositives}/${result.truePositives + result.falseNegatives} bad hit, ${good})`;
	});

	process.stdout.write(`${rows.join('\n')}\n`);
}

function ratio(numerator: number, denominator: number): string {
	return denominator === 0 ? ' n/a' : (numerator / denominator).toFixed(2);
}

main().catch((error: unknown) => {
	logger.error({ err: error }, 'eval failed');
	process.exitCode = 1;
});
