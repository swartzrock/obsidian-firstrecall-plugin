import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import CueCraftPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/settings";
import { buildNoteCache } from "../src/cache";
import { parseSections } from "../src/parser";
import { resolveStudySections, type StudySessionController } from "../src/study-session";

const STUDY_NOTE = "# Agents\nAgents use tools.";

function studyCache() {
	const section = parseSections(STUDY_NOTE)[0];
	return buildNoteCache({
		result: {
			sections: [
				{
					id: section.id,
					heading: section.heading,
					level: section.level,
					lineNumber: section.lineNumber,
					contentHash: section.contentHash,
					keywords: ["tools"],
					question: "What do agents use?",
					sectionLens: null,
					error: null,
				},
			],
			summary: null,
			learningObjective: null,
			noteBrief: null,
			canceled: false,
		},
		provider: "test",
		model: "test",
		preset: "conceptual",
		generationMode: "whole-note-context",
		noteModifiedAt: 1,
	});
}

describe("Editing View cue refresh", () => {
	it("skips Markdown leaves whose editor is not initialized", () => {
		const plugin = new CueCraftPlugin({} as never, {} as never);
		const uninitializedView = {
			getViewType: () => "markdown",
			editor: undefined,
		};
		Object.assign(plugin as unknown as Record<string, unknown>, {
			app: {
				workspace: {
					iterateAllLeaves: (
						visit: (leaf: { view: typeof uninitializedView }) => void
					) => visit({ view: uninitializedView }),
				},
			},
		});

		expect(() => plugin.refreshEditorCues()).not.toThrow();
	});

	it("applies a display change to an open editor when settings has focus", () => {
		const document = new JSDOM("<div class='cm-editor'></div>").window.document;
		const editorDom = document.querySelector<HTMLElement>(".cm-editor")!;
		const dispatch = vi.fn();
		const file = { path: "notes/agents.md" };
		const markdownView = {
			getViewType: () => "markdown",
			getMode: () => "source",
			file,
			addAction: () => document.createElement("button"),
			editor: {
				cm: { dom: editorDom, dispatch },
				getValue: () => "# Agents\nAgents use tools.",
			},
		};
		const plugin = new CueCraftPlugin({} as never, {} as never);
		plugin.settings = {
			...structuredClone(DEFAULT_SETTINGS),
			editorCueDisplay: "cornell",
		};
		Object.assign(plugin as unknown as Record<string, unknown>, {
			app: {
				workspace: {
					getActiveFile: () => null,
					getActiveViewOfType: () => null,
					iterateAllLeaves: (visit: (leaf: { view: typeof markdownView }) => void) =>
						visit({ view: markdownView }),
				},
			},
			cacheStore: { get: () => null },
			visibility: { isHidden: () => false },
			cueSectionCollapse: {},
			updateEditorHookLayout: vi.fn(),
		});

		plugin.refreshEditorCues();

		expect(dispatch).toHaveBeenCalledTimes(1);
		const effect = dispatch.mock.calls[0]?.[0].effects as {
			value: { display: string };
		};
		expect(effect.value.display).toBe("cornell");
		expect(editorDom.dataset.cuecraftEditorDisplay).toBe("cornell");
	});

	it("projects Study and hidden cues into only the active same-path editor", () => {
		const document = new JSDOM(
			"<div id='active' class='cm-editor'></div><div id='inactive' class='cm-editor'></div>"
		).window.document;
		const file = { path: "notes/agents.md" };
		const activeDispatch = vi.fn();
		const inactiveDispatch = vi.fn();
		const makeView = (id: string, dispatch: ReturnType<typeof vi.fn>) => ({
			getViewType: () => "markdown",
			getMode: () => "source",
			file,
			addAction: () => document.createElement("button"),
			editor: {
				cm: {
					dom: document.querySelector<HTMLElement>(`#${id}`)!,
					dispatch,
				},
				getValue: () => STUDY_NOTE,
			},
		});
		const activeView = makeView("active", activeDispatch);
		const inactiveView = makeView("inactive", inactiveDispatch);
		const cache = studyCache();
		const plugin = new CueCraftPlugin({} as never, {} as never);
		plugin.settings = structuredClone(DEFAULT_SETTINGS);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			app: {
				workspace: {
					getActiveFile: () => file,
					getActiveViewOfType: () => activeView,
					iterateAllLeaves: (
						visit: (leaf: { view: typeof activeView }) => void
					) => {
						visit({ view: inactiveView });
						visit({ view: activeView });
					},
				},
			},
			cacheStore: { get: () => cache },
			visibility: { isHidden: () => true },
			cueSectionCollapse: {},
			updateEditorHookLayout: vi.fn(),
		});
		const controller = (
			plugin as unknown as { studySession: StudySessionController }
		).studySession;
		controller.start(
			file.path,
			resolveStudySections(STUDY_NOTE, cache.sections, parseSections(STUDY_NOTE))
		);

		plugin.refreshEditorCues();

		const activePayload = activeDispatch.mock.calls.at(-1)?.[0].effects.value;
		const inactivePayload = inactiveDispatch.mock.calls.at(-1)?.[0].effects.value;
		expect(activePayload.cues).toHaveLength(1);
		expect(activePayload.study?.snapshot).toMatchObject({
			active: true,
			path: file.path,
			total: 1,
		});
		expect(inactivePayload.cues).toEqual([]);
		expect(inactivePayload.study).toBeUndefined();
	});
});
