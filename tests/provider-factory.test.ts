import { describe, expect, it } from "vitest";
import type { CueCraftSettings } from "../src/settings";
import { ClaudeCliProvider } from "@cuecraft/byok/node";
import { CodexCliProvider } from "@cuecraft/byok/node";
import {
	makeCueCraftByokProvider,
	cueCraftProviderConfigFromSettings,
	type CueCraftHttpClient,
} from "../src/byok-cuecraft-adapter";

function settings(
	overrides: Partial<CueCraftSettings> = {}
): CueCraftSettings {
	return {
		provider: "ollama",
		ollamaHost: "http://localhost:11434",
		ollamaModel: "llama3.1:8b",
		anthropicApiKey: "sk-ant-test",
		anthropicModel: "claude-sonnet-4-6",
		openaiApiKey: "sk-openai-test",
		openaiModel: "gpt-4o-mini",
		googleApiKey: "AIza-test",
		googleModel: "gemini-1.5-flash",
		xaiApiKey: "xai-test",
		xaiModel: "grok-2-latest",
		openrouterApiKey: "sk-or-test",
		openrouterModel: "anthropic/claude-sonnet-4",
		codexCliCommand: "codex",
		codexCliModel: "gpt-5",
		claudeCliCommand: "claude",
		claudeCliModel: "sonnet",
		...overrides,
	} as CueCraftSettings;
}

const http: CueCraftHttpClient = async () => ({ status: 200, text: "{}", json: {} });
const fetchImpl = (async () => new Response("{}")) as typeof fetch;

describe("makeCueCraftByokProvider", () => {
	it("maps CueCraft settings into BYOK provider config", () => {
		expect(
			cueCraftProviderConfigFromSettings(
				settings({
					provider: "openrouter",
					openrouterApiKey: "sk-or-test",
					openrouterModel: "anthropic/claude-sonnet-4",
				})
			)
		).toEqual({
			provider: "openrouter",
			apiKey: "sk-or-test",
			model: "anthropic/claude-sonnet-4",
		});
		expect(
			cueCraftProviderConfigFromSettings(
				settings({
					provider: "codex-cli",
					codexCliCommand: "codex",
					codexCliModel: "",
				})
			)
		).toEqual({
			provider: "codex-cli",
			command: "codex",
			model: "",
		});
	});

	it.each([
		["ollama", "ollama"],
		["anthropic", "anthropic"],
		["openai", "openai"],
		["google", "google"],
		["xai", "xai"],
		["openrouter", "openrouter"],
	] as const)("creates the existing %s provider", (provider, expectedId) => {
		expect(
			makeCueCraftByokProvider(settings({ provider }), { fetchImpl, http }).id
		).toBe(expectedId);
	});

	it("creates the Codex CLI provider without a sequential concurrency cap", () => {
		const provider = makeCueCraftByokProvider(
			settings({ provider: "codex-cli" }),
			{ fetchImpl, http }
		);
		expect(provider).toBeInstanceOf(CodexCliProvider);
		expect(provider.id).toBe("codex-cli");
		expect(provider.sectionConcurrencyLimit).toBeUndefined();
	});

	it("creates the Claude CLI provider without a sequential concurrency cap", () => {
		const provider = makeCueCraftByokProvider(
			settings({ provider: "claude-cli" }),
			{ fetchImpl, http }
		);
		expect(provider).toBeInstanceOf(ClaudeCliProvider);
		expect(provider.id).toBe("claude-cli");
		expect(provider.sectionConcurrencyLimit).toBeUndefined();
	});
});
