import { describe, expect, it } from "vitest";
import {
	CLI_DEFAULT_MODEL_SENTINEL,
	deriveProviderSetupStatus,
	recordProviderConnectionSuccess,
	type ProviderSetupStatusSettings,
} from "../src/provider-setup-status";

function baseSettings(
	overrides: Partial<ProviderSetupStatusSettings> = {}
): ProviderSetupStatusSettings {
	return {
		provider: "anthropic",
		ollamaHost: "http://localhost:11434",
		ollamaModel: "llama3.1:8b",
		anthropicApiKey: "sk-ant-test",
		anthropicModel: "claude-sonnet-4-6",
		anthropicAvailableModels: [],
		openaiApiKey: "",
		openaiModel: "",
		googleApiKey: "",
		googleModel: "",
		xaiApiKey: "",
		xaiModel: "",
		openrouterApiKey: "",
		openrouterModel: "",
		codexCliCommand: "codex",
		codexCliModel: "",
		claudeCliCommand: "claude",
		claudeCliModel: "",
		providerConnectionStatus: {},
		...overrides,
	};
	}

describe("deriveProviderSetupStatus", () => {
	it("shows saved key and model before any connection test", () => {
		expect(deriveProviderSetupStatus(baseSettings())).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "untested",
		});
	});

	it("marks a provider connection as verified when the saved key and model still match", () => {
		const settings = baseSettings();
		settings.providerConnectionStatus = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "verified",
			testedAt: "2026-06-11T00:00:00.000Z",
		});
	});

	it("marks cloud connection stale when the selected model changes", () => {
		const settings = baseSettings();
		settings.providerConnectionStatus = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		settings.anthropicModel = "claude-haiku-4-5";
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "stale",
			testedAt: "2026-06-11T00:00:00.000Z",
		});
	});

	it("marks OpenRouter connection stale when its selected model changes", () => {
		const settings = baseSettings({
			provider: "openrouter",
			openrouterApiKey: "sk-or-test",
			openrouterModel: "anthropic/claude-sonnet-4",
		});
		settings.providerConnectionStatus = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		settings.openrouterModel = "openai/gpt-4o";
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "stale",
			testedAt: "2026-06-11T00:00:00.000Z",
		});
	});

	it("marks Ollama connection stale when the model changes after a successful test", () => {
		const settings = baseSettings({
			provider: "ollama",
			ollamaHost: "http://localhost:11434",
			ollamaModel: "llama3.1:8b",
		});
		settings.providerConnectionStatus = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		settings.ollamaModel = "llama3.2:latest";
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "stale",
			testedAt: "2026-06-11T00:00:00.000Z",
		});
	});

	it("marks the connection stale when the key changes after a successful test", () => {
		const settings = baseSettings();
		settings.providerConnectionStatus = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		settings.anthropicApiKey = "sk-ant-new";
		expect(deriveProviderSetupStatus(settings).connection).toBe("stale");
	});

	it("derives provider-specific status independently for other saved providers", () => {
		const anthropic = baseSettings();
		anthropic.providerConnectionStatus = recordProviderConnectionSuccess(
			anthropic,
			"2026-06-11T00:00:00.000Z"
		);
		const openai = {
			...anthropic,
			provider: "openai" as const,
			openaiApiKey: "sk-openai-test",
			openaiModel: "gpt-4o-mini",
		};
		expect(deriveProviderSetupStatus(openai)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "untested",
		});
	});

	it("treats Codex CLI default model as selected setup state", () => {
		expect(
			deriveProviderSetupStatus(
				baseSettings({
					provider: "codex-cli",
					codexCliCommand: "codex",
					codexCliModel: "",
				})
			)
		).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "untested",
		});
	});

	it("records the CLI default sentinel when no CLI model override is configured", () => {
		const settings = baseSettings({
			provider: "codex-cli",
			codexCliCommand: "codex",
			codexCliModel: "",
		});
		settings.providerConnectionStatus = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		expect(settings.providerConnectionStatus["codex-cli"]?.modelId).toBe(
			CLI_DEFAULT_MODEL_SENTINEL
		);
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "verified",
			testedAt: "2026-06-11T00:00:00.000Z",
		});
	});

	it("marks a verified Codex CLI connection stale when its command changes", () => {
		const settings = baseSettings({
			provider: "codex-cli",
			codexCliCommand: "codex",
			codexCliModel: "",
		});
		settings.providerConnectionStatus = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		settings.codexCliCommand = "/opt/homebrew/bin/codex";
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "stale",
			testedAt: "2026-06-11T00:00:00.000Z",
		});
	});

	it("marks a verified Claude CLI connection stale when its model override changes", () => {
		const settings = baseSettings({
			provider: "claude-cli",
			claudeCliCommand: "claude",
			claudeCliModel: "",
		});
		settings.providerConnectionStatus = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		settings.claudeCliModel = "sonnet";
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "stale",
			testedAt: "2026-06-11T00:00:00.000Z",
		});
	});

	it("does not crash when a saved CLI provider is missing new CLI fields", () => {
		const settings = baseSettings({
			provider: "claude-cli",
		}) as Partial<ProviderSetupStatusSettings>;
		delete settings.claudeCliCommand;
		delete settings.claudeCliModel;

		expect(
			deriveProviderSetupStatus(settings as ProviderSetupStatusSettings)
		).toEqual({
			keySaved: false,
			modelSelected: true,
			connection: "untested",
		});
	});

	it("does not crash when a saved provider id is unknown", () => {
		const settings = {
			...baseSettings(),
			provider: "claude",
		} as unknown as ProviderSetupStatusSettings;

		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: false,
			modelSelected: false,
			connection: "untested",
		});
	});
});
