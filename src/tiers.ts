import { join } from 'node:path';

import { createDecider } from './analyzers/decision.js';
import type { Decider } from './analyzers/decision.js';
import { createJudge } from './analyzers/judge.js';
import type { Judge } from './analyzers/judge.js';
import type { Config } from './config.js';
import { hasDecisionKey, hasKey, resolveDecisionClient, resolveModel } from './model.js';
import { createVerifier } from './verify.js';
import type { Verifier } from './verify.js';

export const CACHE_DIR = '.slopscan-cache';

// which model-backed analyzers a run asked for; the keys in the environment decide which it gets
export type TierFlags = {
	shouldJudge: boolean;
	shouldDecide: boolean;
	shouldVerify: boolean;
};

export type Tiers = {
	judge?: Judge;
	decider?: Decider;
	// checks every decision finding and the matches of ast rules that ask for it; without it, decision findings under
	// the confidence floor are dropped and those ast matches stand unchecked
	verifier?: Verifier;
};

// the analyzers beyond the syntax rules, built the same way for the cli and for calibration: the judge only when
// asked, the decision model and the verifier whenever their model's key is set
export function buildTiers(repo: string, config: Config, flags: TierFlags): Tiers {
	const judge = flags.shouldJudge ? buildJudge(repo, config) : undefined;
	const decider =
		flags.shouldDecide && config.decision.enabled && hasDecisionKey(config.decision.model)
			? buildDecider(repo, config)
			: undefined;
	const verifier =
		flags.shouldVerify && config.verify.enabled && hasKey(config.verify.model)
			? buildVerifier(repo, config)
			: undefined;

	return {
		...(judge && { judge }),
		...(decider && { decider }),
		...(verifier && { verifier }),
	};
}

function buildJudge(repo: string, config: Config): Judge {
	return createJudge({
		config: config.judge,
		model: resolveModel(config.judge.model),
		cacheDir: join(repo, CACHE_DIR, 'judge'),
	});
}

function buildDecider(repo: string, config: Config): Decider {
	return createDecider({
		client: resolveDecisionClient(config.decision.model),
		config: config.decision,
		repo,
		ignore: config.ignore,
	});
}

function buildVerifier(repo: string, config: Config): Verifier {
	return createVerifier({
		model: resolveModel(config.verify.model),
		modelId: config.verify.model,
		config: config.verify,
		repo,
		cacheDir: join(repo, CACHE_DIR, 'verify'),
	});
}
