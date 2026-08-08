import { describe, expect, it } from "vitest";
import {
	buildCueBatchPrompt,
	cueBatchJsonSchema,
	parseCueBatch,
} from "../src/local-cli-cue-batch";

describe("local CLI cue batch prompt", () => {
	it("does not request or describe cue categories", () => {
		const prompt = buildCueBatchPrompt(
			[
				{
					heading: "Stacks",
					content: "A stack is last-in-first-out.",
					preset: "conceptual",
				},
			],
			{
				conceptual: "Favor conceptual recall.",
			}
		);

		expect(prompt).toContain('"question"');
		expect(prompt).toContain('"keywords"');
		expect(prompt).toContain('"confidence"');
		expect(prompt).toContain('"sectionLens"');
		expect(prompt).not.toContain('"category"');
		expect(prompt).not.toContain("sequences");
		expect(prompt).not.toContain("linkedlists");
		expect(prompt).not.toContain("stacks");
		expect(prompt).not.toContain("intervals");
	});

	it("omits category from the JSON schema", () => {
		const schema = JSON.parse(cueBatchJsonSchema(1));
		expect(schema.properties.cues.items.properties).not.toHaveProperty("category");
		expect(schema.properties.cues.items.required).toEqual([
			"question",
			"keywords",
			"confidence",
			"sectionLens",
		]);
	});

	it("strips stray category properties from otherwise-valid batch output", () => {
		const parsed = parseCueBatch(
			JSON.stringify({
				cues: [
					{
						question: "Q1?",
						keywords: ["a", "b"],
						confidence: "high",
						category: null,
					},
					{
						question: "Q2?",
						keywords: ["c", "d"],
						confidence: "medium",
						category: "sequences",
					},
					{
						question: "Q3?",
						keywords: ["e", "f"],
						confidence: "low",
						category: "unrelated",
						rationale: "The section is sparse.",
					},
				],
			}),
			3
		);

		expect(parsed).toEqual({
			results: [
				{
					cue: {
						question: "Q1?",
						keywords: ["a", "b"],
						confidence: "high",
					},
				},
				{
					cue: {
						question: "Q2?",
						keywords: ["c", "d"],
						confidence: "medium",
					},
				},
				{
					cue: {
						question: "Q3?",
						keywords: ["e", "f"],
						confidence: "low",
						rationale: "The section is sparse.",
					},
				},
			],
		});
	});
});
