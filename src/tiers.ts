import { join } from 'node:path';

import { TypeSafeClient } from '@typesafe-ai/sdk';

import { createJev } from './analyzers/jev.js';
import type { Jev } from './analyzers/jev.js';
import { createJudge } from './analyzers/judge.js';
import type { Judge } from './analyzers/judge.js';
import type { Config } from './config.js';
import { hasKey, resolveModel } from './model.js';
import { env } from './shared/env.js';
import { createVerifier } from './verify.js';
import type { Verifier } from './verify.js';

export const CACHE_DIR = '.slopscan-cache';

// which model-backed analyzers a run asked for; the keys in the environment decide which it gets
export type TierFlags = {
	judge: boolean;
	jev: boolean;
	verify: boolean;
};

export type Tiers = {
	judge?: Judge;
	jev?: Jev;
	verifier?: Verifier;
};

// the analyzers beyond the syntax rules, built the same way for the cli and for calibration: the judge only when
// asked, jev whenever its key is set, the verifier whenever jev runs and the verifier model's key is set
export function buildTiers(repo: string, config: Config, flags: TierFlags): Tiers {
	const judge = flags.judge ? buildJudge(repo, config) : undefined;
	const jev =
		flags.jev && config.jev.enabled && env.TYPESAFE_API_KEY !== undefined ? buildJev(repo, config) : undefined;
	// without the verifier model's key, low-confidence jev findings are dropped instead of checked
	const verifier =
		jev && flags.verify && config.verify.enabled && hasKey(config.verify.model)
			? buildVerifier(repo, config)
			: undefined;

	return {
		...(judge && { judge }),
		...(jev && { jev }),
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

function buildJev(repo: string, config: Config): Jev {
	return createJev({
		client: new TypeSafeClient({ apiKey: env.TYPESAFE_API_KEY, defaultModel: config.jev.model }),
		config: config.jev,
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
		confidenceFloor: config.jev.confidenceFloor,
	});
}
