import { describe, expect, it, vi } from "vitest";
import {
	buildNoteCache,
	reconcileCacheSections,
	type NoteCache,
} from "../src/cache";
import { parseSections } from "../src/parser";
import {
	StudyMaterialStore,
	cacheContentRevision,
	classifyStudyMaterial,
	createCurrentMaintenanceState,
	createMissingMaintenanceState,
	noteSourceRevision,
	normalizeMaintenanceStateMap,
	reconcileTerminalStudyMaterial,
	reduceMaintenanceState,
	type ComponentSet,
} from "../src/study-material-state";

const MARKDOWN = "# Alpha\none\n## Beta\ntwo";
const NOTE_BRIEF = {
	overview: "Alpha and Beta.",
	whatMatters: { title: "Both", detail: "They work together." },
	reviewFirst: { title: "Alpha", detail: "Start here." },
	sayItBack: { title: "How?", detail: "Explain both." },
};

function cacheFor(markdown = MARKDOWN): NoteCache {
	const sections = parseSections(markdown).filter(
		(section) => section.heading && section.content
	);
	return buildNoteCache({
		result: {
			sections: sections.map((section) => ({
				...section,
				keywords: [section.heading],
				question: `Question: ${section.heading}`,
				summary: null,
				error: null,
			})),
			noteBrief: NOTE_BRIEF,
			canceled: false,
		},
		provider: "openai",
		model: "gpt-5-mini",
		preset: "conceptual",
		generationMode: "whole-note-context",
		noteModifiedAt: 1,
		generatedAt: "2026-08-18T00:00:00.000Z",
	});
}

function components(
	noteBrief: boolean,
	sectionIds: readonly string[] = []
): ComponentSet {
	return { noteBrief, sectionIds: [...sectionIds] };
}

describe("source-derived component freshness", () => {
	it("classifies a matching Note Brief and every matching card as current", () => {
		const cache = cacheFor();
		const state = createCurrentMaintenanceState("Note", MARKDOWN, cache);
		const result = classifyStudyMaterial({
			noteTitle: "Note",
			markdown: MARKDOWN,
			currentSections: parseSections(MARKDOWN),
			cache,
			state,
		});

		expect(result.freshness).toBe("current");
		expect(result.noteBrief).toBe("current");
		expect(result.sections.map((section) => section.freshness)).toEqual([
			"current",
			"current",
		]);
	});

	it("marks only an edited card and the Note Brief outdated", () => {
		const cache = cacheFor();
		const state = createCurrentMaintenanceState("Note", MARKDOWN, cache);
		const edited = "# Alpha\none edited\n## Beta\ntwo";
		const result = classifyStudyMaterial({
			noteTitle: "Note",
			markdown: edited,
			currentSections: parseSections(edited),
			cache,
			state,
		});

		expect(result.noteBrief).toBe("outdated");
		expect(result.sections.map((section) => section.freshness)).toEqual([
			"outdated",
			"current",
		]);
	});

	it("treats add, delete, and reorder as Note Brief changes without staling unaffected cards", () => {
		const cache = cacheFor();
		const state = createCurrentMaintenanceState("Note", MARKDOWN, cache);
		for (const markdown of [
			"# Alpha\none\n## Beta\ntwo\n## Gamma\nthree",
			"# Alpha\none",
			"## Beta\ntwo\n# Alpha\none",
		]) {
			const result = classifyStudyMaterial({
				noteTitle: "Note",
				markdown,
				currentSections: parseSections(markdown),
				cache,
				state,
			});
			expect(result.noteBrief).toBe("outdated");
				expect(
					result.sections
						.filter((section) => section.id !== "gamma")
						.map((section) => section.freshness)
				).toEqual(
					result.sections
						.filter((section) => section.id !== "gamma")
						.map(() => "current")
				);
		}
	});

	it("uses title and Markdown, but no generation configuration, for revisions", () => {
		expect(noteSourceRevision("Note", MARKDOWN)).toBe(
			noteSourceRevision("Note", MARKDOWN)
		);
		expect(noteSourceRevision("Renamed", MARKDOWN)).not.toBe(
			noteSourceRevision("Note", MARKDOWN)
		);

		const cache = cacheFor();
		const state = createCurrentMaintenanceState("Note", MARKDOWN, cache);
		cache.provider = "anthropic";
		cache.model = "claude-sonnet-4-5";
		cache.preset = "exam-practice";
		expect(
			classifyStudyMaterial({
				noteTitle: "Note",
				markdown: MARKDOWN,
				currentSections: parseSections(MARKDOWN),
				cache,
				state: { ...state, cacheRevision: cacheContentRevision(cache) },
			}).freshness
		).toBe("current");
	});

	it("represents updating components", () => {
		const cache = cacheFor();
		const initial = createCurrentMaintenanceState("Note", MARKDOWN, cache);
		const revision = noteSourceRevision("Note", `${MARKDOWN}\nchanged`);
		const observed = reduceMaintenanceState(initial, {
			type: "source-observed",
			revision,
			affected: components(true, [cache.sections[0].id]),
			hasEligibleSections: true,
		});
		const updating = reduceMaintenanceState(observed, {
			type: "update-started",
			revision,
			components: components(true, [cache.sections[0].id]),
		});

		expect(updating?.updating).toEqual(
			components(true, [cache.sections[0].id])
		);
	});
});

describe("maintenance attempts", () => {
	it("keeps last-good content on failure and exposes Retry", async () => {
		const cache = cacheFor();
		const initial = createCurrentMaintenanceState("Note", MARKDOWN, cache);
		const edited = "# Alpha\none edited\n## Beta\ntwo";
		const revision = noteSourceRevision("Note", edited);
		const observed = reduceMaintenanceState(initial, {
			type: "source-observed",
			revision,
			affected: components(true, [cache.sections[0].id]),
			hasEligibleSections: true,
		});
		const failed = reduceMaintenanceState(observed, {
			type: "update-failed",
			revision,
			components: components(true, [cache.sections[0].id]),
			message: "provider unavailable",
		});
		const persist = vi.fn(async () => {});
		const store = new StudyMaterialStore(
			{ "note.md": cache },
			{ "note.md": initial },
			persist
		);

		await store.commit("note.md", cache, failed);

		expect(store.get("note.md")).toEqual(cache);
		expect(store.getState("note.md")?.retryable).toBe(true);
		expect(persist).toHaveBeenCalledTimes(1);
		expect(persist).toHaveBeenCalledWith(
			{ "note.md": cache },
			{ "note.md": failed }
		);

		const classification = classifyStudyMaterial({
			noteTitle: "Note",
			markdown: edited,
			currentSections: parseSections(edited),
			cache,
			state: failed,
		});
		expect(classification.freshness).toBe("failed");
		expect(classification.noteBrief).toBe("failed");
		expect(classification.sections[0].freshness).toBe("failed");
		expect(classification.retryable).toBe(true);
	});

	it("ignores a successful completion for an older source revision", () => {
		const cache = cacheFor();
		const initial = createCurrentMaintenanceState("Note", MARKDOWN, cache);
		const latestRevision = noteSourceRevision("Note", `${MARKDOWN}\nlatest`);
		const latest = reduceMaintenanceState(initial, {
			type: "source-observed",
			revision: latestRevision,
			affected: components(true),
			hasEligibleSections: true,
		});

		expect(
			reduceMaintenanceState(latest, {
				type: "update-succeeded",
				revision: initial.sourceRevision,
				components: components(true),
				cacheRevision: "stale-completion",
			})
		).toBe(latest);
	});

	it("dismisses only the current source revision and resets on a source change", () => {
		const cache = cacheFor();
		const initial = createCurrentMaintenanceState("Note", MARKDOWN, cache);
		const dismissed = reduceMaintenanceState(initial, {
			type: "banner-dismissed",
			revision: initial.sourceRevision,
		});
		expect(dismissed?.bannerDismissedRevision).toBe(initial.sourceRevision);

		const nextRevision = noteSourceRevision("Note", `${MARKDOWN}\nnext`);
		const changed = reduceMaintenanceState(dismissed, {
			type: "source-observed",
			revision: nextRevision,
			affected: components(true),
			hasEligibleSections: true,
		});
		expect(changed?.bannerDismissedRevision).toBeNull();
	});

	it("moves and deletes cache and state together with one write", async () => {
		const cache = cacheFor();
		const state = createCurrentMaintenanceState("Note", MARKDOWN, cache);
		const persist = vi.fn(async () => {});
		const store = new StudyMaterialStore(
			{ "old.md": cache },
			{ "old.md": state },
			persist
		);

		await store.rename("old.md", "new.md");
		expect(store.get("new.md")).toEqual(cache);
		expect(store.getState("new.md")).toEqual(state);
		expect(persist).toHaveBeenCalledTimes(1);

		await store.delete("new.md");
		expect(store.get("new.md")).toBeNull();
		expect(store.getState("new.md")).toBeNull();
		expect(persist).toHaveBeenCalledTimes(2);
	});
});

describe("load reconciliation and terminal state", () => {
	it("preserves legacy cards while treating a legacy Note Brief as outdated", () => {
		const cache = cacheFor();
		const result = classifyStudyMaterial({
			noteTitle: "Note",
			markdown: MARKDOWN,
			currentSections: parseSections(MARKDOWN),
			cache,
			state: null,
		});

		expect(result.noteBrief).toBe("outdated");
		expect(result.sections.map((section) => section.freshness)).toEqual([
			"current",
			"current",
		]);
		expect(cache.sections).toHaveLength(2);
	});

	it("loads malformed or cache-mismatched state conservatively", () => {
		const cache = cacheFor();
		const current = createCurrentMaintenanceState("Note", MARKDOWN, cache);
		const normalized = normalizeMaintenanceStateMap(
			{
				"malformed.md": { sourceRevision: 42 },
				"note.md": { ...current, cacheRevision: "mismatch" },
			},
			{ "note.md": cache }
		);

		expect(normalized.changed).toBe(true);
		expect(normalized.states).not.toHaveProperty("malformed.md");
		expect(normalized.states["note.md"]).toMatchObject({
			noteBriefRevision: null,
			retryable: false,
			bannerDismissedRevision: null,
		});
		expect(normalized.states["note.md"].affected.sectionIds).toEqual(
			cache.sections.map((section) => section.id)
		);
	});

	it("preserves failed no-cache state and Retry across restart", () => {
		const missing = createMissingMaintenanceState("New", MARKDOWN);
		const pending = normalizeMaintenanceStateMap(
			{ "new.md": missing },
			{}
		);
		expect(pending.changed).toBe(false);
		expect(pending.states["new.md"]).toEqual(missing);

		const failed = reduceMaintenanceState(pending.states["new.md"], {
			type: "update-failed",
			revision: missing.sourceRevision,
			components: missing.affected,
			message: "provider unavailable",
		});
		const normalized = normalizeMaintenanceStateMap(
			{ "new.md": failed },
			{}
		);

		expect(normalized.changed).toBe(false);
		expect(normalized.states["new.md"]?.cacheRevision).toBeNull();
		expect(normalized.states["new.md"]?.retryable).toBe(true);
		const classification = classifyStudyMaterial({
			noteTitle: "New",
			markdown: MARKDOWN,
			currentSections: parseSections(MARKDOWN),
			cache: null,
			state: normalized.states["new.md"],
		});
		expect(classification.freshness).toBe("failed");
		expect(classification.retryable).toBe(true);
	});

	it("removes cache and attempt/dismissal state when no eligible sections remain", async () => {
		const cache = cacheFor();
		const state = {
			...createCurrentMaintenanceState("Note", MARKDOWN, cache),
			retryable: true,
			bannerDismissedRevision: noteSourceRevision("Note", MARKDOWN),
		};

		expect(
			reconcileTerminalStudyMaterial(
				cache,
				state,
				parseSections("# Empty heading\n")
			)
		).toEqual({ cache: null, state: null });

		const persist = vi.fn(async () => {});
		const store = new StudyMaterialStore(
			{ "note.md": cache },
			{ "note.md": state },
			persist
		);
		await store.set(
			"note.md",
			reconcileCacheSections(cache, parseSections("# Empty heading\n"))
		);
		expect(store.get("note.md")).toBeNull();
		expect(store.getState("note.md")).toBeNull();
		expect(persist).toHaveBeenCalledWith({}, {});
	});
});
