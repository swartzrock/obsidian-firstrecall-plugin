import { describe, expect, it } from "vitest";
import {
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

	it("keeps cloud connection verification when only the model changes", () => {
		const settings = baseSettings();
		settings.providerConnectionStatus = recordProviderConnectionSuccess(
			settings,
			"2026-06-11T00:00:00.000Z"
		);
		settings.anthropicModel = "claude-haiku-4-5";
		expect(deriveProviderSetupStatus(settings)).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "verified",
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
});
