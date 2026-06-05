import { describe, it, expect } from "vitest";
import { buildCornellModel } from "../src/cornell";
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
