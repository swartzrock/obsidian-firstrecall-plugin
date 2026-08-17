import { describe, it, expect } from "vitest";
import {
	exportFilePath,
	selectExportableQuestions,
	questionsAndTermsToAnki,
	questionsAndTermsToMarkdown,
	type ExportQuestion,
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

describe("selectExportableQuestions", () => {
	it("keeps usable Questions in document order", () => {
		const questions = selectExportableQuestions(cacheFrom());
		expect(questions.map((question) => question.heading)).toEqual(["A", "B", "C"]);
		expect(questions[0]).toEqual({
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
		const questions = selectExportableQuestions(cache);
		expect(questions.map((question) => question.heading)).toEqual(["A"]);
	});
});

describe("questionsAndTermsToMarkdown", () => {
	it("renders a heading, Question, and Terms per section", () => {
		const md = questionsAndTermsToMarkdown("My Note", selectExportableQuestions(cacheFrom()));
		expect(md).toContain("# Questions and Terms — My Note");
		expect(md).toContain("## A");
		expect(md).toContain("**Question:** Q:A");
		expect(md).toContain("_Terms:_ k1 · k2");
	});

	it("notes when there is nothing to export", () => {
		expect(questionsAndTermsToMarkdown("Empty", [])).toContain(
			"No generated Questions and Terms to export"
		);
	});
});

describe("questionsAndTermsToAnki", () => {
	it("emits question<TAB>answer rows, one per Question", () => {
		const tsv = questionsAndTermsToAnki(selectExportableQuestions(cacheFrom()));
		const rows = tsv.split("\n");
		expect(rows).toHaveLength(3);
		expect(rows[0]).toBe("Q:A\tk1 · k2");
		for (const row of rows) expect(row.split("\t")).toHaveLength(2);
	});

	it("falls back to the heading when a Question has no Terms", () => {
		const questions: ExportQuestion[] = [{ heading: "Topic", question: "Why?", keywords: [] }];
		expect(questionsAndTermsToAnki(questions)).toBe("Why?\tTopic");
	});

	it("collapses tabs/newlines so fields stay on one row", () => {
		const questions: ExportQuestion[] = [
			{ heading: "H", question: "Line1\nLine2\tx", keywords: ["a\tb"] },
		];
		const row = questionsAndTermsToAnki(questions);
		expect(row).toBe("Line1 Line2 x\ta b");
		expect(row.split("\t")).toHaveLength(2);
	});
});

describe("exportFilePath", () => {
	it("returns the Markdown export path", () => {
		expect(exportFilePath("folder/", "Note", "markdown")).toBe(
			"folder/Note (questions-and-terms).md"
		);
	});

	it("returns the Anki export path", () => {
		expect(exportFilePath("", "Note", "anki")).toBe(
			"Note (questions-and-terms.anki).txt"
		);
	});
});
