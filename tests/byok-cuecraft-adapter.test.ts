import { describe, expect, it } from "vitest";
import {
	applyCueCraftListedModels,
	applyCueCraftModelRefreshFailure,
	cueCraftFetchedModelCount,
	cueCraftModelRefreshMessage,
	cueCraftProviderConfigFromSettings,
	cueCraftProviderSettings,
	clearCueCraftProviderCredentialMetadata,
	deriveCueCraftProviderSetupStatus,
	makeCueCraftByokProvider,
	normalizeCueCraftProviderSettings,
	recordCueCraftProviderConnectionSuccess,
	resetCueCraftFetchedModels,
	setCueCraftProviderCredentialMetadata,
	setCueCraftProviderModel,
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

describe("CueCraft provider settings normalization", () => {
	it("normalizes provider ids, CLI defaults, and legacy Anthropic model data", () => {
		const s = settings({
			provider: "claude" as never,
			codexCliCommand: undefined as never,
			claudeCliModel: 123 as never,
			anthropicModel: "claude-account-123",
			anthropicAvailableModels: undefined as never,
		}) as CueCraftSettings & { anthropicAvailableModelIds?: string[] };
		s.anthropicAvailableModelIds = ["claude-account-123"];
		delete (s as Partial<CueCraftSettings>).anthropicHasFetchedModels;
		delete (s as Partial<CueCraftSettings>).anthropicModelSelection;

		normalizeCueCraftProviderSettings(s, settings());

		expect(s.byok.selectedProvider).toBe("claude-cli");
		expect(cueCraftProviderSettings(s, "codex-cli").credential).toBe("codex");
		expect(cueCraftProviderSettings(s, "claude-cli").model).toBe("sonnet");
		expect(cueCraftProviderSettings(s, "anthropic").availableModels).toEqual([
			"claude-account-123",
		]);
		expect(cueCraftProviderSettings(s, "anthropic").hasFetchedModels).toBe(true);
		expect(cueCraftProviderSettings(s, "anthropic").modelSelection).toBe(
			"claude-account-123"
		);
	});

	it("normalizes and mutates saved cloud credential metadata", () => {
		const s = settings({
			byok: {
				selectedProvider: "openai",
				providers: {
					openai: {
						credential: "",
						credentialSaved: true,
						credentialUpdatedAt: "token-1",
						model: "gpt-4o-mini",
						availableModels: [],
						modelOptions: [],
						hasFetchedModels: false,
						modelRefreshMessage: "",
					},
				},
				verification: {},
			},
		});

		normalizeCueCraftProviderSettings(s, settings(), s);
		expect(cueCraftProviderSettings(s, "openai")).toMatchObject({
			credential: "",
			credentialSaved: true,
			credentialUpdatedAt: "token-1",
		});

		setCueCraftProviderCredentialMetadata(s, "openai", {
			saved: true,
			token: "token-2",
		});
		expect(cueCraftProviderSettings(s, "openai")).toMatchObject({
			credentialSaved: true,
			credentialUpdatedAt: "token-2",
		});

		clearCueCraftProviderCredentialMetadata(s, "openai");
		expect(cueCraftProviderSettings(s, "openai")).toMatchObject({
			credentialSaved: false,
			credentialUpdatedAt: "",
		});
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

		const stored = cueCraftProviderSettings(s, "openrouter");
		expect(stored.availableModels).toEqual([]);
		expect(stored.modelOptions).toEqual([]);
		expect(stored.hasFetchedModels).toBe(false);
		expect(stored.modelRefreshMessage).toBe("Enter an OpenRouter key.");
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
		expect(cueCraftProviderSettings(s, "openai").availableModels).toEqual([
			"gpt-4o-mini",
		]);
		expect(cueCraftProviderSettings(s, "openai").hasFetchedModels).toBe(true);

		expect(
			applyCueCraftListedModels(s, "openrouter", [openrouterOption], "No models.")
		).toEqual({
			models: ["anthropic/claude-sonnet-4"],
			options: [openrouterOption],
			message: "",
		});
		expect(cueCraftProviderSettings(s, "openrouter").availableModels).toEqual([
			"anthropic/claude-sonnet-4",
		]);
		expect(cueCraftProviderSettings(s, "openrouter").modelOptions).toEqual([
			openrouterOption,
		]);
		expect(cueCraftFetchedModelCount(s, "openrouter")).toBe(1);
		expect(cueCraftModelRefreshMessage(s, "openrouter")).toBe("");
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

		const stored = cueCraftProviderSettings(s, "ollama");
		expect(stored.availableModels).toEqual([]);
		expect(stored.hasFetchedModels).toBe(true);
		expect(stored.modelRefreshMessage).toBe(
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

		recordCueCraftProviderConnectionSuccess(
			s,
			"2026-06-27T00:00:00.000Z"
		);

		expect(deriveCueCraftProviderSetupStatus(s)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "verified",
			testedAt: "2026-06-27T00:00:00.000Z",
		});

		setCueCraftProviderModel(s, "openai", "gpt-4o");
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
		recordCueCraftProviderConnectionSuccess(
			s,
			"2026-06-27T00:00:00.000Z"
		);

		expect(s.byok).toMatchObject({
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
