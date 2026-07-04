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
	migrateCueCraftCloudCredentials,
	normalizeCueCraftProviderSettings,
	recordCueCraftProviderConnectionSuccess,
	resetCueCraftFetchedModels,
	resolveCueCraftProviderConfigFromStore,
	setCueCraftProviderCredentialMetadata,
	setCueCraftProviderModel,
} from "../src/byok-cuecraft-adapter";
import type { ByokHttpClient, ByokModelOption } from "@cuecraft/byok";
import {
	type CueCraftSettings,
} from "../src/settings";
import type {
	CueCraftCloudCredentialProvider,
	SecureCredentialStore,
} from "../src/secure-credential-store";

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
};

function fakeCredentialStore(opts: {
	save?: (
		provider: CueCraftCloudCredentialProvider,
		value: string
	) => Promise<{ ok: boolean; token?: string; length?: number; message?: string }>;
	metadata?: (
		provider: CueCraftCloudCredentialProvider
	) => Promise<{ ok: boolean; token?: string; length?: number }>;
} = {}): SecureCredentialStore {
	return {
		availability: () => ({ ok: true }),
		metadata: async (provider) => {
			const result = await opts.metadata?.(provider);
			return result?.ok
				? {
					ok: true,
					metadata: {
						saved: true,
						token: result.token ?? "token",
						length: result.length ?? 14,
					},
				}
				: { ok: false, reason: "missing-credential" };
		},
		read: async () => ({ ok: false, reason: "missing-credential" }),
		save: async (provider, value) => {
			const result = await opts.save?.(provider, value);
			return result?.ok
				? {
					ok: true,
					metadata: {
						saved: true,
						token: result.token ?? "token",
						length: result.length ?? value.length,
					},
				}
				: {
					ok: false,
					reason: "write-failed",
					message: result?.message ?? "write failed",
				};
		},
		clear: async () => ({
			ok: true,
			metadata: { saved: false, token: "", length: 0 },
		}),
	};
}

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

	it("resolves cloud provider configs through secure storage", async () => {
		const s = settings({
			provider: "openai",
			openaiApiKey: "",
			openaiModel: "gpt-4o-mini",
			byok: {
				selectedProvider: "openai",
				providers: {
					openai: {
						credential: "",
						credentialSaved: true,
						credentialUpdatedAt: "token",
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

		await expect(
			resolveCueCraftProviderConfigFromStore(
				s,
				{
					...fakeCredentialStore(),
					read: async (provider) => ({
						ok: true,
						value: `${provider}-secure-key`,
						metadata: { saved: true, token: "token" },
					}),
				}
			)
		).resolves.toEqual({
			provider: "openai",
			apiKey: "openai-secure-key",
			model: "gpt-4o-mini",
		});
	});

	it("does not touch secure storage for local provider configs", async () => {
		const s = settings({
			provider: "ollama",
			ollamaHost: "http://localhost:11434",
			ollamaModel: "llama3.1:8b",
		});
		let readCount = 0;

		await expect(
			resolveCueCraftProviderConfigFromStore(
				s,
				{
					...fakeCredentialStore(),
					read: async () => {
						readCount += 1;
						return { ok: false, reason: "missing-credential" };
					},
				}
			)
		).resolves.toEqual({
			provider: "ollama",
			host: "http://localhost:11434",
			model: "llama3.1:8b",
		});
		expect(readCount).toBe(0);
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

	it("wraps generic text providers with CueCraft cue generation", async () => {
		const calls: Array<{ url: string; body?: string }> = [];
		const http: ByokHttpClient = async (request) => {
			calls.push({ url: request.url, body: request.body });
			return {
				status: 200,
				text: "{}",
				json: {
					response: JSON.stringify({
						question: "What is an agent?",
						keywords: ["plan", "tools"],
						confidence: "high",
					}),
				},
			};
		};
		const provider = makeCueCraftByokProvider(settings({ provider: "ollama" }), {
			fetchImpl,
			http,
		});

		const cue = await provider.generateCue({
			heading: "Agents",
			content: "Agents can plan and use tools.",
			preset: "conceptual",
		});

		expect(cue.question).toBe("What is an agent?");
		const body = JSON.parse(calls[0].body ?? "{}");
		expect(body.format).toBe("json");
		expect(body.prompt).toContain("Section heading: Agents");
		expect(body.prompt).toContain("Agents can plan and use tools.");
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
						credentialLength: 14,
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
			credentialLength: 14,
		});

		setCueCraftProviderCredentialMetadata(s, "openai", {
			saved: true,
			token: "token-2",
			length: 28,
		});
		expect(cueCraftProviderSettings(s, "openai")).toMatchObject({
			credentialSaved: true,
			credentialUpdatedAt: "token-2",
			credentialLength: 28,
		});

		clearCueCraftProviderCredentialMetadata(s, "openai");
		expect(cueCraftProviderSettings(s, "openai")).toMatchObject({
			credentialSaved: false,
			credentialUpdatedAt: "",
			credentialLength: 0,
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

	it("persists listed model options", () => {
		const s = settings();
		const openAiOption = { id: "gpt-4o-mini", label: "gpt-4o-mini" };

		expect(
			applyCueCraftListedModels(s, "openai", [openAiOption], "No models.")
		).toEqual({
			models: ["gpt-4o-mini"],
			options: [openAiOption],
			message: "",
		});
		expect(cueCraftProviderSettings(s, "openai").availableModels).toEqual([
			"gpt-4o-mini",
		]);
		expect(cueCraftProviderSettings(s, "openai").modelOptions).toEqual([
			openAiOption,
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

		const codexOption = { id: "gpt-5.5", label: "gpt-5.5" };
		expect(
			applyCueCraftListedModels(s, "codex-cli", [codexOption], "No models.")
		).toEqual({
			models: ["gpt-5.5"],
			options: [codexOption],
			message: "",
		});
		expect(cueCraftProviderSettings(s, "codex-cli").availableModels).toEqual([
			"gpt-5.5",
		]);
		expect(cueCraftProviderSettings(s, "codex-cli").modelOptions).toEqual([
			codexOption,
		]);
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

	it("moves plaintext cloud credentials into secure storage metadata", async () => {
		const saved: Array<[CueCraftCloudCredentialProvider, string]> = [];
		const s = settings({
			provider: "openai",
			openaiApiKey: "sk-openai-test",
			openaiModel: "gpt-4o-mini",
		});
		normalizeCueCraftProviderSettings(s, settings(), s);

		const result = await migrateCueCraftCloudCredentials(
			s,
			fakeCredentialStore({
				save: async (provider, value) => {
					saved.push([provider, value]);
					return { ok: true, token: `${provider}-token` };
				},
			})
		);

		expect(result).toMatchObject({
			settingsChanged: true,
			migratedProviders: ["anthropic", "openai", "google", "xai", "openrouter"],
			warnings: [],
		});
		expect(saved).toContainEqual(["openai", "sk-openai-test"]);
		expect(cueCraftProviderSettings(s, "openai")).toMatchObject({
			credential: "",
			credentialSaved: true,
			credentialUpdatedAt: "openai-token",
			credentialLength: 14,
			model: "gpt-4o-mini",
		});
		expect((s as unknown as { openaiApiKey?: string }).openaiApiKey).toBeUndefined();
		const serialized = JSON.stringify(s);
		for (const key of [
			"sk-ant-test",
			"sk-openai-test",
			"AIza-test",
			"xai-test",
			"sk-or-test",
		]) {
			expect(serialized).not.toContain(key);
		}
	});

	it("keeps plaintext recoverable when secure migration fails", async () => {
		const s = settings({
			provider: "openai",
			openaiApiKey: "sk-openai-test",
		});
		normalizeCueCraftProviderSettings(s, settings(), s);

		const result = await migrateCueCraftCloudCredentials(
			s,
			fakeCredentialStore({
				save: async (provider) =>
					provider === "openai"
						? { ok: false, message: "disk full" }
						: { ok: true, token: `${provider}-token` },
			})
		);

		expect(result.settingsChanged).toBe(true);
		expect(result.warnings.join("\n")).toContain("disk full");
		expect(cueCraftProviderSettings(s, "openai")).toMatchObject({
			credential: "sk-openai-test",
			credentialSaved: false,
			credentialUpdatedAt: "",
			credentialLength: 0,
		});
		expect((s as unknown as { openaiApiKey?: string }).openaiApiKey).toBe(
			"sk-openai-test"
		);
	});

	it("hydrates saved cloud credential metadata from secure storage", async () => {
		const s = settings({
			provider: "openai",
			openaiApiKey: "",
		});
		normalizeCueCraftProviderSettings(s, settings(), s);

		const result = await migrateCueCraftCloudCredentials(
			s,
			fakeCredentialStore({
				metadata: async (provider) =>
					provider === "openai"
						? { ok: true, token: "openai-token", length: 14 }
						: { ok: false },
			})
		);

		expect(result.settingsChanged).toBe(true);
		expect(cueCraftProviderSettings(s, "openai")).toMatchObject({
			credential: "",
			credentialSaved: true,
			credentialUpdatedAt: "openai-token",
			credentialLength: 14,
		});
	});

	it("hydrates missing saved credential length metadata from secure storage", async () => {
		const s = settings({
			byok: {
				selectedProvider: "openai",
				providers: {
					openai: {
						credential: "",
						credentialSaved: true,
						credentialUpdatedAt: "old-token",
						credentialLength: 0,
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

		const result = await migrateCueCraftCloudCredentials(
			s,
			fakeCredentialStore({
				metadata: async (provider) =>
					provider === "openai"
						? { ok: true, token: "openai-token", length: 42 }
						: { ok: false },
			})
		);

		expect(result.settingsChanged).toBe(true);
		expect(cueCraftProviderSettings(s, "openai")).toMatchObject({
			credentialSaved: true,
			credentialUpdatedAt: "openai-token",
			credentialLength: 42,
		});
	});
});
