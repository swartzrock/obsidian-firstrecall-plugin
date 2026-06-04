import { describe, it, expect } from "vitest";
import { buildCueLineData } from "../src/cue-extension";
import { buildNoteCache } from "../src/cache";
import { parseSections } from "../src/parser";
import type { NoteGenerationResult } from "../src/generator";

const NOTE = "# A\nalpha\n## B\nbeta\n## C\ngamma";

function cacheFrom(
	overrides: (
		s: ReturnType<typeof parseSections>[number],
		i: number
	) => Partial<NoteGenerationResult["sections"][number]> = () => ({})
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
		summary: "s",
		learningObjective: null,
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

describe("buildCueLineData", () => {
	it("maps every successful section to its current heading line", () => {
		const cache = cacheFrom();
		const cues = buildCueLineData(cache, parseSections(NOTE));
		expect(cues.map((c) => c.line)).toEqual([1, 3, 5]);
		expect(cues[0]).toMatchObject({
			question: "Q:A",
			keywords: ["k1", "k2"],
			confidence: "high",
		});
	});

	it("skips sections that errored or have no question", () => {
		const cache = cacheFrom((_s, i) =>
			i === 1 ? { error: "boom", question: null } : {}
		);
		const cues = buildCueLineData(cache, parseSections(NOTE));
		expect(cues).toHaveLength(2);
		expect(cues.some((c) => c.heading === "B")).toBe(false);
	});

	it("re-resolves cue lines after content shifts the heading down", () => {
		const cache = cacheFrom();
		// Prepend lines so headings move; ids stay stable (hash of body).
		const shifted = parseSections("intro\nmore\n" + NOTE);
		const cues = buildCueLineData(cache, shifted);
		expect(cues).toHaveLength(3);
		expect(cues[0].line).toBe(3); // "# A" now on line 3
		expect(cues.every((c) => c.line > 0)).toBe(true);
	});

	it("falls back to the cached line when a section id is gone", () => {
		const cache = cacheFrom();
		const cues = buildCueLineData(cache, parseSections("# A\nalpha"));
		// B and C ids no longer match current sections -> use cached lineNumbers.
		const headings = cues.map((c) => c.heading);
		expect(headings).toContain("B");
		expect(headings).toContain("C");
	});
});
