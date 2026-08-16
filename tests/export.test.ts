import { describe, it, expect } from "vitest";
import {
	selectExportableCues,
	cuesToMarkdown,
	cuesToAnki,
	type ExportCue,
} from "../src/export";
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
		error: null as string | null,
		...overrides(s, i),
	}));
	const result: NoteGenerationResult = {
		sections,
		summary: "s",
		learningObjective: null,
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

describe("selectExportableCues", () => {
	it("keeps usable cues in document order", () => {
		const cues = selectExportableCues(cacheFrom());
		expect(cues.map((c) => c.heading)).toEqual(["A", "B", "C"]);
		expect(cues[0]).toEqual({
			heading: "A",
			question: "Q:A",
			keywords: ["k1", "k2"],
		});
	});

	it("drops errored and never-generated sections", () => {
		const cache = cacheFrom((_s, i) => {
			if (i === 1) return { error: "boom", question: null };
			if (i === 2) return { question: null, keywords: null };
			return {};
		});
		const cues = selectExportableCues(cache);
		expect(cues.map((c) => c.heading)).toEqual(["A"]);
	});
});

describe("cuesToMarkdown", () => {
	it("renders a heading + question + keywords per cue", () => {
		const md = cuesToMarkdown("My Note", selectExportableCues(cacheFrom()));
		expect(md).toContain("# Study cues — My Note");
		expect(md).toContain("## A");
		expect(md).toContain("**Q:** Q:A");
		expect(md).toContain("_Keywords:_ k1 · k2");
	});

	it("notes when there is nothing to export", () => {
		expect(cuesToMarkdown("Empty", [])).toContain(
			"No generated cues to export"
		);
	});
});

describe("cuesToAnki", () => {
	it("emits question<TAB>answer rows, one per cue", () => {
		const tsv = cuesToAnki(selectExportableCues(cacheFrom()));
		const rows = tsv.split("\n");
		expect(rows).toHaveLength(3);
		expect(rows[0]).toBe("Q:A\tk1 · k2");
		for (const row of rows) expect(row.split("\t")).toHaveLength(2);
	});

	it("falls back to the heading when a cue has no keywords", () => {
		const cues: ExportCue[] = [{ heading: "Topic", question: "Why?", keywords: [] }];
		expect(cuesToAnki(cues)).toBe("Why?\tTopic");
	});

	it("collapses tabs/newlines so fields stay on one row", () => {
		const cues: ExportCue[] = [
			{ heading: "H", question: "Line1\nLine2\tx", keywords: ["a\tb"] },
		];
		const row = cuesToAnki(cues);
		expect(row).toBe("Line1 Line2 x\ta b");
		expect(row.split("\t")).toHaveLength(2);
	});
});
