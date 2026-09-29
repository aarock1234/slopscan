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

const KEY_NAME: Readonly<Record<Provider, string>> = {
	[Provider.OPENAI]: 'OPENAI_API_KEY',
	[Provider.OPENROUTER]: 'OPENROUTER_API_KEY',
};

type Spec = {
	provider: Provider;
	modelId: string;
};

// whether the key a "provider/model-id" spec needs is set, for callers that should stay quiet without it
export function hasKey(spec: string): boolean {
	return keyOf(parseSpec(spec).provider) !== undefined;
}

// resolves "provider/model-id" from config to an AI SDK model, asking for the one key it needs
export function resolveModel(spec: string): LanguageModel {
	const { provider, modelId } = parseSpec(spec);
	const apiKey = keyOf(provider);

	if (apiKey === undefined) {
		throw new ConfigError(
			`${KEY_NAME[provider]} is required by ${spec}; set it or change the model in .slopscan.yml`
		);
	}

	switch (provider) {
		case Provider.OPENAI:
			return createOpenAI({ apiKey })(modelId);
		case Provider.OPENROUTER:
			return createOpenRouter({ apiKey })(modelId);
		default: {
			const exhaustive: never = provider;
			throw new Error(`unhandled provider: ${String(exhaustive)}`);
		}
	}
}

function parseSpec(spec: string): Spec {
	const slash = spec.indexOf('/');
	const provider = spec.slice(0, slash);
	const modelId = spec.slice(slash + 1);

	if (slash === -1 || !isProvider(provider) || modelId.length === 0) {
		throw new ConfigError(`a model is "<provider>/<model>" with provider one of ${providerValues.join(', ')}`);
	}

	return {
		provider,
		modelId,
	};
}

function keyOf(provider: Provider): string | undefined {
	switch (provider) {
		case Provider.OPENAI:
			return env.OPENAI_API_KEY;
		case Provider.OPENROUTER:
			return env.OPENROUTER_API_KEY;
		default: {
			const exhaustive: never = provider;
			throw new Error(`unhandled provider: ${String(exhaustive)}`);
		}
	}
}

function isProvider(value: string): value is Provider {
	return providerValues.includes(value);
}
