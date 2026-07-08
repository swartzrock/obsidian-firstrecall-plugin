import {
	cueDensityGuidance,
	keywordGuidance,
	questionStyleGuidance,
} from "./cue-generation";
import type { CueCraftCueBatchResult, CueCraftCueInput } from "./cue-provider";
import {
	CUE_CATEGORY_PROMPT_VALUES,
	CUE_CATEGORY_VALUES,
	validateCueBatch,
} from "./schemas";
import {
	SECTION_LENS_JSON_SCHEMA,
	SECTION_LENS_PROMPT,
} from "./review-artifact-prompts";

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
		confidence: { enum: ["high", "medium", "low"] },
		category: { enum: CUE_CATEGORY_VALUES },
		rationale: { type: "string" },
		sectionLens: SECTION_LENS_JSON_SCHEMA,
	},
	required: ["question", "keywords", "confidence", "sectionLens"],
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
	inputs: CueCraftCueInput[],
	presetGuidance: Record<string, string>
): string {
	const first = inputs[0];
	const preset =
		presetGuidance[first?.preset ?? ""] ?? presetGuidance.conceptual;
	const options = first?.options;
	const contextLine = first?.noteContext
		? `\nWhole-note context (for relevance only):\n${first.noteContext}\n`
		: "";
	const sections = inputs
		.map(
			(input, index) =>
				`Section ${index + 1}\n` +
				`Heading: ${input.heading || "(untitled)"}\n` +
				`Content:\n${input.content}\n`
		)
		.join("\n---\n");

	return (
		`You are a study assistant creating Cornell-style active-recall cues.\n` +
		`${preset}\n` +
		`${questionStyleGuidance(options?.questionStyle)}\n` +
		`${cueDensityGuidance(options?.cueDensity)}\n` +
		`${keywordGuidance(options?.generateKeywords ?? true)}\n` +
		`Return ONLY a JSON object with key "cues". ` +
		`"cues" must be an array with exactly ${inputs.length} objects, in the same order as the sections. ` +
		`Each object must have keys: "question" (string), ` +
		`"keywords" (array of 2 to 5 short strings), "confidence" ("high" | "medium" | "low"), ` +
		`optional "category" (${CUE_CATEGORY_PROMPT_VALUES}) when the section clearly fits one of those semantic families, ` +
		`optional "rationale" (short reason, only when confidence is "low"), ` +
		`and "sectionLens" (object). ${SECTION_LENS_PROMPT}\n` +
		contextLine +
		`\nSections:\n${sections}\n`
	);
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
