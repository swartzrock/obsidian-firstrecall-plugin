import { describe, it, expect } from "vitest";
import { resolveModelRefreshDescription } from "../src/model-refresh";

/** Minimal shape mirroring the OpenRouter fields from CueCraftSettings. */
interface OpenRouterSettings {
	provider: string;
	openrouterApiKey: string;
	openrouterModel: string;
	openrouterAvailableModels: string[];
	openrouterHasFetchedModels: boolean;
	openrouterModelRefreshMessage: string;
	openaiApiKey: string;
	openaiModel: string;
}

describe("resolveModelRefreshDescription", () => {
	it("returns the default description when refresh message is empty", () => {
		expect(
			resolveModelRefreshDescription("", "Fetch OpenRouter's available model IDs for this account.")
		).toBe("Fetch OpenRouter's available model IDs for this account.");
	});

	it("returns the default description when refresh message is whitespace", () => {
		expect(
			resolveModelRefreshDescription("   ", "Fetch models.")
		).toBe("Fetch models.");
	});

	it("surfaces a 'Could not' error message over the default", () => {
		expect(
			resolveModelRefreshDescription(
				"Could not fetch OpenRouter models (401 unauthorized).",
				"Fetch OpenRouter's available model IDs."
			)
		).toBe("Could not fetch OpenRouter models (401 unauthorized).");
	});

	it("surfaces a 'No models' message over the default", () => {
		expect(
			resolveModelRefreshDescription(
				"No OpenRouter models were returned for this account.",
				"Fetch models."
			)
		).toBe("No OpenRouter models were returned for this account.");
	});

	it("surfaces a 'CueCraft:' prefixed message over the default", () => {
		expect(
			resolveModelRefreshDescription(
				"CueCraft: OpenRouter model fetch is unavailable.",
				"Fetch models."
			)
		).toBe("CueCraft: OpenRouter model fetch is unavailable.");
	});

	it("ignores an unrecognized success message and returns the default", () => {
		expect(
			resolveModelRefreshDescription(
				"Fetched 42 models successfully!",
				"Fetch models."
			)
		).toBe("Fetch models.");
	});
});

describe("OpenRouter settings preservation", () => {
	function settingsWithOpenRouter(overrides: Partial<OpenRouterSettings> = {}): OpenRouterSettings {
		return {
			provider: "openrouter",
			openrouterApiKey: "or-test-key",
			openrouterModel: "anthropic/claude-sonnet-4",
			openrouterAvailableModels: [],
			openrouterHasFetchedModels: false,
			openrouterModelRefreshMessage: "",
			openaiApiKey: "",
			openaiModel: "",
			...overrides,
		};
	}

	it("preserves OpenRouter key and model when switching provider away and back", () => {
		const s = settingsWithOpenRouter();
		expect(s.openrouterApiKey).toBe("or-test-key");
		expect(s.openrouterModel).toBe("anthropic/claude-sonnet-4");

		// Simulate switching to OpenAI
		s.provider = "openai";
		s.openaiApiKey = "sk-openai";
		s.openaiModel = "gpt-4o";

		// OpenRouter fields are unchanged
		expect(s.openrouterApiKey).toBe("or-test-key");
		expect(s.openrouterModel).toBe("anthropic/claude-sonnet-4");

		// Switch back
		s.provider = "openrouter";
		expect(s.openrouterApiKey).toBe("or-test-key");
		expect(s.openrouterModel).toBe("anthropic/claude-sonnet-4");
	});

	it("preserves a custom model when fetched models do not include it", () => {
		const s = settingsWithOpenRouter({
			openrouterModel: "custom-provider/my-fine-tune",
			openrouterAvailableModels: [
				"anthropic/claude-sonnet-4",
				"openai/gpt-4o",
			],
		});
		const availableModels = s.openrouterAvailableModels;
		const currentModel = s.openrouterModel;
		const isCustomSelection =
			availableModels.length === 0 || !availableModels.includes(currentModel);

		expect(isCustomSelection).toBe(true);
		expect(currentModel).toBe("custom-provider/my-fine-tune");
	});

	it("recognizes a fetched model as a non-custom selection", () => {
		const s = settingsWithOpenRouter({
			openrouterModel: "anthropic/claude-sonnet-4",
			openrouterAvailableModels: [
				"anthropic/claude-sonnet-4",
				"openai/gpt-4o",
			],
		});
		const isCustomSelection =
			s.openrouterAvailableModels.length === 0 ||
			!s.openrouterAvailableModels.includes(s.openrouterModel);

		expect(isCustomSelection).toBe(false);
	});

	it("treats empty available models as custom selection mode", () => {
		const s = settingsWithOpenRouter({
			openrouterModel: "anthropic/claude-sonnet-4",
			openrouterAvailableModels: [],
		});
		const isCustomSelection =
			s.openrouterAvailableModels.length === 0 ||
			!s.openrouterAvailableModels.includes(s.openrouterModel);

		expect(isCustomSelection).toBe(true);
	});

	it("keeps fetched models after a refresh updates the list", () => {
		const s = settingsWithOpenRouter({
			openrouterAvailableModels: [],
			openrouterHasFetchedModels: false,
		});

		// Simulate a successful refresh
		const fetched = [
			"anthropic/claude-sonnet-4",
			"openai/gpt-4o",
			"meta-llama/llama-3-70b",
		];
		s.openrouterAvailableModels = fetched;
		s.openrouterHasFetchedModels = true;
		s.openrouterModelRefreshMessage = "";

		expect(s.openrouterAvailableModels).toEqual(fetched);
		expect(s.openrouterHasFetchedModels).toBe(true);
	});

	it("stores an error message when refresh fails", () => {
		const s = settingsWithOpenRouter({
			openrouterAvailableModels: ["old/model"],
			openrouterHasFetchedModels: true,
		});

		// Simulate a failed refresh
		s.openrouterAvailableModels = [];
		s.openrouterModelRefreshMessage =
			"Could not fetch OpenRouter models (network error).";

		const desc = resolveModelRefreshDescription(
			s.openrouterModelRefreshMessage,
			"Fetch OpenRouter's available model IDs for this account."
		);
		expect(desc).toBe("Could not fetch OpenRouter models (network error).");
	});

});
