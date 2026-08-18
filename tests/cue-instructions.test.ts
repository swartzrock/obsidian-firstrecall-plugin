import { describe, expect, it } from "vitest";
import { QUESTION_TYPES } from "../src/cue-generation";
import {
	buildSectionCueInstructionsTemplate,
	buildSectionCuePrompt,
	DEFAULT_CUE_INSTRUCTIONS,
	SECTION_CONTENT_PLACEHOLDER,
	SECTION_HEADING_PLACEHOLDER,
	WHOLE_NOTE_CONTEXT_PLACEHOLDER,
} from "../src/cue-instructions";

describe("section study card instructions", () => {
	it("builds an inspectable template with the production single-section composer", () => {
		const template = buildSectionCueInstructionsTemplate("exam-practice", "single");
		const runtime = buildSectionCuePrompt({
			heading: "Agents",
			content: "Agents plan and use tools.",
			noteContext: "# Agents\nAgents plan and use tools.",
			options: { questionType: "exam-practice" },
		});

		expect(template).toContain(DEFAULT_CUE_INSTRUCTIONS);
		expect(template).toContain(SECTION_HEADING_PLACEHOLDER);
		expect(template).toContain(SECTION_CONTENT_PLACEHOLDER);
		expect(template).toContain(WHOLE_NOTE_CONTEXT_PLACEHOLDER);
		expect(
			template
				.replace(SECTION_HEADING_PLACEHOLDER, "Agents")
				.replace(SECTION_CONTENT_PLACEHOLDER, "Agents plan and use tools.")
				.replace(
					WHOLE_NOTE_CONTEXT_PLACEHOLDER,
					"# Agents\nAgents plan and use tools."
				)
		).toBe(runtime);
	});

	it.each(QUESTION_TYPES)("uses one coherent $label instruction only for the recall question", (type) => {
		const prompt = buildSectionCueInstructionsTemplate(type.id, "single");
		const questionLine = prompt
			.split("\n")
			.find((line) => line.startsWith("Recall question:"));

		expect(questionLine).toContain(type.guidance);
		for (const other of QUESTION_TYPES) {
			if (other.id !== type.id) expect(prompt).not.toContain(other.guidance);
		}
		expect(prompt).toContain("Summary:");
		expect(prompt).toContain("Key terms:");
		expect(prompt).not.toMatch(/preset|density|question style/i);
	});

	it.each(["single", "batch"] as const)(
		"lets the %s route abstain instead of inventing unsupported details",
		(route) => {
			const prompt = buildSectionCueInstructionsTemplate("exam-practice", route);

			expect(prompt).toContain('{"insufficientSource":true}');
			expect(prompt).toContain(
				route === "single"
					? 'Return ONLY either {"insufficientSource":true} or a JSON object'
					: 'Each array entry must be either {"insufficientSource":true} or an object'
			);
			expect(prompt).toContain(
				"Do not infer facts from headings, filenames, links, image markup, or layout metadata."
			);
		}
	);
});
