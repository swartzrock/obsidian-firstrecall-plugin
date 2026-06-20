import { describe, expect, it } from "vitest";
import {
	buildModelComboboxOptions,
	filterModelOptions,
	modelOptionSearchText,
} from "../src/model-combobox";
import { normalizeStringId, type ModelOption } from "../src/model-options";

function opt(
	id: string,
	overrides: Partial<ModelOption> = {}
): ModelOption {
	return { ...normalizeStringId(id, "openrouter"), ...overrides };
}

describe("buildModelComboboxOptions", () => {
	it("keeps the current custom model visible when it is not in fetched options", () => {
		const options = buildModelComboboxOptions({
			options: [opt("openai/gpt-4o"), opt("anthropic/claude-sonnet-4")],
			currentModelId: "custom-provider/private-model",
			source: "openrouter",
		});
		expect(options[0]).toMatchObject({
			id: "custom-provider/private-model",
			provider: "custom-provider",
		});
		expect(options.map((option) => option.id)).toContain("openai/gpt-4o");
	});

	it("preserves fetched metadata for the current model", () => {
		const options = buildModelComboboxOptions({
			options: [
				opt("openai/gpt-4o", {
					label: "OpenAI: GPT-4o",
					contextLength: 128000,
				}),
			],
			currentModelId: "openai/gpt-4o",
			source: "openrouter",
		});
		expect(options[0]).toMatchObject({
			id: "openai/gpt-4o",
			label: "OpenAI: GPT-4o",
			contextLength: 128000,
		});
	});

	it("does not create an empty custom option when no model is selected", () => {
		expect(
			buildModelComboboxOptions({
				options: [],
				currentModelId: "   ",
				source: "openai",
			})
		).toEqual([]);
	});
});

describe("filterModelOptions", () => {
	const options = [
		opt("anthropic/claude-sonnet-4", {
			label: "Anthropic: Claude Sonnet 4",
		}),
		opt("openai/gpt-4o", {
			label: "OpenAI: GPT-4o",
		}),
		opt("google/gemini-pro", {
			label: "Google: Gemini Pro",
		}),
	];

	it("matches by model ID, label, and provider", () => {
		expect(filterModelOptions(options, "gpt").map((o) => o.id)).toEqual([
			"openai/gpt-4o",
		]);
		expect(filterModelOptions(options, "sonnet").map((o) => o.id)).toEqual([
			"anthropic/claude-sonnet-4",
		]);
		expect(filterModelOptions(options, "google").map((o) => o.id)).toEqual([
			"google/gemini-pro",
		]);
	});

	it("can match badge text supplied by the caller", () => {
		const result = filterModelOptions(options, "structured", (option) =>
			option.id === "anthropic/claude-sonnet-4"
				? ["Structured output"]
				: []
		);
		expect(result.map((option) => option.id)).toEqual([
			"anthropic/claude-sonnet-4",
		]);
	});

	it("returns all options for an empty query", () => {
		expect(filterModelOptions(options, "  ")).toHaveLength(3);
	});
});

describe("modelOptionSearchText", () => {
	it("includes badge text for searchable metadata", () => {
		expect(
			modelOptionSearchText(opt("openai/gpt-4o"), ["Low cost"])
		).toContain("low cost");
	});
});
