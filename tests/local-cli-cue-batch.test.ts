import { describe, expect, it } from "vitest";
import {
	buildCueBatchPrompt,
	cueBatchJsonSchema,
} from "../src/local-cli-cue-batch";

describe("local CLI cue batch prompt", () => {
	it("describes optional semantic cue categories", () => {
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

		expect(prompt).toContain('"category"');
		expect(prompt).toContain("sequences");
		expect(prompt).toContain("linkedlists");
		expect(prompt).toContain("stacks");
		expect(prompt).toContain("intervals");
	});

	it("allows category values in the JSON schema", () => {
		const schema = JSON.parse(cueBatchJsonSchema(1));
		expect(schema.properties.cues.items.properties.category.enum).toEqual([
			"sequences",
			"linkedlists",
			"stacks",
			"intervals",
		]);
	});
});
