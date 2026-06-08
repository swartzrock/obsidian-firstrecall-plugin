/**
 * Reading-mode (preview) cue support. Obsidian renders reading view through
 * Markdown post-processors that hand us one rendered block at a time, so we
 * resolve the cached cues to current document lines (reusing the same
 * {@link buildCueLineData} logic as the editor) and key them by heading line.
 * The post-processor then looks up a heading element's source line and inserts
 * the matching cue beneath it. This module holds the pure mapping so it can be
 * unit-tested without a DOM.
 */

import { buildCueLineData, type CueLineData } from "./cue-extension";
import { parseSections } from "./parser";
import type { NoteCache } from "./cache";

/**
 * Resolve a note's cached cues against its current Markdown and index them by
 * 1-based heading line. Sections without a heading (the intro/whole-note
 * section, line 1) have no heading element to attach to in reading mode, so
 * callers simply won't find a heading at that line.
 */
export function buildReadingCueMap(
	cache: NoteCache,
	markdown: string
): Map<number, CueLineData> {
	const map = new Map<number, CueLineData>();
	for (const cue of buildCueLineData(cache, parseSections(markdown))) {
		// First cue wins for a given line; cues are already top-to-bottom.
		if (!map.has(cue.line)) map.set(cue.line, cue);
	}
	return map;
}
