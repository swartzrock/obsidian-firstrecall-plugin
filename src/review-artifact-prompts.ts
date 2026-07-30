import type { CueCraftNoteBriefInput } from "./cue-provider";

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

const NOTE_BRIEF_CARD_JSON_SCHEMA = {
	type: "object",
	properties: {
		title: { type: "string" },
		detail: { type: "string" },
	},
	required: ["title", "detail"],
	additionalProperties: false,
} as const;

export const NOTE_BRIEF_JSON_SCHEMA = {
	type: "object",
	properties: {
		overview: { type: "string" },
		whatMatters: NOTE_BRIEF_CARD_JSON_SCHEMA,
		reviewFirst: NOTE_BRIEF_CARD_JSON_SCHEMA,
		sayItBack: NOTE_BRIEF_CARD_JSON_SCHEMA,
	},
	required: ["overview", "whatMatters", "reviewFirst", "sayItBack"],
	additionalProperties: false,
} as const;

export const NOTE_BRIEF_PROMPT =
	`Return ONLY a JSON object with "overview" (exactly 2 concise sentences), ` +
	`"whatMatters" (title/detail card for the central claim), ` +
	`"reviewFirst" (title/detail card naming the section or idea to review first), and ` +
	`"sayItBack" (title/detail card phrased as a self-test prompt). ` +
	`Card titles must name specific note content; never use or begin with the category labels ` +
	`"Core idea", "Review first", or "Self-test". Make the "sayItBack" title the recall question itself.`;

export function buildNoteBriefPrompt(input: CueCraftNoteBriefInput): string {
	const sections = input.sections
		.map((section, index) => {
			const keywords = section.keywords.length
				? section.keywords.join(", ")
				: "none";
			return (
				`Section ${index + 1}: ${section.heading || "(untitled)"}\n` +
				`Cue: ${section.question}\n` +
				`Keywords: ${keywords}`
			);
		})
		.join("\n---\n");

	return (
		`Create an AI-native Note Brief that helps a reader review and retain this note.\n` +
		`Prefer concrete claims, memorable language, and active recall over generic summary.\n` +
		`${NOTE_BRIEF_PROMPT}\n` +
		`\nNote title: ${input.noteTitle || "(untitled)"}\n` +
		`\nGenerated section cues:\n${sections}\n` +
		`\nNote text:\n${input.fullText}\n`
	);
}
