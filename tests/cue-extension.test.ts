import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { EditorState } from "@codemirror/state";
import {
	buildCueGutterMarkers,
	buildCueLineData,
	buildCueWidgetDecorations,
	cueGutterField,
	renderCueElement,
	setCuesEffect,
} from "../src/cue-extension";
import { buildNoteCache } from "../src/cache";
import { parseSections } from "../src/parser";
import type { NoteGenerationResult } from "../src/generator";

const NOTE = "# A\nalpha\n## B\nbeta\n## C\ngamma";

function withDocument<T>(fn: () => T): T {
	const dom = new JSDOM("<!doctype html><html><body></body></html>");
	const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: dom.window.document,
	});
	try {
		return fn();
	} finally {
		if (previous) {
			Object.defineProperty(globalThis, "document", previous);
		} else {
			delete (globalThis as { document?: Document }).document;
		}
	}
}

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

	it("can hide keyword data while keeping questions visible", () => {
		const cache = cacheFrom();
		const cues = buildCueLineData(cache, parseSections(NOTE), {
			showKeywords: false,
		});
		expect(cues).toHaveLength(3);
		expect(cues[0].question).toBe("Q:A");
		expect(cues.every((c) => c.keywords.length === 0)).toBe(true);
	});

	it("emits a warning marker for errored sections instead of skipping them", () => {
		const cache = cacheFrom((_s, i) =>
			i === 1 ? { error: "boom", question: null } : {}
		);
		const cues = buildCueLineData(cache, parseSections(NOTE));
		expect(cues).toHaveLength(3);
		const b = cues.find((c) => c.heading === "B");
		expect(b).toMatchObject({ error: "boom", question: "", keywords: [], confidence: null });
		// Usable cues carry no error.
		expect(cues.find((c) => c.heading === "A")?.error).toBeNull();
	});

	it("skips sections that were never generated (no question, no error)", () => {
		const cache = cacheFrom((_s, i) =>
			i === 1 ? { error: null, question: null, keywords: null, confidence: null } : {}
		);
		const cues = buildCueLineData(cache, parseSections(NOTE));
		expect(cues).toHaveLength(2);
		expect(cues.some((c) => c.heading === "B")).toBe(false);
	});

	it("skips cached cues whose current section has no body text", () => {
		const markdown = "# Empty parent\n## Prefix Sum\nactual notes";
		const sections = parseSections(markdown);
		const result: NoteGenerationResult = {
			sections: sections.map((s) => ({
				id: s.id,
				heading: s.heading,
				level: s.level,
				lineNumber: s.lineNumber,
				contentHash: s.contentHash,
				keywords: ["k"],
				question: `Q:${s.heading}`,
				confidence: "high" as const,
				rationale: null,
				error: null,
			})),
			summary: null,
			learningObjective: null,
			canceled: false,
		};
		const cache = buildNoteCache({
			result,
			provider: "ollama",
			model: "m",
			preset: "conceptual",
			generationMode: "whole-note-context",
			noteModifiedAt: 1,
		});
		const cues = buildCueLineData(cache, sections);
		expect(cues.map((cue) => cue.heading)).toEqual(["Prefix Sum"]);
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

describe("renderCueElement", () => {
	it("keeps the existing inline cue DOM shape", () => {
		withDocument(() => {
			const el = renderCueElement(
				{
					line: 1,
					heading: "Terms",
					question: "What is an agent?",
					keywords: ["agent", "tool"],
					confidence: "high",
					error: null,
				},
				"inline-cues"
			);
			expect(el.className).toBe("cuecraft-cue");
			expect(el.dataset.confidence).toBe("high");
			expect(el.querySelector(".cuecraft-cue-question")?.textContent).toBe(
				"What is an agent?"
			);
			expect(el.querySelector(".cuecraft-cue-keywords")?.textContent).toBe(
				"agent · tool"
			);
		});
	});

	it("renders anchored card rail hook DOM", () => {
		withDocument(() => {
			const el = renderCueElement(
				{
					line: 3,
					heading: "Terms",
					question: "How do agents differ from chatbots?",
					keywords: ["agents"],
					confidence: "medium",
					error: null,
				},
				"anchored-card-rail"
			);
			expect(el.classList.contains("cuecraft-editor-hook")).toBe(true);
			expect(
				el.classList.contains("cuecraft-editor-hook-anchored-card-rail")
			).toBe(true);
			expect(el.dataset.display).toBe("anchored-card-rail");
			expect(el.dataset.line).toBe("3");
			expect(el.dataset.state).toBe("upcoming");
			expect(el.dataset.confidence).toBe("medium");
			expect(el.querySelector(".cuecraft-editor-hook-heading")).toBeNull();
			expect(
				el.querySelector(".cuecraft-editor-hook-title")?.textContent
			).toBe("How do agents differ from chatbots");
			expect(
				el.querySelector(".cuecraft-editor-hook-keywords")?.textContent
			).toBe("agents");
		});
	});

	it("renders collapsed tab hook DOM", () => {
		withDocument(() => {
			const el = renderCueElement(
				{
					line: 3,
					heading: "Who It Is For",
					question: "Who is this workflow designed for?",
					keywords: [],
					confidence: "low",
					error: null,
				},
				"collapsed-tabs"
			);
			expect(el.classList.contains("cuecraft-editor-hook-collapsed-tabs")).toBe(
				true
			);
			expect(el.dataset.display).toBe("collapsed-tabs");
			expect(el.dataset.state).toBe("upcoming");
			expect(el.dataset.confidence).toBe("low");
			expect(el.querySelector(".cuecraft-editor-hook-heading")).toBeNull();
			expect(
				el.querySelector(".cuecraft-editor-hook-title")?.textContent
			).toBe("Who is this workflow designed for");
			expect(el.querySelector(".cuecraft-editor-hook-keywords")).toBeNull();
		});
	});

	it("renders threaded margin note hook DOM", () => {
		withDocument(() => {
			const el = renderCueElement(
				{
					line: 5,
					heading: "How To Upskill Employees",
					question: "How does organizational knowledge make teams faster?",
					keywords: ["standards", "workflow"],
					confidence: "high",
					error: null,
				},
				"threaded-margin-notes",
				2
			);
			expect(
				el.classList.contains("cuecraft-editor-hook-threaded-margin-notes")
			).toBe(true);
			expect(el.dataset.display).toBe("threaded-margin-notes");
			expect(el.dataset.state).toBe("upcoming");
			expect(el.querySelector(".cuecraft-editor-hook-heading")).toBeNull();
			expect(
				el.querySelector(".cuecraft-editor-hook-keywords")?.textContent
			).toBe("standards · workflow");
		});
	});

	it("renders active-section composer hook DOM", () => {
		withDocument(() => {
			const el = renderCueElement(
				{
					line: 7,
					heading: "Who It Is For",
					question: "Who should use this workflow?",
					keywords: ["students", "researchers"],
					confidence: "medium",
					error: null,
				},
				"active-section-composer"
			);
			expect(
				el.classList.contains("cuecraft-editor-hook-active-section-composer")
			).toBe(true);
			expect(el.dataset.display).toBe("active-section-composer");
			expect(el.dataset.state).toBe("upcoming");
			expect(el.getAttribute("role")).toBe("note");
			expect(el.querySelector(".cuecraft-editor-hook-heading")).toBeNull();
			expect(
				el.querySelector(".cuecraft-editor-hook-title")?.textContent
			).toBe("Who should use this workflow");
		});
	});

	it("renders current active-section composer with the full question", () => {
		withDocument(() => {
			const question =
				"How does tailoring AI with organizational knowledge upskill employees, and why does encoding that expertise into reusable plugins or agents make them faster and smarter?";
			const el = renderCueElement(
				{
					line: 7,
					heading: "How To Upskill Employees",
					question,
					keywords: ["org knowledge"],
					confidence: "medium",
					error: null,
				},
				"active-section-composer",
				0,
				"current"
			);
			expect(el.dataset.state).toBe("current");
			expect(el.querySelector(".cuecraft-editor-hook-title")?.textContent).toBe(
				question
			);
		});
	});

	it("renders hook minimap DOM", () => {
		withDocument(() => {
			const question =
				"What should the reader remember about tailoring AI to local workflows?";
			const el = renderCueElement(
				{
					line: 9,
					heading: "Study Takeaway",
					question,
					keywords: ["takeaway"],
					confidence: "high",
					error: null,
				},
				"hook-minimap"
			);
			expect(el.classList.contains("cuecraft-editor-hook-hook-minimap")).toBe(
				true
			);
			expect(el.dataset.display).toBe("hook-minimap");
			expect(el.dataset.line).toBe("9");
			expect(el.dataset.state).toBe("upcoming");
			expect(el.querySelector(".cuecraft-editor-hook-heading")).toBeNull();
			expect(
				el.querySelector(".cuecraft-editor-hook-title")?.textContent
			).toBe(question);
		});
	});

	it("renders anchored failed cue state without keywords", () => {
		withDocument(() => {
			const el = renderCueElement(
				{
					line: 3,
					heading: "Terms",
					question: "",
					keywords: [],
					confidence: null,
					error: "boom",
				},
				"anchored-card-rail"
			);
			expect(el.classList.contains("cuecraft-editor-hook-failed")).toBe(true);
			expect(el.querySelector(".cuecraft-editor-hook-title")?.textContent).toBe(
				"Cue unavailable"
			);
			expect(el.querySelector(".cuecraft-editor-hook-status")?.textContent).toBe(
				"Generation failed - regenerate"
			);
			expect(el.querySelector(".cuecraft-editor-hook-keywords")).toBeNull();
		});
	});
});

describe("cue editor placement", () => {
	const cues = [
		{
			line: 1,
			heading: "A",
			question: "What is A?",
			keywords: ["alpha"],
			confidence: "high" as const,
			error: null,
		},
		{
			line: 3,
			heading: "B",
			question: "What is B?",
			keywords: ["beta"],
			confidence: "medium" as const,
			error: null,
		},
	];

	it("renders hook displays into left-gutter markers", () => {
		const state = EditorState.create({ doc: NOTE });
		const markers = buildCueGutterMarkers(state, {
			cues,
			display: "anchored-card-rail",
		});
		const positions: number[] = [];
		markers.between(0, state.doc.length, (from) => {
			positions.push(from);
		});
		expect(positions).toEqual([
			state.doc.line(1).from,
			state.doc.line(3).from,
		]);
	});

	it("keeps hook gutter markers attached when edits move headings down", () => {
		let state = EditorState.create({
			doc: NOTE,
			extensions: [cueGutterField],
		});
		state = state.update({
			effects: setCuesEffect.of({
				cues,
				display: "anchored-card-rail",
			}),
		}).state;

		state = state.update({
			changes: {
				from: state.doc.line(3).from,
				insert: "\n\n",
			},
		}).state;

		const positions: number[] = [];
		state.field(cueGutterField).markers.between(0, state.doc.length, (from) => {
			positions.push(from);
		});
		expect(positions).toEqual([
			state.doc.line(1).from,
			state.doc.line(5).from,
		]);
	});

	it("marks the active composer card current for the cursor section", () => {
		withDocument(() => {
			const state = EditorState.create({
				doc: NOTE,
				selection: { anchor: NOTE.indexOf("beta") },
			});
			const markers = buildCueGutterMarkers(state, {
				cues,
				display: "active-section-composer",
			});
			const states: Array<string | undefined> = [];
			markers.between(0, state.doc.length, (_from, _to, marker) => {
				const element = marker.toDOM(null as never) as HTMLElement;
				states.push(element.dataset.state);
			});
			expect(states).toEqual(["upcoming", "current"]);
		});
	});

	it("keeps collapsed tabs upcoming even when the cursor is in a section", () => {
		withDocument(() => {
			const state = EditorState.create({
				doc: NOTE,
				selection: { anchor: NOTE.indexOf("beta") },
			});
			const markers = buildCueGutterMarkers(state, {
				cues,
				display: "collapsed-tabs",
			});
			const states: Array<string | undefined> = [];
			markers.between(0, state.doc.length, (_from, _to, marker) => {
				const element = marker.toDOM(null as never) as HTMLElement;
				states.push(element.dataset.state);
			});
			expect(states).toEqual(["upcoming", "upcoming"]);
		});
	});

	it("keeps inline cues out of the left gutter", () => {
		const state = EditorState.create({ doc: NOTE });
		const markers = buildCueGutterMarkers(state, {
			cues,
			display: "inline-cues",
		});
		const positions: number[] = [];
		markers.between(0, state.doc.length, (from) => {
			positions.push(from);
		});
		expect(positions).toEqual([]);
	});

	it("does not render hook displays as body block widgets", () => {
		const state = EditorState.create({ doc: NOTE });
		const widgets = buildCueWidgetDecorations(state, {
			cues,
			display: "anchored-card-rail",
		});
		const positions: number[] = [];
		widgets.between(0, state.doc.length, (from) => {
			positions.push(from);
		});
		expect(positions).toEqual([]);
	});

	it("renders inline cues as body block widgets", () => {
		const state = EditorState.create({ doc: NOTE });
		const widgets = buildCueWidgetDecorations(state, {
			cues,
			display: "inline-cues",
		});
		const positions: number[] = [];
		widgets.between(0, state.doc.length, (from) => {
			positions.push(from);
		});
		expect(positions).toEqual([state.doc.line(1).to, state.doc.line(3).to]);
	});
});
