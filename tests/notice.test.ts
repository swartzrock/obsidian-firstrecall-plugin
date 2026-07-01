import { describe, expect, it } from "vitest";
import { formatAnthropicUnavailableModelMessage } from "@cuecraft/byok";
import { formatCueCraftNotice } from "../src/notice";

describe("formatCueCraftNotice", () => {
	it("adds the CueCraft prefix once", () => {
		expect(formatCueCraftNotice("Connected to Claude CLI.")).toBe(
			"CueCraft: Connected to Claude CLI."
		);
		expect(
			formatCueCraftNotice(
				"CueCraft: claude was not found. Check the command path in settings."
			)
		).toBe("CueCraft: claude was not found. Check the command path in settings.");
		expect(
			formatCueCraftNotice(
				formatAnthropicUnavailableModelMessage("claude-unknown-xyz")
			)
		).toBe(
			"CueCraft: This key cannot access Custom model ID (claude-unknown-xyz). Pick another model or check your Anthropic account."
		);
	});
});
