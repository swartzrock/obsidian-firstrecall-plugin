import { describe, expect, it } from "vitest";
import {
	isLargeContextModel,
	isLowCostModel,
	modelCompatibilityBadges,
	modelCompatibilityWarning,
	modelStructuredOutputSupport,
	sortByokModelOptions,
	normalizeStringId,
	type ModelOption,
} from "../src";

function opt(
	id: string,
	overrides: Partial<ModelOption> = {}
): ModelOption {
	return { ...normalizeStringId(id, "openrouter"), ...overrides };
}

describe("modelStructuredOutputSupport", () => {
	it("detects OpenRouter structured-output parameters", () => {
		expect(
			modelStructuredOutputSupport(
				opt("anthropic/claude-sonnet-4", {
					supportedParameters: ["max_tokens", "structured_outputs"],
				})
			)
		).toBe("supported");
		expect(
			modelStructuredOutputSupport(
				opt("openai/gpt-4o", {
					supportedParameters: ["response_format"],
				})
			)
		).toBe("supported");
	});

	it("distinguishes missing metadata from known unsupported metadata", () => {
		expect(modelStructuredOutputSupport(opt("custom/model"))).toBe("unknown");
		expect(
			modelStructuredOutputSupport(
				opt("legacy/model", { supportedParameters: ["temperature"] })
			)
		).toBe("unsupported");
	});
});

describe("modelCompatibilityBadges", () => {
	it("keeps badges concise for useful selection traits", () => {
		const badges = modelCompatibilityBadges(
			opt("anthropic/claude-sonnet-4", {
				label: "Anthropic: Claude Sonnet 4",
				contextLength: 200000,
				pricing: { prompt: 0.0000005, completion: 0.000002 },
				supportedParameters: ["structured_outputs"],
			})
		);
		expect(badges).toEqual([
			"Structured output",
			"Large context",
			"Low cost",
		]);
	});

	it("shows structured output without recommending every compatible model", () => {
		expect(
			modelCompatibilityBadges(
				opt("small/provider-model", {
					supportedParameters: ["response_format"],
				})
			)
		).toEqual(["Structured output"]);
	});
});

describe("modelCompatibilityWarning", () => {
	it("warns when a selected model lacks structured-output support", () => {
		expect(
			modelCompatibilityWarning(
				opt("legacy/model", { supportedParameters: ["temperature"] })
			)
		).toMatch(/does not advertise structured-output support/i);
	});

	it("warns for models without structured-output metadata", () => {
		expect(modelCompatibilityWarning(opt("custom/model"))).toMatch(
			/does not have structured-output metadata/i
		);
	});

	it("stays quiet for supported models", () => {
		expect(
			modelCompatibilityWarning(
				opt("openai/gpt-4o", {
					supportedParameters: ["response_format"],
				})
			)
		).toBe("");
	});
});

describe("sortByokModelOptions", () => {
	it("prefers structured-output models without hiding others", () => {
		const sorted = sortByokModelOptions([
			opt("legacy/model", { supportedParameters: ["temperature"] }),
			opt("small/structured", { supportedParameters: ["response_format"] }),
			opt("anthropic/claude-sonnet-4", {
				label: "Anthropic: Claude Sonnet 4",
				contextLength: 200000,
				supportedParameters: ["structured_outputs"],
			}),
		]);
		expect(sorted.map((option) => option.id)).toEqual([
			"anthropic/claude-sonnet-4",
			"small/structured",
			"legacy/model",
		]);
	});

	it("keeps the current model first even when it lacks compatibility traits", () => {
		const sorted = sortByokModelOptions(
			[
				opt("anthropic/claude-sonnet-4", {
					supportedParameters: ["structured_outputs"],
				}),
				opt("legacy/model", { supportedParameters: ["temperature"] }),
			],
			"legacy/model"
		);
		expect(sorted[0].id).toBe("legacy/model");
	});
});

describe("model compatibility predicates", () => {
	it("detects large-context and low-cost models", () => {
		const model = opt("openai/gpt-4o-mini", {
			contextLength: 128000,
			pricing: { prompt: 0.00000015, completion: 0.0000006 },
			supportedParameters: ["response_format"],
		});
		expect(isLargeContextModel(model)).toBe(true);
		expect(isLowCostModel(model)).toBe(true);
	});
});
