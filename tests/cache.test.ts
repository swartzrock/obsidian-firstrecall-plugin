import { describe, it, expect, vi } from "vitest";
import {
	CACHE_SCHEMA_VERSION,
	CacheStore,
	buildNoteCache,
	hasUsableCues,
	isStale,
	loadCache,
	normalizeCacheMap,
	reconcileCacheSections,
	replaceSection,
	sectionIdsNeedingGeneration,
	validateCache,
	type NoteCache,
} from "../src/cache";
import { cueEligibleSections, parseSections } from "../src/parser";
import type { NoteGenerationResult } from "../src/generator";

const NOTE = "# A\nalpha\n## B\nbeta";

function sampleResult(): NoteGenerationResult {
	const sections = parseSections(NOTE).map((s) => ({
		id: s.id,
		heading: s.heading,
		level: s.level,
		lineNumber: s.lineNumber,
		contentHash: s.contentHash,
		keywords: ["k1", "k2"],
		question: `Q:${s.heading}`,
		summary: null,
		error: null,
	}));
	return {
		sections,
		noteBrief: null,
		canceled: false,
	};
}

function build(): NoteCache {
	return buildNoteCache({
		result: sampleResult(),
		provider: "ollama",
		model: "llama3.1:8b",
		preset: "conceptual",
		generationMode: "whole-note-context",
		noteModifiedAt: 1000,
		generatedAt: "2026-06-04T00:00:00.000Z",
	});
}

describe("buildNoteCache + validateCache", () => {
	it("produces a current-schema cache that validates", () => {
		const cache = build();
		expect(cache.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
		expect(cache.sections).toHaveLength(2);
		expect(cache.outline).toEqual({});
		expect(cache).not.toHaveProperty("summary");
		expect(cache.sections[0].summary).toBeNull();
		expect(cache.noteBrief).toBeNull();
		expect(validateCache(cache).ok).toBe(true);
	});

	it("persists generated Summary and Note Brief data", () => {
		const result = sampleResult();
		result.sections[0].summary = "Focus on A.";
		result.noteBrief = {
			overview: "A and B explain the note.",
			whatMatters: { title: "A matters", detail: "It frames the note." },
			reviewFirst: { title: "A", detail: "Start with the parent idea." },
			sayItBack: { title: "Why does A matter?", detail: "Answer before review." },
		};
		const cache = buildNoteCache({
			result,
			provider: "ollama",
			model: "llama3.1:8b",
			preset: "conceptual",
			generationMode: "whole-note-context",
			noteModifiedAt: 1000,
		});

		expect(cache.sections[0].summary).toBe("Focus on A.");
		expect(cache.noteBrief?.reviewFirst.title).toBe("A");
		expect(validateCache(cache).ok).toBe(true);
	});

	it("loads legacy Summary objects without retaining removed fields", () => {
		const cache = build();
		const legacy = {
			...cache,
			sections: cache.sections.map((section, index) =>
				index === 0
					? {
							...section,
							summary: {
								takeaway: "Focus on A.",
								keyPhrase: "A",
								explanation: "A frames the rest of the note.",
							},
						}
					: section
			),
		};

		expect(loadCache(legacy)?.sections[0].summary).toBe("Focus on A.");
	});

	it("rejects objects that are not valid caches", () => {
		expect(validateCache({ schemaVersion: 2 }).ok).toBe(false);
		expect(validateCache(null).ok).toBe(false);
	});
});

describe("isStale", () => {
	it("is not stale against the same note", () => {
		const cache = build();
		expect(isStale(cache, parseSections(NOTE))).toBe(false);
	});

	it("is stale when a section's content changes", () => {
		const cache = build();
		const edited = parseSections("# A\nalpha EDITED\n## B\nbeta");
		expect(isStale(cache, edited)).toBe(true);
	});

	it("is stale when a section is added or removed", () => {
		const cache = build();
		expect(isStale(cache, parseSections("# A\nalpha"))).toBe(true);
		expect(
			isStale(cache, parseSections("# A\nalpha\n## B\nbeta\n## C\ngamma"))
		).toBe(true);
	});

	it("is not stale when the cache intentionally omits empty heading sections", () => {
		const markdown = "# Empty parent\n## Prefix Sum\nactual notes";
		const sections = cueEligibleSections(parseSections(markdown)).map((s) => ({
			id: s.id,
			heading: s.heading,
			level: s.level,
			lineNumber: s.lineNumber,
			contentHash: s.contentHash,
			keywords: ["prefix"],
			question: "What does Prefix Sum explain?",
			summary: null,
			error: null,
		}));
		const cache = buildNoteCache({
			result: {
				sections,
				noteBrief: null,
				canceled: false,
			},
			provider: "ollama",
			model: "llama3.1:8b",
			preset: "conceptual",
			generationMode: "whole-note-context",
			noteModifiedAt: 1000,
		});
		expect(cache.sections.map((section) => section.heading)).toEqual(["Prefix Sum"]);
		expect(isStale(cache, parseSections(markdown))).toBe(false);
	});
});

describe("loadCache", () => {
	it("rejects unsupported cache versions", () => {
		const cache = build();

		expect(loadCache({ ...cache, schemaVersion: 7 })).toBeNull();
	});

	it("loads a current cache and rejects invalid data", () => {
		const current = build();
		expect(loadCache(current)?.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
		expect(loadCache({ schemaVersion: 99, sections: [] })).toBeNull();
		expect(loadCache(42)).toBeNull();
	});
});

describe("normalizeCacheMap", () => {
	it("does not report an unchanged current cache map", () => {
		const cache = build();
		expect(normalizeCacheMap({ "note.md": cache })).toEqual({
			caches: { "note.md": cache },
			retainedCaches: {},
			changed: false,
		});
	});

	it("reports when unknown cache properties are removed", () => {
		const cache = { ...build(), temporary: true };
		const normalized = normalizeCacheMap({ "notes/retrieval.md": cache });
		expect(normalized.changed).toBe(true);
		expect(normalized.caches["notes/retrieval.md"]).toEqual(build());
	});

	it("retains invalid cache entries for persistence", () => {
		const invalid = { schemaVersion: 99, sections: ["unknown"] };
		const normalized = normalizeCacheMap({
			"unrecognized.md": invalid,
		});

		expect(normalized.caches).toEqual({});
		expect(normalized.retainedCaches).toEqual({
			"unrecognized.md": invalid,
		});
		expect(normalized.changed).toBe(false);
	});
});

describe("CacheStore", () => {
	it("sets, gets, has and deletes, persisting each mutation", async () => {
		const persist = vi.fn(async () => {});
		const store = new CacheStore({}, persist);
		const cache = build();

		expect(store.has("note.md")).toBe(false);
		await store.set("note.md", cache);
		expect(store.get("note.md")).toEqual(cache);
		expect(store.has("note.md")).toBe(true);
		expect(persist).toHaveBeenCalledTimes(1);

		await store.delete("note.md");
		expect(store.get("note.md")).toBeNull();
		expect(persist).toHaveBeenCalledTimes(2);
	});

	it("does not persist when deleting a missing key", async () => {
		const persist = vi.fn(async () => {});
		const store = new CacheStore(undefined, persist);
		await store.delete("missing.md");
		expect(persist).not.toHaveBeenCalled();
	});

	it("seeds from initial data", () => {
		const cache = build();
		const store = new CacheStore({ "seed.md": cache }, async () => {});
		expect(store.get("seed.md")).toEqual(cache);
		expect(store.snapshot()).toEqual({ "seed.md": cache });
	});

});

describe("sectionIdsNeedingGeneration", () => {
	it("is empty when cached sections still match the note", () => {
		const cache = build();
		expect(sectionIdsNeedingGeneration(cache, parseSections(NOTE))).toEqual([]);
	});

	it("includes edited and newly added sections only", () => {
		const cache = build();
		const current = parseSections("# A\nalpha edited\n## B\nbeta\n## C\ngamma");
		const eligible = cueEligibleSections(current);

		expect(sectionIdsNeedingGeneration(cache, current)).toEqual([
			eligible[0].id,
			eligible[2].id,
		]);
	});

	it("includes previous failures even when their content is unchanged", () => {
		const cache = build();
		cache.sections[1] = { ...cache.sections[1], error: "boom" };

		expect(sectionIdsNeedingGeneration(cache, parseSections(NOTE))).toEqual([
			cache.sections[1].id,
		]);
	});

	it("does not call the provider for removed sections", () => {
		const cache = build();
		expect(sectionIdsNeedingGeneration(cache, parseSections("# A\nalpha"))).toEqual([]);
	});
});

describe("reconcileCacheSections", () => {
	it("updates cached section metadata without replacing the cue", () => {
		const cache = build();
		const current = parseSections("# A\nalpha\n\n\n## B\nbeta");
		const result = reconcileCacheSections(cache, current, [], {
			generatedAt: "2099-01-01T00:00:00.000Z",
			noteModifiedAt: 2000,
		});

		expect(result.sections[1].question).toBe("Q:B");
		expect(result.sections[1].lineNumber).toBe(cueEligibleSections(current)[1].lineNumber);
		expect(result.generatedAt).toBe("2099-01-01T00:00:00.000Z");
		expect(result.noteModifiedAt).toBe(2000);
	});

	it("adds generated sections and removes sections no longer in the note", () => {
		const cache = build();
		const current = parseSections("# A\nalpha\n## C\ngamma");
		const sectionC = cueEligibleSections(current)[1];
		const generatedC = {
			id: sectionC.id,
			heading: sectionC.heading,
			level: sectionC.level,
			lineNumber: sectionC.lineNumber,
			contentHash: sectionC.contentHash,
			keywords: ["gamma"],
			question: "Q:C",
			summary: null,
			error: null,
		};

		const result = reconcileCacheSections(cache, current, [generatedC]);

		expect(result.sections.map((section) => section.heading)).toEqual(["A", "C"]);
		expect(result.sections.map((section) => section.question)).toEqual(["Q:A", "Q:C"]);
	});

	it("preserves existing cues when sections are reordered", () => {
		const cache = build();
		const current = parseSections("## B\nbeta\n# A\nalpha");
		const result = reconcileCacheSections(cache, current);

		expect(result.sections.map((section) => section.heading)).toEqual(["B", "A"]);
		expect(result.sections.map((section) => section.question)).toEqual(["Q:B", "Q:A"]);
	});

	it("does not advance a changed section hash without a successful replacement", () => {
		const cache = build();
		const edited = parseSections("# A\nalpha edited\n## B\nbeta");
		const failed = {
			...cache.sections[0],
			contentHash: edited[0].contentHash,
			question: null,
			error: "provider unavailable",
		};

		const result = reconcileCacheSections(cache, edited, [failed]);

		expect(result.sections[0]).toEqual(cache.sections[0]);
		expect(sectionIdsNeedingGeneration(result, edited)).toEqual([edited[0].id]);
	});

	it("removes all generated material when no eligible sections remain", () => {
		const result = reconcileCacheSections(
			build(),
			parseSections("# Empty heading\n")
		);

		expect(result.sections).toEqual([]);
		expect(result.noteBrief).toBeNull();
	});
});

describe("replaceSection", () => {
	it("replaces the matching section and bumps generatedAt", () => {
		const cache = build();
		const original = cache.sections[1]; // B
		const updated = {
			...original,
			question: "new Q",
			keywords: ["x", "y", "z"],
			contentHash: "newHash",
		};
		const result = replaceSection(cache, updated, "2099-01-01T00:00:00.000Z");
		expect(result.sections[1].question).toBe("new Q");
		expect(result.sections[1].contentHash).toBe("newHash");
		expect(result.sections[0]).toEqual(cache.sections[0]); // A untouched
		expect(result.noteBrief).toBe(cache.noteBrief);
		expect(result.outline).toBe(cache.outline);
		expect(result.generatedAt).toBe("2099-01-01T00:00:00.000Z");
	});

	it("returns the cache unchanged when the id is not found", () => {
		const cache = build();
		const missing = { ...cache.sections[0], id: "does-not-exist" };
		const result = replaceSection(cache, missing);
		expect(result).toBe(cache);
	});

	it("does not mutate the original sections array", () => {
		const cache = build();
		const updated = { ...cache.sections[0], question: "replaced" };
		const result = replaceSection(cache, updated);
		expect(result.sections[0].question).toBe("replaced");
		expect(cache.sections[0].question).toBe("Q:A"); // original unchanged
	});

	it("preserves the last-good section when its replacement failed", () => {
		const cache = build();
		const failed = {
			...cache.sections[0],
			question: null,
			error: "provider unavailable",
		};

		expect(replaceSection(cache, failed)).toBe(cache);
	});
});

describe("hasUsableCues", () => {
	it("is true when at least one section has a non-errored question", () => {
		expect(hasUsableCues(build())).toBe(true);
	});

	it("is false when every section is errored or questionless", () => {
		const cache = build();
		const allFailed: NoteCache = {
			...cache,
			sections: cache.sections.map((s) => ({
				...s,
				question: null,
				keywords: null,
				error: "response was not valid JSON",
			})),
		};
		expect(hasUsableCues(allFailed)).toBe(false);
	});
});
