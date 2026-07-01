import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod/v3";
import * as byok from "../src";
import type {
	ByokProviderConfig,
	ByokProviderDefinition,
	ByokProviderRuntime,
} from "../src";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

describe("BYOK public contract", () => {
	it("exports only the intentional main-entry public API", () => {
		expect(Object.keys(byok).sort()).toEqual([
			"ANTHROPIC_CUSTOM_MODEL_ID",
			"BYOK_PROVIDER_DEFINITIONS",
			"BYOK_PROVIDER_IDS",
			"ByokProviderError",
			"ByokProviderRateLimitError",
			"CLI_DEFAULT_MODEL_SENTINEL",
			"anthropicModelInfoToByokModelOption",
			"buildAnthropicModelOptions",
			"byokProviderDefinition",
			"byokProviderDefinitions",
			"compareFetchedModelIds",
			"createByokProvider",
			"deriveProviderSetupStatus",
			"describeAnthropicModel",
			"describeAnthropicModelDetails",
			"formatAnthropicModelHint",
			"formatAnthropicUnavailableModelMessage",
			"isAnthropicCustomModelSelection",
			"isByokProviderId",
			"isLargeContextModel",
			"isLowCostModel",
			"isModelOption",
			"modelCompatibilityBadges",
			"modelCompatibilityWarning",
			"modelStructuredOutputSupport",
			"normalizeAnthropicModelSelection",
			"normalizeModelIds",
			"normalizeOpenRouterModel",
			"normalizeProviderId",
			"normalizeStringId",
			"providerCredentialFingerprint",
			"recordProviderConnectionSuccess",
			"refreshAnthropicModelOptions",
			"sortByokModelOptions",
			"sortFetchedModelIds",
			"sortModelOptions",
		]);
		expect("createByokNodeProvider" in byok).toBe(false);
		expect("LocalCommandRunner" in byok).toBe(false);
	});

	it("keeps BYOK free of app and storage imports", () => {
		const files = walkFiles(join(PACKAGE_ROOT, "src")).filter((path) =>
			path.endsWith(".ts")
		);
		for (const file of files) {
			const source = readFileSync(file, "utf8");
			expect(source, file).not.toMatch(/from\s+["'](?:obsidian|electron)["']/);
			expect(source, file).not.toContain("secure-credential-store");
			expect(source, file).not.toContain("CueCraftSettings");
		}
	});

	it("documents examples against the public barrel", () => {
		const doc = readFileSync(join(REPO_ROOT, "docs", "byok-extraction.md"), "utf8");
		const codeExamples = [...doc.matchAll(/```(?:ts|typescript)\n([\s\S]*?)```/g)]
			.map((match) => match[1] ?? "")
			.join("\n");

		expect(codeExamples).toContain('from "@cuecraft/byok"');
		expect(codeExamples).toContain('from "@cuecraft/byok/node"');
		expect(codeExamples).not.toMatch(
			/from\s+["'][^"']*byok\/(?:models|providers|registry|setup-status|types)/
		);
	});

	it("represents all current provider config variants", () => {
		const configs: ByokProviderConfig[] = [
			{ provider: "anthropic", apiKey: "sk-ant-test", model: "claude-sonnet-4-6" },
			{ provider: "openai", apiKey: "sk-openai-test", model: "gpt-4o-mini" },
			{ provider: "google", apiKey: "AIza-test", model: "gemini-1.5-flash" },
			{ provider: "xai", apiKey: "xai-test", model: "grok-2-latest" },
			{ provider: "openrouter", apiKey: "sk-or-test", model: "openai/gpt-4o" },
			{ provider: "ollama", host: "http://localhost:11434", model: "llama3.1:8b" },
			{ provider: "codex-cli", command: "codex" },
			{ provider: "claude-cli", command: "claude", model: "sonnet" },
		];

		expect(configs.map((config) => config.provider)).toEqual(
			byok.BYOK_PROVIDER_IDS
		);
	});

	it("exports a runtime shape with text, object, status, and model hooks", async () => {
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
			async generateText() {
				return { text: "Plain response." };
			},
			async generateObject() {
				return { ok: true };
			},
		};

		await expect(runtime.testConnection()).resolves.toEqual({
			ok: true,
			message: "Connected.",
		});
		await expect(runtime.listModels?.()).resolves.toEqual(["gpt-4o-mini"]);
		await expect(runtime.generateText({ prompt: "Hi" })).resolves.toEqual({
			text: "Plain response.",
		});
		await expect(
			runtime.generateObject?.({
				prompt: "Hi",
				schema: z.object({ ok: z.boolean() }),
			})
		).resolves.toEqual({ ok: true });
	});

	it("exposes every provider with stable labels and capability metadata", () => {
		const definitions = byok.byokProviderDefinitions();
		const byId = new Map(definitions.map((definition) => [definition.id, definition]));

		expect(definitions).toHaveLength(8);
		for (const definition of definitions) {
			expect(definition.shortLabel.length).toBeGreaterThan(0);
			expect(definition.productLabel.length).toBeGreaterThan(0);
			expect(definition.icon.viewBox.length).toBeGreaterThan(0);
			expect(definition.icon.svg).toContain("<");
			expect(definition.icon.sourceUrl.length).toBeGreaterThan(0);
			expect(definition.credentialField.label.length).toBeGreaterThan(0);
			expect(definition.credentialField.placeholder.length).toBeGreaterThan(0);
			expect(definition.credentialField.missingMessage.length).toBeGreaterThan(0);
			expect(definition.credentialField.description).not.toMatch(
				/Obsidian|Secret Storage|CueCraft/i
			);
			expect(definition.modelField.label.length).toBeGreaterThan(0);
			expect(definition.modelField.placeholder.length).toBeGreaterThan(0);
		}
		expect(byId.get("ollama")).toMatchObject({
			label: "Ollama",
			shortLabel: "Ollama",
			productLabel: "Ollama",
			credentialKind: "host",
			credentialField: {
				label: "Ollama host",
				secret: false,
			},
			requiresNetwork: false,
			supportsModelListing: true,
		} satisfies Partial<ByokProviderDefinition>);
		expect(byId.get("openrouter")).toMatchObject({
			label: "OpenRouter",
			shortLabel: "OpenRouter",
			credentialKind: "api-key",
			icon: {
				source: "custom",
			},
			supportsModelListing: true,
		} satisfies Partial<ByokProviderDefinition>);
		expect(byId.get("anthropic")?.icon.source).toBe("svgl");
		expect(byId.get("openai")?.icon.source).toBe("svgl");
		expect(byId.get("codex-cli")).toMatchObject({
			label: "Codex CLI",
			credentialKind: "command",
			modelBehavior: "optional",
		} satisfies Partial<ByokProviderDefinition>);
		expect(byId.get("claude-cli")).toMatchObject({
			label: "Claude CLI",
			credentialKind: "command",
			modelBehavior: "optional",
		} satisfies Partial<ByokProviderDefinition>);
	});

	it("keeps provider ID guards in the public barrel", () => {
		expect(byok.isByokProviderId("anthropic")).toBe(true);
		expect(byok.isByokProviderId("claude")).toBe(false);
		expect(byok.normalizeProviderId("claude")).toBe("claude-cli");
		expect(byok.byokProviderDefinition("google").label).toBe("Google (Gemini)");
	});
});

function walkFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		return statSync(path).isDirectory() ? walkFiles(path) : [path];
	});
}
