import { describe, it, expect } from "vitest";
import {
	ANTHROPIC_CUSTOM_MODEL_ID,
	ANTHROPIC_DEFAULT_MODEL_ID,
	buildAnthropicModelOptions,
	describeAnthropicModel,
	describeAnthropicModelDetails,
	formatAnthropicUnavailableModelMessage,
	formatAnthropicModelHint,
	isAnthropicCustomModelSelection,
	normalizeAnthropicModelSelection,
	refreshAnthropicModelOptions,
} from "../src/anthropic-models";
import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";

function modelInfo(id: string, display_name: string): ModelInfo {
	return {
		id,
		display_name,
		type: "model",
		created_at: "2026-01-01T00:00:00Z",
		max_input_tokens: null,
		max_tokens: null,
		capabilities: null,
	} as ModelInfo;
}

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

	it("keeps a refreshed Anthropic account-specific model in catalog mode", () => {
		const settings = {
			anthropicModel: "claude-account-123",
			anthropicAvailableModels: [modelInfo("claude-account-123", "Claude Account 123")],
		};
		normalizeAnthropicModelSelection(settings);
		expect(settings.anthropicModelSelection).toBe("claude-account-123");
		expect(
			isAnthropicCustomModelSelection({
				anthropicModel: "claude-account-123",
				anthropicModelSelection: "claude-account-123",
				anthropicAvailableModels: [modelInfo("claude-account-123", "Claude Account 123")],
			})
		).toBe(false);
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

describe("Anthropic model refresh", () => {
	it("merges refreshed Anthropic models with curated fallback labels", async () => {
		const refreshed = await refreshAnthropicModelOptions({
			listModels: async () => [
				modelInfo("claude-sonnet-4-6", "Claude Sonnet 4.6"),
				modelInfo("claude-account-123", "Claude Account 123"),
				modelInfo("claude-haiku-4-5", "Claude Haiku 4.5"),
			],
		});
		expect(refreshed.usedFallback).toBe(false);
		expect(refreshed.options).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "claude-sonnet-4-6",
					label: "Claude Sonnet 4.6",
				}),
				expect.objectContaining({
					id: "claude-account-123",
					label: "Claude Account 123",
				}),
			])
		);
		expect(
			buildAnthropicModelOptions(refreshed.availableModels).find(
				(model) => model.id === "claude-sonnet-4-6"
			)
		).toMatchObject({
			label: "Claude Sonnet 4.6",
			recommended: true,
		});
		expect(refreshed.message).toMatch(/account-specific model/i);
	});

	it("omits Anthropic models whose display names already exist in the curated catalog", () => {
		const options = buildAnthropicModelOptions([
			modelInfo("claude-sonnet-4-6-20260101", "Claude Sonnet 4.6"),
			modelInfo("claude-sonnet-4-6-20260202", "Claude Sonnet 4.6"),
		]);
		expect(options.filter((model) => model.label === "Claude Sonnet 4.6")).toHaveLength(1);
		expect(options.some((model) => model.id === "claude-sonnet-4-6-20260101")).toBe(false);
		expect(options.some((model) => model.id === "claude-sonnet-4-6-20260202")).toBe(false);
	});

	it("sorts discovered Anthropic models by family and newest version first", () => {
		const options = buildAnthropicModelOptions([
			modelInfo("claude-opus-4-5", "Claude Opus 4.5"),
			modelInfo("claude-sonnet-4", "Claude Sonnet 4"),
			modelInfo("claude-sonnet-4-5", "Claude Sonnet 4.5"),
			modelInfo("claude-opus-4-7", "Claude Opus 4.7"),
			modelInfo("claude-opus-4-1", "Claude Opus 4.1"),
		]);
		const discoveredLabels = options.slice(6).map((model) => model.label);
		expect(discoveredLabels).toEqual([
			"Claude Sonnet 4.5",
			"Claude Sonnet 4",
			"Claude Opus 4.7",
			"Claude Opus 4.5",
			"Claude Opus 4.1",
		]);
	});

	it("falls back to curated Anthropic models when refresh fails", async () => {
		const refreshed = await refreshAnthropicModelOptions({
			listModels: async () => {
				throw new Error("network down");
			},
		});
		expect(refreshed.usedFallback).toBe(true);
		expect(refreshed.options).toEqual(buildAnthropicModelOptions());
		expect(refreshed.message).toMatch(/curated fallback list/i);
	});

	it("preserves a saved custom Anthropic model when refresh fails", async () => {
		const refreshed = await refreshAnthropicModelOptions({
			listModels: async () => {
				throw new Error("403 authentication_error");
			},
		});
		const settings = {
			anthropicModel: "claude-unknown-xyz",
			anthropicAvailableModels: refreshed.availableModels,
		};
		normalizeAnthropicModelSelection(settings);
		expect(settings.anthropicModelSelection).toBe(ANTHROPIC_CUSTOM_MODEL_ID);
	});
});
