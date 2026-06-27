import { describe, expect, it } from "vitest";
import * as byok from "../../src/byok";
import type {
	ByokProviderConfig,
	ByokProviderDefinition,
	ByokProviderRuntime,
} from "../../src/byok";

describe("BYOK public contract", () => {
	it("represents all current provider config variants", () => {
		const configs: ByokProviderConfig[] = [
			{ provider: "ollama", host: "http://localhost:11434", model: "llama3.1:8b" },
			{ provider: "anthropic", apiKey: "sk-ant-test", model: "claude-sonnet-4-6" },
			{ provider: "openai", apiKey: "sk-openai-test", model: "gpt-4o-mini" },
			{ provider: "google", apiKey: "AIza-test", model: "gemini-1.5-flash" },
			{ provider: "xai", apiKey: "xai-test", model: "grok-2-latest" },
			{ provider: "openrouter", apiKey: "sk-or-test", model: "openai/gpt-4o" },
			{ provider: "codex-cli", command: "codex" },
			{ provider: "claude-cli", command: "claude", model: "sonnet" },
		];

		expect(configs.map((config) => config.provider)).toEqual(
			byok.BYOK_PROVIDER_IDS
		);
	});

	it("exports a runtime shape with cue, batch, summary, status, and model hooks", async () => {
		const runtime: ByokProviderRuntime = {
			id: "openai",
			label: "OpenAI (ChatGPT)",
			requiresNetwork: true,
			requiresDownload: false,
			async testConnection() {
				return { ok: true, message: "Connected." };
			},
			async listModels() {
				return ["gpt-4o-mini"];
			},
			async generateCue() {
				return {
					question: "What changed?",
					keywords: ["provider", "contract"],
					confidence: "high",
				};
			},
			async generateCues() {
				return [
					{
						cue: {
							question: "What changed?",
							keywords: ["provider", "contract"],
							confidence: "high",
						},
					},
				];
			},
			async generateSummary() {
				return {
					summary: "Provider contracts moved behind BYOK.",
					learningObjective: null,
				};
			},
		};

		await expect(runtime.testConnection()).resolves.toEqual({
			ok: true,
			message: "Connected.",
		});
		await expect(runtime.listModels?.()).resolves.toEqual(["gpt-4o-mini"]);
	});

	it("exposes every provider with stable labels and capability metadata", () => {
		const definitions = byok.byokProviderDefinitions();
		const byId = new Map(definitions.map((definition) => [definition.id, definition]));

		expect(definitions).toHaveLength(8);
		expect(byId.get("ollama")).toMatchObject({
			label: "Ollama",
			credentialKind: "host",
			requiresNetwork: false,
			supportsModelListing: true,
		} satisfies Partial<ByokProviderDefinition>);
		expect(byId.get("openrouter")).toMatchObject({
			label: "OpenRouter",
			credentialKind: "api-key",
			supportsModelListing: true,
		} satisfies Partial<ByokProviderDefinition>);
		expect(byId.get("codex-cli")).toMatchObject({
			label: "Codex CLI",
			credentialKind: "command",
			modelBehavior: "optional",
			supportsBatchGeneration: true,
		} satisfies Partial<ByokProviderDefinition>);
		expect(byId.get("claude-cli")).toMatchObject({
			label: "Claude CLI",
			credentialKind: "command",
			modelBehavior: "optional",
			supportsBatchGeneration: true,
		} satisfies Partial<ByokProviderDefinition>);
	});

	it("keeps provider ID guards in the public barrel", () => {
		expect(byok.isByokProviderId("anthropic")).toBe(true);
		expect(byok.isByokProviderId("claude")).toBe(false);
		expect(byok.byokProviderDefinition("google").label).toBe("Google (Gemini)");
		expect(Object.keys(byok)).toEqual(
			expect.arrayContaining([
				"BYOK_PROVIDER_DEFINITIONS",
				"BYOK_PROVIDER_IDS",
				"ByokProviderError",
				"ByokProviderRateLimitError",
				"byokProviderDefinition",
				"byokProviderDefinitions",
				"isByokProviderId",
			])
		);
	});
});
