import type { NoteCache } from "./cache";
import { cueEligibleSections, type Section } from "./parser";

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
	rationale: string | null;
	/** True when a usable question exists (no error). */
	hasCue: boolean;
	/** Generation error for this section, when it was attempted but failed. */
	error: string | null;
}

export interface CornellModel {
	rows: CornellRow[];
	summary: string | null;
	learningObjective: string | null;
}

export interface CornellTakeawayPresentation {
	label: string;
	takeaway: string | null;
	objective: string | null;
}

export const MAX_CORNELL_SUPPORT_TERMS = 3;

export interface CornellSupportPresentation {
	terms: string[];
}

export interface CornellAnswerPresentation {
	hidden: boolean;
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

	const rows: CornellRow[] = cueEligibleSections(currentSections).map((section) => {
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
			rationale: hasCue ? cue?.rationale ?? null : null,
			hasCue,
			error: hasCue ? null : cue?.error ?? null,
		};
	});

	return {
		rows,
		summary: cache.summary,
		learningObjective: cache.outline.learningObjective,
	};
}

/**
 * Present the cached summary fields as a study-oriented takeaway without
 * changing the underlying cache shape. Older multi-sentence summaries remain
 * readable; newer generations are asked to be shorter via provider prompts.
 */
export function buildCornellTakeawayPresentation(opts: {
	summary: string | null;
	learningObjective: string | null;
}): CornellTakeawayPresentation {
	const takeaway = opts.summary?.trim() || null;
	const objective = opts.learningObjective?.trim() || null;
	return {
		label: "Study takeaway",
		takeaway,
		objective,
	};
}

/**
 * The cache can keep the full keyword list for exports and compatibility, but
 * the Cornell cue rail should stay quiet. Show only the strongest few supports.
 */
export function buildCornellSupportTerms(
	keywords: string[],
	limit = MAX_CORNELL_SUPPORT_TERMS
): string[] {
	if (limit <= 0) return [];
	const seen = new Set<string>();
	const terms: string[] = [];
	for (const keyword of keywords) {
		const term = keyword.trim();
		if (!term) continue;
		const key = term.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		terms.push(term);
		if (terms.length === limit) break;
	}
	return terms;
}

export function buildCornellSupportPresentation(opts: {
	keywords: string[];
}): CornellSupportPresentation {
	return {
		terms: buildCornellSupportTerms(opts.keywords),
	};
}

export function buildCornellAnswerPresentation(opts: {
	sectionId: string;
	studyMode: boolean;
	revealAll: boolean;
	revealedSectionIds: ReadonlySet<string>;
}): CornellAnswerPresentation {
	const revealed = opts.revealAll || opts.revealedSectionIds.has(opts.sectionId);
	return {
		hidden: opts.studyMode && !revealed,
	};
}

/** Minimal view of a vault file for picking the Cornell target note. */
export interface CornellFileRef {
	path: string;
	extension: string;
}

/**
 * Choose which note the Cornell view should render, in priority order:
 *  1. the active Markdown note,
 *  2. the last note we showed (if it still exists),
 *  3. the most recently opened note with *usable* cues (questions, not just
 *     errors), so a note whose cache is entirely failed cues doesn't win,
 *  4. the most recently opened note that has any cache,
 *  5. failing that, the most recently opened Markdown note.
 *
 * This keeps the view populated after an Obsidian restart, when the restored
 * active leaf is the Cornell view itself and there is no active Markdown file.
 * Pure (no Obsidian/DOM) so it can be unit-tested.
 */
export function pickCornellFile(opts: {
	active: CornellFileRef | null;
	last: CornellFileRef | null;
	lastExists: boolean;
	recentMd: CornellFileRef[];
	hasCache: (path: string) => boolean;
	/** Optional: whether a note has at least one non-errored cue. */
	hasUsableCache?: (path: string) => boolean;
}): CornellFileRef | null {
	const { active, last, lastExists, recentMd, hasCache, hasUsableCache } = opts;
	if (active && active.extension === "md") return active;
	if (last && lastExists) return last;
	const isUsable = hasUsableCache ?? hasCache;
	let firstMd: CornellFileRef | null = null;
	let firstCached: CornellFileRef | null = null;
	for (const f of recentMd) {
		if (!firstMd) firstMd = f;
		if (!firstCached && hasCache(f.path)) firstCached = f;
		if (isUsable(f.path)) return f;
	}
	return firstCached ?? firstMd;
}

/** How many rows in the model are failed cues (attempted but errored). */
export function failedCueCount(model: CornellModel): number {
	return model.rows.filter((r) => r.error).length;
}
