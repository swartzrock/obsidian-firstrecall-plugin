import { describe, it, expect } from "vitest";
import {
	ANTHROPIC_CUSTOM_MODEL_ID,
	ANTHROPIC_DEFAULT_MODEL_ID,
	describeAnthropicModel,
	describeAnthropicModelDetails,
	formatAnthropicUnavailableModelMessage,
	formatAnthropicModelHint,
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

	it("describes curated Anthropic models with friendly labels and raw IDs", () => {
		expect(describeAnthropicModel("claude-sonnet-4-6")).toEqual({
			label: "Claude Sonnet 4.6",
			rawId: "claude-sonnet-4-6",
		});
	});

	it("describes custom Anthropic models with a generic label", () => {
		expect(describeAnthropicModel("claude-unknown-xyz")).toEqual({
			label: "Custom model ID",
			rawId: "claude-unknown-xyz",
		});
	});

	it("returns cue-quality hint metadata for curated Anthropic models", () => {
		expect(describeAnthropicModelDetails("claude-haiku-4-5")).toEqual({
			label: "Claude Haiku 4.5",
			rawId: "claude-haiku-4-5",
			hint: {
				quality: "Good",
				speed: "Fast",
				cost: "Low",
				context: "Good",
				cuecraftHint: "Fast, lower-cost refreshes for frequent cue generation.",
			},
		});
		expect(formatAnthropicModelHint("claude-haiku-4-5")).toBe(
			"Fast · Low · Good"
		);
	});

	it("falls back to generic hint metadata for custom Anthropic models", () => {
		expect(describeAnthropicModelDetails("claude-unknown-xyz")).toEqual({
			label: "Custom model ID",
			rawId: "claude-unknown-xyz",
			hint: {
				quality: "Varies",
				speed: "Varies",
				cost: "Varies",
				context: "Varies",
				cuecraftHint: "Cue quality depends on the exact custom model you enter.",
			},
		});
		expect(formatAnthropicModelHint("claude-unknown-xyz")).toBe(
			"Varies · Varies · Varies"
		);
	});
});
