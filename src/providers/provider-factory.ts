import type { CueCraftSettings } from "../settings";
import {
	createByokProvider,
	type ByokProviderConfig,
	type ByokProviderDeps,
} from "../byok";
import type { AiProvider, HttpClient } from "./types";

export interface ProviderFactoryDeps extends ByokProviderDeps {
	fetchImpl: typeof fetch;
	http: HttpClient;
}

export function providerConfigFromSettings(
	settings: CueCraftSettings
): ByokProviderConfig {
	switch (settings.provider) {
		case "anthropic":
			return {
				provider: "anthropic",
				apiKey: settings.anthropicApiKey,
				model: settings.anthropicModel,
			};
		case "openai":
			return {
				provider: "openai",
				apiKey: settings.openaiApiKey,
				model: settings.openaiModel,
			};
		case "google":
			return {
				provider: "google",
				apiKey: settings.googleApiKey,
				model: settings.googleModel,
			};
		case "xai":
			return {
				provider: "xai",
				apiKey: settings.xaiApiKey,
				model: settings.xaiModel,
			};
		case "openrouter":
			return {
				provider: "openrouter",
				apiKey: settings.openrouterApiKey,
				model: settings.openrouterModel,
			};
		case "codex-cli":
			return {
				provider: "codex-cli",
				command: settings.codexCliCommand,
				model: settings.codexCliModel,
			};
		case "claude-cli":
			return {
				provider: "claude-cli",
				command: settings.claudeCliCommand,
				model: settings.claudeCliModel,
			};
		case "ollama":
			return {
				provider: "ollama",
				host: settings.ollamaHost,
				model: settings.ollamaModel,
			};
	}
}

export function makeProviderFromSettings(
	settings: CueCraftSettings,
	deps: ProviderFactoryDeps
): AiProvider {
	return createByokProvider(providerConfigFromSettings(settings), deps) as AiProvider;
}
