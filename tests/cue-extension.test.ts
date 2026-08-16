import { describe, it, expect, vi } from "vitest";
import { JSDOM } from "jsdom";
import { EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import {
	applyEditorCueWidthPreview,
	buildCueGutterMarkers,
	buildCueLineData,
	buildEditorStudyAnswerDecorations,
	buildCueWidgetDecorations,
	cueEditorExtension,
	cueGutterField,
	cueStudyField,
	RAIL_CARD_LAYOUT_EVENT,
	buildRailSpacerDecorations,
	cueRailSpacerField,
	measureRailSpacerHeights,
	railSpacerHeightForOverlap,
	railLayoutUpdateNeedsMeasure,
	scheduleRailLayoutMeasure,
	renderNoteBriefElement,
	renderCueElement,
	setCuesEffect,
	setRailSpacersEffect,
	type CueEditorRenderState,
	type CueLineData,
} from "../src/cue-extension";
import { EDITOR_CUE_DISPLAY_OPTIONS } from "../src/editor-cue-display";
import { buildNoteCache, migrateCache } from "../src/cache";
import { parseSections } from "../src/parser";
import type { NoteGenerationResult } from "../src/generator";
import type {
	CueSectionCollapseController,
	CueSectionKind,
} from "../src/cue-section-collapse";
import type { StudySessionSnapshot } from "../src/study-session";

const NOTE = "# A\nalpha\n## B\nbeta\n## C\ngamma";
const SECTION_LENS = {
	keyPhrase: "agent autonomy",
	takeaway: "Agents use tools to complete multi-step work.",
	explanation: "The section contrasts one-shot chat with tool-using agents.",
};
const NOTE_BRIEF = {
	overview: "The note explains how agents use tools to complete work.",
	whatMatters: {
		title: "Agent workflow",
		detail: "Agents can plan, decide, and use tools.",
	},
	reviewFirst: {
		title: "Review First: Agent versus chatbot",
		detail: "Review the contrast with single-turn chatbots first.",
	},
	sayItBack: {
		title: "Self-Test",
		detail: "Say why tool use changes the task boundary.",
	},
};
const LEGACY_CATEGORY_TEXT = [
	"sequences",
	"linkedlists",
	"stacks",
	"intervals",
];

function expectNoLegacyCategoryPresentation(element: HTMLElement): void {
	expect(element.hasAttribute("data-category")).toBe(false);
	expect(element.querySelector("[data-category]")).toBeNull();
	expect(element.querySelector(".cuecraft-section-tag")).toBeNull();
	expect(element.querySelector(".cuecraft-section-tag-dot")).toBeNull();
	for (const category of LEGACY_CATEGORY_TEXT) {
		expect(element.textContent).not.toContain(category);
	}
}

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

function withEditorView<T>(
	docText: string,
	extensions: Extension,
	fn: (view: EditorView, parent: HTMLElement) => T
): T {
	const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
		pretendToBeVisual: true,
	});
	const previousGlobals = new Map<PropertyKey, PropertyDescriptor | undefined>();
	const testGlobals: Record<PropertyKey, unknown> = {
		window: dom.window,
		document: dom.window.document,
		navigator: dom.window.navigator,
		MutationObserver: dom.window.MutationObserver,
		HTMLElement: dom.window.HTMLElement,
		Node: dom.window.Node,
		DOMRect: dom.window.DOMRect,
		getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
	};
	for (const [key, value] of Object.entries(testGlobals)) {
		previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
		Object.defineProperty(globalThis, key, { configurable: true, value });
	}
	const parent = dom.window.document.querySelector<HTMLElement>("main");
	if (!parent) throw new Error("Missing editor parent");
	const view = new EditorView({
		state: EditorState.create({ doc: docText, extensions }),
		parent,
	});
	try {
		return fn(view, parent);
	} finally {
		view.destroy();
		dom.window.close();
		for (const [key, descriptor] of previousGlobals) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else delete (globalThis as Record<PropertyKey, unknown>)[key];
		}
	}
}

function collapseController(initial: readonly CueSectionKind[] = []): {
	controller: CueSectionCollapseController;
	collapsed: Set<CueSectionKind>;
	calls: Array<[string, string, CueSectionKind, boolean]>;
} {
	const collapsed = new Set(initial);
	const calls: Array<[string, string, CueSectionKind, boolean]> = [];
	return {
		collapsed,
		calls,
		controller: {
			isCollapsed: (_notePath, _sectionId, kind) => collapsed.has(kind),
			setCollapsed: (notePath, sectionId, kind, value) => {
				calls.push([notePath, sectionId, kind, value]);
				if (value) collapsed.add(kind);
				else collapsed.delete(kind);
				return Promise.resolve();
			},
		},
	};
}

function cue(overrides: Partial<CueLineData> = {}): CueLineData {
	return {
		line: 1,
		sectionId: "section-terms",
		heading: "Terms",
		question: "How do agents differ from chatbots?",
		keywords: ["agents", "tools"],
		sectionLens: SECTION_LENS,
		error: null,
		...overrides,
	};
}

function studySnapshot(
	overrides: Partial<StudySessionSnapshot> = {}
): StudySessionSnapshot {
	return {
		active: true,
		path: "notes/agents.md",
		sections: [
			{
				sectionId: "section-terms",
				headingLine: 1,
				bodyStartLine: 2,
				bodyEndLine: 2,
				headingRange: { from: 0, to: 7 },
				bodyRange: { from: 8, to: 12 },
				revealed: false,
			},
		],
		revealedCount: 0,
		total: 1,
		...overrides,
	};
}

describe("Editing View Study projection", () => {
	it("conceals only an admitted answer body and removes it from the accessibility tree", () => {
		const state = EditorState.create({ doc: "# Terms\nbody" });
		const decorations = buildEditorStudyAnswerDecorations(
			state,
			studySnapshot()
		);
		const ranges: Array<{
			from: number;
			to: number;
			className: string | undefined;
			ariaHidden: string | undefined;
		}> = [];
		decorations.between(0, state.doc.length, (from, to, value) => {
			ranges.push({
				from,
				to,
				className: value.spec.class,
				ariaHidden: value.spec.attributes?.["aria-hidden"],
			});
		});

		expect(ranges).toEqual([
			{
				from: 8,
				to: 12,
				className: "cuecraft-editor-study-answer is-hidden",
				ariaHidden: "true",
			},
		]);
	});

	it("maps admitted answer ranges through ordinary edits until reconciliation", () => {
		const callbacks = {
			toggleSection: vi.fn(),
			showAll: vi.fn(),
			hideAll: vi.fn(),
			exit: vi.fn(),
		};
		let state = EditorState.create({
			doc: "# Terms\nbody",
			extensions: [cueStudyField],
		});
		state = state.update({
			effects: setCuesEffect.of({
				cues: [cue()],
				display: "inline-cues",
				study: { snapshot: studySnapshot(), ...callbacks },
			}),
		}).state;
		state = state.update({ changes: { from: 0, insert: "intro\n" } }).state;
		state = state.update({ changes: { from: 16, insert: "XX" } }).state;

		const concealed: Array<[number, number]> = [];
		state
			.field(cueStudyField)
			.decorations.between(0, state.doc.length, (from, to) => {
				concealed.push([from, to]);
			});
		expect(concealed).toEqual([[14, 20]]);
		expect(state.doc.toString()).toBe("intro\n# Terms\nboXXdy");

		const revealed = studySnapshot({
			sections: studySnapshot().sections.map((section) => ({
				...section,
				bodyRange: { from: 14, to: 20 },
				revealed: true,
			})),
			revealedCount: 1,
		});
		state = state.update({
			effects: setCuesEffect.of({
				cues: [cue({ line: 2 })],
				display: "inline-cues",
				study: { snapshot: revealed, ...callbacks },
			}),
		}).state;
		expect(state.field(cueStudyField).decorations.size).toBe(0);
	});

	it("notifies the active Study projection after a document change", () => {
		const queuedMicrotasks: Array<() => void> = [];
		const originalQueueMicrotask = globalThis.queueMicrotask;
		globalThis.queueMicrotask = (callback) => queuedMicrotasks.push(callback);
		try {
			withEditorView("# Terms\nbody", cueEditorExtension, (view) => {
				const documentChanged = vi.fn();
				view.dispatch({
					effects: setCuesEffect.of({
						cues: [cue()],
						display: "inline-cues",
						study: {
							snapshot: studySnapshot(),
							toggleSection: vi.fn(),
							showAll: vi.fn(),
							hideAll: vi.fn(),
							exit: vi.fn(),
							documentChanged,
						},
					}),
				});
				queuedMicrotasks.length = 0;
				view.dispatch({ changes: { from: view.state.doc.length, insert: "!" } });
				for (const callback of queuedMicrotasks.splice(0)) callback();

				expect(documentChanged).toHaveBeenCalledOnce();
				expect(documentChanged).toHaveBeenCalledWith("# Terms\nbody!");
			});
		} finally {
			globalThis.queueMicrotask = originalQueueMicrotask;
		}
	});

	it("makes only admitted successful cues accessible reveal controls", () => {
		withDocument(() => {
			const toggleSection = vi.fn();
			const state = EditorState.create({ doc: "# Terms\nbody" });
			const widgets = buildCueWidgetDecorations(state, {
				cues: [
					cue(),
					cue({ sectionId: "failed", error: "No response", question: "" }),
					cue({ sectionId: "fallback" }),
				],
				display: "inline-cues",
				study: {
					snapshot: studySnapshot(),
					toggleSection,
					showAll: vi.fn(),
					hideAll: vi.fn(),
					exit: vi.fn(),
				},
			});
			const rendered: Array<{ widget: { destroy?(dom: Node): void }; dom: HTMLElement }> = [];
			widgets.between(0, state.doc.length, (_from, _to, value) => {
				const widget = value.spec.widget as {
					toDOM(): HTMLElement;
					destroy?(dom: Node): void;
				};
				rendered.push({ widget, dom: widget.toDOM() });
			});

			const studyCue = rendered[0].dom.querySelector<HTMLElement>(
				".cuecraft-cue"
			)!;
			expect(studyCue.getAttribute("role")).toBe("note");
			expect(studyCue.hasAttribute("tabindex")).toBe(false);
			expect(studyCue.dataset.studyState).toBe("hidden");
			const toggle = studyCue.querySelector<HTMLButtonElement>(
				".cuecraft-study-section-toggle"
			)!;
			expect(toggle.getAttribute("aria-label")).toBe("Show section");
			expect(toggle.getAttribute("aria-pressed")).toBe("false");
			expect(toggle.dataset.icon).toBe("eye");
			expect(toggle.dataset.tooltip).toBe("Show section");
			expect(toggle.dataset.tooltipPlacement).toBe("right");
			studyCue.click();
			studyCue.dispatchEvent(
				new document.defaultView!.KeyboardEvent("keydown", {
					bubbles: true,
					key: "Enter",
				})
			);
			studyCue.dispatchEvent(
				new document.defaultView!.KeyboardEvent("keydown", {
					bubbles: true,
					key: " ",
				})
			);
			expect(toggleSection).not.toHaveBeenCalled();
			toggle.click();
			expect(toggleSection).toHaveBeenCalledOnce();
			expect(toggleSection).toHaveBeenCalledWith("section-terms");

			for (const item of rendered.slice(1)) {
				const root = item.dom.querySelector<HTMLElement>(".cuecraft-cue")!;
				expect(root.getAttribute("role")).toBe("note");
				expect(root.querySelector(".cuecraft-study-section-toggle")).toBeNull();
				root.click();
			}
			expect(toggleSection).toHaveBeenCalledTimes(1);

			rendered[0].widget.destroy?.(rendered[0].dom);
			toggle.click();
			expect(toggleSection).toHaveBeenCalledTimes(1);

			const revealedCue = renderCueElement(
				cue(),
				"inline-cues",
				0,
				"upcoming",
				{
					study: {
						sectionId: "section-terms",
						revealed: true,
						toggleSection,
					},
				}
			);
			const hideToggle = revealedCue.querySelector<HTMLButtonElement>(
				".cuecraft-study-section-toggle"
			)!;
			expect(hideToggle.getAttribute("aria-label")).toBe("Hide section");
			expect(hideToggle.getAttribute("aria-pressed")).toBe("true");
			expect(hideToggle.dataset.icon).toBe("eye-off");
		});
	});

	it("includes Study reveal state in cue widget and gutter equality", () => {
		const state = EditorState.create({ doc: "# Terms\nbody" });
		const callbacks = {
			toggleSection: vi.fn(),
			showAll: vi.fn(),
			hideAll: vi.fn(),
			exit: vi.fn(),
		};
		const revealed = studySnapshot({
			sections: studySnapshot().sections.map((section) => ({
				...section,
				revealed: true,
			})),
			revealedCount: 1,
		});
		const payload = (snapshot: StudySessionSnapshot): CueEditorRenderState => ({
			cues: [cue()],
			display: "inline-cues",
			study: { snapshot, ...callbacks },
		});
		const widgetFor = (snapshot: StudySessionSnapshot) => {
			let widget: { eq(other: unknown): boolean } | null = null;
			buildCueWidgetDecorations(state, payload(snapshot)).between(
				0,
				state.doc.length,
				(_from, _to, value) => {
					widget = value.spec.widget as { eq(other: unknown): boolean };
				}
			);
			return widget!;
		};
		expect(widgetFor(studySnapshot()).eq(widgetFor(revealed))).toBe(false);

		const markerFor = (snapshot: StudySessionSnapshot) => {
			let marker: { eq(other: unknown): boolean } | null = null;
			buildCueGutterMarkers(state, {
				...payload(snapshot),
				display: "cornell",
			}).between(0, state.doc.length, (_from, _to, value) => {
				marker = value as { eq(other: unknown): boolean };
			});
			return marker!;
		};
		expect(markerFor(studySnapshot()).eq(markerFor(revealed))).toBe(false);
	});

	it("renders one control host without revealing from hidden text clicks", () => {
		const toggleSection = vi.fn();
		const showAll = vi.fn();
		const hideAll = vi.fn();
		const exit = vi.fn();
		let destroyedControls: HTMLElement | null = null;
		let destroyedButtons: NodeListOf<HTMLButtonElement> | null = null;
		let destroyedEditor: HTMLElement | null = null;
		withEditorView(
			"# Terms\nbody",
			cueEditorExtension,
			(view, parent) => {
				const controlsContainer = document.createElement("section");
				parent.before(controlsContainer);
				view.dispatch({
					effects: setCuesEffect.of({
						cues: [cue()],
						display: "inline-cues",
						study: {
							snapshot: studySnapshot(),
							controlsContainer,
							toggleSection,
							showAll,
							hideAll,
							exit,
						},
					}),
				});

				expect(
					controlsContainer.querySelectorAll(".cuecraft-editor-study-controls")
				).toHaveLength(1);
				expect(parent.querySelector(".cuecraft-editor-study-controls")).toBeNull();
				expect(view.dom.classList.contains("cuecraft-editor-study-active")).toBe(true);
				const controls = controlsContainer.querySelector<HTMLElement>(
					".cuecraft-editor-study-controls"
				)!;
				expect(controls.textContent).toContain("0 / 1 revealed");
				const help = controls.firstElementChild as HTMLElement;
				expect(help.classList.contains("cuecraft-study-help")).toBe(true);
				expect(help.dataset.icon).toBe("eye");
				expect(
					help.querySelector(".cuecraft-study-help-title")?.textContent
				).toBe("Show or hide sections");
				expect(
					help.querySelector(".cuecraft-study-help-detail")?.textContent
				).toBe("Click the eye icon on any cue card.");
				expect(help.querySelectorAll(".cuecraft-study-help-copy > span")).toHaveLength(
					2
				);
				const actions = controls.querySelector<HTMLElement>(
					".cuecraft-study-actions"
				)!;
				expect(actions.querySelectorAll("button")).toHaveLength(3);
				const progressTrack = controls.querySelector<HTMLElement>(
					".cuecraft-study-progress-track"
				)!;
				expect(progressTrack.getAttribute("role")).toBe("progressbar");
				expect(progressTrack.getAttribute("aria-valuenow")).toBe("0");
				expect(progressTrack.getAttribute("aria-valuemax")).toBe("1");
				expect(
					progressTrack.querySelector<HTMLElement>(
						".cuecraft-study-progress-fill"
					)?.style.width
				).toBe("0%");
				const buttons = controls.querySelectorAll<HTMLButtonElement>("button");
				expect([...buttons].map((button) => button.textContent)).toEqual([
					"Show All Sections",
					"Hide All Sections",
					"Exit Study Mode",
				]);
				expect([...buttons].map((button) => button.dataset.icon)).toEqual([
					"eye",
					"eye-off",
					"log-out",
				]);
				expect(buttons[0].disabled).toBe(false);
				expect(buttons[1].disabled).toBe(true);
				buttons[0].click();
				buttons[1].click();
				buttons[2].click();
				expect(showAll).toHaveBeenCalledTimes(1);
				expect(hideAll).not.toHaveBeenCalled();
				expect(exit).toHaveBeenCalledTimes(1);

				const hidden = parent.querySelector<HTMLElement>(
					".cuecraft-editor-study-answer.is-hidden"
				)!;
				hidden.dispatchEvent(
					new document.defaultView!.MouseEvent("click", {
						bubbles: true,
						clientX: 20,
						clientY: 20,
					})
				);
				expect(toggleSection).not.toHaveBeenCalled();
				expect(view.state.doc.toString()).toBe("# Terms\nbody");

				view.dispatch({
					effects: setCuesEffect.of({
						cues: [cue()],
						display: "inline-cues",
					}),
				});
				expect(parent.querySelector(".cuecraft-editor-study-controls")).toBeNull();
				expect(parent.querySelector(".cuecraft-editor-study-answer")).toBeNull();
				expect(view.dom.classList.contains("cuecraft-editor-study-active")).toBe(false);
				buttons[0].click();
				buttons[1].click();
				buttons[2].click();
				expect(showAll).toHaveBeenCalledTimes(1);
				expect(hideAll).not.toHaveBeenCalled();
				expect(exit).toHaveBeenCalledTimes(1);

				view.dispatch({
					effects: setCuesEffect.of({
						cues: [cue()],
						display: "inline-cues",
						study: {
							snapshot: studySnapshot(),
							controlsContainer,
							toggleSection,
							showAll,
							hideAll,
							exit,
						},
					}),
				});
				destroyedControls = controlsContainer.querySelector<HTMLElement>(
					".cuecraft-editor-study-controls"
				);
				destroyedButtons = destroyedControls?.querySelectorAll("button") ?? null;
				destroyedEditor = view.dom;
			}
		);
		expect(destroyedControls?.isConnected).toBe(false);
		expect(destroyedEditor?.classList.contains("cuecraft-editor-study-active")).toBe(
			false
		);
		destroyedButtons?.[0]?.click();
		destroyedButtons?.[1]?.click();
		destroyedButtons?.[2]?.click();
		expect(showAll).toHaveBeenCalledTimes(1);
		expect(hideAll).not.toHaveBeenCalled();
		expect(exit).toHaveBeenCalledTimes(1);
	});
});

function renderCornellMarker(
	controller: CueSectionCollapseController,
	cueData: CueLineData = cue(),
	options: Pick<
		CueEditorRenderState,
		"showRailSummary" | "showRailQuestions" | "showRailSupportTerms"
	> = {}
): HTMLElement {
	const state = EditorState.create({ doc: "# Terms\nbody" });
	const elements: HTMLElement[] = [];
	buildCueGutterMarkers(state, {
		cues: [cueData],
		display: "cornell",
		notePath: "notes/agents.md",
		collapseController: controller,
		...options,
	}).between(0, state.doc.length, (_from, _to, marker) => {
		elements.push(marker.toDOM(null as never) as HTMLElement);
	});
	const element = elements[0];
	if (!element) throw new Error("Expected Cornell cue marker");
	return element;
}

function disclosureButtons(element: HTMLElement): HTMLButtonElement[] {
	return Array.from(
		element.querySelectorAll<HTMLButtonElement>(
			".cuecraft-editor-hook-section-toggle"
		)
	);
}

function disclosureBody(
	element: HTMLElement,
	button: HTMLButtonElement
): HTMLElement | null {
	return element.querySelector<HTMLElement>(
		`#${button.getAttribute("aria-controls")}`
	);
}

function dispatchPointer(
	target: HTMLElement,
	type: string,
	init: { pointerId: number; clientX?: number; button?: number; isPrimary?: boolean }
): Event {
	const event = new target.ownerDocument.defaultView!.MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		button: init.button ?? 0,
		clientX: init.clientX ?? 0,
	});
	Object.defineProperties(event, {
		pointerId: { value: init.pointerId },
		isPrimary: { value: init.isPrimary ?? true },
	});
	target.dispatchEvent(event);
	return event;
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
		sectionLens: SECTION_LENS,
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

describe("buildCueLineData", () => {
	it("maps every successful section to its current heading line", () => {
		const cache = cacheFrom();
		const cues = buildCueLineData(cache, parseSections(NOTE));
		expect(cues.map((c) => c.line)).toEqual([1, 3, 5]);
		expect(cues[0]).toMatchObject({
			question: "Q:A",
			keywords: ["k1", "k2"],
			sectionLens: SECTION_LENS,
		});
		expect(cues[0]).not.toHaveProperty("category");
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

	it("can hide Section Lens data while keeping questions visible", () => {
		const cache = cacheFrom();
		const cues = buildCueLineData(cache, parseSections(NOTE), {
			showSectionLens: false,
		});
		expect(cues).toHaveLength(3);
		expect(cues[0].question).toBe("Q:A");
		expect(cues.every((c) => c.sectionLens === null)).toBe(true);
	});

	it("emits a warning marker for errored sections instead of skipping them", () => {
		const cache = cacheFrom((_s, i) =>
			i === 1 ? { error: "boom", question: null } : {}
		);
		const cues = buildCueLineData(cache, parseSections(NOTE));
		expect(cues).toHaveLength(3);
		const b = cues.find((c) => c.heading === "B");
		expect(b).toMatchObject({ error: "boom", question: "", keywords: [] });
		expect(b).not.toHaveProperty("category");
		// Usable cues carry no error.
		expect(cues.find((c) => c.heading === "A")?.error).toBeNull();
	});

	it("skips sections that were never generated (no question, no error)", () => {
		const cache = cacheFrom((_s, i) =>
			i === 1 ? { error: null, question: null, keywords: null } : {}
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
				sectionLens: SECTION_LENS,
				error: null,
			})),
			noteBrief: null,
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

function createEditorCueWidthController(committedWidthPx: number | null = 240) {
	const applyPreview = (widthPx: number | null) => {
		applyEditorCueWidthPreview(document, widthPx);
	};
	return {
		getCommittedWidthPx: () => committedWidthPx,
		previewWidthPx: vi.fn(applyPreview),
		flushWidthPreview: vi.fn(applyPreview),
		commitWidthPx: vi.fn(),
	};
}

describe("renderCueElement", () => {
	it("coalesces live width previews into one rail layout event per frame", () => {
		withDocument(() => {
			const callbacks: FrameRequestCallback[] = [];
			const win = document.defaultView!;
			win.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
				callbacks.push(callback);
				return callbacks.length;
			});
			const controller = createEditorCueWidthController(null);
			const editor = document.createElement("div");
			editor.className = "cm-editor";
			editor.append(
				renderCueElement(cue(), "cornell", 0, "upcoming", {
					editorCueWidthController: controller,
				}),
				renderCueElement(
					cue({ line: 3, sectionId: "peer" }),
					"cornell",
					0,
					"upcoming",
					{ editorCueWidthController: controller }
				)
			);
			document.body.appendChild(editor);
			const events = vi.fn();
			editor.addEventListener(RAIL_CARD_LAYOUT_EVENT, events);

			applyEditorCueWidthPreview(editor, 200);
			applyEditorCueWidthPreview(editor, 220);
			applyEditorCueWidthPreview(editor, 240);

			expect(win.requestAnimationFrame).toHaveBeenCalledOnce();
			expect(events).not.toHaveBeenCalled();
			callbacks[0]?.(0);
			expect(events).toHaveBeenCalledOnce();
			applyEditorCueWidthPreview(editor, 240);
			expect(win.requestAnimationFrame).toHaveBeenCalledOnce();
		});
	});

	it("adds an accessible left-edge width separator only to eligible editor rail cards", () => {
		withDocument(() => {
			const widthController = createEditorCueWidthController();
			for (const display of ["cornell"] as const) {
				const card = renderCueElement(cue(), display, 0, "upcoming", {
					editorCueWidthController: widthController,
				});
				const grip = card.querySelector<HTMLElement>(
					".cuecraft-editor-cue-width-grip"
				);
				expect(grip).not.toBeNull();
				expect(grip?.tabIndex).toBe(0);
				expect(grip?.getAttribute("role")).toBe("separator");
				expect(grip?.getAttribute("aria-orientation")).toBe("vertical");
				expect(grip?.hasAttribute("aria-label")).toBe(false);
				const gripLabel = card.querySelector<HTMLElement>(
					".cuecraft-editor-cue-width-grip-label"
				);
				expect(gripLabel?.textContent).toContain("cue rail width");
				expect(grip?.getAttribute("aria-labelledby")).toBe(gripLabel?.id);
				expect(grip?.getAttribute("aria-valuemin")).toBe("96");
				expect(grip?.getAttribute("aria-valuemax")).toBe("512");
				expect(grip?.getAttribute("aria-valuenow")).toBe("240");
				expect(grip?.getAttribute("aria-controls")).toBe(card.id);
				expect(
					grip?.parentElement?.classList.contains("cuecraft-cornell-cue")
				).toBe(true);
			}

			for (const display of [
				"inline-cues",
				"active-section-composer",
				"collapsed-tabs",
				"hook-minimap",
			] as const) {
				const card = renderCueElement(cue(), display, 0, "upcoming", {
					editorCueWidthController: widthController,
				});
				expect(
					card.querySelector(".cuecraft-editor-cue-width-grip")
				).toBeNull();
			}
		});
	});

	it("clamps the same requested width to each editor workspace", () => {
		withDocument(() => {
			const controller = createEditorCueWidthController();
			const makeEditor = (workspaceLeft: number, sectionId: string) => {
				const workspace = document.createElement("div");
				workspace.className = "workspace-leaf-content";
				workspace.getBoundingClientRect = () =>
					({ left: workspaceLeft }) as DOMRect;
				const editor = document.createElement("div");
				editor.className = "cm-editor";
				const card = renderCueElement(
					cue({ sectionId }),
					"cornell",
					0,
					"upcoming",
					{ editorCueWidthController: controller }
				);
				card.getBoundingClientRect = () =>
					({ width: 240, right: 500 }) as DOMRect;
				editor.appendChild(card);
				workspace.appendChild(editor);
				document.body.appendChild(workspace);
				return card;
			};
			const wideWorkspaceCard = makeEditor(100, "wide-workspace");
			const narrowWorkspaceCard = makeEditor(300, "narrow-workspace");

			applyEditorCueWidthPreview(document, 400);

			expect(
				wideWorkspaceCard.style.getPropertyValue(
					"--cuecraft-editor-cue-width"
				)
			).toBe("388px");
			expect(
				narrowWorkspaceCard.style.getPropertyValue(
					"--cuecraft-editor-cue-width"
				)
			).toBe("188px");
		});
	});

	it("previews every visible eligible card during a captured left-edge drag and commits once", () => {
		withDocument(() => {
			const controller = createEditorCueWidthController();
			const editor = document.createElement("div");
			editor.className = "cm-editor";
			editor.getBoundingClientRect = () => ({ left: 100 }) as DOMRect;
			const source = renderCueElement(
				cue(),
				"cornell",
				0,
				"upcoming",
				{ editorCueWidthController: controller }
			);
			const peer = renderCueElement(
				cue({ line: 3, sectionId: "peer" }),
				"cornell",
				0,
				"upcoming",
				{ editorCueWidthController: controller }
			);
			let sourceHeight = 480;
			source.getBoundingClientRect = () =>
				({ width: 240, right: 500, height: sourceHeight }) as DOMRect;
			editor.append(source, peer);
			document.body.appendChild(editor);
			const grip = source.querySelector<HTMLElement>(
				".cuecraft-editor-cue-width-grip"
			);
			if (!grip) throw new Error("Expected resize grip");
			const gripHost = grip.parentElement;
			if (!gripHost) throw new Error("Expected resize grip host");
			gripHost.getBoundingClientRect = () =>
				({ height: sourceHeight }) as DOMRect;
			let capturedPointer: number | null = null;
			grip.setPointerCapture = (pointerId) => {
				capturedPointer = pointerId;
			};
			grip.hasPointerCapture = (pointerId) => capturedPointer === pointerId;
			grip.releasePointerCapture = (pointerId) => {
				if (capturedPointer === pointerId) capturedPointer = null;
			};

			dispatchPointer(grip, "pointerdown", { pointerId: 7, clientX: 400 });
			expect(
				grip.style.getPropertyValue("--cuecraft-editor-cue-width-grip-top")
			).toBe("240px");
			sourceHeight = 640;
			dispatchPointer(grip, "pointermove", { pointerId: 8, clientX: 360 });
			expect(controller.previewWidthPx).not.toHaveBeenCalled();
			dispatchPointer(grip, "pointermove", { pointerId: 7, clientX: 360 });
			expect(controller.previewWidthPx).toHaveBeenLastCalledWith(280);
			expect(source.style.getPropertyValue("--cuecraft-editor-cue-width")).toBe(
				"280px"
			);
			expect(peer.style.getPropertyValue("--cuecraft-editor-cue-width")).toBe(
				"280px"
			);
			expect(
				source.querySelector(".cuecraft-editor-cue-width-grip")
			).toBe(grip);
			expect(
				grip.style.getPropertyValue("--cuecraft-editor-cue-width-grip-top")
			).toBe("240px");
			dispatchPointer(grip, "pointerup", { pointerId: 7, clientX: 360 });
			expect(
				grip.style.getPropertyValue("--cuecraft-editor-cue-width-grip-top")
			).toBe("");
			expect(controller.commitWidthPx).toHaveBeenCalledOnce();
			expect(controller.commitWidthPx).toHaveBeenCalledWith(280);
			expect(capturedPointer).toBeNull();
		});
	});

	it("rejects non-primary drags and reverts cancellation without saving", () => {
		withDocument(() => {
			const controller = createEditorCueWidthController();
			const editor = document.createElement("div");
			editor.className = "cm-editor";
			editor.getBoundingClientRect = () => ({ left: 100 }) as DOMRect;
			const card = renderCueElement(
				cue(),
				"cornell",
				0,
				"upcoming",
				{ editorCueWidthController: controller }
			);
			card.getBoundingClientRect = () =>
				({ width: 240, right: 500 }) as DOMRect;
			editor.appendChild(card);
			document.body.appendChild(editor);
			const grip = card.querySelector<HTMLElement>(
				".cuecraft-editor-cue-width-grip"
			);
			if (!grip) throw new Error("Expected resize grip");
			grip.setPointerCapture = vi.fn();

			dispatchPointer(grip, "pointerdown", {
				pointerId: 1,
				button: 1,
			});
			dispatchPointer(grip, "pointerdown", {
				pointerId: 2,
				isPrimary: false,
			});
			expect(grip.setPointerCapture).not.toHaveBeenCalled();

			dispatchPointer(grip, "pointerdown", { pointerId: 3, clientX: 400 });
			dispatchPointer(grip, "pointermove", { pointerId: 3, clientX: 350 });
			expect(card.style.getPropertyValue("--cuecraft-editor-cue-width")).toBe(
				"290px"
			);
			dispatchPointer(grip, "lostpointercapture", { pointerId: 3 });
			expect(controller.flushWidthPreview).toHaveBeenLastCalledWith(240);
			expect(controller.commitWidthPx).not.toHaveBeenCalled();
			expect(card.style.getPropertyValue("--cuecraft-editor-cue-width")).toBe(
				"240px"
			);
			dispatchPointer(grip, "pointercancel", { pointerId: 3 });
			expect(controller.previewWidthPx).toHaveBeenCalledOnce();
			expect(controller.flushWidthPreview).toHaveBeenCalledOnce();

			dispatchPointer(grip, "pointerdown", { pointerId: 4, clientX: 400 });
			dispatchPointer(grip, "pointermove", { pointerId: 4, clientX: 375 });
			grip.dispatchEvent(new document.defaultView!.FocusEvent("blur"));
			expect(controller.previewWidthPx).toHaveBeenCalledTimes(2);
			expect(controller.flushWidthPreview).toHaveBeenCalledTimes(2);
			expect(controller.flushWidthPreview).toHaveBeenLastCalledWith(240);
			expect(controller.commitWidthPx).not.toHaveBeenCalled();
			expect(card.style.getPropertyValue("--cuecraft-editor-cue-width")).toBe(
				"240px"
			);
		});
	});

	it("cancels an active drag when CodeMirror destroys the marker", () => {
		withDocument(() => {
			const controller = createEditorCueWidthController();
			const state = EditorState.create({ doc: "# Terms\nbody" });
			const marker = buildCueGutterMarkers(state, {
				cues: [cue()],
				display: "cornell",
				editorCueWidthController: controller,
			}).iter().value;
			if (!marker?.toDOM) throw new Error("Expected cue marker");
			const card = marker.toDOM(null as never) as HTMLElement;
			card.getBoundingClientRect = () =>
				({ width: 240, right: 500 }) as DOMRect;
			const editor = document.createElement("div");
			editor.className = "cm-editor";
			editor.getBoundingClientRect = () => ({ left: 100 }) as DOMRect;
			editor.appendChild(card);
			document.body.appendChild(editor);
			const grip = card.querySelector<HTMLElement>(
				".cuecraft-editor-cue-width-grip"
			);
			if (!grip) throw new Error("Expected resize grip");
			grip.setPointerCapture = vi.fn();

			dispatchPointer(grip, "pointerdown", { pointerId: 5, clientX: 400 });
			dispatchPointer(grip, "pointermove", { pointerId: 5, clientX: 360 });
			(marker as unknown as { destroy(dom: Node): void }).destroy(card);

			expect(controller.flushWidthPreview).toHaveBeenLastCalledWith(240);
			expect(controller.commitWidthPx).not.toHaveBeenCalled();
			expect(card.style.getPropertyValue("--cuecraft-editor-cue-width")).toBe(
				"240px"
			);
			dispatchPointer(grip, "pointermove", { pointerId: 5, clientX: 320 });
			expect(controller.previewWidthPx).toHaveBeenCalledOnce();
		});
	});

	it("previews repeated separator keys and commits once on matching keyup", () => {
		withDocument(() => {
			const controller = createEditorCueWidthController();
			const editor = document.createElement("div");
			editor.className = "cm-editor";
			editor.getBoundingClientRect = () => ({ left: 100 }) as DOMRect;
			const card = renderCueElement(
				cue(),
				"cornell",
				0,
				"upcoming",
				{ editorCueWidthController: controller }
			);
			card.getBoundingClientRect = () =>
				({ width: 240, right: 500 }) as DOMRect;
			editor.appendChild(card);
			document.body.appendChild(editor);
			const grip = card.querySelector<HTMLElement>(
				".cuecraft-editor-cue-width-grip"
			);
			if (!grip) throw new Error("Expected resize grip");
			const bubbled = vi.fn();
			editor.addEventListener("keydown", bubbled);
			const keydown = (key: string, repeat = false) => {
				const event = new document.defaultView!.KeyboardEvent("keydown", {
					key,
					repeat,
					bubbles: true,
					cancelable: true,
				});
				grip.dispatchEvent(event);
				return event;
			};
			expect(keydown("ArrowLeft").defaultPrevented).toBe(true);
			expect(keydown("ArrowLeft", true).defaultPrevented).toBe(true);
			expect(controller.previewWidthPx).toHaveBeenNthCalledWith(1, 248);
			expect(controller.previewWidthPx).toHaveBeenNthCalledWith(2, 256);
			expect(grip.getAttribute("aria-valuenow")).toBe("256");
			expect(bubbled).not.toHaveBeenCalled();
			grip.dispatchEvent(
				new document.defaultView!.KeyboardEvent("keyup", {
					key: "ArrowLeft",
					bubbles: true,
					cancelable: true,
				})
			);
			expect(controller.commitWidthPx).toHaveBeenCalledOnce();
			expect(controller.commitWidthPx).toHaveBeenCalledWith(256);
		});
	});

	it("waits for every held separator key before committing keyboard resize", () => {
		withDocument(() => {
			const controller = createEditorCueWidthController();
			const editor = document.createElement("div");
			editor.className = "cm-editor";
			editor.getBoundingClientRect = () => ({ left: 100 }) as DOMRect;
			const card = renderCueElement(
				cue(),
				"cornell",
				0,
				"upcoming",
				{ editorCueWidthController: controller }
			);
			card.getBoundingClientRect = () =>
				({ width: 240, right: 500 }) as DOMRect;
			editor.appendChild(card);
			document.body.appendChild(editor);
			const grip = card.querySelector<HTMLElement>(
				".cuecraft-editor-cue-width-grip"
			);
			if (!grip) throw new Error("Expected resize grip");
			const dispatchKey = (type: "keydown" | "keyup", key: string) => {
				grip.dispatchEvent(
					new document.defaultView!.KeyboardEvent(type, {
						key,
						bubbles: true,
						cancelable: true,
					})
				);
			};

			dispatchKey("keydown", "ArrowLeft");
			dispatchKey("keydown", "ArrowRight");
			dispatchKey("keyup", "ArrowLeft");
			expect(controller.commitWidthPx).not.toHaveBeenCalled();
			dispatchKey("keyup", "ArrowRight");
			expect(controller.commitWidthPx).toHaveBeenCalledOnce();
			expect(controller.commitWidthPx).toHaveBeenCalledWith(240);
		});
	});

	it("renders a legacy inline cue without category markers", () => {
		withDocument(() => {
			const legacyCue: CueLineData & { category: "stacks" } = {
				line: 1,
				heading: "Terms",
				question: "What is an agent?",
				keywords: ["agent", "tool"],
				category: "stacks",
				sectionLens: SECTION_LENS,
				error: null,
			};
			const el = renderCueElement(legacyCue, "inline-cues");
			expect(el.classList.contains("cuecraft-cue")).toBe(true);
			expect(el.classList.contains("cuecraft-cuewidth-medium")).toBe(true);
			expect(el.classList.contains("cuecraft-cuefont-medium")).toBe(true);
			expect(el.hasAttribute("data-confidence")).toBe(false);
			expectNoLegacyCategoryPresentation(el);
			const buttons = disclosureButtons(el);
			expect(buttons.map((button) => button.dataset.section)).toEqual([
				"summary",
				"question",
				"terms",
			]);
			expect(
				buttons.map((button) =>
					button
						.querySelector(".cuecraft-label-icon")
						?.getAttribute("data-icon")
				)
			).toEqual(["notebook-text", "circle-question-mark", "tags"]);
			expect(el.querySelector(".cuecraft-cue-question")?.textContent).toBe(
				"What is an agent?"
			);
			expect(
				Array.from(el.querySelectorAll(".cuecraft-cue-term")).map(
					(term) => term.textContent
				)
			).toEqual(["agent", "tool"]);
			expect(
				el.querySelector(".cuecraft-section-lens-takeaway")?.textContent
			).toBe("Agents use tools to complete multi-step work.");
			expect(el.querySelector(".cuecraft-section-lens-phrase")).toBeNull();
		});
	});

	it.each([
		{
			name: "Cornell",
			display: "cornell",
			supportSelector: ".cuecraft-cornell-support-term",
		},
	] as const)(
		"renders a legacy cue in $name without category markers",
		({ display, supportSelector }) => {
			withDocument(() => {
				const legacyCue: CueLineData & { category: "sequences" } = {
					line: 7,
					sectionId: "retrieval-practice",
					heading: "Retrieval Practice",
					question: "Why does retrieval practice strengthen memory?",
					keywords: ["retrieval", "testing effect"],
					category: "sequences",
					sectionLens: SECTION_LENS,
					error: null,
				};
				const el = renderCueElement(legacyCue, display);

				expectNoLegacyCategoryPresentation(el);
				expect(el.textContent).toContain(
					"Why does retrieval practice strengthen memory"
				);
				expect(
					Array.from(el.querySelectorAll(supportSelector)).map(
						(term) => term.textContent
					)
				).toEqual(["retrieval", "testing effect"]);
			});
		}
	);

	it("keeps support terms when rendering a migrated v5 cue", () => {
		withDocument(() => {
			const current = cacheFrom();
			const migrated = migrateCache({
				...current,
				schemaVersion: 5,
				sections: current.sections.map((section) => ({
					...section,
					category: "linkedlists",
				})),
			});
			expect(migrated).not.toBeNull();
			if (!migrated) throw new Error("Expected v5 cache to migrate");
			const [cue] = buildCueLineData(migrated, parseSections(NOTE));
			const el = renderCueElement(cue, "inline-cues");

			expectNoLegacyCategoryPresentation(el);
			expect(
				Array.from(el.querySelectorAll(".cuecraft-cue-term")).map(
					(term) => term.textContent
				)
			).toEqual(["k1", "k2"]);
		});
	});

	it("renders accessible disclosures from saved state and displayed content", () => {
		withDocument(() => {
			const expanded = renderCueElement(cue(), "cornell");
			const expandedButtons = disclosureButtons(expanded);
			expect(expandedButtons.map((button) => button.dataset.section)).toEqual([
				"summary",
				"question",
				"terms",
			]);
			for (const button of expandedButtons) {
				expect(button.type).toBe("button");
				expect(button.getAttribute("aria-expanded")).toBe("true");
				expect(
					button.querySelector(".cuecraft-editor-hook-section-label")
				).not.toBeNull();
				expect(
					button.querySelector(".cuecraft-editor-hook-section-preview")?.hidden
				).toBe(true);
				expect(
					button
						.querySelector(".cuecraft-editor-hook-section-chevron")
						?.getAttribute("data-icon")
				).toBe("chevron-down");
				expect(disclosureBody(expanded, button)?.getAttribute("aria-hidden")).toBe(
					"false"
				);
			}
			const second = renderCueElement(
				cue({ sectionId: "section-tools" }),
				"cornell"
			);
			const bodyIds = [...expandedButtons, ...disclosureButtons(second)].map(
				(button) => button.getAttribute("aria-controls")
			);
			expect(new Set(bodyIds).size).toBe(6);

			const { controller } = collapseController([
				"summary",
				"question",
				"terms",
			]);
			const collapsed = renderCornellMarker(
				controller,
				cue({
					keywords: ["agents", "tools", "planning", "autonomy", "memory"],
				})
			);
			expect(
				disclosureButtons(collapsed).map((button) => ({
					expanded: button.getAttribute("aria-expanded"),
					preview: button.querySelector<HTMLElement>(
						".cuecraft-editor-hook-section-preview"
					)?.textContent,
					previewHidden: button.querySelector<HTMLElement>(
						".cuecraft-editor-hook-section-preview"
					)?.hidden,
					bodyHidden: disclosureBody(collapsed, button)?.getAttribute("aria-hidden"),
				}))
			).toEqual([
				{
					expanded: "false",
					preview: "Agents use tools to complete multi-step work.",
					previewHidden: false,
					bodyHidden: "true",
				},
				{
					expanded: "false",
					preview: "How do agents differ from chatbots?",
					previewHidden: false,
					bodyHidden: "true",
				},
				{
					expanded: "false",
					preview: "agents, tools, planning",
					previewHidden: false,
					bodyHidden: "true",
				},
			]);
		});
	});

	it("renders inline cues with the shared section order, icons, and saved toggles", () => {
		withDocument(() => {
			const { controller, calls } = collapseController(["question"]);
			const state = EditorState.create({ doc: "# Terms\nbody" });
			const decorations = buildCueWidgetDecorations(state, {
				cues: [cue()],
				display: "inline-cues",
				notePath: "notes/agents.md",
				collapseController: controller,
			});
			let widget: { toDOM(): HTMLElement } | undefined;
			let element: HTMLElement | undefined;
			decorations.between(0, state.doc.length, (_from, _to, decoration) => {
				widget = decoration.spec.widget as
					| { toDOM(): HTMLElement }
					| undefined;
				element = widget?.toDOM();
			});
			if (!element) throw new Error("Expected inline cue widget");
			expect(element.classList.contains("cuecraft-inline-cue-widget")).toBe(true);
			expect(
				element.querySelector(":scope > .cuecraft-cue")
			).not.toBeNull();

			const buttons = disclosureButtons(element);
			expect(buttons.map((button) => button.dataset.section)).toEqual([
				"summary",
				"question",
				"terms",
			]);
			expect(
				buttons.map((button) =>
					button
						.querySelector(".cuecraft-label-icon")
						?.getAttribute("data-icon")
				)
			).toEqual(["notebook-text", "circle-question-mark", "tags"]);
			expect(buttons.map((button) => button.getAttribute("aria-expanded"))).toEqual([
				"true",
				"false",
				"true",
			]);
			expect(element.querySelector(".cuecraft-editor-cue-width-grip")).toBeNull();

			buttons[2]?.click();
			expect(calls).toEqual([
				["notes/agents.md", "section-terms", "terms", true],
			]);
			expect(buttons[2]?.getAttribute("aria-expanded")).toBe("false");

			const remountedTerms = widget
				?.toDOM()
				.querySelector<HTMLButtonElement>(
					'.cuecraft-editor-hook-section-toggle[data-section="terms"]'
				);
			expect(remountedTerms?.getAttribute("aria-expanded")).toBe("false");
		});
	});

	it("keeps inline disclosure interactions out of CodeMirror", () => {
		const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
			pretendToBeVisual: true,
		});
		const previousGlobals = new Map<PropertyKey, PropertyDescriptor | undefined>();
		const testGlobals: Record<PropertyKey, unknown> = {
			window: dom.window,
			document: dom.window.document,
			navigator: dom.window.navigator,
			MutationObserver: dom.window.MutationObserver,
			HTMLElement: dom.window.HTMLElement,
			Node: dom.window.Node,
			DOMRect: dom.window.DOMRect,
			getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
		};
		for (const [key, value] of Object.entries(testGlobals)) {
			previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
			Object.defineProperty(globalThis, key, {
				configurable: true,
				value,
			});
		}

		const parent = dom.window.document.querySelector("main");
		if (!(parent instanceof dom.window.HTMLElement)) {
			throw new Error("Missing editor parent");
		}
		let view: EditorView | null = null;
		try {
			const { controller, calls } = collapseController();
			const placementState = EditorState.create({ doc: "# Terms\nbody" });
			const decorations = buildCueWidgetDecorations(placementState, {
				cues: [cue()],
				display: "inline-cues",
				notePath: "notes/agents.md",
				collapseController: controller,
			});
			let editorKeydowns = 0;
			view = new EditorView({
				state: EditorState.create({
					doc: placementState.doc,
					extensions: [
						EditorView.decorations.of(decorations),
						EditorView.domEventHandlers({
							keydown: () => {
								editorKeydowns += 1;
								return true;
							},
						}),
					],
				}),
				parent,
			});
			const button = parent.querySelector<HTMLButtonElement>(
				'.cuecraft-editor-hook-section-toggle[data-section="question"]'
			);
			if (!button) throw new Error("Expected inline question toggle");

			button.dispatchEvent(
				new dom.window.KeyboardEvent("keydown", {
					bubbles: true,
					cancelable: true,
					key: "Enter",
				})
			);
			button.dispatchEvent(
				new dom.window.KeyboardEvent("keydown", {
					bubbles: true,
					cancelable: true,
					key: " ",
				})
			);
			expect(editorKeydowns).toBe(0);

			button.click();
			expect(calls).toEqual([
				["notes/agents.md", "section-terms", "question", true],
			]);
		} finally {
			view?.destroy();
			dom.window.close();
			for (const [key, descriptor] of previousGlobals) {
				if (descriptor) {
					Object.defineProperty(globalThis, key, descriptor);
				} else {
					delete (globalThis as Record<PropertyKey, unknown>)[key];
				}
			}
		}
	});

	it("toggles one disclosure synchronously and requests rail layout", () => {
		withDocument(() => {
			const { controller, collapsed, calls } = collapseController();
			const element = renderCornellMarker(controller);
			const [summary, question] = disclosureButtons(element);
			if (!summary) throw new Error("Expected Summary disclosure");
			const body = disclosureBody(element, summary);
			if (!body) throw new Error("Expected Summary disclosure body");
			const measurementEvents: string[] = [];
			element.addEventListener(RAIL_CARD_LAYOUT_EVENT, () => {
				measurementEvents.push("measure");
			});

			summary.click();
			expect(collapsed.has("summary")).toBe(true);
			expect(calls).toEqual([
				["notes/agents.md", "section-terms", "summary", true],
			]);
			expect(summary.getAttribute("aria-expanded")).toBe("false");
			expect(body.hidden).toBe(false);
			expect(body.dataset.collapsed).toBe("true");
			expect(body.getAttribute("aria-hidden")).toBe("true");
			expect(
				summary
					.querySelector(".cuecraft-editor-hook-section-chevron")
					?.getAttribute("data-icon")
			).toBe("chevron-down");
			expect(question?.getAttribute("aria-expanded")).toBe("true");
			expect(element.dataset.expanded).toBeUndefined();
			expect(measurementEvents).toEqual(["measure"]);

			const dispatchTransitionEnd = (
				target: HTMLElement,
				propertyName: string
			): void => {
				const event = new target.ownerDocument.defaultView!.Event(
					"transitionend",
					{ bubbles: true }
				);
				Object.defineProperty(event, "propertyName", { value: propertyName });
				target.dispatchEvent(event);
			};
			dispatchTransitionEnd(body.firstElementChild as HTMLElement, "grid-template-rows");
			dispatchTransitionEnd(body, "opacity");
			expect(measurementEvents).toEqual(["measure"]);
			dispatchTransitionEnd(body, "grid-template-rows");
			dispatchTransitionEnd(body, "grid-template-rows");
			expect(measurementEvents).toEqual(["measure", "measure"]);

			summary
				.querySelector<HTMLElement>(".cuecraft-editor-hook-section-preview")
				?.click();
			expect(calls.at(-1)).toEqual([
				"notes/agents.md",
				"section-terms",
				"summary",
				false,
			]);
			expect(summary.getAttribute("aria-expanded")).toBe("true");
			expect(body.hidden).toBe(false);
			expect(measurementEvents).toEqual(["measure", "measure", "measure"]);
		});
	});

	it("reports persistence rejection without rolling back newer state", async () => {
		const error = new Error("save failed");
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		let rejectFirstWrite: ((error: Error) => void) | undefined;
		let summary: HTMLButtonElement | undefined;
		const collapsed = new Set<CueSectionKind>();
		const controller: CueSectionCollapseController = {
			isCollapsed: (_notePath, _sectionId, kind) => collapsed.has(kind),
			setCollapsed: (_notePath, _sectionId, kind, value) => {
				if (value) collapsed.add(kind);
				else collapsed.delete(kind);
				if (!rejectFirstWrite) {
					return new Promise<void>((_resolve, reject) => {
						rejectFirstWrite = reject;
					});
				}
				return Promise.resolve();
			},
		};

		try {
			withDocument(() => {
				const element = renderCornellMarker(controller);
				summary = disclosureButtons(element).find(
					(button) => button.dataset.section === "summary"
				);
				if (!summary) throw new Error("Expected Summary disclosure");

				summary.click();
				summary.click();
				expect(summary.getAttribute("aria-expanded")).toBe("true");
				expect(collapsed.has("summary")).toBe(false);
			});

			if (!rejectFirstWrite) throw new Error("Expected pending persistence");
			rejectFirstWrite(error);
			await Promise.resolve();

			expect(consoleError).toHaveBeenCalledWith(
				"CueCraft cue section collapse persistence failed",
				error
			);
			expect(summary?.getAttribute("aria-expanded")).toBe("true");
			expect(collapsed.has("summary")).toBe(false);
		} finally {
			consoleError.mockRestore();
		}
	});

	it("omits unavailable disclosures without changing saved state", () => {
		withDocument(() => {
			const { controller, collapsed, calls } = collapseController([
				"question",
				"terms",
			]);
			const hidden = renderCornellMarker(controller, cue(), {
				showRailQuestions: false,
				showRailSupportTerms: false,
			});
			expect(disclosureButtons(hidden).map((button) => button.dataset.section)).toEqual([
				"summary",
			]);
			expect(collapsed).toEqual(new Set(["question", "terms"]));
			expect(calls).toEqual([]);

			const missing = renderCueElement(
				cue({ sectionLens: null, keywords: [] }),
				"cornell"
			);
			expect(disclosureButtons(missing).map((button) => button.dataset.section)).toEqual([
				"question",
			]);
			const failed = renderCueElement(
				cue({
					question: "",
					keywords: [],
					sectionLens: null,
					error: "boom",
				}),
				"cornell"
			);
			expect(disclosureButtons(failed)).toEqual([]);
			expect(
				disclosureButtons(
					renderCueElement(cue(), "inline-cues")
				).map((button) => button.dataset.section)
			).toEqual(["summary", "question", "terms"]);
			expect(
				disclosureButtons(renderCueElement(cue(), "cornell")).map(
					(button) => button.dataset.section
				)
			).toEqual(["summary", "question", "terms"]);
		});
	});

	it("hides inline and Cornell cue questions and support terms when display settings are off", () => {
		withDocument(() => {
			const cue = {
				line: 3,
				sectionId: "terms",
				heading: "Terms",
				question: "How do agents differ from chatbots?",
				keywords: ["agents", "tools"],
				sectionLens: SECTION_LENS,
				error: null,
			};
			const options = {
				showQuestion: false,
				showSupportTerms: false,
			};
			const inline = renderCueElement(cue, "inline-cues", 0, "upcoming", options);
			expect(inline.dataset.questionVisible).toBe("false");
			expect(inline.dataset.supportTermsVisible).toBe("false");
			expect(inline.querySelector(".cuecraft-cue-question")).toBeNull();
			expect(inline.querySelector(".cuecraft-cue-keywords")).toBeNull();
			expect(
				inline.querySelector(".cuecraft-section-lens-takeaway")?.textContent
			).toBe("Agents use tools to complete multi-step work.");
			expect(
				disclosureButtons(inline).map((button) => button.dataset.section)
			).toEqual(["summary"]);

			const cornell = renderCueElement(
				cue,
				"cornell",
				0,
				"upcoming",
				options
			);
			expect(cornell.dataset.questionVisible).toBe("false");
			expect(cornell.dataset.supportTermsVisible).toBe("false");
			expect(cornell.querySelector(".cuecraft-cornell-q")).toBeNull();
			expect(cornell.querySelector(".cuecraft-cornell-kw")).toBeNull();
			expect(
				cornell.querySelector(".cuecraft-section-lens-takeaway")?.textContent
			).toBe("Agents use tools to complete multi-step work.");
			expect(cornell.querySelector(".cuecraft-cue-section-label")).toBeNull();
		});
	});

	it("hides summaries independently in Inline and Cornell cues", () => {
		withDocument(() => {
			const options = {
				showSummary: false,
				showQuestion: true,
				showSupportTerms: true,
			};
			for (const display of ["inline-cues", "cornell"] as const) {
				const element = renderCueElement(
					cue(),
					display,
					0,
					"upcoming",
					options
				);
				expect(element.dataset.summaryVisible).toBe("false");
				expect(
					disclosureButtons(element).map((button) => button.dataset.section)
				).toEqual(["question", "terms"]);
				expect(element.querySelector(".cuecraft-section-lens")).toBeNull();
			}
		});
	});

	it("falls back to the question when the selected cue section has no data", () => {
		withDocument(() => {
			const scenarios = [
				{
					cue: cue({ keywords: [] }),
					options: {
						showSummary: false,
						showQuestion: false,
						showSupportTerms: true,
					},
				},
				{
					cue: cue({ sectionLens: null }),
					options: {
						showSummary: true,
						showQuestion: false,
						showSupportTerms: false,
					},
				},
			];
			for (const scenario of scenarios) {
				for (const display of ["inline-cues", "cornell"] as const) {
					const element = renderCueElement(
						scenario.cue,
						display,
						0,
						"upcoming",
						scenario.options
					);
					expect(element.dataset.questionVisible).toBe("true");
					expect(
						disclosureButtons(element).map((button) => button.dataset.section)
					).toEqual(["question"]);
				}
			}
		});
	});

	it("renders collapsed tab hook DOM", () => {
		withDocument(() => {
			const el = renderCueElement(
				{
					line: 3,
					sectionId: "who-it-is-for",
					heading: "Who It Is For",
					question: "Who is this workflow designed for?",
					keywords: [],
					sectionLens: SECTION_LENS,
					error: null,
				},
				"collapsed-tabs"
			);
			expect(el.classList.contains("cuecraft-editor-hook-collapsed-tabs")).toBe(
				true
			);
			expect(el.classList.contains("cuecraft-editor-rail-card")).toBe(false);
			expect(el.querySelector(".cuecraft-editor-rail-card-toggle")).toBeNull();
			expect(el.dataset.display).toBe("collapsed-tabs");
			expect(el.dataset.state).toBe("upcoming");
			expect(el.hasAttribute("data-confidence")).toBe(false);
			expect(el.querySelector(".cuecraft-editor-hook-heading")).toBeNull();
			expect(el.querySelector(".cuecraft-editor-hook-section-label")).toBeNull();
			expect(
				el.querySelector(".cuecraft-editor-hook-title")?.textContent
			).toBe("Who is this workflow designed for");
			expect(el.querySelector(".cuecraft-editor-hook-keywords")).toBeNull();
		});
	});

	it("renders active-section composer hook DOM", () => {
		withDocument(() => {
			const el = renderCueElement(
				{
					line: 7,
					sectionId: "who-it-is-for",
					heading: "Who It Is For",
					question: "Who should use this workflow?",
					keywords: ["students", "researchers"],
					sectionLens: SECTION_LENS,
					error: null,
				},
				"active-section-composer"
			);
			expect(
				el.classList.contains("cuecraft-editor-hook-active-section-composer")
			).toBe(true);
			expect(el.classList.contains("cuecraft-editor-rail-card")).toBe(false);
			expect(el.querySelector(".cuecraft-editor-rail-card-toggle")).toBeNull();
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
					sectionId: "upskill-employees",
					heading: "How To Upskill Employees",
					question,
					keywords: ["org knowledge"],
					sectionLens: SECTION_LENS,
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
					sectionId: "study-takeaway",
					heading: "Study Takeaway",
					question,
					keywords: ["takeaway"],
					sectionLens: SECTION_LENS,
					error: null,
				},
				"hook-minimap"
			);
			expect(el.classList.contains("cuecraft-editor-hook-hook-minimap")).toBe(
				true
			);
			expect(el.classList.contains("cuecraft-editor-rail-card")).toBe(false);
			expect(el.querySelector(".cuecraft-editor-rail-card-toggle")).toBeNull();
			expect(el.dataset.display).toBe("hook-minimap");
			expect(el.dataset.line).toBe("9");
			expect(el.dataset.state).toBe("upcoming");
			expect(el.querySelector(".cuecraft-editor-hook-heading")).toBeNull();
			expect(
				el.querySelector(".cuecraft-editor-hook-title")?.textContent
			).toBe(question);
		});
	});

	it("renders failed hook state without keywords", () => {
		withDocument(() => {
			const el = renderCueElement(
				{
					line: 3,
					sectionId: "terms",
					heading: "Terms",
					question: "",
					keywords: [],
					sectionLens: null,
					error: "boom",
				},
				"collapsed-tabs"
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

describe("renderNoteBriefElement", () => {
	it("renders the overview and structured review cards", () => {
		withDocument(() => {
			const el = renderNoteBriefElement(NOTE_BRIEF, "editor");
			expect(el.classList.contains("cuecraft-note-brief")).toBe(true);
			expect(el.classList.contains("cuecraft-note-brief-editor")).toBe(true);
			expect(el.querySelector(".cuecraft-note-brief-label")?.textContent).toBe(
				"Note brief"
			);
			expect(
				el.querySelector(".cuecraft-note-brief-label .cuecraft-label-icon")
					?.getAttribute("data-icon")
			).toBe("sparkles");
			expect(
				el.querySelector(".cuecraft-note-brief-overview")?.textContent
			).toBe("The note explains how agents use tools to complete work.");
			expect(el.querySelectorAll(".cuecraft-note-brief-insight")).toHaveLength(3);
			expect(
				Array.from(
					el.querySelectorAll(".cuecraft-note-brief-insight-badge")
				).map((label) => label.textContent)
			).toEqual(["core idea", "review first", "self-test"]);
			expect(
				Array.from(el.querySelectorAll(".cuecraft-note-brief-insight")).every(
					(insight) =>
						insight.lastElementChild?.matches(
							".cuecraft-note-brief-insight-badge.cuecraft-cue-term"
						) === true
				)
			).toBe(true);
			const reviewTitle =
				"[data-card='reviewFirst'] .cuecraft-note-brief-insight-title";
			expect(
				el.querySelector(reviewTitle)?.textContent
			).toBe("Agent versus chatbot");
			expect(
				el.querySelector(
					"[data-card='sayItBack'] .cuecraft-note-brief-insight-title"
				)
			).toBeNull();
		});
	});
});

describe("cue editor placement", () => {
	const cues = [
		{
			line: 1,
			sectionId: "a",
			heading: "A",
			question: "What is A?",
			keywords: ["alpha"],
			sectionLens: SECTION_LENS,
			error: null,
		},
		{
			line: 3,
			sectionId: "b",
			heading: "B",
			question: "What is B?",
			keywords: ["beta"],
			sectionLens: SECTION_LENS,
			error: null,
		},
	];

	it("rereads collapse state when the same gutter marker remounts", () => {
		withDocument(() => {
			const { controller } = collapseController();
			const state = EditorState.create({ doc: "# Terms\nbody" });
			const marker = buildCueGutterMarkers(state, {
				cues: [cue()],
				display: "cornell",
				notePath: "notes/agents.md",
				collapseController: controller,
			}).iter().value;
			if (!marker?.toDOM) throw new Error("Expected Cornell gutter marker");

			const first = marker.toDOM(null as never) as HTMLElement;
			const firstQuestion = disclosureButtons(first).find(
				(button) => button.dataset.section === "question"
			);
			expect(firstQuestion?.getAttribute("aria-expanded")).toBe("true");

			void controller.setCollapsed(
				"notes/agents.md",
				"section-terms",
				"question",
				true
			);
			const remounted = marker.toDOM(null as never) as HTMLElement;
			const remountedQuestion = disclosureButtons(remounted).find(
				(button) => button.dataset.section === "question"
			);
			expect(remountedQuestion?.getAttribute("aria-expanded")).toBe("false");
		});
	});

	it("keeps hook displays on heading lines", () => {
		const state = EditorState.create({ doc: NOTE });
		const markers = buildCueGutterMarkers(state, {
			cues,
			display: "active-section-composer",
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
				display: "cornell",
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
			display: "collapsed-tabs",
		});
		const positions: number[] = [];
		widgets.between(0, state.doc.length, (from) => {
			positions.push(from);
		});
		expect(positions).toEqual([]);
	});

	it("renders a single Note Brief widget near the top of the editor", () => {
		const state = EditorState.create({ doc: NOTE });
		const widgets = buildCueWidgetDecorations(state, {
			cues,
			display: "cornell",
			noteBrief: NOTE_BRIEF,
		});
		const positions: number[] = [];
		widgets.between(0, state.doc.length, (from) => {
			positions.push(from);
		});
		expect(positions).toEqual([state.doc.line(1).to]);
	});

	it("keeps the Note Brief visible when Live Preview replaces a leading divider", () => {
		const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
			pretendToBeVisual: true,
		});
		const previousGlobals = new Map<PropertyKey, PropertyDescriptor | undefined>();
		const testGlobals: Record<PropertyKey, unknown> = {
			window: dom.window,
			document: dom.window.document,
			navigator: dom.window.navigator,
			MutationObserver: dom.window.MutationObserver,
			HTMLElement: dom.window.HTMLElement,
			Node: dom.window.Node,
			DOMRect: dom.window.DOMRect,
			getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
		};
		for (const [key, value] of Object.entries(testGlobals)) {
			previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
			Object.defineProperty(globalThis, key, {
				configurable: true,
				value,
			});
		}

		const parent = dom.window.document.querySelector("main");
		if (!(parent instanceof dom.window.HTMLElement)) {
			throw new Error("Missing editor parent");
		}
		let view: EditorView | null = null;
		try {
			const doc = "****\n# Terms";
			const placementState = EditorState.create({ doc });
			const cueDecorations = buildCueWidgetDecorations(placementState, {
				cues: [],
				display: "cornell",
				noteBrief: NOTE_BRIEF,
			});

			const focusedState = EditorState.create({
				doc,
				extensions: [EditorView.decorations.of(cueDecorations)],
			});
			view = new EditorView({ state: focusedState, parent });
			expect(parent.querySelector(".cuecraft-note-brief-editor")).not.toBeNull();
			view.destroy();
			view = null;
			parent.replaceChildren();

			const firstLine = placementState.doc.line(1);
			const dividerDecorations = Decoration.set([
				Decoration.replace({ block: true }).range(firstLine.from, firstLine.to),
			]);
			const unfocusedState = EditorState.create({
				doc,
				extensions: [
					EditorView.decorations.of(cueDecorations),
					EditorView.decorations.of(dividerDecorations),
				],
			});
			view = new EditorView({ state: unfocusedState, parent });
			expect(parent.querySelector(".cuecraft-note-brief-editor")).not.toBeNull();
		} finally {
			view?.destroy();
			dom.window.close();
			for (const [key, descriptor] of previousGlobals) {
				if (descriptor) {
					Object.defineProperty(globalThis, key, descriptor);
				} else {
					delete (globalThis as Record<PropertyKey, unknown>)[key];
				}
			}
		}
	});

	it("omits the Note Brief widget when it is disabled or missing", () => {
		const state = EditorState.create({ doc: NOTE });
		const widgets = buildCueWidgetDecorations(state, {
			cues,
			display: "cornell",
			noteBrief: null,
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

	it("renders Cornell display cues in the left gutter", () => {
		const state = EditorState.create({ doc: NOTE });
		const widgets = buildCueWidgetDecorations(state, {
			cues,
			display: "cornell",
		});
		const widgetPositions: number[] = [];
		widgets.between(0, state.doc.length, (from) => {
			widgetPositions.push(from);
		});
		expect(widgetPositions).toEqual([]);

		const markers = buildCueGutterMarkers(state, {
			cues,
			display: "cornell",
		});
		const markerPositions: number[] = [];
		markers.between(0, state.doc.length, (from) => {
			markerPositions.push(from);
		});
		expect(markerPositions).toEqual([
			state.doc.line(1).from,
			state.doc.line(3).from,
		]);
	});

	it("renders Cornell display with the Cornell cue card element in rail layout", () => {
		withDocument(() => {
			const el = renderCueElement(cues[0], "cornell");
			expect(el.classList.contains("cuecraft-editor-hook")).toBe(true);
			expect(el.classList.contains("cuecraft-editor-cornell-card")).toBe(true);
			expect(el.classList.contains("cuecraft-editor-rail-card")).toBe(true);
			expect(el.dataset.display).toBe("cornell");
			expect(el.classList.contains("cuecraft-style-classic")).toBe(true);
			expect(el.querySelector(".cuecraft-cornell-cue")).not.toBeNull();
			expect(el.querySelector(".cuecraft-cornell-q")?.textContent).toBe(
				"What is A?"
			);
			expect(
				el.querySelector(".cuecraft-cornell-support-term")?.textContent
			).toBe("alpha");
			expect(
				el.querySelector(".cuecraft-section-lens-takeaway")?.textContent
			).toBe("Agents use tools to complete multi-step work.");
		});
	});

	it("renders classic Cornell cards with section controls and saved state", () => {
		withDocument(() => {
			const { controller } = collapseController(["question"]);
			const state = EditorState.create({ doc: "# Terms\nbody" });
			const marker = buildCueGutterMarkers(state, {
				cues: [cue()],
				display: "cornell",
				notePath: "notes/agents.md",
				collapseController: controller,
				cueFontSize: "large",
			}).iter().value;
			if (!marker?.toDOM) throw new Error("Expected Cornell gutter marker");

			const element = marker.toDOM(null as never) as HTMLElement;
			expect(element.classList.contains("cuecraft-cuewidth-medium")).toBe(true);
			expect(element.classList.contains("cuecraft-cuefont-large")).toBe(true);
			expect(
				disclosureButtons(element).map((button) => button.dataset.section)
			).toEqual(["summary", "question", "terms"]);
			expect(
				disclosureButtons(element).map((button) =>
					button.getAttribute("aria-expanded")
				)
			).toEqual(["true", "false", "true"]);
			expect(element.querySelector(".cuecraft-section-lens-phrase")).toBeNull();
			expect(
				element.querySelector(".cuecraft-section-lens-takeaway")?.textContent
			).toBe("Agents use tools to complete multi-step work.");
		});
	});

	it("applies the fixed width class and cue font settings to every editor cue display", () => {
		withDocument(() => {
			for (const option of EDITOR_CUE_DISPLAY_OPTIONS) {
				const element = renderCueElement(cues[0], option.id, 0, "current", {
					cueFontSize: "large",
				});
				expect(element.classList.contains("cuecraft-cuewidth-medium")).toBe(true);
				expect(element.classList.contains("cuecraft-cuefont-large")).toBe(true);
			}
		});
	});
});

describe("rail spacers", () => {
	const cues = [
		{
			line: 1,
			sectionId: "a",
			heading: "A",
			question: "What is A?",
			keywords: ["alpha"],
			sectionLens: SECTION_LENS,
			error: null,
		},
		{
			line: 3,
			sectionId: "b",
			heading: "B",
			question: "What is B?",
			keywords: ["beta"],
			sectionLens: SECTION_LENS,
			error: null,
		},
	];

	it("calculates stable spacer height from overlap and existing spacer", () => {
		expect(railSpacerHeightForOverlap(200, 120, 0)).toBe(92);
		expect(railSpacerHeightForOverlap(200, 212, 92)).toBe(92);
		expect(railSpacerHeightForOverlap(120, 200, 0)).toBe(0);
		expect(railSpacerHeightForOverlap(0, 120, 0)).toBe(0);
	});

	it("measures desired spacers before the next rail card line", () => {
		withDocument(() => {
			const root = document.createElement("div");
			const first = document.createElement("div");
			first.className = "cuecraft-editor-rail-card";
			first.dataset.line = "1";
			first.getBoundingClientRect = () =>
				({ top: 10, height: 200 }) as DOMRect;

			const second = document.createElement("div");
			second.className = "cuecraft-editor-rail-card";
			second.dataset.line = "3";
			second.getBoundingClientRect = () =>
				({ top: 130, height: 90 }) as DOMRect;
			root.append(first, second);

			expect(Array.from(measureRailSpacerHeights(root))).toEqual([[3, 92]]);

			second.getBoundingClientRect = () =>
				({ top: 222, height: 90 }) as DOMRect;
			expect(
				Array.from(measureRailSpacerHeights(root, new Map([[3, 92]])))
			).toEqual([[3, 92]]);

			second.getBoundingClientRect = () =>
				({ top: 230, height: 90 }) as DOMRect;
			expect(Array.from(measureRailSpacerHeights(root))).toEqual([]);
		});
	});

	it("keeps a spacer when its target cue leaves the rendered viewport", () => {
		withDocument(() => {
			const root = document.createElement("div");
			const first = document.createElement("div");
			first.className = "cuecraft-editor-rail-card";
			first.dataset.line = "1";
			first.getBoundingClientRect = () =>
				({ top: 10, height: 200 }) as DOMRect;

			const second = document.createElement("div");
			second.className = "cuecraft-editor-rail-card";
			second.dataset.line = "3";
			second.getBoundingClientRect = () =>
				({ top: 130, height: 90 }) as DOMRect;
			root.append(first, second);

			let measured = measureRailSpacerHeights(root);
			expect(Array.from(measured)).toEqual([[3, 92]]);

			second.remove();
			for (let pass = 0; pass < 20; pass += 1) {
				measured = measureRailSpacerHeights(root, measured);
				expect(Array.from(measured)).toEqual([[3, 92]]);
			}
		});
	});

	it("measures cue content that overflows its gutter marker box", () => {
		withDocument(() => {
			const root = document.createElement("div");
			const first = document.createElement("div");
			first.className = "cuecraft-editor-rail-card";
			first.dataset.line = "1";
			first.getBoundingClientRect = () =>
				({ top: 10, height: 200 }) as DOMRect;
			Object.defineProperty(first, "scrollHeight", { value: 260 });

			const second = document.createElement("div");
			second.className = "cuecraft-editor-rail-card";
			second.dataset.line = "3";
			second.getBoundingClientRect = () =>
				({ top: 230, height: 90 }) as DOMRect;
			root.append(first, second);

			expect(Array.from(measureRailSpacerHeights(root))).toEqual([[3, 52]]);
		});
	});

	it("reserves space when wide Cornell cards overlap after rendering", async () => {
		const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
			pretendToBeVisual: true,
		});
		const previousGlobals = new Map<PropertyKey, PropertyDescriptor | undefined>();
		const testGlobals: Record<PropertyKey, unknown> = {
			window: dom.window,
			document: dom.window.document,
			navigator: dom.window.navigator,
			MutationObserver: dom.window.MutationObserver,
			HTMLElement: dom.window.HTMLElement,
			Node: dom.window.Node,
			DOMRect: dom.window.DOMRect,
			getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
		};
		for (const [key, value] of Object.entries(testGlobals)) {
			previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
			Object.defineProperty(globalThis, key, {
				configurable: true,
				value,
			});
		}

		const parent = dom.window.document.querySelector("main");
		if (!(parent instanceof dom.window.HTMLElement)) {
			throw new Error("Missing editor parent");
		}
		let view: EditorView | null = null;
		try {
			view = new EditorView({
				state: EditorState.create({
					doc: NOTE,
					extensions: [cueEditorExtension],
				}),
				parent,
			});
			view.dispatch({
				effects: setCuesEffect.of({
					cues,
					display: "cornell",
					cueFontSize: "large",
				}),
			});
			const cards = Array.from(
				parent.querySelectorAll<HTMLElement>(".cuecraft-editor-rail-card")
			);
			expect(cards).toHaveLength(2);
			cards[0].getBoundingClientRect = () =>
				({ top: 10, height: 400 }) as DOMRect;
			cards[1].getBoundingClientRect = () => {
				const spacer = view?.state.field(cueRailSpacerField).spacers.get(3) ?? 0;
				return { top: 230 + spacer, height: 100 } as DOMRect;
			};
			await new Promise((resolve) => dom.window.setTimeout(resolve, 50));
			expect(Array.from(view.state.field(cueRailSpacerField).spacers)).toEqual([
				[3, 192],
			]);
		} finally {
			view?.destroy();
			dom.window.close();
			for (const [key, descriptor] of previousGlobals) {
				if (descriptor) {
					Object.defineProperty(globalThis, key, descriptor);
				} else {
					delete (globalThis as Record<PropertyKey, unknown>)[key];
				}
			}
		}
	});

	it("builds invisible block spacer widgets for rail displays only", () => {
		withDocument(() => {
			const state = EditorState.create({ doc: NOTE });
			const railDecorations = buildRailSpacerDecorations(
				state,
				{ cues, display: "cornell" },
				new Map([[3, 42]])
			);
			const positions: number[] = [];
			const spacerHeights: string[] = [];
			railDecorations.between(0, state.doc.length, (from, _to, value) => {
				positions.push(from);
				const widget = (value.spec as { widget: { toDOM(): HTMLElement } }).widget;
				spacerHeights.push(widget.toDOM().style.height);
			});
			expect(positions).toEqual([state.doc.line(3).from]);
			expect(spacerHeights).toEqual(["42px"]);

			const inlineDecorations = buildRailSpacerDecorations(
				state,
				{ cues, display: "inline-cues" },
				new Map([[3, 42]])
			);
			const inlinePositions: number[] = [];
			inlineDecorations.between(0, state.doc.length, (from) => {
				inlinePositions.push(from);
			});
			expect(inlinePositions).toEqual([]);
		});
	});

	it("keeps spacer lines attached when edits move headings down", () => {
		let state = EditorState.create({
			doc: NOTE,
			extensions: [cueRailSpacerField],
		});
		state = state.update({
			effects: setCuesEffect.of({
				cues,
				display: "cornell",
			}),
		}).state;
		state = state.update({
			effects: setRailSpacersEffect.of(new Map([[3, 42]])),
		}).state;
		state = state.update({
			changes: {
				from: state.doc.line(3).from,
				insert: "\n\n",
			},
		}).state;

		const positions: number[] = [];
		state.field(cueRailSpacerField).decorations.between(
			0,
			state.doc.length,
			(from) => {
				positions.push(from);
			}
		);
		expect(positions).toEqual([state.doc.line(5).from]);
	});

	it("does not measure again in response to its own spacer transaction", () => {
		const state = EditorState.create({ doc: NOTE });
		const transaction = state.update({
			effects: setRailSpacersEffect.of(new Map([[3, 120]])),
		});
		expect(
			railLayoutUpdateNeedsMeasure({
				docChanged: false,
				viewportChanged: true,
				selectionSet: false,
				transactions: [transaction],
			} as Parameters<typeof railLayoutUpdateNeedsMeasure>[0])
		).toBe(false);
	});

	it("does not starve the renderer when editor state changes during measurement", () => {
		withDocument(() => {
			const queuedMicrotasks: Array<() => void> = [];
			const originalQueueMicrotask = globalThis.queueMicrotask;
			let requestCount = 0;
			const view = {
				dom: document.createElement("div"),
				get state() {
					return {
						field(field: unknown) {
							if (field === cueGutterField) {
								return { payload: { display: "cornell" } };
							}
							if (field === cueRailSpacerField) {
								return { spacers: new Map<number, number>() };
							}
							return undefined;
						},
					};
				},
				requestMeasure(request: {
					read(): unknown;
					write(value: unknown): void;
				}) {
					requestCount += 1;
					request.write(request.read());
				},
				dispatch: vi.fn(),
			} as unknown as EditorView;

			globalThis.queueMicrotask = (callback) => {
				queuedMicrotasks.push(callback);
			};
			try {
				scheduleRailLayoutMeasure(view);
				for (let pass = 0; pass < 5; pass += 1) {
					queuedMicrotasks.shift()?.();
				}
				expect(requestCount).toBeLessThanOrEqual(2);
			} finally {
				globalThis.queueMicrotask = originalQueueMicrotask;
			}
		});
	});
});
