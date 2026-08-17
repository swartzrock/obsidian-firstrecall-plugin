import { describe, expect, it } from "vitest";
import type {
	ByokProviderId,
	ByokProviderStoredSettings,
} from "@swartzrock/byok-runtime";
import { DEFAULT_SETTINGS, type CueCraftSettings } from "../src/settings";
import {
	makeCueCraftByokProvider,
	cueCraftProviderConfigFromSettings,
	type CueCraftHttpClient,
} from "../src/byok-cuecraft-adapter";

function settings(
	provider: ByokProviderId = "ollama",
	overrides: Partial<ByokProviderStoredSettings> = {}
): CueCraftSettings {
	const current = structuredClone(DEFAULT_SETTINGS);
	current.byok.selectedProvider = provider;
	current.byok.providers[provider] = {
		credential: "",
		credentialSaved: false,
		credentialUpdatedAt: "",
		credentialLength: 0,
		model: "",
		modelSelection: "",
		availableModels: [],
		modelOptions: [],
		hasFetchedModels: false,
		modelRefreshMessage: "",
		...current.byok.providers[provider],
		...overrides,
	};
	return current;
}

const http: CueCraftHttpClient = async () => ({ status: 200, text: "{}", json: {} });
const fetchImpl = (async () => new Response("{}")) as typeof fetch;

describe("makeCueCraftByokProvider", () => {
	it("maps CueCraft settings into BYOK provider config", () => {
		expect(
			cueCraftProviderConfigFromSettings(
				settings("openrouter", {
					credential: "sk-or-test",
					model: "anthropic/claude-sonnet-4",
				})
			)
		).toEqual({
			provider: "openrouter",
			apiKey: "sk-or-test",
			model: "anthropic/claude-sonnet-4",
		});
		expect(
			cueCraftProviderConfigFromSettings(
				settings("codex-cli", {
					credential: "codex",
					model: "",
				})
			)
		).toEqual({
			provider: "codex-cli",
			command: "codex",
			model: "",
		});
		expect(
			cueCraftProviderConfigFromSettings(
				settings("lm-studio", {
					credential: "http://localhost:1234/v1",
					model: "qwen3-4b",
				})
			)
		).toEqual({
			provider: "lm-studio",
			url: "http://localhost:1234/v1",
			model: "qwen3-4b",
		});
	});

	it.each([
		["ollama", "ollama"],
		["lm-studio", "lm-studio"],
		["anthropic", "anthropic"],
		["openai", "openai"],
		["google", "google"],
		["xai", "xai"],
		["openrouter", "openrouter"],
	] as const)("creates the existing %s provider", (provider, expectedId) => {
		const stored = ["ollama", "lm-studio"].includes(provider)
			? {}
			: { credential: "test-key", model: "test-model" };
		expect(
			makeCueCraftByokProvider(settings(provider, stored), { fetchImpl, http }).id
		).toBe(expectedId);
	});

	it("creates the Codex CLI provider without a sequential concurrency cap", () => {
		const provider = makeCueCraftByokProvider(
			settings("codex-cli", { credential: "codex" }),
			{ fetchImpl, http }
		);
		expect(provider.id).toBe("codex-cli");
		expect(typeof provider.listModels).toBe("function");
		expect(typeof provider.generateCue).toBe("function");
		expect(typeof provider.generateCues).toBe("function");
		expect(typeof provider.generateNoteBrief).toBe("function");
		expect(provider.sectionConcurrencyLimit).toBeUndefined();
	});

	it("creates the Claude CLI provider without a sequential concurrency cap", () => {
		const provider = makeCueCraftByokProvider(
			settings("claude-cli", { credential: "claude" }),
			{ fetchImpl, http }
		);
		expect(provider.id).toBe("claude-cli");
		expect(typeof provider.listModels).toBe("function");
		expect(typeof provider.generateCue).toBe("function");
		expect(typeof provider.generateCues).toBe("function");
		expect(typeof provider.generateNoteBrief).toBe("function");
		expect(provider.sectionConcurrencyLimit).toBeUndefined();
	});
});
