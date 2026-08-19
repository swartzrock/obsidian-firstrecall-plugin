import { describe, expect, it } from "vitest";
import { formatAnthropicUnavailableModelMessage } from "../src/anthropic-model-options";
import { formatFirstRecallNotice } from "../src/notice";

describe("formatFirstRecallNotice", () => {
	it("adds the FirstRecall prefix once", () => {
		expect(formatFirstRecallNotice("Connected to Claude CLI.")).toBe(
			"FirstRecall: Connected to Claude CLI."
		);
		expect(
			formatFirstRecallNotice(
				"FirstRecall: claude was not found. Check the command path in settings."
			)
		).toBe("FirstRecall: claude was not found. Check the command path in settings.");
		expect(
			formatFirstRecallNotice(
				formatAnthropicUnavailableModelMessage("claude-unknown-xyz")
			)
		).toBe(
			"FirstRecall: This key cannot access Custom model ID (claude-unknown-xyz). Pick another model or check your Anthropic account."
		);
	});
});
