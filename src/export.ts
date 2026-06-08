/**
 * Export generated cues for external study. Two pure formatters turn a note's
 * cached cues into:
 *   - a Markdown study sheet (human-readable, one Q + keywords per section), and
 *   - Anki-compatible TSV (`question<TAB>answer`), importable as Basic notes.
 * Both ignore sections that never produced a usable cue (no question, or an
 * error), so an export is always clean review material.
 */

import type { NoteCache } from "./cache";

export interface ExportCue {
	heading: string;
	question: string;
	keywords: string[];
}

/** Usable cues from a cache, in document order (skips empty/errored sections). */
export function selectExportableCues(cache: NoteCache): ExportCue[] {
	return cache.sections
		.filter((s) => s.question && !s.error)
		.map((s) => ({
			heading: s.heading,
			question: s.question as string,
			keywords: s.keywords ?? [],
		}));
}

/** A Markdown study sheet: a heading + question + keyword line per cue. */
export function cuesToMarkdown(noteTitle: string, cues: ExportCue[]): string {
	const lines: string[] = [`# Study cues — ${noteTitle}`, ""];
	if (cues.length === 0) {
		lines.push("_No generated cues to export yet._", "");
		return lines.join("\n");
	}
	for (const cue of cues) {
		if (cue.heading) lines.push(`## ${cue.heading}`);
		lines.push(`**Q:** ${cue.question}`);
		if (cue.keywords.length) {
			lines.push("", `_Keywords:_ ${cue.keywords.join(" · ")}`);
		}
		lines.push("");
	}
	return lines.join("\n");
}

/** Collapse tabs/newlines so a value stays inside one TSV field. */
function tsvField(value: string): string {
	return value.replace(/[\t\r\n]+/g, " ").trim();
}

/**
 * Anki TSV: `question<TAB>answer`, one note per line. The answer is the
 * section's keywords (falling back to the heading) so the front is the cue and
 * the back is what to recall. Import into Anki as a Basic (front/back) note type.
 */
export function cuesToAnki(cues: ExportCue[]): string {
	return cues
		.map((cue) => {
			const back = cue.keywords.length
				? cue.keywords.join(" · ")
				: cue.heading;
			return `${tsvField(cue.question)}\t${tsvField(back)}`;
		})
		.join("\n");
}
