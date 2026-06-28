import { describe, expect, it } from "vitest";
import {
	applyCueCraftListedModels,
	applyCueCraftModelRefreshFailure,
	cueCraftByokSettingsFromCueCraftSettings,
	cueCraftProviderConfigFromSettings,
	deriveCueCraftProviderSetupStatus,
	makeCueCraftByokProvider,
	recordCueCraftProviderConnectionSuccess,
	resetCueCraftFetchedModels,
} from "../src/byok-cuecraft-adapter";
import type { ByokHttpClient, ByokModelOption } from "../src/byok";
import {
	type CueCraftSettings,
} from "../src/settings";

function settings(
	overrides: Partial<CueCraftSettings> = {}
): CueCraftSettings {
	return {
		provider: "ollama",
		ollamaHost: "http://localhost:11434",
		ollamaModel: "llama3.1:8b",
		ollamaAvailableModels: [],
		ollamaHasFetchedModels: false,
		ollamaModelRefreshMessage: "",
		anthropicApiKey: "sk-ant-test",
		anthropicModel: "claude-sonnet-4-6",
		anthropicModelSelection: "claude-sonnet-4-6",
		anthropicAvailableModels: [],
		anthropicHasFetchedModels: false,
		anthropicModelRefreshMessage: "",
		openaiApiKey: "sk-openai-test",
		openaiModel: "gpt-4o-mini",
		openaiAvailableModels: [],
		openaiHasFetchedModels: false,
		openaiModelRefreshMessage: "",
		googleApiKey: "AIza-test",
		googleModel: "gemini-1.5-flash",
		googleAvailableModels: [],
		googleHasFetchedModels: false,
		googleModelRefreshMessage: "",
		xaiApiKey: "xai-test",
		xaiModel: "grok-2-latest",
		xaiAvailableModels: [],
		xaiHasFetchedModels: false,
		xaiModelRefreshMessage: "",
		openrouterApiKey: "sk-or-test",
		openrouterModel: "anthropic/claude-sonnet-4",
		openrouterAvailableModels: [],
		openrouterModelOptions: [],
		openrouterHasFetchedModels: false,
		openrouterModelRefreshMessage: "",
		codexCliCommand: "codex",
		codexCliModel: "gpt-5",
		claudeCliCommand: "claude",
		claudeCliModel: "sonnet",
		providerConnectionStatus: {},
		...overrides,
	} as CueCraftSettings;
}

const http: ByokHttpClient = async () => ({ status: 200, text: "{}", json: {} });
const fetchImpl = (async () => new Response("{}")) as typeof fetch;

const openrouterOption: ByokModelOption = {
	id: "anthropic/claude-sonnet-4",
	label: "Claude Sonnet 4",
	provider: "Anthropic",
	contextLength: 200000,
	pricing: null,
	supportedParameters: ["tools"],
	source: "openrouter",
};

describe("cueCraftProviderConfigFromSettings", () => {
	it("maps every CueCraft provider setting shape into BYOK provider config", () => {
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
		expect(
			cueCraftProviderConfigFromSettings(
				settings({
					provider: "ollama",
					ollamaHost: "http://localhost:11434",
					ollamaModel: "llama3.1:8b",
				})
			)
		).toEqual({
			provider: "ollama",
			host: "http://localhost:11434",
			model: "llama3.1:8b",
		});
	});

	it.each([
		"ollama",
		"anthropic",
		"openai",
		"google",
		"xai",
		"openrouter",
		"codex-cli",
		"claude-cli",
	] as const)("creates a BYOK runtime for %s", (provider) => {
		expect(
			makeCueCraftByokProvider(settings({ provider }), { fetchImpl, http }).id
		).toBe(provider);
	});
});

describe("CueCraft fetched model adapters", () => {
	it("resets provider-specific fetched model state when credentials change", () => {
		const s = settings({
			openrouterAvailableModels: ["anthropic/claude-sonnet-4"],
			openrouterModelOptions: [openrouterOption],
			openrouterHasFetchedModels: true,
		});

		resetCueCraftFetchedModels(s, "openrouter", "Enter an OpenRouter key.");

		expect(s.openrouterAvailableModels).toEqual([]);
		expect(s.openrouterModelOptions).toEqual([]);
		expect(s.openrouterHasFetchedModels).toBe(false);
		expect(s.openrouterModelRefreshMessage).toBe("Enter an OpenRouter key.");
	});

	it("persists listed string models and rich OpenRouter model options", () => {
		const s = settings();

		expect(
			applyCueCraftListedModels(s, "openai", ["gpt-4o-mini"], "No models.")
		).toEqual({
			models: ["gpt-4o-mini"],
			options: [],
			message: "",
		});
		expect(s.openaiAvailableModels).toEqual(["gpt-4o-mini"]);
		expect(s.openaiHasFetchedModels).toBe(true);

		expect(
			applyCueCraftListedModels(s, "openrouter", [openrouterOption], "No models.")
		).toEqual({
			models: ["anthropic/claude-sonnet-4"],
			options: [openrouterOption],
			message: "",
		});
		expect(s.openrouterAvailableModels).toEqual([
			"anthropic/claude-sonnet-4",
		]);
		expect(s.openrouterModelOptions).toEqual([openrouterOption]);
	});

	it("persists model refresh failures as fetched-but-empty state", () => {
		const s = settings({
			ollamaAvailableModels: ["llama3.1:8b"],
			ollamaHasFetchedModels: false,
		});

		applyCueCraftModelRefreshFailure(
			s,
			"ollama",
			"Could not fetch Ollama models."
		);

		expect(s.ollamaAvailableModels).toEqual([]);
		expect(s.ollamaHasFetchedModels).toBe(true);
		expect(s.ollamaModelRefreshMessage).toBe(
			"Could not fetch Ollama models."
		);
	});
});

describe("CueCraft provider connection adapters", () => {
	it("records and derives setup status through BYOK snapshots", () => {
		const s = settings({
			provider: "openai",
			openaiApiKey: "sk-openai-test",
			openaiModel: "gpt-4o-mini",
		});

		s.providerConnectionStatus = recordCueCraftProviderConnectionSuccess(
			s,
			"2026-06-27T00:00:00.000Z"
		);

		expect(deriveCueCraftProviderSetupStatus(s)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "verified",
			testedAt: "2026-06-27T00:00:00.000Z",
		});

		s.openaiModel = "gpt-4o";
		expect(deriveCueCraftProviderSetupStatus(s).connection).toBe("stale");
	});
});

describe("CueCraft BYOK settings migration", () => {
	it("projects flat CueCraft provider settings into BYOK-owned storage", () => {
		const s = settings({
			provider: "openrouter",
			openrouterApiKey: "sk-or-test",
			openrouterModel: "anthropic/claude-sonnet-4",
			openrouterAvailableModels: ["anthropic/claude-sonnet-4"],
			openrouterModelOptions: [openrouterOption],
			openrouterHasFetchedModels: true,
			openrouterModelRefreshMessage: "",
		});
		s.providerConnectionStatus = recordCueCraftProviderConnectionSuccess(
			s,
			"2026-06-27T00:00:00.000Z"
		);

		expect(cueCraftByokSettingsFromCueCraftSettings(s)).toMatchObject({
			selectedProvider: "openrouter",
			providers: {
				openrouter: {
					credential: "sk-or-test",
					model: "anthropic/claude-sonnet-4",
					availableModels: ["anthropic/claude-sonnet-4"],
					modelOptions: [openrouterOption],
					hasFetchedModels: true,
					modelRefreshMessage: "",
				},
				"codex-cli": {
					credential: "codex",
					model: "gpt-5",
				},
			},
			verification: {
				openrouter: {
					testedAt: "2026-06-27T00:00:00.000Z",
				},
			},
		});
	});
});
