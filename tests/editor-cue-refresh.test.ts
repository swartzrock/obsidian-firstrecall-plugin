import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import FirstRecallPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/settings";
import { buildNoteCache } from "../src/cache";
import { parseSections } from "../src/parser";
import { resolveStudySections, type StudySessionController } from "../src/study-session";
import { createCurrentMaintenanceState } from "../src/study-material-state";
import {
	removeStudyMaterialBanner,
	syncStudyMaterialBanner,
} from "../src/study-material-banner";

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
					summary: null,
					error: null,
				},
			],
			summary: null,
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
		const plugin = new FirstRecallPlugin({} as never, {} as never);
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
		const plugin = new FirstRecallPlugin({} as never, {} as never);
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
			cacheStore: { get: () => null, getState: () => null },
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
		expect(editorDom.dataset.firstrecallEditorDisplay).toBe("cornell");
	});

	it("projects outdated maintenance into the Editing banner and affected cards", () => {
		const document = new JSDOM(
			"<main class='view-content'><div class='cm-editor'></div></main>"
		).window.document;
		const editorDom = document.querySelector<HTMLElement>(".cm-editor")!;
		const contentEl = document.querySelector<HTMLElement>("main")!;
		const dispatch = vi.fn();
		const file = { path: "notes/agents.md", basename: "agents" };
		const changed = "# Agents\nAgents use tools and memory.";
		const cache = studyCache();
		const state = createCurrentMaintenanceState("agents", STUDY_NOTE, cache);
		const markdownView = {
			getViewType: () => "markdown",
			getMode: () => "source",
			file,
			contentEl,
			addAction: () => document.createElement("button"),
			editor: {
				cm: { dom: editorDom, dispatch },
				getValue: () => changed,
			},
		};
		const plugin = new FirstRecallPlugin({} as never, {} as never);
		plugin.settings = {
			...structuredClone(DEFAULT_SETTINGS),
			studyAreas: [
				{
					id: "notes",
					name: "Notes",
					parentPath: "notes",
					excludedPaths: [],
					maintenanceMode: "maintain-on-save",
					createdAt: "2026-08-18T00:00:00.000Z",
				},
			],
		};
		Object.assign(plugin as unknown as Record<string, unknown>, {
			app: {
				workspace: {
					getActiveFile: () => file,
					getActiveViewOfType: () => markdownView,
					iterateAllLeaves: (
						visit: (leaf: { view: typeof markdownView }) => void
					) => visit({ view: markdownView }),
				},
			},
			cacheStore: {
				get: () => cache,
				getState: () => state,
			},
			visibility: { isHidden: () => false },
			cueSectionCollapse: {},
			isConfigured: () => true,
			updateEditorHookLayout: vi.fn(),
		});

		plugin.refreshEditorCues();

		const payload = dispatch.mock.calls[0]?.[0].effects.value as {
			cues: Array<{ freshness: string }>;
		};
		expect(payload.cues[0].freshness).toBe("outdated");
		expect(
			contentEl.querySelector(".firstrecall-study-material-banner")?.textContent
		).toContain("out of date");
		expect(contentEl.querySelectorAll(".firstrecall-study-material-banner")).toHaveLength(1);

		(markdownView as { file: typeof file | null }).file = null;
		plugin.refreshEditorCues();
		expect(contentEl.querySelector(".firstrecall-study-material-banner")).toBeNull();
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
		const plugin = new FirstRecallPlugin({} as never, {} as never);
		plugin.settings = {
			...structuredClone(DEFAULT_SETTINGS),
			showSummary: false,
			showQuestion: false,
			showTerms: false,
		};
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
			cacheStore: { get: () => cache, getState: () => null },
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
		expect(activePayload).toMatchObject({
			showSummary: false,
			showQuestion: false,
			showTerms: false,
		});
		expect(inactivePayload.cues).toEqual([]);
		expect(inactivePayload.study).toBeUndefined();
	});

	it("rerenders every open Reading leaf and skips Editing leaves", () => {
		const plugin = new FirstRecallPlugin({} as never, {} as never);
		const firstRerender = vi.fn();
		const secondRerender = vi.fn();
		const editingRerender = vi.fn();
		const leaves = [
			{
				view: {
					getViewType: () => "markdown",
					getMode: () => "preview",
					previewMode: { rerender: firstRerender },
				},
			},
			{
				view: {
					getViewType: () => "markdown",
					getMode: () => "preview",
					previewMode: { rerender: secondRerender },
				},
			},
			{
				view: {
					getViewType: () => "markdown",
					getMode: () => "source",
					previewMode: { rerender: editingRerender },
				},
			},
		];
		Object.assign(plugin as unknown as Record<string, unknown>, {
			app: {
				workspace: {
					getLeavesOfType: () => leaves,
				},
			},
		});

		plugin.refreshReadingModeSurface();

		expect(firstRerender).toHaveBeenCalledWith(true);
		expect(secondRerender).toHaveBeenCalledWith(true);
		expect(editingRerender).not.toHaveBeenCalled();
	});

	it("skips reported Markdown leaves without Markdown view methods", () => {
		const plugin = new FirstRecallPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			app: {
				workspace: {
					getLeavesOfType: () => [{ view: { getViewType: () => "markdown" } }],
				},
			},
		});

		expect(() => plugin.refreshReadingModeSurface()).not.toThrow();
	});
});

describe("study material banner", () => {
	it("keeps one semantic host and routes named update and Retry actions", async () => {
		const document = new JSDOM("<main><button id='before'>Before</button></main>")
			.window.document;
		const container = document.querySelector<HTMLElement>("main")!;
		const onUpdate = vi.fn(async () => undefined);
		const onRetry = vi.fn(async () => undefined);
		const onDismiss = vi.fn(async () => undefined);

		const firstHost = syncStudyMaterialBanner(
			container,
			{ revision: "one", kind: "outdated", action: "update" },
			{ onUpdate, onRetry, onDismiss }
		);
		const latestUpdate = vi.fn(async () => undefined);
		const secondHost = syncStudyMaterialBanner(
			container,
			{ revision: "one", kind: "outdated", action: "update" },
			{ onUpdate: latestUpdate, onRetry, onDismiss }
		);
		expect(secondHost).toBe(firstHost);
		expect(container.querySelectorAll(".firstrecall-study-material-banner")).toHaveLength(1);
		const update = container.querySelector<HTMLButtonElement>(
			"[data-banner-action='update']"
		)!;
		expect(update.textContent).toBe("Update study material");
		expect(update.closest("[role='status']")?.getAttribute("aria-live")).toBe(
			"polite"
		);
		update.click();
		await vi.waitFor(() => expect(latestUpdate).toHaveBeenCalledTimes(1));
		expect(onUpdate).not.toHaveBeenCalled();

		syncStudyMaterialBanner(
			container,
			{ revision: "one", kind: "failed", action: "retry" },
			{ onUpdate, onRetry, onDismiss }
		);
		const retry = container.querySelector<HTMLButtonElement>(
			"[data-banner-action='retry']"
		)!;
		expect(retry.textContent).toBe("Retry update");
		expect(retry.closest("[role='alert']")?.getAttribute("aria-live")).toBe(
			"assertive"
		);
		retry.click();
		await vi.waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
	});

	it("dismisses one revision, preserves focus, and cleans listeners and hosts", async () => {
		const document = new JSDOM("<main></main>").window.document;
		const container = document.querySelector<HTMLElement>("main")!;
		const onDismiss = vi.fn(async () => {
			removeStudyMaterialBanner(container);
		});
		syncStudyMaterialBanner(
			container,
			{ revision: "revision-2", kind: "outdated", action: "update" },
			{
				onUpdate: vi.fn(),
				onRetry: vi.fn(),
				onDismiss,
			}
		);
		const dismiss = container.querySelector<HTMLButtonElement>(
			"[data-banner-action='dismiss']"
		)!;
		dismiss.focus();
		dismiss.click();
		await vi.waitFor(() => expect(onDismiss).toHaveBeenCalledWith("revision-2"));

		expect(container.querySelector(".firstrecall-study-material-banner")).toBeNull();
		expect(document.activeElement).toBe(container);
		removeStudyMaterialBanner(container);
		expect(onDismiss).toHaveBeenCalledTimes(1);
	});
});
