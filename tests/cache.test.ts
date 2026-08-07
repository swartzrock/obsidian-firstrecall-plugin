import { describe, it, expect, vi } from "vitest";
import {
	CACHE_SCHEMA_VERSION,
	CacheStore,
	buildNoteCache,
	hasUsableCues,
	isStale,
	loadCache,
	migrateCache,
	normalizeCacheMap,
	reconcileCacheSections,
	replaceSection,
	sectionIdsNeedingGeneration,
	staleSectionIds,
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
			confidence: "high" as const,
			rationale: null,
			sectionLens: null,
			error: null,
		}));
	return {
		sections,
		summary: "a summary",
		learningObjective: "understand A and B",
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

function richV5Cache() {
	return {
		schemaVersion: 5,
		generatedAt: "2026-08-01T12:00:00.000Z",
		noteModifiedAt: 1234,
		provider: "openai",
		model: "gpt-5-mini",
		generationMode: "whole-note-context",
		preset: "exam-prep",
		outline: {
			learningObjective: "Explain how retrieval strengthens memory.",
			keyThemes: ["retrieval", "memory"],
		},
		sections: [
			{
				id: "retrieval-practice",
				heading: "Retrieval Practice",
				level: 2,
				lineNumber: 7,
				contentHash: "abc123",
				keywords: ["retrieval", "testing effect"],
				question: "Why does retrieval practice strengthen memory?",
				confidence: "high",
				category: "sequences",
				rationale: "The section states the causal relationship directly.",
				sectionLens: {
					takeaway: "Practice recalling an idea instead of rereading it.",
					keyPhrase: "retrieval practice",
					explanation: "Active recall makes the memory easier to access later.",
				},
				error: null,
			},
		],
		summary: "Retrieval practice improves later access to learned material.",
		noteBrief: {
			overview: "Retrieval strengthens memory. Repeated recall improves access.",
			whatMatters: {
				title: "Recall beats rereading",
				detail: "Effortful retrieval produces more durable learning.",
			},
			reviewFirst: {
				title: "Retrieval practice",
				detail: "Start with the mechanism that strengthens recall.",
			},
			sayItBack: {
				title: "Why does retrieval strengthen memory?",
				detail: "Explain the testing effect without looking at the note.",
			},
		},
	};
}

describe("buildNoteCache + validateCache", () => {
	it("produces a current-schema cache that validates", () => {
		const cache = build();
		expect(cache.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
		expect(cache.sections).toHaveLength(2);
		expect(cache.outline.learningObjective).toBe("understand A and B");
		expect(cache.sections[0]).not.toHaveProperty("category");
		expect(cache.sections[0].sectionLens).toBeNull();
		expect(cache.noteBrief).toBeNull();
		expect(validateCache(cache).ok).toBe(true);
	});

	it("persists generated Section Lens and Note Brief artifacts", () => {
		const result = sampleResult();
		result.sections[0].sectionLens = {
			takeaway: "Focus on A.",
			keyPhrase: "A",
			explanation: "A frames the rest of the note.",
		};
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

		expect(cache.sections[0].sectionLens?.keyPhrase).toBe("A");
		expect(cache.sections[0]).not.toHaveProperty("category");
		expect(cache.noteBrief?.reviewFirst.title).toBe("A");
		expect(validateCache(cache).ok).toBe(true);
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
			confidence: "high" as const,
			rationale: null,
			sectionLens: null,
			error: null,
		}));
		const cache = buildNoteCache({
			result: {
				sections,
				summary: "summary",
				learningObjective: null,
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

describe("migrateCache", () => {
	it("upgrades a rich v5 cache by discarding only category", () => {
		const v5 = richV5Cache();

		const migrated = migrateCache(v5);

		expect(migrated).toEqual({
			...v5,
			schemaVersion: CACHE_SCHEMA_VERSION,
			sections: v5.sections.map(({ category: _category, ...section }) => section),
		});
	});

	it("upgrades a v1 cache by filling new fields", () => {
		const v1 = {
			schemaVersion: 1,
			generatedAt: "2026-06-01T00:00:00.000Z",
			noteModifiedAt: 5,
			provider: "ollama",
			model: "llama3.1:8b",
			summary: "old summary",
			sections: [
				{
					id: "a",
					heading: "A",
					lineNumber: 1,
					contentHash: "deadbeef",
					keywords: ["x", "y"],
					question: "Q",
					confidence: "medium",
					error: null,
				},
			],
		};
		const migrated = migrateCache(v1);
		expect(migrated).not.toBeNull();
		expect(migrated?.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
		expect(migrated?.preset).toBe("conceptual");
		expect(migrated?.generationMode).toBe("whole-note-context");
		expect(migrated?.sections[0].level).toBe(0);
		expect(migrated?.sections[0]).not.toHaveProperty("category");
		expect(migrated?.sections[0].rationale).toBeNull();
		expect(migrated?.sections[0].sectionLens).toBeNull();
		expect(migrated?.noteBrief).toBeNull();
		expect(validateCache(migrated).ok).toBe(true);
	});

	it("upgrades a v2 cache by adding rationale fields", () => {
		const v2 = {
			...build(),
			schemaVersion: 2,
			noteBrief: undefined,
			sections: build().sections.map(
				({
					rationale: _rationale,
					sectionLens: _sectionLens,
					...section
				}) => section
			),
		};
		const migrated = migrateCache(v2);
		expect(migrated?.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
		expect(migrated?.sections[0]).not.toHaveProperty("category");
		expect(migrated?.sections[0].rationale).toBeNull();
		expect(migrated?.sections[0].sectionLens).toBeNull();
		expect(migrated?.noteBrief).toBeNull();
		expect(validateCache(migrated).ok).toBe(true);
	});

	it("upgrades a v3 cache by adding review artifact fields", () => {
		const v3 = {
			...build(),
			schemaVersion: 3,
			noteBrief: undefined,
			sections: build().sections.map(
				({ sectionLens: _sectionLens, ...section }) => section
			),
		};
		const migrated = migrateCache(v3);
		expect(migrated?.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
		expect(migrated?.sections[0]).not.toHaveProperty("category");
		expect(migrated?.sections[0].sectionLens).toBeNull();
		expect(migrated?.noteBrief).toBeNull();
		expect(validateCache(migrated).ok).toBe(true);
	});

	it("upgrades a v4 cache to the current category-free schema", () => {
		const v4 = {
			...build(),
			schemaVersion: 4,
		};
		const migrated = migrateCache(v4);
		expect(migrated?.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
		expect(migrated?.sections[0]).not.toHaveProperty("category");
		expect(validateCache(migrated).ok).toBe(true);
	});

	it("returns null for unmigratable junk", () => {
		expect(migrateCache(42)).toBeNull();
		expect(migrateCache({ schemaVersion: 99, nonsense: true })).toBeNull();
	});

	it("loadCache passes through a current cache and migrates a v1 cache", () => {
		const current = build();
		expect(loadCache(current)?.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
		expect(loadCache({ schemaVersion: 1, sections: [] })).toBeNull();
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

	it("reports when persisted caches were normalized to v6", () => {
		const v5 = richV5Cache();

		const normalized = normalizeCacheMap({ "notes/retrieval.md": v5 });

		expect(normalized.changed).toBe(true);
		expect(normalized.caches["notes/retrieval.md"]).toEqual(migrateCache(v5));
		expect(normalized.caches["notes/retrieval.md"].sections[0]).not.toHaveProperty(
			"category"
		);
	});

	it("migrates valid caches while retaining invalid entries for persistence", () => {
		const current = build();
		const v5 = {
			...current,
			schemaVersion: 5,
			sections: current.sections.map((section) => ({
				...section,
				category: "sequences",
			})),
		};

		const invalid = { schemaVersion: 99, sections: ["unknown"] };
		const normalized = normalizeCacheMap({
			"note.md": v5,
			"unrecognized.md": invalid,
		});

		expect(normalized.caches["note.md"].schemaVersion).toBe(CACHE_SCHEMA_VERSION);
		expect(normalized.caches).not.toHaveProperty("unrecognized.md");
		expect(normalized.retainedCaches).toEqual({
			"unrecognized.md": invalid,
		});
		expect(normalized.changed).toBe(true);
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

describe("staleSectionIds", () => {
	it("is empty when nothing changed", () => {
		const cache = build();
		expect(staleSectionIds(cache, parseSections(NOTE))).toEqual([]);
	});

	it("lists only the edited section's id", () => {
		const cache = build();
		const edited = parseSections("# A\nalpha EDITED\n## B\nbeta");
		const ids = staleSectionIds(cache, edited);
		const aId = cache.sections[0].id;
		expect(ids).toEqual([aId]);
	});

	it("includes sections that previously errored even if unchanged", () => {
		const cache = build();
		cache.sections[1] = { ...cache.sections[1], error: "boom" };
		const ids = staleSectionIds(cache, parseSections(NOTE));
		expect(ids).toEqual([cache.sections[1].id]);
	});

	it("ignores sections no longer present in the note", () => {
		const cache = build();
		const onlyA = parseSections("# A\nalpha");
		// B is gone from the note, so it is not returned (full Generate handles removals).
		expect(staleSectionIds(cache, onlyA)).toEqual([]);
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
			confidence: "medium" as const,
			rationale: null,
			sectionLens: null,
			error: null,
		};

		const result = reconcileCacheSections(cache, current, [generatedC]);

		expect(result.sections.map((section) => section.heading)).toEqual(["A", "C"]);
		expect(result.sections.map((section) => section.question)).toEqual(["Q:A", "Q:C"]);
		expect(result.sections[1]).not.toHaveProperty("category");
	});

	it("preserves existing cues when sections are reordered", () => {
		const cache = build();
		const current = parseSections("## B\nbeta\n# A\nalpha");
		const result = reconcileCacheSections(cache, current);

		expect(result.sections.map((section) => section.heading)).toEqual(["B", "A"]);
		expect(result.sections.map((section) => section.question)).toEqual(["Q:B", "Q:A"]);
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
			confidence: "low" as const,
			contentHash: "newHash",
		};
		const result = replaceSection(cache, updated, "2099-01-01T00:00:00.000Z");
		expect(result.sections[1].question).toBe("new Q");
		expect(result.sections[1].contentHash).toBe("newHash");
		expect(result.sections[0]).toEqual(cache.sections[0]); // A untouched
		expect(result.summary).toBe(cache.summary);
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
				confidence: null,
				error: "response was not valid JSON",
			})),
		};
		expect(hasUsableCues(allFailed)).toBe(false);
	});
});
