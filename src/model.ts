import { createOpenAI } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';

import { env } from './shared/env.js';
import { ConfigError } from './shared/errors.js';

const Provider = {
	OPENAI: 'openai',
	OPENROUTER: 'openrouter',
} as const;

type Provider = (typeof Provider)[keyof typeof Provider];

const providerValues = Object.values(Provider) as readonly string[];

// resolves "provider/model-id" from config to an AI SDK model, asking for the one key it needs
export function resolveModel(spec: string): LanguageModel {
	const slash = spec.indexOf('/');
	const provider = spec.slice(0, slash);
	const modelId = spec.slice(slash + 1);

	if (slash === -1 || !isProvider(provider) || modelId.length === 0) {
		throw new ConfigError(
			`judge.model must be "<provider>/<model>" with provider one of ${providerValues.join(', ')}`
		);
	}

	switch (provider) {
		case Provider.OPENAI:
			return createOpenAI({ apiKey: requireKey('OPENAI_API_KEY', env.OPENAI_API_KEY) })(modelId);
		case Provider.OPENROUTER:
			return createOpenRouter({ apiKey: requireKey('OPENROUTER_API_KEY', env.OPENROUTER_API_KEY) })(modelId);
	}
}

function isProvider(value: string): value is Provider {
	return providerValues.includes(value);
}

function requireKey(name: string, value: string | undefined): string {
	if (value === undefined) {
		throw new ConfigError(
			`${name} is required by the configured judge model; set it, change judge.model, or run with --no-judge --no-verify`
		);
	}

	return value;
}
