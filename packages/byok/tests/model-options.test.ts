import { describe, it, expect } from "vitest";
import {
	normalizeStringId,
	normalizeModelIds,
	normalizeOpenRouterModel,
	isModelOption,
	sortModelOptions,
	type ModelOption,
	type OpenRouterRawModel,
} from "../src";

describe("normalizeStringId", () => {
	it("normalizes a plain model ID from a string-only provider", () => {
		const opt = normalizeStringId("gpt-4o-mini", "openai");
		expect(opt).toEqual({
			id: "gpt-4o-mini",
			label: "gpt-4o-mini",
			provider: "openai",
			contextLength: null,
			pricing: null,
			supportedParameters: null,
			source: "openai",
		});
	});

	it("extracts provider prefix from slash-delimited IDs", () => {
		const opt = normalizeStringId("anthropic/claude-sonnet-4", "openrouter");
		expect(opt.provider).toBe("anthropic");
		expect(opt.source).toBe("openrouter");
		expect(opt.label).toBe("anthropic/claude-sonnet-4");
	});

	it("falls back to source when ID has no slash", () => {
		const opt = normalizeStringId("gemini-1.5-flash", "google");
		expect(opt.provider).toBe("google");
	});
});

describe("normalizeModelIds", () => {
	it("batch-normalizes an array of string IDs", () => {
		const result = normalizeModelIds(
			["gpt-4o-mini", "gpt-4o"],
			"openai"
		);
		expect(result).toHaveLength(2);
		expect(result[0].id).toBe("gpt-4o-mini");
		expect(result[1].id).toBe("gpt-4o");
		expect(result.every((o) => o.source === "openai")).toBe(true);
	});
});

describe("normalizeOpenRouterModel", () => {
	it("normalizes a full OpenRouter API model entry", () => {
		const raw: OpenRouterRawModel = {
			id: "anthropic/claude-sonnet-4",
			name: "Anthropic: Claude Sonnet 4",
			context_length: 200000,
			pricing: { prompt: "0.000003", completion: "0.000015" },
			supported_parameters: [
				"max_tokens",
				"temperature",
				"structured_outputs",
			],
		};
		const opt = normalizeOpenRouterModel(raw);
		expect(opt).toEqual({
			id: "anthropic/claude-sonnet-4",
			label: "Anthropic: Claude Sonnet 4",
			provider: "anthropic",
			contextLength: 200000,
			pricing: { prompt: 0.000003, completion: 0.000015 },
			supportedParameters: [
				"max_tokens",
				"temperature",
				"structured_outputs",
			],
			source: "openrouter",
		});
	});

	it("falls back to id as label when name is missing", () => {
		const opt = normalizeOpenRouterModel({ id: "openai/gpt-4o" });
		expect(opt.label).toBe("openai/gpt-4o");
		expect(opt.provider).toBe("openai");
	});

	it("handles missing pricing gracefully", () => {
		const opt = normalizeOpenRouterModel({
			id: "meta-llama/llama-3-70b",
			name: "Meta: Llama 3 70B",
		});
		expect(opt.pricing).toBeNull();
		expect(opt.contextLength).toBeNull();
		expect(opt.supportedParameters).toBeNull();
	});

	it("handles empty id gracefully", () => {
		const opt = normalizeOpenRouterModel({});
		expect(opt.id).toBe("");
		expect(opt.label).toBe("");
		expect(opt.provider).toBe("");
	});

	it("parses pricing strings to numbers", () => {
		const opt = normalizeOpenRouterModel({
			id: "test/model",
			pricing: { prompt: "0.0000005", completion: "0.000002" },
		});
		expect(opt.pricing).toEqual({
			prompt: 0.0000005,
			completion: 0.000002,
		});
	});
});

describe("isModelOption", () => {
	it("returns true for a valid ModelOption", () => {
		const opt = normalizeStringId("gpt-4o", "openai");
		expect(isModelOption(opt)).toBe(true);
	});

	it("returns false for a plain string", () => {
		expect(isModelOption("gpt-4o")).toBe(false);
	});

	it("returns false for null/undefined", () => {
		expect(isModelOption(null)).toBe(false);
		expect(isModelOption(undefined)).toBe(false);
	});

	it("returns false for an object missing required fields", () => {
		expect(isModelOption({ id: "x" })).toBe(false);
		expect(isModelOption({ source: "openai" })).toBe(false);
	});
});

describe("sortModelOptions", () => {
	function opt(id: string): ModelOption {
		return normalizeStringId(id, "openrouter");
	}

	it("sorts options by natural ID order", () => {
		const sorted = sortModelOptions([
			opt("openai/gpt-4o"),
			opt("anthropic/claude-sonnet-4"),
			opt("meta-llama/llama-3-70b"),
		]);
		expect(sorted.map((o) => o.id)).toEqual([
			"anthropic/claude-sonnet-4",
			"meta-llama/llama-3-70b",
			"openai/gpt-4o",
		]);
	});

	it("puts the current model first when specified", () => {
		const sorted = sortModelOptions(
			[
				opt("anthropic/claude-sonnet-4"),
				opt("openai/gpt-4o"),
				opt("meta-llama/llama-3-70b"),
			],
			"openai/gpt-4o"
		);
		expect(sorted[0].id).toBe("openai/gpt-4o");
		expect(sorted.map((o) => o.id)).toEqual([
			"openai/gpt-4o",
			"anthropic/claude-sonnet-4",
			"meta-llama/llama-3-70b",
		]);
	});

	it("does not modify the original array", () => {
		const original = [opt("b/z"), opt("a/y")];
		const sorted = sortModelOptions(original);
		expect(original[0].id).toBe("b/z");
		expect(sorted[0].id).toBe("a/y");
	});

	it("handles empty arrays", () => {
		expect(sortModelOptions([])).toEqual([]);
	});

	it("handles currentModelId not in the list", () => {
		const sorted = sortModelOptions(
			[opt("a/x"), opt("b/y")],
			"c/z"
		);
		expect(sorted.map((o) => o.id)).toEqual(["a/x", "b/y"]);
	});
});
