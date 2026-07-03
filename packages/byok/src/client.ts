import { createByokProvider } from "./providers/provider-factory";
import type {
	ByokClient,
	ByokClientConfig,
	ByokClientTextGenerationInput,
	ByokCoreProviderConfig,
	ByokFacadeDeps,
	ByokGenerateTextOptions,
	ByokTextGenerationOutput,
} from "./types";

function providerConfigFromGenerateTextOptions(
	options: ByokGenerateTextOptions
): ByokCoreProviderConfig {
	if (options.provider === "ollama") {
		return {
			provider: "ollama",
			host: options.host,
			model: options.model,
		};
	}
	return {
		provider: options.provider,
		apiKey: options.apiKey,
		model: options.model,
	};
}

function providerConfigFromClientInput(
	config: ByokClientConfig,
	input: ByokClientTextGenerationInput
): ByokCoreProviderConfig {
	if (config.provider === "ollama") {
		return {
			provider: "ollama",
			host: config.host,
			model: input.model,
		};
	}
	return {
		provider: config.provider,
		apiKey: config.apiKey,
		model: input.model,
	};
}

async function generateTextForConfig(
	config: ByokCoreProviderConfig,
	input: { prompt: string },
	options: {
		deps?: ByokFacadeDeps;
		signal?: AbortSignal;
	} = {}
): Promise<ByokTextGenerationOutput> {
	const provider = createByokProvider(config, options.deps);
	return provider.generateText({ prompt: input.prompt }, options.signal);
}

export async function generateText(
	options: ByokGenerateTextOptions
): Promise<ByokTextGenerationOutput> {
	return generateTextForConfig(providerConfigFromGenerateTextOptions(options), options, {
		deps: options.deps,
		signal: options.signal,
	});
}

export function createByok(config: ByokClientConfig): ByokClient {
	return {
		generateText(input) {
			return generateTextForConfig(providerConfigFromClientInput(config, input), input, {
				deps: config.deps,
				signal: input.signal,
			});
		},
	};
}
