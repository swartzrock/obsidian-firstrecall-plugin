import { describe, it, expect } from "vitest";
import {
	ANTHROPIC_CUSTOM_MODEL_ID,
	isAnthropicCustomModelSelection,
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
