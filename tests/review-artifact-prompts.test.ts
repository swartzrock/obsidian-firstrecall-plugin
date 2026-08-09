import { describe, expect, it } from "vitest";
import {
	buildNoteBriefPrompt,
	NOTE_BRIEF_PROMPT,
} from "../src/review-artifact-prompts";

describe("note brief prompt", () => {
	it("keeps the overview, three-card contract, cues, and note source in the app-owned prompt", () => {
		expect(NOTE_BRIEF_PROMPT).toContain("exactly 2 concise sentences");
		expect(NOTE_BRIEF_PROMPT).toContain('"whatMatters"');
		expect(NOTE_BRIEF_PROMPT).toContain('"reviewFirst"');
		expect(NOTE_BRIEF_PROMPT).toContain('"sayItBack"');
		expect(NOTE_BRIEF_PROMPT).toContain(
			'never use or begin with the category labels "Core idea", "Review first", or "Self-test"'
		);
		expect(NOTE_BRIEF_PROMPT).toContain(
			'Make the "sayItBack" title the recall question itself'
		);
		const prompt = buildNoteBriefPrompt({
			noteTitle: "Agents",
			fullText: "# Agents\nNOTE_SOURCE_SENTINEL: Agents use tools.",
			sections: [
				{
					heading: "Agents",
					question: "CUE_SOURCE_SENTINEL: How do agents use tools?",
					keywords: ["agents", "tools"],
				},
			],
		});
		expect(prompt).toContain("exactly 2 concise sentences");
		expect(prompt).toContain(
			"CUE_SOURCE_SENTINEL: How do agents use tools?"
		);
		expect(prompt).toContain(
			"NOTE_SOURCE_SENTINEL: Agents use tools."
		);
		expect(prompt.indexOf("Generated section cues:")).toBeLessThan(
			prompt.indexOf("CUE_SOURCE_SENTINEL")
		);
		expect(prompt.indexOf("CUE_SOURCE_SENTINEL")).toBeLessThan(
			prompt.indexOf("Note text:")
		);
		expect(prompt.indexOf("Note text:")).toBeLessThan(
			prompt.indexOf("NOTE_SOURCE_SENTINEL")
		);
	});
});
