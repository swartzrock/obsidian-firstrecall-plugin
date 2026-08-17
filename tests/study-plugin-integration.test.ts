import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildNoteCache, type NoteCache } from "../src/cache";
import { parseSections } from "../src/parser";
import { DEFAULT_SETTINGS } from "../src/settings";

const { notices } = vi.hoisted(() => ({ notices: [] as string[] }));

vi.mock("obsidian", async (importOriginal) => {
	const original = await importOriginal<Record<string, unknown>>();
	return {
		...original,
		MarkdownView: class MarkdownView {},
		TFile: class TFile {},
		Notice: class Notice {
			constructor(message: string) {
				notices.push(message);
			}
		},
	};
});

import { TFile } from "obsidian";
import CueCraftPlugin from "../src/main";
import type { StudySessionController } from "../src/study-session";

const NOTE = "# Agents\nAgents use tools.";
const OTHER_NOTE = "# Memory\nRetrieval strengthens memory.";
const GENERATE_FIRST = "CueCraft: generate Section cues for this note first.";

function cacheFor(markdown: string): NoteCache {
	const section = parseSections(markdown)[0];
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
					question: `Question for ${section.heading}`,
					summary: null,
					error: null,
				},
			],
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

type RegisteredCommand = { id: string; callback: () => void | Promise<void> };
type EventCallback = (...args: never[]) => unknown;
type EditorTransaction = { effects: { value: Record<string, unknown> } };

interface HarnessView {
	file: TFile;
	leaf: { view: HarnessView };
	containerEl: HTMLElement;
	contentEl: HTMLElement;
	getViewType(): string;
	getMode(): "source" | "preview";
	editor: {
		getValue(): string;
		cm: {
			dom: HTMLElement;
			dispatch(transaction: EditorTransaction): void;
		};
	};
	previewMode: { rerender: ReturnType<typeof vi.fn> };
	addAction(
		icon: string,
		title: string,
		callback: (event: MouseEvent) => void
	): HTMLElement;
}

function file(path: string): TFile {
	return Object.assign(new TFile(), {
		path,
		extension: "md",
		basename: path.split("/").at(-1)?.replace(/\.md$/, "") ?? path,
		stat: { mtime: 1 },
	});
}

function installDom(): Document {
	const dom = new JSDOM("<main><div id='header'></div></main>");
	globalThis.window = dom.window as unknown as typeof globalThis.window;
	globalThis.document = dom.window.document;
	globalThis.HTMLElement = dom.window.HTMLElement;
	Object.defineProperty(dom.window, "requestAnimationFrame", {
		value: (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		},
	});
	Object.defineProperty(dom.window, "cancelAnimationFrame", {
		value: vi.fn(),
	});
	const proto = dom.window.HTMLElement.prototype as HTMLElement & {
		addClass?: (...classes: string[]) => void;
		setText?: (text: string) => void;
	};
	proto.addClass = function addClass(...classes: string[]) {
		this.classList.add(...classes);
	};
	proto.setText = function setText(text: string) {
		this.textContent = text;
	};
	return dom.window.document;
}

function createHarness() {
	const document = installDom();
	const noteFile = file("notes/agents.md");
	const otherFile = file("notes/memory.md");
	const markdownByPath = new Map([
		[noteFile.path, NOTE],
		[otherFile.path, OTHER_NOTE],
	]);
	const dispatches: Array<{ payload: Record<string, unknown>; active: boolean }> = [];
	let mode: "source" | "preview" = "source";
	let activeFile: TFile | null = noteFile;
	let activeView: HarnessView | null;
	const header = document.querySelector<HTMLElement>("#header")!;
	const statusBar = document.createElement("div");
	const makeView = (target: TFile): HarnessView => {
		const view = {} as HarnessView;
		const containerEl = document.createElement("section");
		const contentEl = document.createElement("div");
		contentEl.className = "view-content";
		containerEl.append(contentEl);
		Object.assign(view, {
			file: target,
			leaf: { view },
			containerEl,
			contentEl,
			getViewType: () => "markdown",
			getMode: () => mode,
			editor: {
				getValue: () => markdownByPath.get(view.file.path) ?? "",
				cm: {
					dom: document.createElement("div"),
					dispatch: (transaction: EditorTransaction) => {
						dispatches.push({
							payload: transaction.effects.value,
							active: controller().snapshot().active,
						});
					},
				},
			},
			previewMode: { rerender: vi.fn() },
			addAction: vi.fn(
				(icon: string, title: string, callback: (event: MouseEvent) => void) => {
					const action = document.createElement("button");
					action.dataset.icon = icon;
					action.title = title;
					action.addEventListener("click", callback);
					header.appendChild(action);
					return action;
				}
			),
		});
		return view;
	};
	const firstView = makeView(noteFile);
	activeView = firstView;
	const leaves = [{ view: firstView }];
	const workspaceEvents = new Map<string, EventCallback>();
	const vaultEvents = new Map<string, EventCallback>();
	const commands = new Map<string, RegisteredCommand>();
	const ribbons: Array<{
		icon: string;
		label: string;
		element: HTMLButtonElement;
	}> = [];
	const openedFiles: string[] = [];
	const viewStates: string[] = [];
	let restoredLeaves: Array<{ type: string; active: boolean }> = [];
	const detachLeavesOfType = vi.fn((type: string) => {
		restoredLeaves = restoredLeaves.filter((leaf) => leaf.type !== type);
	});
	let layoutReady: (() => void) | null = null;
	let cachedRead = async (target: TFile) => markdownByPath.get(target.path) ?? "";
	const workspace = {
		leftSplit: null,
		getActiveFile: () => activeFile,
		getActiveViewOfType: () => activeView,
		iterateAllLeaves: (visit: (leaf: (typeof leaves)[number]) => void) =>
			leaves.forEach(visit),
		getLeavesOfType: (type: string) =>
			restoredLeaves.filter((leaf) => leaf.type === type),
		detachLeavesOfType,
		on: (name: string, callback: EventCallback) => {
			workspaceEvents.set(name, callback);
			return {};
		},
		onLayoutReady: (callback: () => void) => {
			layoutReady = callback;
		},
		setActiveLeaf: (leaf: (typeof leaves)[number]) => {
			activeView = leaf.view;
			activeFile = leaf.view.file;
		},
		getLeaf: (_kind: unknown) => ({
			openFile: async (target: TFile) => {
				openedFiles.push(target.path);
				activeFile = target;
				if (activeView) activeView.file = target;
			},
			setViewState: async (state: { type: string }) => {
				viewStates.push(state.type);
			},
			view: {},
		}),
		revealLeaf: vi.fn(),
	};
	const app = {
		secretStorage: {
			getSecret: () => null,
			setSecret: vi.fn(),
		},
		workspace,
		vault: {
			on: (name: string, callback: EventCallback) => {
				vaultEvents.set(name, callback);
				return {};
			},
			cachedRead: (target: TFile) => cachedRead(target),
			getAbstractFileByPath: () => null,
		},
	};
	const plugin = new CueCraftPlugin(app as never, {} as never);
	const registerView = vi.fn();
	const data = {
		settings: structuredClone(DEFAULT_SETTINGS),
		caches: {
			[noteFile.path]: cacheFor(NOTE),
			[otherFile.path]: cacheFor(OTHER_NOTE),
		},
		hidden: {},
		cueSectionCollapse: {},
	};
	Object.assign(plugin as unknown as Record<string, unknown>, {
		data,
		settings: data.settings,
		loadPluginData: vi.fn(async () => undefined),
		saveData: vi.fn(async () => undefined),
		addSettingTab: vi.fn(),
		registerView,
		registerEditorExtension: vi.fn(),
		registerMarkdownPostProcessor: vi.fn(),
		registerEvent: vi.fn(),
		addStatusBarItem: () => statusBar,
		addRibbonIcon: (icon: string, label: string, callback: () => void) => {
			const element = document.createElement("button");
			element.dataset.icon = icon;
			element.title = label;
			element.addEventListener("click", callback);
			ribbons.push({ icon, label, element });
			return element;
		},
		addCommand: (command: RegisteredCommand) => commands.set(command.id, command),
	});
	const controller = () =>
		(plugin as unknown as { studySession: StudySessionController }).studySession;

	return {
		plugin,
		controller,
		noteFile,
		otherFile,
		firstView,
		leaves,
		commands,
		ribbons,
		dispatches,
		openedFiles,
		viewStates,
		registerView,
		detachLeavesOfType,
		statusBar,
		workspaceEvents,
		vaultEvents,
		markdownByPath,
		setMode: (next: "source" | "preview") => {
			mode = next;
		},
		setCachedRead: (next: (target: TFile) => Promise<string>) => {
			cachedRead = next;
		},
		setActiveView: (view: HarnessView | null, selectedFile = activeFile) => {
			activeView = view;
			activeFile = selectedFile;
		},
		restoreLayout: (next: Array<{ type: string; active: boolean }>) => {
			restoredLeaves = [...next];
		},
		restoredLayout: () => [...restoredLeaves],
		addView: (target = noteFile) => {
			const view = makeView(target);
			leaves.push({ view });
			return view;
		},
		layoutReady: () => layoutReady?.(),
	};
}

beforeEach(() => {
	notices.length = 0;
});

describe("Study plugin orchestration", () => {
	const retiredDedicatedViewCommand = ["open", "cornell", "view"].join("-");

	it.each([
		[
			"active",
			[
				{ type: "cuecraft-cornell", active: true },
				{ type: "markdown", active: false },
			],
		],
		[
			"background",
			[
				{ type: "markdown", active: true },
				{ type: "cuecraft-cornell", active: false },
			],
		],
		[
			"duplicates",
			[
				{ type: "cuecraft-cornell", active: true },
				{ type: "markdown", active: false },
				{ type: "cuecraft-cornell", active: false },
			],
		],
		["only leaf", [{ type: "cuecraft-cornell", active: true }]],
	] as const)("detaches restored %s legacy leaves without redirecting or starting Study", async (_name, restored) => {
		const harness = createHarness();
		harness.restoreLayout([...restored]);

		await harness.plugin.onload();
		harness.layoutReady();

		expect(harness.registerView).not.toHaveBeenCalled();
		expect(harness.commands.has(retiredDedicatedViewCommand)).toBe(false);
		expect(harness.detachLeavesOfType).toHaveBeenCalledOnce();
		expect(harness.detachLeavesOfType).toHaveBeenCalledWith("cuecraft-cornell");
		expect(harness.restoredLayout()).toEqual(
			restored.filter((leaf) => leaf.type !== "cuecraft-cornell")
		);
		expect(harness.openedFiles).toEqual([]);
		expect(harness.viewStates).toEqual([]);
		expect(harness.controller().snapshot().active).toBe(false);
	});

	it("keeps one enabled or aria-disabled Study action in every Markdown header and a distinct ribbon shortcut", async () => {
		const harness = createHarness();
		await harness.plugin.onload();
		harness.layoutReady();

		const headerAction = document.querySelector<HTMLElement>(
			".cuecraft-study-header-action"
		)!;
		expect(harness.firstView.addAction).toHaveBeenCalledTimes(1);
		expect(headerAction.textContent).toContain("Study");
		expect(headerAction.getAttribute("aria-disabled")).toBeNull();
		expect(harness.ribbons.map(({ icon }) => icon)).toEqual([
			"graduation-cap",
			"book-open-check",
		]);
		expect(harness.ribbons[1].label).toContain("Study");

		harness.markdownByPath.set(harness.noteFile.path, "# Agents\nChanged answer.");
		harness.workspaceEvents.get("layout-change")?.();
		expect(harness.firstView.addAction).toHaveBeenCalledTimes(1);
		expect(headerAction.getAttribute("aria-disabled")).toBe("true");
		expect(headerAction.title).toBe(GENERATE_FIRST);
		expect(harness.ribbons[1].element.getAttribute("aria-disabled")).toBe("true");
		headerAction.click();
		headerAction.dispatchEvent(
			new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })
		);
		harness.ribbons[1].element.click();
		expect(notices).toEqual([GENERATE_FIRST, GENERATE_FIRST, GENERATE_FIRST]);
	});

	it("starts and toggles in-note Study while review stays idempotent", async () => {
		const harness = createHarness();
		await harness.plugin.onload();
		harness.layoutReady();
		const headerAction = document.querySelector<HTMLElement>(
			".cuecraft-study-header-action"
		)!;
		headerAction.click();
		expect(harness.controller().snapshot()).toMatchObject({
			active: true,
			path: harness.noteFile.path,
			revealedCount: 0,
		});
		expect(harness.statusBar.dataset.status).toBe("study");
		expect(harness.statusBar.textContent).toBe("CueCraft: study");
		expect(harness.openedFiles).toEqual([]);
		const studyPayload = harness.dispatches.at(-1)?.payload.study as {
			snapshot: { sections: Array<{ sectionId: string }> };
			controlsContainer: HTMLElement;
			toggleSection(sectionId: string): void;
		};
		expect(studyPayload.controlsContainer).toBe(harness.firstView.contentEl);
		studyPayload.toggleSection(studyPayload.snapshot.sections[0].sectionId);
		await harness.commands.get("review-this-note")?.callback();
		expect(harness.controller().snapshot().revealedCount).toBe(1);

		harness.ribbons[1].element.click();
		expect(harness.controller().snapshot().active).toBe(false);
		await harness.commands.get("toggle-study-mode")?.callback();
		expect(harness.controller().snapshot().revealedCount).toBe(0);

		expect(harness.commands.has(retiredDedicatedViewCommand)).toBe(false);
		expect(harness.viewStates).toEqual([]);
	});

	it("exits Study immediately when an editor change makes the cue stale", async () => {
		const harness = createHarness();
		await harness.plugin.onload();
		harness.layoutReady();
		document.querySelector<HTMLElement>(".cuecraft-study-header-action")?.click();
		const start = harness.dispatches.length;
		const study = harness.dispatches.at(-1)?.payload.study as {
			documentChanged(markdown: string): void;
		};

		harness.markdownByPath.set(harness.noteFile.path, "# Agents\nChanged answer.");
		study.documentChanged("# Agents\nChanged answer.");

		expect(harness.controller().snapshot().active).toBe(false);
		expect(
			harness.dispatches
				.slice(start)
				.some(({ payload, active }) => active && !("study" in payload))
		).toBe(true);
	});

	it("does not let an older status read overwrite a newly started Study session", async () => {
		const harness = createHarness();
		let resolveRead: (markdown: string) => void = () => undefined;
		harness.setCachedRead(
			() => new Promise<string>((resolve) => {
				resolveRead = resolve;
			})
		);
		await harness.plugin.onload();
		harness.layoutReady();
		document.querySelector<HTMLElement>(".cuecraft-study-header-action")?.click();

		resolveRead(NOTE);
		await Promise.resolve();
		await Promise.resolve();

		expect(harness.statusBar.dataset.status).toBe("study");
		expect(harness.statusBar.textContent).toBe("CueCraft: study");
	});

	it("opens a requested Markdown target for fresh review without opening Cornell", async () => {
		const harness = createHarness();
		await harness.plugin.onload();
		harness.layoutReady();
		document.querySelector<HTMLElement>(".cuecraft-study-header-action")?.click();

		await (
			harness.plugin as unknown as {
				reviewThisNote(target: TFile): Promise<void>;
			}
		).reviewThisNote(harness.otherFile);

		expect(harness.openedFiles).toEqual([harness.otherFile.path]);
		expect(harness.controller().snapshot()).toMatchObject({
			active: true,
			path: harness.otherFile.path,
			revealedCount: 0,
		});
		expect(harness.viewStates).toEqual([]);
	});

	it("preserves same-path progress across leaves and non-Markdown focus, then restores before every teardown", async () => {
		const harness = createHarness();
		await harness.plugin.onload();
		harness.layoutReady();
		document.querySelector<HTMLElement>(".cuecraft-study-header-action")?.click();
		const study = harness.dispatches.at(-1)?.payload.study as {
			snapshot: { sections: Array<{ sectionId: string }> };
			toggleSection(sectionId: string): void;
		};
		study.toggleSection(study.snapshot.sections[0].sectionId);
		harness.setMode("preview");
		harness.workspaceEvents.get("active-leaf-change")?.({
			view: harness.firstView,
		} as never);
		expect(harness.controller().snapshot().revealedCount).toBe(1);
		harness.setMode("source");
		harness.workspaceEvents.get("active-leaf-change")?.({
			view: harness.firstView,
		} as never);
		expect(
			(harness.dispatches.at(-1)?.payload.study as {
				snapshot: { revealedCount: number };
			}).snapshot.revealedCount
		).toBe(1);

		const secondView = harness.addView();
		harness.setActiveView(secondView, harness.noteFile);
		harness.workspaceEvents.get("active-leaf-change")?.({ view: secondView } as never);
		expect(harness.controller().snapshot().revealedCount).toBe(1);
		expect((harness.dispatches.at(-1)?.payload.study as { snapshot: { revealedCount: number } }).snapshot.revealedCount).toBe(1);

		harness.setActiveView(null, harness.noteFile);
		harness.workspaceEvents.get("active-leaf-change")?.({
			view: { getViewType: () => "canvas" },
		} as never);
		expect(harness.controller().snapshot().revealedCount).toBe(1);
		expect(harness.dispatches.at(-1)?.active).toBe(true);
		expect("study" in (harness.dispatches.at(-1)?.payload ?? {})).toBe(false);

		harness.setActiveView(secondView, harness.noteFile);
		harness.workspaceEvents.get("active-leaf-change")?.({ view: secondView } as never);
		expect(harness.controller().snapshot().revealedCount).toBe(1);

		const assertRestoreBeforeClear = async (teardown: () => void | Promise<void>) => {
			const start = harness.dispatches.length;
			await teardown();
			expect(harness.controller().snapshot().active).toBe(false);
			expect(
				harness.dispatches
					.slice(start)
					.some(({ payload, active }) => active && !("study" in payload))
			).toBe(true);
		};

		const different = harness.otherFile;
		harness.setActiveView(secondView, different);
		secondView.file = different;
		await assertRestoreBeforeClear(() =>
			harness.workspaceEvents.get("file-open")?.(different as never)
		);

		secondView.file = harness.noteFile;
		harness.setActiveView(secondView, harness.noteFile);
		document.querySelector<HTMLElement>(".cuecraft-study-header-action")?.click();
		await assertRestoreBeforeClear(() =>
			harness.vaultEvents.get("rename")?.(
				Object.assign(file("notes/renamed.md"), { path: "notes/renamed.md" }) as never,
				harness.noteFile.path as never
			)
		);

		document.querySelector<HTMLElement>(".cuecraft-study-header-action")?.click();
		await assertRestoreBeforeClear(() =>
			harness.vaultEvents.get("delete")?.(harness.noteFile as never)
		);

		document.querySelector<HTMLElement>(".cuecraft-study-header-action")?.click();
		await assertRestoreBeforeClear(() =>
			harness.commands.get("clear-cues")?.callback()
		);

		const unloadHarness = createHarness();
		await unloadHarness.plugin.onload();
		unloadHarness.layoutReady();
		document.querySelector<HTMLElement>(".cuecraft-study-header-action")?.click();
		const unloadStart = unloadHarness.dispatches.length;
		unloadHarness.plugin.onunload();
		expect(unloadHarness.controller().snapshot().active).toBe(false);
		expect(
			unloadHarness.dispatches
				.slice(unloadStart)
				.some(({ payload, active }) => active && !("study" in payload))
		).toBe(true);
		expect(
			document.querySelector(".cuecraft-study-header-action")
		).toBeNull();
	});

	it("ends Study when the active note closes and reopens with fresh progress", async () => {
		const harness = createHarness();
		await harness.plugin.onload();
		harness.layoutReady();
		document.querySelector<HTMLElement>(".cuecraft-study-header-action")?.click();
		const study = harness.dispatches.at(-1)?.payload.study as {
			snapshot: { sections: Array<{ sectionId: string }> };
			toggleSection(sectionId: string): void;
		};
		study.toggleSection(study.snapshot.sections[0].sectionId);
		expect(harness.controller().snapshot().revealedCount).toBe(1);

		harness.setActiveView(null, null);
		harness.workspaceEvents.get("file-open")?.(null as never);
		expect(harness.controller().snapshot().active).toBe(false);

		harness.setActiveView(harness.firstView, harness.noteFile);
		harness.workspaceEvents.get("file-open")?.(harness.noteFile as never);
		document.querySelector<HTMLElement>(".cuecraft-study-header-action")?.click();
		expect(harness.controller().snapshot()).toMatchObject({
			active: true,
			revealedCount: 0,
		});
	});
});
