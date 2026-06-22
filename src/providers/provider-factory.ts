import type { CueCraftSettings } from "../settings";
import { AnthropicProvider } from "./anthropic-provider";
import { ClaudeCliProvider } from "./claude-cli-provider";
import { CodexCliProvider } from "./codex-cli-provider";
import { GoogleProvider } from "./google-provider";
import { OllamaProvider } from "./ollama-provider";
import { OpenAIProvider } from "./openai-provider";
import { OpenRouterProvider } from "./openrouter-provider";
import type { AiProvider, HttpClient } from "./types";
import { XaiProvider } from "./xai-provider";

export interface ProviderFactoryDeps {
	fetchImpl: typeof fetch;
	http: HttpClient;
}

export function makeProviderFromSettings(
	settings: CueCraftSettings,
	deps: ProviderFactoryDeps
): AiProvider {
	switch (settings.provider) {
		case "anthropic":
			return new AnthropicProvider({
				apiKey: settings.anthropicApiKey,
				model: settings.anthropicModel,
				fetchImpl: deps.fetchImpl,
			});
		case "openai":
			return new OpenAIProvider({
				apiKey: settings.openaiApiKey,
				model: settings.openaiModel,
				fetchImpl: deps.fetchImpl,
			});
		case "google":
			return new GoogleProvider({
				apiKey: settings.googleApiKey,
				model: settings.googleModel,
				fetchImpl: deps.fetchImpl,
			});
		case "xai":
			return new XaiProvider({
				apiKey: settings.xaiApiKey,
				model: settings.xaiModel,
				fetchImpl: deps.fetchImpl,
			});
		case "openrouter":
			return new OpenRouterProvider({
				apiKey: settings.openrouterApiKey,
				model: settings.openrouterModel,
				fetchImpl: deps.fetchImpl,
			});
		case "codex-cli":
			return new CodexCliProvider({
				command: settings.codexCliCommand,
				model: settings.codexCliModel,
			});
		case "claude-cli":
			return new ClaudeCliProvider({
				command: settings.claudeCliCommand,
				model: settings.claudeCliModel,
			});
		case "ollama":
			return new OllamaProvider({
				host: settings.ollamaHost,
				model: settings.ollamaModel,
				http: deps.http,
			});
	}
}
