import { describe, expect, it } from "vitest";
import { resolveModelRefreshDescription } from "../src/model-refresh";

describe("resolveModelRefreshDescription", () => {
	it("returns the default description when refresh message is empty", () => {
		expect(
			resolveModelRefreshDescription(
				"",
				"Fetch OpenRouter's available model IDs for this account."
			)
		).toBe("Fetch OpenRouter's available model IDs for this account.");
	});

	it("returns the default description when refresh message is whitespace", () => {
		expect(resolveModelRefreshDescription("   ", "Fetch models.")).toBe(
			"Fetch models."
		);
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
