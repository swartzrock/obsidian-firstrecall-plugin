import { createByokProvider } from "./providers/provider-factory";
import type {
	ByokClient,
	ByokClientConfig,
	ByokClientTextGenerationInput,
	ByokCoreProviderConfig,
	ByokFacadeDeps,
	ByokGenerateTextOptions,
	ByokProviderAppInfo,
	ByokProviderDeps,
	ByokTextGenerationOutput,
} from "./types";

function depsWithAppInfo(
	deps: ByokFacadeDeps | undefined,
	appInfo: ByokProviderAppInfo | undefined
): Partial<ByokProviderDeps> | undefined {
	if (!deps) return appInfo ? { appInfo } : undefined;
	const { appInfo: _droppedAppInfo, ...transportDeps } =
		deps as Partial<ByokProviderDeps>;
	return appInfo ? { ...transportDeps, appInfo } : transportDeps;
}

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
		appInfo?: ByokProviderAppInfo;
	} = {}
): Promise<ByokTextGenerationOutput> {
	const provider = createByokProvider(
		config,
		depsWithAppInfo(options.deps, options.appInfo)
	);
	return provider.generateText({ prompt: input.prompt }, options.signal);
}

export async function generateText(
	options: ByokGenerateTextOptions
): Promise<ByokTextGenerationOutput> {
	return generateTextForConfig(providerConfigFromGenerateTextOptions(options), options, {
		deps: options.deps,
		signal: options.signal,
		appInfo: "appInfo" in options ? options.appInfo : undefined,
	});
}

export function createByok(config: ByokClientConfig): ByokClient {
	return {
		generateText(input) {
			return generateTextForConfig(providerConfigFromClientInput(config, input), input, {
				deps: config.deps,
				signal: input.signal,
				appInfo: "appInfo" in config ? config.appInfo : undefined,
			});
		},
	};
}
