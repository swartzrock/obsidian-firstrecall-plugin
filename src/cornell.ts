import type { NoteCache } from "./cache";
import type { Section } from "./parser";

export type Confidence = "high" | "medium" | "low";

/**
 * One section as rendered in the Cornell view: the live note body on the right,
 * and (when available) its cached cue on the left.
 */
export interface CornellRow {
	id: string;
	level: number;
	/** Heading text; empty for the intro section. */
	heading: string;
	/** Live section body from the current note. */
	content: string;
	/** Cue question, or null when the section has no usable cue. */
	question: string | null;
	keywords: string[];
	confidence: Confidence | null;
	/** True when a usable question exists (no error). */
	hasCue: boolean;
}

export interface CornellModel {
	rows: CornellRow[];
	summary: string | null;
	learningObjective: string | null;
}

/**
 * Join a note's cached cues to its freshly parsed sections to produce the
 * Cornell layout model. The notes column follows the *current* document
 * (order + body), while each row's cue is matched from the cache by stable id,
 * so cues stay attached to the right section even after edits elsewhere.
 * Pure (no Obsidian/DOM) so it can be unit-tested.
 */
export function buildCornellModel(
	cache: NoteCache,
	currentSections: Section[]
): CornellModel {
	const cueById = new Map<string, NoteCache["sections"][number]>();
	for (const sec of cache.sections) cueById.set(sec.id, sec);

	const rows: CornellRow[] = currentSections.map((section) => {
		const cue = cueById.get(section.id);
		const hasCue = Boolean(cue && !cue.error && cue.question);
		return {
			id: section.id,
			level: section.level,
			heading: section.heading,
			content: section.content,
			question: hasCue ? (cue?.question ?? null) : null,
			keywords: hasCue ? cue?.keywords ?? [] : [],
			confidence: hasCue ? cue?.confidence ?? null : null,
			hasCue,
		};
	});

	return {
		rows,
		summary: cache.summary,
		learningObjective: cache.outline.learningObjective,
	};
}
