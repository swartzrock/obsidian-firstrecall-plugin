import { DEFAULT_NOTE_BRIEF_INSTRUCTIONS } from "./note-brief-instructions";
import type { CueCraftNoteBriefInput } from "./cue-provider";

export const NOTE_TITLE_PLACEHOLDER = "{{note_title}}";
export const FULL_NOTE_SOURCE_PLACEHOLDER = "{{full_note_source}}";
export const SECTION_CUE_SOURCE_PLACEHOLDER = "{{successful_section_cues}}";

export const SUMMARY_PROMPT =
	`Also include "summary": an object with ` +
	`"takeaway" (one short sentence summarizing the section's most important idea), ` +
	`"keyPhrase" (the most important phrase or term to notice), and ` +
	`"explanation" (one short sentence explaining why that phrase matters for recall).`;

export const SUMMARY_JSON_SCHEMA = {
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

function formatNoteBriefSectionSource(input: CueCraftNoteBriefInput): string {
	return input.sections
		.map((section, index) => {
			const terms = section.keywords.length
				? section.keywords.join(", ")
				: "none";
			return (
				`Section ${index + 1}: ${section.heading || "(untitled)"}\n` +
				`Recall question: ${section.question}\n` +
				`Key terms: ${terms}`
			);
		})
		.join("\n---\n");
}

function composeNoteBriefPrompt(source: {
	noteTitle: string;
	fullText: string;
	sectionCues: string;
}): string {
	return (
		`${DEFAULT_NOTE_BRIEF_INSTRUCTIONS}\n\n` +
		`Create a Note Brief that helps a reader review and retain this note.\n` +
		`Prefer concrete claims, memorable language, and active recall over generic summary.\n` +
		`${NOTE_BRIEF_PROMPT}\n` +
		`\nNote title: ${source.noteTitle}\n` +
		`\nSuccessful section study cards:\n${source.sectionCues}\n` +
		`\nFull note source:\n${source.fullText}\n`
	);
}

/** Build the exact CueCraft-owned initial Note Brief prompt. */
export function buildNoteBriefPrompt(input: CueCraftNoteBriefInput): string {
	return composeNoteBriefPrompt({
		noteTitle: input.noteTitle || "(untitled)",
		fullText: input.fullText,
		sectionCues: formatNoteBriefSectionSource(input),
	});
}

/** Build the read-only Advanced template without reading an active note. */
export function buildNoteBriefInstructionsTemplate(): string {
	return composeNoteBriefPrompt({
		noteTitle: NOTE_TITLE_PLACEHOLDER,
		fullText: FULL_NOTE_SOURCE_PLACEHOLDER,
		sectionCues: SECTION_CUE_SOURCE_PLACEHOLDER,
	});
}
