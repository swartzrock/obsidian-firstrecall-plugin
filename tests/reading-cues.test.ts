import { describe, it, expect } from "vitest";
import { buildReadingCueMap } from "../src/reading-cues";
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

describe("buildReadingCueMap", () => {
	it("indexes cues by their current heading line", () => {
		const map = buildReadingCueMap(cacheFrom(), NOTE);
		expect([...map.keys()].sort((a, b) => a - b)).toEqual([1, 3, 5]);
		expect(map.get(1)?.question).toBe("Q:A");
		expect(map.get(3)?.heading).toBe("B");
	});

	it("can omit keyword hints from mapped reading cues", () => {
		const map = buildReadingCueMap(cacheFrom(), NOTE, {
			showKeywords: false,
		});
		expect(map.get(1)?.question).toBe("Q:A");
		expect(map.get(1)?.keywords).toEqual([]);
	});

	it("re-resolves lines after content shifts headings down", () => {
		const map = buildReadingCueMap(cacheFrom(), "intro\nmore\n" + NOTE);
		// "# A" is now on line 3.
		expect(map.get(3)?.question).toBe("Q:A");
		expect(map.has(1)).toBe(false);
	});

	it("keeps errored sections as warning markers", () => {
		const cache = cacheFrom((_s, i) =>
			i === 1 ? { error: "boom", question: null } : {}
		);
		const map = buildReadingCueMap(cache, NOTE);
		expect(map.get(3)).toMatchObject({ error: "boom", question: "" });
	});

	it("omits sections that were never generated", () => {
		const cache = cacheFrom((_s, i) =>
			i === 1
				? { error: null, question: null, keywords: null, confidence: null }
				: {}
		);
		const map = buildReadingCueMap(cache, NOTE);
		expect(map.has(3)).toBe(false);
		expect(map.size).toBe(2);
	});
});
