import { describe, it, expect } from "vitest";
import {
	ANTHROPIC_CUSTOM_MODEL_ID,
	ANTHROPIC_DEFAULT_MODEL_ID,
	formatAnthropicUnavailableModelMessage,
	isAnthropicCustomModelSelection,
	normalizeAnthropicModelSelection,
} from "../src/anthropic-models";

describe("isAnthropicCustomModelSelection", () => {
	it("treats unknown Anthropic model IDs as custom", () => {
		expect(
			isAnthropicCustomModelSelection({
				anthropicModel: "claude-unknown-xyz",
			})
		).toBe(true);
	});

	it("treats the explicit custom sentinel as custom", () => {
		expect(
			isAnthropicCustomModelSelection({
				anthropicModel: "claude-sonnet-4-6",
				anthropicModelSelection: ANTHROPIC_CUSTOM_MODEL_ID,
			})
		).toBe(true);
	});

	it("keeps curated models in catalog mode", () => {
		expect(
			isAnthropicCustomModelSelection({
				anthropicModel: "claude-sonnet-4-6",
				anthropicModelSelection: "claude-sonnet-4-6",
			})
		).toBe(false);
	});
});

describe("Anthropic picker defaults", () => {
	it("defaults Anthropic to Claude Sonnet 4.6", () => {
		expect(ANTHROPIC_DEFAULT_MODEL_ID).toBe("claude-sonnet-4-6");
	});

	it("preserves saved curated Anthropic model IDs on load", () => {
		const settings = {
			anthropicModel: "claude-3-5-sonnet-latest",
		};
		normalizeAnthropicModelSelection(settings);
		expect(settings.anthropicModelSelection).toBe("claude-3-5-sonnet-latest");
	});

	it("marks unknown saved Anthropic model IDs as custom on load", () => {
		const settings = {
			anthropicModel: "claude-unknown-xyz",
		};
		normalizeAnthropicModelSelection(settings);
		expect(settings.anthropicModelSelection).toBe(ANTHROPIC_CUSTOM_MODEL_ID);
	});

	it("formats an unavailable Anthropic model message with friendly and raw IDs", () => {
		expect(formatAnthropicUnavailableModelMessage("claude-unknown-xyz")).toBe(
			"CueCraft: This key cannot access Custom model ID (claude-unknown-xyz). Pick another model or check your Anthropic account."
		);
	});
});
