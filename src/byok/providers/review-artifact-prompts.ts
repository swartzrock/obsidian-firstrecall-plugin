export const SECTION_LENS_PROMPT =
	`Also include "sectionLens": an object with ` +
	`"takeaway" (one short sentence summarizing the section's most important idea), ` +
	`"keyPhrase" (the most important phrase or term to notice), and ` +
	`"explanation" (one short sentence explaining why that phrase matters for recall).`;

export const SECTION_LENS_JSON_SCHEMA = {
	type: "object",
	properties: {
		takeaway: { type: "string" },
		keyPhrase: { type: "string" },
		explanation: { type: "string" },
	},
	required: ["takeaway", "keyPhrase", "explanation"],
	additionalProperties: false,
} as const;
