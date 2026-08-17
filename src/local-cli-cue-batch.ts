import { composeSectionCueBatchPrompt } from "./cue-instructions";
import { DEFAULT_QUESTION_TYPE } from "./cue-generation";
import type { CueCraftCueBatchResult, CueCraftCueInput } from "./cue-provider";
import { validateCueBatch } from "./schemas";
import { SECTION_LENS_JSON_SCHEMA } from "./review-artifact-prompts";

const CUE_BATCH_ITEM_SCHEMA = {
	type: "object",
	properties: {
		question: { type: "string" },
		keywords: {
			type: "array",
			items: { type: "string" },
			minItems: 2,
			maxItems: 5,
		},
		sectionLens: SECTION_LENS_JSON_SCHEMA,
	},
	required: ["question", "keywords", "sectionLens"],
	additionalProperties: false,
};

export function cueBatchJsonSchema(count: number): string {
	return JSON.stringify({
		type: "object",
		properties: {
			cues: {
				type: "array",
				items: CUE_BATCH_ITEM_SCHEMA,
				minItems: count,
				maxItems: count,
			},
		},
		required: ["cues"],
		additionalProperties: false,
	});
}

export function buildCueBatchPrompt(
	inputs: CueCraftCueInput[]
): string {
	const first = inputs[0];
	const sections = inputs
		.map(
			(input, index) =>
				`Section ${index + 1}\n` +
				`Heading: ${input.heading || "(untitled)"}\n` +
				`Content:\n${input.content}\n`
		)
		.join("\n---\n");

	return composeSectionCueBatchPrompt({
		questionType: first?.options?.questionType ?? DEFAULT_QUESTION_TYPE,
		sectionCount: inputs.length,
		sectionList: sections,
		noteContext: first?.noteContext ?? "",
	});
}

export interface ParsedCueBatch {
	results: CueCraftCueBatchResult[];
}

export function parseCueBatch(raw: string, expectedCount: number): ParsedCueBatch | string {
	const result = validateCueBatch(raw, expectedCount);
	if (!result.ok) return result.error;
	const results = result.value.map<CueCraftCueBatchResult>((item) =>
		item.value ? { cue: item.value } : { error: item.error ?? "Invalid cue." }
	);
	return {
		results,
	};
}
