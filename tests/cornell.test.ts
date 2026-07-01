import { describe, it, expect } from "vitest";
import {
	buildCornellAnswerPresentation,
	buildCornellModel,
	buildCornellSupportPresentation,
	buildCornellSupportTerms,
	buildCornellTakeawayPresentation,
	failedCueCount,
	pickCornellFile,
	type CornellFileRef,
} from "../src/cornell";
import { buildNoteCache } from "../src/cache";
import { parseSections } from "../src/parser";
import type { NoteGenerationResult } from "../src/generator";

const NOTE = "# A\nalpha\n## B\nbeta\n## C\ngamma";

function cacheFrom(
	overrides: (
		s: ReturnType<typeof parseSections>[number],
		i: number
	) => Partial<NoteGenerationResult["sections"][number]> = () => ({}),
	top: Partial<Pick<NoteGenerationResult, "summary" | "learningObjective">> = {}
) {
	const sections = parseSections(NOTE).map((s, i) => ({
		id: s.id,
		heading: s.heading,
		level: s.level,
		lineNumber: s.lineNumber,
		contentHash: s.contentHash,
		keywords: ["k1", "k2"],
		question: `Q:${s.heading}`,
		confidence: "high" as const,
		error: null as string | null,
		...overrides(s, i),
	}));
	const result: NoteGenerationResult = {
		sections,
		summary: top.summary ?? "the summary",
		learningObjective: top.learningObjective ?? "the objective",
		noteBrief: null,
		canceled: false,
	};
	return buildNoteCache({
		result,
		provider: "ollama",
		model: "m",
		preset: "conceptual",
		generationMode: "whole-note-context",
		noteModifiedAt: 1,
	});
}

describe("buildCornellModel", () => {
	it("produces one row per current section with its cue and live body", () => {
		const model = buildCornellModel(cacheFrom(), parseSections(NOTE));
		expect(model.rows).toHaveLength(3);
		expect(model.rows.map((r) => r.heading)).toEqual(["A", "B", "C"]);
		expect(model.rows[0]).toMatchObject({
			heading: "A",
			content: "alpha",
			question: "Q:A",
			keywords: ["k1", "k2"],
			confidence: "high",
			hasCue: true,
		});
		expect(model.summary).toBe("the summary");
		expect(model.learningObjective).toBe("the objective");
	});

	it("carries low-confidence rationale into rows", () => {
		const cache = cacheFrom((_s, i) =>
			i === 0
				? {
						confidence: "low",
						rationale: "Section is too short to make a robust cue.",
					}
				: {}
		);
		const model = buildCornellModel(cache, parseSections(NOTE));
		expect(model.rows[0].confidence).toBe("low");
		expect(model.rows[0].rationale).toBe(
			"Section is too short to make a robust cue."
		);
	});

	it("marks sections without a usable cue as hasCue=false but keeps the notes", () => {
		const cache = cacheFrom((_s, i) =>
			i === 1 ? { error: "boom", question: null, keywords: null } : {}
		);
		const model = buildCornellModel(cache, parseSections(NOTE));
		const b = model.rows.find((r) => r.heading === "B");
		expect(b).toBeDefined();
		expect(b?.hasCue).toBe(false);
		expect(b?.question).toBeNull();
		expect(b?.keywords).toEqual([]);
		expect(b?.content).toBe("beta"); // notes still render
	});

	it("surfaces the generation error on a failed row (and not on usable ones)", () => {
		const cache = cacheFrom((_s, i) =>
			i === 1 ? { error: "boom", question: null } : {}
		);
		const model = buildCornellModel(cache, parseSections(NOTE));
		expect(model.rows.find((r) => r.heading === "B")?.error).toBe("boom");
		expect(model.rows.find((r) => r.heading === "A")?.error).toBeNull();
		expect(failedCueCount(model)).toBe(1);
	});

	it("reports a never-generated section as failure-free (count stays 0)", () => {
		const cache = cacheFrom();
		const model = buildCornellModel(cache, parseSections(NOTE + "\n## D\ndelta"));
		expect(model.rows.find((r) => r.heading === "D")?.error).toBeNull();
		expect(failedCueCount(model)).toBe(0);
	});

	it("reflects the live document order and body, not the cache snapshot", () => {
		const cache = cacheFrom();
		// Reorder + edit the note after caching; ids stay stable by body hash.
		const edited = "## C\ngamma edited\n# A\nalpha";
		const model = buildCornellModel(cache, parseSections(edited));
		expect(model.rows.map((r) => r.heading)).toEqual(["C", "A"]);
		expect(model.rows[0].content).toBe("gamma edited");
		// C's cached cue still attaches by id.
		expect(model.rows[0].question).toBe("Q:C");
	});

	it("includes a section that has no matching cue at all", () => {
		const cache = cacheFrom();
		const withNew = parseSections(NOTE + "\n## D\ndelta");
		const model = buildCornellModel(cache, withNew);
		const d = model.rows.find((r) => r.heading === "D");
		expect(d?.hasCue).toBe(false);
		expect(d?.content).toBe("delta");
	});
});

describe("buildCornellTakeawayPresentation", () => {
	it("presents cached summary fields as a study takeaway without changing the data shape", () => {
		expect(
			buildCornellTakeawayPresentation({
				summary: "A concise stored summary.",
				learningObjective: "Explain X.",
			})
		).toEqual({
			label: "Study takeaway",
			takeaway: "A concise stored summary.",
			objective: "Explain X.",
		});
	});

	it("keeps compatibility with older verbose cached summaries", () => {
		expect(
			buildCornellTakeawayPresentation({
				summary:
					"Sentence one. Sentence two. Sentence three from an older cache.",
				learningObjective: null,
			})
		).toEqual({
			label: "Study takeaway",
			takeaway:
				"Sentence one. Sentence two. Sentence three from an older cache.",
			objective: null,
		});
	});
});

describe("buildCornellSupportPresentation", () => {
	it("limits visible cue supports to the first three useful evidence terms", () => {
		expect(
			buildCornellSupportTerms([" alpha ", "Beta", "alpha", "", "Gamma", "Delta"])
		).toEqual(["alpha", "Beta", "Gamma"]);
	});

	it("keeps full cached keyword arrays on the Cornell model for compatibility", () => {
		const cache = cacheFrom((_s, i) =>
			i === 0
				? {
						keywords: ["a", "b", "c", "d", "e"],
					}
				: {}
		);
		const model = buildCornellModel(cache, parseSections(NOTE));
		expect(model.rows[0].keywords).toEqual(["a", "b", "c", "d", "e"]);
		expect(buildCornellSupportTerms(model.rows[0].keywords)).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("keeps supports readable in Study Mode", () => {
		expect(
			buildCornellSupportPresentation({
				keywords: ["a", "b", "c", "d"],
			})
		).toEqual({
			terms: ["a", "b", "c"],
		});
	});
});

describe("buildCornellAnswerPresentation", () => {
	it("hides note-side answers in Study Mode until the section is revealed", () => {
		const hidden = buildCornellAnswerPresentation({
			sectionId: "terms",
			studyMode: true,
			revealAll: false,
			revealedSectionIds: new Set(),
		});
		expect(hidden).toEqual({
			hidden: true,
		});

		const revealed = buildCornellAnswerPresentation({
			sectionId: "terms",
			studyMode: true,
			revealAll: false,
			revealedSectionIds: new Set(["terms"]),
		});
		expect(revealed.hidden).toBe(false);
	});

	it("reveals note-side answers when Study Mode reveal-all is active", () => {
		const presentation = buildCornellAnswerPresentation({
			sectionId: "terms",
			studyMode: true,
			revealAll: true,
			revealedSectionIds: new Set(),
		});
		expect(presentation.hidden).toBe(false);
	});
});

const md = (path: string): CornellFileRef => ({ path, extension: "md" });

describe("pickCornellFile", () => {
	it("prefers the active Markdown note", () => {
		const picked = pickCornellFile({
			active: md("active.md"),
			last: md("last.md"),
			lastExists: true,
			recentMd: [md("recent.md")],
			hasCache: () => true,
		});
		expect(picked?.path).toBe("active.md");
	});

	it("ignores a non-Markdown active leaf (e.g. the Cornell view itself)", () => {
		const picked = pickCornellFile({
			active: { path: "cornell", extension: "cuecraft-cornell" },
			last: md("last.md"),
			lastExists: true,
			recentMd: [md("recent.md")],
			hasCache: () => true,
		});
		expect(picked?.path).toBe("last.md");
	});

	it("falls back to the last note shown when no Markdown is active (restart)", () => {
		const picked = pickCornellFile({
			active: null,
			last: md("last.md"),
			lastExists: true,
			recentMd: [md("recent.md")],
			hasCache: () => true,
		});
		expect(picked?.path).toBe("last.md");
	});

	it("uses the most recently opened note WITH cues on a cold start", () => {
		const picked = pickCornellFile({
			active: null,
			last: null,
			lastExists: false,
			recentMd: [md("no-cues.md"), md("has-cues.md")],
			hasCache: (p) => p === "has-cues.md",
		});
		expect(picked?.path).toBe("has-cues.md");
	});

	it("prefers a note with USABLE cues over one whose cache is all errors", () => {
		const picked = pickCornellFile({
			active: null,
			last: null,
			lastExists: false,
			recentMd: [md("all-errors.md"), md("good.md")],
			hasCache: () => true,
			hasUsableCache: (p) => p === "good.md",
		});
		expect(picked?.path).toBe("good.md");
	});

	it("falls back to an all-errored cache when no note has usable cues", () => {
		const picked = pickCornellFile({
			active: null,
			last: null,
			lastExists: false,
			recentMd: [md("plain.md"), md("all-errors.md")],
			hasCache: (p) => p === "all-errors.md",
			hasUsableCache: () => false,
		});
		expect(picked?.path).toBe("all-errors.md");
	});

	it("falls back to the most recent Markdown note when none have cues", () => {
		const picked = pickCornellFile({
			active: null,
			last: null,
			lastExists: false,
			recentMd: [md("first.md"), md("second.md")],
			hasCache: () => false,
		});
		expect(picked?.path).toBe("first.md");
	});

	it("skips a remembered note that no longer exists", () => {
		const picked = pickCornellFile({
			active: null,
			last: md("deleted.md"),
			lastExists: false,
			recentMd: [md("has-cues.md")],
			hasCache: () => true,
		});
		expect(picked?.path).toBe("has-cues.md");
	});

	it("returns null when there is nothing to show", () => {
		const picked = pickCornellFile({
			active: null,
			last: null,
			lastExists: false,
			recentMd: [],
			hasCache: () => false,
		});
		expect(picked).toBeNull();
	});
});
