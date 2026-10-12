import { createOpenAI } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { LanguageModel } from 'ai';

import { env } from './shared/env.js';
import { ConfigError } from './shared/errors.js';

const Provider = {
	OPENAI: 'openai',
	OPENROUTER: 'openrouter',
	TYPESAFE: 'typesafe',
} as const;

type Provider = (typeof Provider)[keyof typeof Provider];

// language models answer in text for the judge and the verifier; decision models answer typed questions about each
// changed function. OpenRouter serves both kinds.
const LANGUAGE_PROVIDERS = [Provider.OPENAI, Provider.OPENROUTER] as const;
const DECISION_PROVIDERS = [Provider.TYPESAFE, Provider.OPENROUTER] as const;

const KEY_NAME: Readonly<Record<Provider, string>> = {
	[Provider.OPENAI]: 'OPENAI_API_KEY',
	[Provider.OPENROUTER]: 'OPENROUTER_API_KEY',
	[Provider.TYPESAFE]: 'TYPESAFE_API_KEY',
};

// OpenRouter speaks TypeSafe's decision API under this base and serves decision models from several labs behind it,
// so one client reaches all of them
const OPENROUTER_DECISION_BASE_URL = 'https://openrouter.ai/api';

type Spec<P extends Provider> = {
	readonly provider: P;
	readonly modelId: string;
};

// whether the key a "provider/model-id" language model spec needs is set, for callers that should stay quiet
// without it
export function hasKey(spec: string): boolean {
	return keyOf(parseSpec(spec, LANGUAGE_PROVIDERS).provider) !== undefined;
}

// the same for a decision model spec
export function hasDecisionKey(spec: string): boolean {
	return keyOf(parseSpec(spec, DECISION_PROVIDERS).provider) !== undefined;
}

// resolves "provider/model-id" from config to an AI SDK model, asking for the one key it needs
export function resolveModel(spec: string): LanguageModel {
	const { provider, modelId } = parseSpec(spec, LANGUAGE_PROVIDERS);
	const apiKey = requireKey(spec, provider);

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

// resolves "provider/model-id" from config to a decision client whose default model is that model
export function resolveDecisionClient(spec: string): TypeSafeClient {
	const { provider, modelId } = parseSpec(spec, DECISION_PROVIDERS);
	const apiKey = requireKey(spec, provider);

	switch (provider) {
		case Provider.TYPESAFE:
			return new TypeSafeClient({
				apiKey,
				defaultModel: modelId,
			});
		case Provider.OPENROUTER:
			return new TypeSafeClient({
				apiKey,
				baseURL: OPENROUTER_DECISION_BASE_URL,
				defaultModel: modelId,
			});
		default: {
			const exhaustive: never = provider;
			throw new Error(`unhandled provider: ${String(exhaustive)}`);
		}
	}
}

// the model id may itself hold slashes, as OpenRouter's do, so only the first one separates the provider
function parseSpec<P extends Provider>(spec: string, providers: readonly P[]): Spec<P> {
	const slash = spec.indexOf('/');
	const provider = spec.slice(0, slash);
	const modelId = spec.slice(slash + 1);

	if (slash === -1 || !isOneOf(provider, providers) || modelId.length === 0) {
		throw new ConfigError(`${spec}: a model is "<provider>/<model>" with provider one of ${providers.join(', ')}`);
	}

	return {
		provider,
		modelId,
	};
}

function requireKey(spec: string, provider: Provider): string {
	const apiKey = keyOf(provider);

	if (apiKey === undefined) {
		throw new ConfigError(
			`${KEY_NAME[provider]} is required by ${spec}; set it or change the model in .slopscan.yml`
		);
	}

	return apiKey;
}

function keyOf(provider: Provider): string | undefined {
	switch (provider) {
		case Provider.OPENAI:
			return env.OPENAI_API_KEY;
		case Provider.OPENROUTER:
			return env.OPENROUTER_API_KEY;
		case Provider.TYPESAFE:
			return env.TYPESAFE_API_KEY;
		default: {
			const exhaustive: never = provider;
			throw new Error(`unhandled provider: ${String(exhaustive)}`);
		}
	}
}

function isOneOf<P extends string>(value: string, values: readonly P[]): value is P {
	return (values as readonly string[]).includes(value);
}
