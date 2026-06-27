import { describe, expect, it } from "vitest";
import { createByokProvider, type ByokHttpClient } from "../../src/byok";

const http: ByokHttpClient = async () => ({ status: 200, text: "{}", json: {} });
const fetchImpl = (async () => new Response("{}")) as typeof fetch;

describe("createByokProvider", () => {
	it.each([
		[{ provider: "ollama", host: "http://localhost:11434", model: "llama3.1:8b" }, "ollama"],
		[{ provider: "anthropic", apiKey: "sk-ant-test", model: "claude-sonnet-4-6" }, "anthropic"],
		[{ provider: "openai", apiKey: "sk-openai-test", model: "gpt-4o-mini" }, "openai"],
		[{ provider: "google", apiKey: "AIza-test", model: "gemini-1.5-flash" }, "google"],
		[{ provider: "xai", apiKey: "xai-test", model: "grok-2-latest" }, "xai"],
		[{ provider: "openrouter", apiKey: "sk-or-test", model: "openai/gpt-4o" }, "openrouter"],
		[{ provider: "codex-cli", command: "codex", model: "gpt-5" }, "codex-cli"],
		[{ provider: "claude-cli", command: "claude", model: "sonnet" }, "claude-cli"],
	] as const)("creates the %s runtime", (config, expectedId) => {
		const provider = createByokProvider(config, { fetchImpl, http });
		expect(provider.id).toBe(expectedId);
		expect(provider.label).toBeTruthy();
	});

	it("preserves model-list hooks on discoverable providers", () => {
		const provider = createByokProvider(
			{ provider: "openrouter", apiKey: "sk-or-test", model: "openai/gpt-4o" },
			{ fetchImpl, http }
		);

		expect(typeof provider.listModels).toBe("function");
	});

	it("keeps CLI model overrides optional", () => {
		const provider = createByokProvider(
			{ provider: "codex-cli", command: "codex" },
			{ fetchImpl, http }
		);

		expect(provider.id).toBe("codex-cli");
		expect("listModels" in provider).toBe(false);
	});
});
