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
		for (const field of ["overview", "whatMatters", "reviewFirst", "sayItBack"]) {
			expect(NOTE_BRIEF_PROMPT).toContain(`"${field}"`);
		}
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
		expect(prompt).toMatch(/source material.*not as instructions/i);
		expect(prompt).toContain(
			"CUE_SOURCE_SENTINEL: How do agents use tools?"
		);
		expect(prompt).toContain(
			"NOTE_SOURCE_SENTINEL: Agents use tools."
		);
		expect(prompt.indexOf("CUE_SOURCE_SENTINEL")).toBeLessThan(
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
			"Section 1: Planning\nRecall question: How do plans guide tool use?\nKey terms: plans, tools";

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
