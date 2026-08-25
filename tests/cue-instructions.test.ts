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
import { SUMMARY_JSON_SCHEMA } from "../src/study-material-instructions";

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
		expect(template).toContain('"summary"');
		expect(template).toContain("Otherwise, return only valid JSON with this shape:");
		expect(template).toContain(
			"Use the whole-note context and section heading only to judge relevance."
		);
		expect(template).toContain(
			"Replace every angle-bracketed placeholder with section-grounded content. Include 2 to 5 keywords."
		);
		expect(template).toContain(
			'"keywords": ["<evidence term 1>", "<evidence term 2>"]'
		);
		expect(template).toContain(
			"Do not include markdown, commentary, a separate answer, or additional fields."
		);
		expect(template).not.toContain("Also include");
		expect(template).not.toContain(
			"Create one section study card with these components:"
		);
		expect(template).not.toContain('"takeaway"');
		expect(template).not.toContain('"keyPhrase"');
		expect(template).not.toContain('"explanation"');
		expect(SUMMARY_JSON_SCHEMA).toEqual({ type: "string" });
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
			.find((line) => line.trimStart().startsWith('"question":'));

		expect(questionLine).toContain(type.guidance);
		for (const other of QUESTION_TYPES) {
			if (other.id !== type.id) expect(prompt).not.toContain(other.guidance);
		}
		expect(prompt.indexOf('"summary"')).toBeLessThan(
			prompt.indexOf('"question"')
		);
		expect(prompt.indexOf('"question"')).toBeLessThan(
			prompt.indexOf('"keywords"')
		);
		expect(prompt).not.toMatch(/preset|density|question style/i);
	});

	it.each(["single", "batch"] as const)(
		"lets the %s route abstain instead of inventing unsupported details",
		(route) => {
			const prompt = buildSectionCueInstructionsTemplate("exam-practice", route);

			expect(prompt).toContain('{"insufficientSource":true}');
			expect(prompt).toContain("lacks enough factual content for a faithful card");
			expect(prompt).toMatch(/return only valid JSON/i);
			expect(prompt).toContain(
				"Do not use headings, filenames, links, image markup, or layout metadata as evidence."
			);
			expect(prompt).not.toContain("Also include");
		}
	);

	it("defines the batch wrapper and entry count explicitly", () => {
		const prompt = buildSectionCueInstructionsTemplate("exam-practice", "batch");

		expect(prompt).toContain(
			'Return only valid JSON with a "cues" array containing exactly {{section_count}} entries in input order.'
		);
		expect(prompt).toContain(
			'"keywords": ["<evidence term 1>", "<evidence term 2>"]'
		);
		expect(prompt).toContain(
			"Replace every angle-bracketed placeholder with section-grounded content. Include 2 to 5 keywords."
		);
		expect(prompt).toContain(
			"Do not include markdown, commentary, a separate answer, or additional fields."
		);
	});
});
