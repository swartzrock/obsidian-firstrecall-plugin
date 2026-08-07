import { describe, expect, it } from "vitest";
import {
	DEFAULT_SUMMARY_INSTRUCTIONS,
	normalizeSummaryInstructionsOverride,
	resolveSummaryInstructions,
} from "../src/summary-instructions";

describe("summary instructions", () => {
	it("uses the current built-in instructions when no customization is stored", () => {
		expect(resolveSummaryInstructions(undefined)).toBe(
			DEFAULT_SUMMARY_INSTRUCTIONS
		);
		expect(resolveSummaryInstructions("")).toBe(DEFAULT_SUMMARY_INSTRUCTIONS);
		expect(resolveSummaryInstructions("  \n  ")).toBe(
			DEFAULT_SUMMARY_INSTRUCTIONS
		);
	});

	it("preserves a stored customization exactly", () => {
		const customization = "  Focus on causal relationships.\nKeep this spacing.  ";

		expect(resolveSummaryInstructions(customization)).toBe(customization);
	});

	it("normalizes invalid persisted overrides to the unset state", () => {
		expect(normalizeSummaryInstructionsOverride(undefined)).toBe("");
		expect(normalizeSummaryInstructionsOverride(42)).toBe("");
		expect(normalizeSummaryInstructionsOverride("Custom")).toBe("Custom");
	});
});
