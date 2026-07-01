import { describe, expect, it } from "vitest";
import {
	CLI_DEFAULT_MODEL_SENTINEL,
	deriveProviderSetupStatus,
	modelCompatibilityBadges,
	normalizeOpenRouterModel,
	recordProviderConnectionSuccess,
} from "../src";

describe("BYOK model metadata and setup status", () => {
	it("normalizes model metadata and exposes compatibility helpers", () => {
		const option = normalizeOpenRouterModel({
			id: "openai/gpt-4o-mini",
			name: "OpenAI: GPT-4o mini",
			context_length: 128000,
			pricing: { prompt: "0.00000015", completion: "0.0000006" },
			supported_parameters: ["response_format"],
		});

		expect(option).toMatchObject({
			id: "openai/gpt-4o-mini",
			label: "OpenAI: GPT-4o mini",
			provider: "openai",
			contextLength: 128000,
		});
		expect(modelCompatibilityBadges(option)).toEqual([
			"Structured output",
			"Large context",
			"Low cost",
		]);
	});

	it("derives CLI setup status with the default-model sentinel", () => {
		const settings = {
			byok: {
				selectedProvider: "codex-cli" as const,
				providers: {
					"codex-cli": {
						credential: "codex",
						model: "",
						availableModels: [],
						modelOptions: [],
						hasFetchedModels: false,
						modelRefreshMessage: "",
					},
				},
				verification: {},
			},
		};

		const providerConnectionStatus = recordProviderConnectionSuccess(
			settings,
			"2026-06-27T00:00:00.000Z"
		);

		expect(providerConnectionStatus["codex-cli"]?.modelId).toBe(
			CLI_DEFAULT_MODEL_SENTINEL
		);
		expect(
			deriveProviderSetupStatus({
				byok: {
					...settings.byok,
					verification: providerConnectionStatus,
				},
			})
		).toEqual({
			keySaved: true,
			modelSelected: true,
			connection: "verified",
			testedAt: "2026-06-27T00:00:00.000Z",
		});
	});
});
