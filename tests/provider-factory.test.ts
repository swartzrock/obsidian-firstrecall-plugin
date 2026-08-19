import { describe, expect, it } from "vitest";
import type {
	ByokProviderId,
	ByokProviderStoredSettings,
} from "@swartzrock/byok-runtime";
import { DEFAULT_SETTINGS, type FirstRecallSettings } from "../src/settings";
import {
	makeFirstRecallByokProvider,
	firstRecallProviderConfigFromSettings,
	type FirstRecallTransport,
} from "../src/byok-firstrecall-adapter";

function settings(
	provider: ByokProviderId = "ollama",
	overrides: Partial<ByokProviderStoredSettings> = {}
): FirstRecallSettings {
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

const transport: FirstRecallTransport = async () => new Response("{}");

describe("makeFirstRecallByokProvider", () => {
	it("requires the user to select a provider", () => {
		expect(() =>
			firstRecallProviderConfigFromSettings(structuredClone(DEFAULT_SETTINGS))
		).toThrow("Choose an AI provider in Settings.");
	});

	it("maps FirstRecall settings into BYOK provider config", () => {
		expect(
			firstRecallProviderConfigFromSettings(
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
			firstRecallProviderConfigFromSettings(
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
			firstRecallProviderConfigFromSettings(
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
			makeFirstRecallByokProvider(settings(provider, stored), { transport }).id
		).toBe(expectedId);
	});

	it("creates the Codex CLI provider without a sequential concurrency cap", () => {
		const provider = makeFirstRecallByokProvider(
			settings("codex-cli", { credential: "codex" }),
			{ transport }
		);
		expect(provider.id).toBe("codex-cli");
		expect(typeof provider.listModels).toBe("function");
		expect(typeof provider.generateCue).toBe("function");
		expect(typeof provider.generateCues).toBe("function");
		expect(typeof provider.generateNoteBrief).toBe("function");
		expect(provider.sectionConcurrencyLimit).toBeUndefined();
	});

	it("creates the Claude CLI provider without a sequential concurrency cap", () => {
		const provider = makeFirstRecallByokProvider(
			settings("claude-cli", { credential: "claude" }),
			{ transport }
		);
		expect(provider.id).toBe("claude-cli");
		expect(typeof provider.listModels).toBe("function");
		expect(typeof provider.generateCue).toBe("function");
		expect(typeof provider.generateCues).toBe("function");
		expect(typeof provider.generateNoteBrief).toBe("function");
		expect(provider.sectionConcurrencyLimit).toBeUndefined();
	});
});
