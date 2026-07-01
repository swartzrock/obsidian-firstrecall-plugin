import { AnthropicProvider } from "./anthropic-provider";
import { GoogleProvider } from "./google-provider";
import { OllamaProvider } from "./ollama-provider";
import { OpenAIProvider } from "./openai-provider";
import { OpenRouterProvider } from "./openrouter-provider";
import { XaiProvider } from "./xai-provider";
import type {
	ByokCoreProviderConfig,
	ByokProviderDeps,
	ByokProviderRuntime,
} from "../types";

export function createByokProvider(
	config: ByokCoreProviderConfig,
	deps: ByokProviderDeps
): ByokProviderRuntime {
	switch (config.provider) {
		case "anthropic":
			return new AnthropicProvider({
				apiKey: config.apiKey,
				model: config.model,
				fetchImpl: deps.fetchImpl,
			}) as unknown as ByokProviderRuntime;
		case "openai":
			return new OpenAIProvider({
				apiKey: config.apiKey,
				model: config.model,
				fetchImpl: deps.fetchImpl,
			}) as unknown as ByokProviderRuntime;
		case "google":
			return new GoogleProvider({
				apiKey: config.apiKey,
				model: config.model,
				fetchImpl: deps.fetchImpl,
			}) as unknown as ByokProviderRuntime;
		case "xai":
			return new XaiProvider({
				apiKey: config.apiKey,
				model: config.model,
				fetchImpl: deps.fetchImpl,
			}) as unknown as ByokProviderRuntime;
		case "openrouter":
			return new OpenRouterProvider({
				apiKey: config.apiKey,
				model: config.model,
				fetchImpl: deps.fetchImpl,
				appInfo: deps.appInfo,
			}) as unknown as ByokProviderRuntime;
		case "ollama":
			return new OllamaProvider({
				host: config.host,
				model: config.model,
				http: deps.http,
			}) as unknown as ByokProviderRuntime;
	}
}
