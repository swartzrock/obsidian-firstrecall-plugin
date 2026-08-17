import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import {
	CueSectionCollapseStore,
	loadCueSectionCollapseMap,
} from "../src/cue-section-collapse";
import {
	buildCueGutterMarkers,
	buildCueLineData,
} from "../src/cue-extension";
import { buildNoteCache } from "../src/cache";
import { parseSections } from "../src/parser";
import type { NoteGenerationResult } from "../src/generator";

function cacheFor(markdown: string) {
	const sections = parseSections(markdown);
	const result: NoteGenerationResult = {
		sections: sections.map((section) => ({
			id: section.id,
			heading: section.heading,
			level: section.level,
			lineNumber: section.lineNumber,
			contentHash: section.contentHash,
			keywords: ["retrieval"],
			question: "Why does retrieval help?",
			summary: null,
			error: null,
		})),
		summary: null,
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

describe("loadCueSectionCollapseMap", () => {
	it("rejects malformed paths, section ids, kinds, and values", () => {
		expect(
			loadCueSectionCollapseMap({
				"notes/a.md": {
					"section-a": {
						summary: true,
						question: false,
						terms: "yes",
						unknown: true,
					},
					"": { question: true },
				},
				"": { "section-b": { terms: true } },
				"notes/b.md": "collapsed",
			})
		).toEqual({
			"notes/a.md": {
				"section-a": { summary: true },
			},
		});
	});
});

describe("CueSectionCollapseStore", () => {
	it("stores only collapsed overrides and removes empty branches", async () => {
		const persist = vi.fn(async () => {});
		const store = new CueSectionCollapseStore({}, persist);

		const collapse = store.setCollapsed(
			"notes/a.md",
			"section-a",
			"summary",
			true
		);
		expect(store.isCollapsed("notes/a.md", "section-a", "summary")).toBe(
			true
		);
		await collapse;
		expect(store.snapshot()).toEqual({
			"notes/a.md": { "section-a": { summary: true } },
		});

		await store.setCollapsed(
			"notes/a.md",
			"section-a",
			"summary",
			false
		);
		expect(store.snapshot()).toEqual({});
		expect(persist).toHaveBeenCalledTimes(2);
	});

	it("keeps notes, sections, and content kinds independent", async () => {
		const store = new CueSectionCollapseStore({}, async () => {});

		await store.setCollapsed("notes/a.md", "shared-heading", "question", true);
		await store.setCollapsed("notes/a.md", "other-section", "terms", true);
		await store.setCollapsed("notes/b.md", "shared-heading", "summary", true);

		expect(store.isCollapsed("notes/a.md", "shared-heading", "question")).toBe(
			true
		);
		expect(store.isCollapsed("notes/a.md", "shared-heading", "summary")).toBe(
			false
		);
		expect(store.isCollapsed("notes/b.md", "shared-heading", "summary")).toBe(
			true
		);
		expect(store.isCollapsed("notes/b.md", "other-section", "terms")).toBe(
			false
		);
	});
});

describe("buildCueLineData collapse identity", () => {
	it("keeps the cached section id when a heading moves", () => {
		const cache = cacheFor("# Retrieval\nPractice recalling the answer.");

		const [cue] = buildCueLineData(
			cache,
			parseSections("preface\n# Retrieval\nPractice recalling the answer.")
		);

		expect(cue.line).toBe(2);
		expect(cue.sectionId).toBe(cache.sections[0].id);
	});

	it("rebuilds a Cornell marker from the controller's live state", async () => {
		const markdown = "# Retrieval\nPractice recalling the answer.";
		const sections = parseSections(markdown);
		const cache = cacheFor(markdown);
		const [cue] = buildCueLineData(cache, sections);
		const controller = new CueSectionCollapseStore({}, async () => {});
		const state = EditorState.create({ doc: markdown });
		const payload = {
			cues: [cue],
			display: "cornell" as const,
			notePath: "notes/retrieval.md",
			collapseController: controller,
		};
		const before = buildCueGutterMarkers(state, payload).iter();

		const persist = controller.setCollapsed(
			payload.notePath,
			cue.sectionId,
			"question",
			true
		);
		const after = buildCueGutterMarkers(state, payload).iter();

		expect(before.value.eq(after.value)).toBe(false);
		await persist;
	});
});
