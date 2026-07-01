/**
 * Reading-mode (preview) cue support. Obsidian renders reading view through
 * Markdown post-processors that hand us one rendered block at a time, so we
 * resolve the cached cues to current document lines (reusing the same
 * {@link buildCueLineData} logic as the editor) and key them by heading line.
 * The post-processor then looks up a heading element's source line and inserts
 * the matching cue beneath it. This module holds the pure mapping so it can be
 * unit-tested without a DOM.
 */

import {
	buildCueLineData,
	type CueLineData,
	type CueLineDataOptions,
} from "./cue-extension";
import { parseSections } from "./parser";
import type { NoteCache } from "./cache";

export const READING_MODE_DISPLAY_OPTIONS = [
	{
		id: "inline-cues",
		label: "Inline cues",
		description: "Show cached cues beneath their headings in Reading mode.",
	},
	{
		id: "review-button",
		label: "Review button",
		description: "Show one compact Review in Cornell button near the first cue.",
	},
] as const;

export type ReadingModeDisplay = typeof READING_MODE_DISPLAY_OPTIONS[number]["id"];

export const DEFAULT_READING_MODE_DISPLAY: ReadingModeDisplay = "review-button";

export interface ReadingReviewAffordanceState {
	visible: boolean;
	action: "review-this-note" | null;
}

export interface ReadingModeDisplayState {
	showInlineCues: boolean;
	showReviewButton: boolean;
}

export interface ReadingNoteBriefDisplayState {
	showNoteBrief: boolean;
}

/**
 * Resolve a note's cached cues against its current Markdown and index them by
 * 1-based heading line. Sections without a heading (the intro/whole-note
 * section, line 1) have no heading element to attach to in reading mode, so
 * callers simply won't find a heading at that line.
 */
export function buildReadingCueMap(
	cache: NoteCache,
	markdown: string,
	options: CueLineDataOptions = {}
): Map<number, CueLineData> {
	const map = new Map<number, CueLineData>();
	for (const cue of buildCueLineData(cache, parseSections(markdown), options)) {
		// First cue wins for a given line; cues are already top-to-bottom.
		if (!map.has(cue.line)) map.set(cue.line, cue);
	}
	return map;
}

export function isReadingModeDisplay(value: unknown): value is ReadingModeDisplay {
	return READING_MODE_DISPLAY_OPTIONS.some((option) => option.id === value);
}

export function readingModeDisplayState(opts: {
	display: ReadingModeDisplay;
	renderInReadingMode: boolean;
	hasCache: boolean;
	hasUsableCues: boolean;
	isHidden: boolean;
}): ReadingModeDisplayState {
	if (!opts.renderInReadingMode || !opts.hasCache || opts.isHidden) {
		return {
			showInlineCues: false,
			showReviewButton: false,
		};
	}
	return {
		showInlineCues: opts.display === "inline-cues",
		showReviewButton: opts.display === "review-button" && opts.hasUsableCues,
	};
}

export function readingNoteBriefDisplayState(opts: {
	renderInReadingMode: boolean;
	showNoteBrief: boolean;
	hasCache: boolean;
	hasNoteBrief: boolean;
	isHidden: boolean;
}): ReadingNoteBriefDisplayState {
	return {
		showNoteBrief:
			opts.renderInReadingMode &&
			opts.showNoteBrief &&
			opts.hasCache &&
			opts.hasNoteBrief &&
			!opts.isHidden,
	};
}

/**
 * The Reading-mode Cornell entry point is shown only when a note can actually
 * be reviewed: the cue layer is visible and at least one usable cue exists.
 * The action remains the existing review flow so Cornell Study Mode behavior
 * stays centralized in one place.
 */
export function readingReviewAffordanceState(opts: {
	hasUsableCues: boolean;
	isHidden: boolean;
}): ReadingReviewAffordanceState {
	if (opts.isHidden || !opts.hasUsableCues) {
		return { visible: false, action: null };
	}
	return { visible: true, action: "review-this-note" };
}
