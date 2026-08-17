import { describe, expect, it } from "vitest";
import {
	buildNoteBriefInstructionsTemplate,
	buildNoteBriefPrompt,
	FULL_NOTE_SOURCE_PLACEHOLDER,
	NOTE_BRIEF_PROMPT,
	NOTE_TITLE_PLACEHOLDER,
	SECTION_CUE_SOURCE_PLACEHOLDER,
} from "../src/study-material-instructions";

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
		expect(prompt.indexOf("Successful Section cues:")).toBeLessThan(
			prompt.indexOf("CUE_SOURCE_SENTINEL")
		);
		expect(prompt.indexOf("CUE_SOURCE_SENTINEL")).toBeLessThan(
			prompt.indexOf("Full note source:")
		);
		expect(prompt.indexOf("Full note source:")).toBeLessThan(
			prompt.indexOf("NOTE_SOURCE_SENTINEL")
		);
	});

	it("builds the inspector template with the production Note Brief composer", () => {
		const template = buildNoteBriefInstructionsTemplate();
		const runtime = buildNoteBriefPrompt({
			noteTitle: "Agents",
			fullText: "# Agents\nAgents use tools.",
			sections: [
				{
					heading: "Planning",
					question: "How do plans guide tool use?",
					keywords: ["plans", "tools"],
				},
			],
		});
		const sectionSource =
			"Section 1: Planning\nQuestion: How do plans guide tool use?\nTerms: plans, tools";

		expect(template).toContain(NOTE_TITLE_PLACEHOLDER);
		expect(template).toContain(FULL_NOTE_SOURCE_PLACEHOLDER);
		expect(template).toContain(SECTION_CUE_SOURCE_PLACEHOLDER);
		expect(
			template
				.replace(NOTE_TITLE_PLACEHOLDER, "Agents")
				.replace(SECTION_CUE_SOURCE_PLACEHOLDER, sectionSource)
				.replace(FULL_NOTE_SOURCE_PLACEHOLDER, "# Agents\nAgents use tools.")
		).toBe(runtime);
	});
});
