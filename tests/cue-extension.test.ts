import { describe, it, expect, vi } from "vitest";
import { JSDOM } from "jsdom";
import { EditorState } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import {
	buildCueGutterMarkers,
	buildCueLineData,
	buildCueWidgetDecorations,
	applyRailOverflowMeasurements,
	cueGutterField,
	measureRailOverflowCards,
	railCardCollapsedHeightForAvailable,
	railCardContentOverflows,
	RAIL_CARD_COLLAPSED_DEFAULT_HEIGHT,
	RAIL_CARD_COLLAPSED_MAX_HEIGHT,
	RAIL_CARD_COLLAPSED_MIN_HEIGHT,
	RAIL_CARD_TOGGLE_EVENT,
	buildRailSpacerDecorations,
	cueRailSpacerField,
	measureRailSpacerHeights,
	railSpacerHeightForOverlap,
	railOverflowUpdateNeedsMeasure,
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

function anchoredCue(overrides: Partial<CueLineData> = {}): CueLineData {
	return {
		line: 1,
		sectionId: "section-terms",
		heading: "Terms",
		question: "How do agents differ from chatbots?",
		keywords: ["agents", "tools"],
		confidence: "medium",
		sectionLens: SECTION_LENS,
		error: null,
		...overrides,
	};
}

function renderAnchoredMarker(
	controller: CueSectionCollapseController,
	cue: CueLineData = anchoredCue(),
	options: Pick<
		CueEditorRenderState,
		"showRailQuestions" | "showRailSupportTerms"
	> = {}
): HTMLElement {
	const state = EditorState.create({ doc: "# Terms\nbody" });
	const elements: HTMLElement[] = [];
	buildCueGutterMarkers(state, {
		cues: [cue],
		display: "anchored-card-rail",
		notePath: "notes/agents.md",
		collapseController: controller,
		...options,
	}).between(0, state.doc.length, (_from, _to, marker) => {
		elements.push(marker.toDOM(null as never) as HTMLElement);
	});
	const element = elements[0];
	if (!element) throw new Error("Expected anchored cue marker");
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
		sectionLens: SECTION_LENS,
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

describe("buildCueLineData", () => {
	it("maps every successful section to its current heading line", () => {
		const cache = cacheFrom();
		const cues = buildCueLineData(cache, parseSections(NOTE));
		expect(cues.map((c) => c.line)).toEqual([1, 3, 5]);
		expect(cues[0]).toMatchObject({
			question: "Q:A",
			keywords: ["k1", "k2"],
			confidence: "high",
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
		expect(b).toMatchObject({ error: "boom", question: "", keywords: [], confidence: null });
		expect(b).not.toHaveProperty("category");
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
				sectionLens: SECTION_LENS,
				rationale: null,
				error: null,
			})),
			summary: null,
			learningObjective: null,
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

describe("renderCueElement", () => {
	it("renders a legacy inline cue without category markers", () => {
		withDocument(() => {
			const legacyCue: CueLineData & { category: "stacks" } = {
				line: 1,
				heading: "Terms",
				question: "What is an agent?",
				keywords: ["agent", "tool"],
				confidence: "high",
				category: "stacks",
				sectionLens: SECTION_LENS,
				error: null,
			};
			const el = renderCueElement(legacyCue, "inline-cues");
			expect(el.classList.contains("cuecraft-cue")).toBe(true);
			expect(el.classList.contains("cuecraft-cuewidth-medium")).toBe(true);
			expect(el.classList.contains("cuecraft-cuefont-medium")).toBe(true);
			expect(el.dataset.confidence).toBe("high");
			expectNoLegacyCategoryPresentation(el);
			expect(
				Array.from(el.querySelectorAll(".cuecraft-cue-section-label")).map(
					(label) => label.textContent
				)
			).toEqual(["QUESTION", "TERMS"]);
			expect(
				el.querySelector(".cuecraft-cue-section-label .cuecraft-label-icon")
					?.getAttribute("data-icon")
			).toBe("circle-question-mark");
			expect(el.querySelector(".cuecraft-cue-question")?.textContent).toBe(
				"What is an agent?"
			);
			expect(
				Array.from(el.querySelectorAll(".cuecraft-cue-term")).map(
					(term) => term.textContent
				)
			).toEqual(["agent", "tool"]);
			expect(
				el.querySelector(".cuecraft-section-lens-phrase")?.textContent
			).toBe("agent autonomy");
		});
	});

	it.each([
		{
			name: "anchored rail",
			display: "anchored-card-rail",
			supportSelector: ".cuecraft-editor-hook-keywords .cuecraft-cue-term",
		},
		{
			name: "alternate editor hook",
			display: "threaded-margin-notes",
			supportSelector: ".cuecraft-editor-hook-keywords .cuecraft-cue-term",
		},
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
					heading: "Retrieval Practice",
					question: "Why does retrieval practice strengthen memory?",
					keywords: ["retrieval", "testing effect"],
					confidence: "high",
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

	it("renders anchored card rail hook DOM", () => {
		withDocument(() => {
			const el = renderCueElement(
				{
					line: 3,
					heading: "Terms",
					question: "How do agents differ from chatbots?",
					keywords: ["agents"],
					confidence: "medium",
					sectionLens: SECTION_LENS,
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
			expectNoLegacyCategoryPresentation(el);
			expect(el.classList.contains("cuecraft-editor-rail-card")).toBe(true);
			expect(el.dataset.overflowing).toBe("false");
			expect(
				el.querySelector(".cuecraft-editor-rail-card-content")
			).not.toBeNull();
			expect(
				el.querySelector<HTMLButtonElement>(".cuecraft-editor-rail-card-toggle")
					?.hidden
			).toBe(true);
			expect(el.querySelector(".cuecraft-editor-hook-heading")).toBeNull();
			expect(el.querySelector(".cuecraft-section-tag")).toBeNull();
			expect(
				Array.from(
					el.querySelectorAll(".cuecraft-editor-hook-section-label")
				).map((label) => label.textContent)
			).toEqual(["SUMMARY", "QUESTION", "TERMS"]);
			expect(
				el.querySelector(
					".cuecraft-editor-hook-section-label[data-section='summary'] .cuecraft-label-icon"
				)?.getAttribute("data-icon")
			).toBe("notebook-text");
			expect(
				el.querySelector(
					".cuecraft-editor-hook-section-label[data-section='question'] .cuecraft-label-icon"
				)?.getAttribute("data-icon")
			).toBe("circle-question-mark");
			expect(
				el.querySelector(
					".cuecraft-editor-hook-section-label[data-section='terms'] .cuecraft-label-icon"
				)?.getAttribute("data-icon")
			).toBe("tags");
			expect(
				el.querySelector(".cuecraft-editor-hook-title")?.textContent
			).toBe("How do agents differ from chatbots");
			expect(
				el.querySelector(".cuecraft-editor-hook-keywords .cuecraft-cue-term")
					?.textContent
			).toBe("agents");
			expect(
				el.querySelector(".cuecraft-section-lens-takeaway")?.textContent
			).toBe("Agents use tools to complete multi-step work.");
			expect(el.querySelector(".cuecraft-section-lens-phrase")).toBeNull();
			expect(el.querySelector(".cuecraft-section-lens-explanation")).toBeNull();
		});
	});

	it("renders accessible disclosures from saved state and displayed content", () => {
		withDocument(() => {
			const expanded = renderCueElement(anchoredCue(), "anchored-card-rail");
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
				anchoredCue({ sectionId: "section-tools" }),
				"anchored-card-rail"
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
			const collapsed = renderAnchoredMarker(
				controller,
				anchoredCue({
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
					preview: "How do agents differ from chatbots",
					previewHidden: false,
					bodyHidden: "true",
				},
				{
					expanded: "false",
					preview: "agents, tools, planning, autonomy",
					previewHidden: false,
					bodyHidden: "true",
				},
			]);
		});
	});

	it("toggles one disclosure synchronously without changing card expansion", () => {
		withDocument(() => {
			const { controller, collapsed, calls } = collapseController();
			const element = renderAnchoredMarker(controller);
			const [summary, question] = disclosureButtons(element);
			if (!summary) throw new Error("Expected Summary disclosure");
			const body = disclosureBody(element, summary);
			if (!body) throw new Error("Expected Summary disclosure body");
			const measurementEvents: string[] = [];
			element.addEventListener(RAIL_CARD_TOGGLE_EVENT, () => {
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
			expect(element.dataset.expanded).toBe("false");
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
				const element = renderAnchoredMarker(controller);
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

	it("omits unavailable disclosures without changing saved or alternate surfaces", () => {
		withDocument(() => {
			const { controller, collapsed, calls } = collapseController([
				"question",
				"terms",
			]);
			const hidden = renderAnchoredMarker(controller, anchoredCue(), {
				showRailQuestions: false,
				showRailSupportTerms: false,
			});
			expect(disclosureButtons(hidden).map((button) => button.dataset.section)).toEqual([
				"summary",
			]);
			expect(collapsed).toEqual(new Set(["question", "terms"]));
			expect(calls).toEqual([]);

			const missing = renderCueElement(
				anchoredCue({ sectionLens: null, keywords: [] }),
				"anchored-card-rail"
			);
			expect(disclosureButtons(missing).map((button) => button.dataset.section)).toEqual([
				"question",
			]);
			const failed = renderCueElement(
				anchoredCue({
					question: "",
					keywords: [],
					confidence: null,
					sectionLens: null,
					error: "boom",
				}),
				"anchored-card-rail"
			);
			expect(disclosureButtons(failed)).toEqual([]);
			for (const display of ["inline-cues", "cornell"] as const) {
				expect(disclosureButtons(renderCueElement(anchoredCue(), display))).toEqual(
					[]
				);
			}
		});
	});

	it("caps anchored card rail support terms at four", () => {
		withDocument(() => {
			const el = renderCueElement(
				{
					line: 3,
					heading: "Terms",
					question: "How do agents differ from chatbots?",
					keywords: ["agents", "tools", "planning", "autonomy", "memory"],
					confidence: "medium",
					sectionLens: SECTION_LENS,
					error: null,
				},
				"anchored-card-rail"
			);
			expect(
				Array.from(
					el.querySelectorAll(".cuecraft-editor-hook-keywords .cuecraft-cue-term")
				).map((term) => term.textContent)
			).toEqual(["agents", "tools", "planning", "autonomy"]);
			expect(el.querySelector(".cuecraft-editor-hook-terms-toggle")).toBeNull();
		});
	});

	it("hides hook card questions and support terms when display settings are off", () => {
		withDocument(() => {
			const el = renderCueElement(
				{
					line: 3,
					heading: "Terms",
					question: "How do agents differ from chatbots?",
					keywords: ["agents", "tools"],
					confidence: "medium",
					sectionLens: SECTION_LENS,
					error: null,
				},
				"anchored-card-rail",
				4,
				"upcoming",
				{
					showQuestion: false,
					showSupportTerms: false,
					cardStyle: "gradient",
				}
			);
			expect(el.dataset.cardStyle).toBe("gradient");
			expect(el.dataset.gradient).toBe("1");
			expect(el.dataset.questionVisible).toBe("false");
			expect(el.dataset.supportTermsVisible).toBe("false");
			expect(el.classList.contains("cuecraft-editor-hook-empty")).toBe(false);
			expect(
				Array.from(
					el.querySelectorAll(".cuecraft-editor-hook-section-label")
				).map((label) => label.textContent)
			).toEqual(["SUMMARY"]);
			expect(el.querySelector(".cuecraft-editor-hook-title")).toBeNull();
			expect(el.querySelector(".cuecraft-editor-hook-keywords")).toBeNull();
			expect(
				el.querySelector(".cuecraft-section-lens")?.textContent
			).toBe("Agents use tools to complete multi-step work.");
		});
	});

	it("hides inline and Cornell cue questions and support terms when display settings are off", () => {
		withDocument(() => {
			const cue = {
				line: 3,
				heading: "Terms",
				question: "How do agents differ from chatbots?",
				keywords: ["agents", "tools"],
				confidence: "medium" as const,
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
			expect(inline.querySelector(".cuecraft-cue-section-label")).toBeNull();

			const cornell = renderCueElement(
				cue,
				"cornell-exam-prep",
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

	it("renders collapsed tab hook DOM", () => {
		withDocument(() => {
			const el = renderCueElement(
				{
					line: 3,
					heading: "Who It Is For",
					question: "Who is this workflow designed for?",
					keywords: [],
					confidence: "low",
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
			expect(el.dataset.confidence).toBe("low");
			expect(el.querySelector(".cuecraft-editor-hook-heading")).toBeNull();
			expect(el.querySelector(".cuecraft-editor-hook-section-label")).toBeNull();
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
					sectionLens: SECTION_LENS,
					error: null,
				},
				"threaded-margin-notes",
				2
			);
			expect(
				el.classList.contains("cuecraft-editor-hook-threaded-margin-notes")
			).toBe(true);
			expect(el.classList.contains("cuecraft-editor-rail-card")).toBe(true);
			expect(el.dataset.display).toBe("threaded-margin-notes");
			expect(el.dataset.state).toBe("upcoming");
			expect(el.querySelector(".cuecraft-editor-hook-heading")).toBeNull();
			expect(
				Array.from(
					el.querySelectorAll(".cuecraft-editor-hook-keywords .cuecraft-cue-term")
				).map((term) => term.textContent)
			).toEqual(["standards", "workflow"]);
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
					heading: "How To Upskill Employees",
					question,
					keywords: ["org knowledge"],
					confidence: "medium",
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
					heading: "Study Takeaway",
					question,
					keywords: ["takeaway"],
					confidence: "high",
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

	it("renders anchored failed cue state without keywords", () => {
		withDocument(() => {
			const el = renderCueElement(
				{
					line: 3,
					heading: "Terms",
					question: "",
					keywords: [],
					confidence: null,
					sectionLens: null,
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
			heading: "A",
			question: "What is A?",
			keywords: ["alpha"],
			confidence: "high" as const,
			sectionLens: SECTION_LENS,
			error: null,
		},
		{
			line: 3,
			heading: "B",
			question: "What is B?",
			keywords: ["beta"],
			confidence: "medium" as const,
			sectionLens: SECTION_LENS,
			error: null,
		},
	];

	it("renders anchored card rail markers at section body lines", () => {
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
			state.doc.line(2).from,
			state.doc.line(4).from,
		]);
	});

	it("rereads collapse state when the same gutter marker remounts", () => {
		withDocument(() => {
			const { controller } = collapseController();
			const state = EditorState.create({ doc: "# Terms\nbody" });
			const marker = buildCueGutterMarkers(state, {
				cues: [anchoredCue()],
				display: "anchored-card-rail",
				notePath: "notes/agents.md",
				collapseController: controller,
			}).iter().value;
			if (!marker?.toDOM) throw new Error("Expected anchored gutter marker");

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

	it.each([
		{
			name: "standard",
			question: "What are the key roles?",
			compactGap: 6,
			roomyGap: 7,
		},
		{
			name: "long",
			question:
				"How do agents differ from chatbots, and how do tools make them useful?",
			compactGap: 7,
			roomyGap: 8,
		},
		{
			name: "dense",
			question:
				"How does tailoring AI with organizational knowledge upskill employees, and why does encoding that expertise into reusable plugins or agents make them faster and smarter?",
			compactGap: 8,
			roomyGap: 9,
		},
	])(
		"compacts $name cue cards only when the next cue is too close",
		({ question, compactGap, roomyGap }) => {
			withDocument(() => {
				const firstSection = Array.from(
					{ length: compactGap - 1 },
					(_, index) => `compact ${index + 1}`
				);
				const secondSection = Array.from(
					{ length: roomyGap - 1 },
					(_, index) => `roomy ${index + 1}`
				);
				const secondCueLine = compactGap + 1;
				const finalCueLine = secondCueLine + roomyGap;
				const doc = [
					"# Compact",
					...firstSection,
					"# Roomy",
					...secondSection,
					"# Final",
					"body",
				].join("\n");
				const state = EditorState.create({ doc });
				const markers = buildCueGutterMarkers(state, {
					cues: [
						{
							...cues[0],
							line: 1,
							question,
							keywords: ["driver", "designer"],
						},
						{
							...cues[1],
							line: secondCueLine,
							question,
							keywords: ["ask", "clarify"],
						},
						{
							...cues[1],
							line: finalCueLine,
							heading: "Final",
							question,
							keywords: ["scope", "requirements"],
						},
					],
					display: "anchored-card-rail",
				});
				const cards: HTMLElement[] = [];
				markers.between(0, state.doc.length, (_from, _to, marker) => {
					cards.push(marker.toDOM(null as never) as HTMLElement);
				});

				expect(cards[0].dataset.supportTermsVisible).toBe("true");
				expect(cards[0].dataset.space).toBe("compact");
				expect(
					cards[0].querySelector(".cuecraft-editor-hook-keywords")
				).not.toBeNull();
				expect(
					cards[0].querySelector(".cuecraft-editor-hook-title")?.textContent
				).toBe(question.replace(/\?$/, ""));
				expect(cards[1].dataset.supportTermsVisible).toBe("true");
				expect(cards[1].dataset.space).toBe("normal");
				expect(
					cards[1].querySelector(".cuecraft-editor-hook-keywords")
				).not.toBeNull();
				expect(cards[2].dataset.supportTermsVisible).toBe("true");
				expect(cards[2].dataset.space).toBe("normal");
			});
		}
	);

	it("keeps non-anchored hook displays on heading lines", () => {
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
			state.doc.line(2).from,
			state.doc.line(6).from,
		]);
	});

	it("falls anchored card markers back to the heading line without a body line", () => {
		const state = EditorState.create({ doc: "# Last" });
		const markers = buildCueGutterMarkers(state, {
			cues: [
				{
					line: 1,
					heading: "Last",
					question: "What is last?",
					keywords: ["last"],
					confidence: "high",
					sectionLens: null,
					error: null,
				},
			],
			display: "anchored-card-rail",
		});
		const positions: number[] = [];
		markers.between(0, state.doc.length, (from) => {
			positions.push(from);
		});
		expect(positions).toEqual([state.doc.line(1).from]);
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

	it("renders a single Note Brief widget near the top of the editor", () => {
		const state = EditorState.create({ doc: NOTE });
		const widgets = buildCueWidgetDecorations(state, {
			cues,
			display: "anchored-card-rail",
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
				display: "anchored-card-rail",
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
			display: "anchored-card-rail",
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

	it("renders Cornell Exam Prep and Minimal displays with Cornell style classes", () => {
		withDocument(() => {
			const examPrep = renderCueElement(cues[0], "cornell-exam-prep");
			expect(examPrep.classList.contains("cuecraft-editor-hook")).toBe(true);
			expect(examPrep.classList.contains("cuecraft-editor-rail-card")).toBe(true);
			expect(examPrep.classList.contains("cuecraft-style-exam-prep")).toBe(true);
			expect(examPrep.querySelector(".cuecraft-cornell-cue")).not.toBeNull();
			expect(examPrep.textContent).toContain("What is A?");
			expect(
				examPrep.querySelector(".cuecraft-section-lens-takeaway")?.textContent
			).toBe("Agents use tools to complete multi-step work.");

			const minimal = renderCueElement(cues[0], "cornell-minimal");
			expect(minimal.classList.contains("cuecraft-editor-hook")).toBe(true);
			expect(minimal.classList.contains("cuecraft-editor-rail-card")).toBe(true);
			expect(minimal.classList.contains("cuecraft-style-minimal")).toBe(true);
			expect(minimal.querySelector(".cuecraft-cornell-cue")).not.toBeNull();
			expect(minimal.textContent).toContain("What is A?");
			expect(
				minimal.querySelector(".cuecraft-section-lens-takeaway")?.textContent
			).toBe("Agents use tools to complete multi-step work.");
		});
	});

	it("applies cue width and font settings to every editor cue display", () => {
		withDocument(() => {
			for (const option of EDITOR_CUE_DISPLAY_OPTIONS) {
				const element = renderCueElement(cues[0], option.id, 0, "current", {
					cueColumnWidth: "wide",
					cueFontSize: "large",
				});
				expect(element.classList.contains("cuecraft-cuewidth-wide")).toBe(true);
				expect(element.classList.contains("cuecraft-cuefont-large")).toBe(true);
			}
		});
	});
});

describe("rail card overflow", () => {
	const cue = {
		line: 1,
		heading: "A",
		question: "What is A?",
		keywords: ["alpha"],
		confidence: "high" as const,
		sectionLens: SECTION_LENS,
		error: null,
	};

	it("clamps collapsed height to the next section gap with a fallback", () => {
		expect(railCardCollapsedHeightForAvailable(null)).toBe(
			RAIL_CARD_COLLAPSED_DEFAULT_HEIGHT
		);
		expect(railCardCollapsedHeightForAvailable(Number.NaN)).toBe(
			RAIL_CARD_COLLAPSED_DEFAULT_HEIGHT
		);
		expect(railCardCollapsedHeightForAvailable(60)).toBe(
			RAIL_CARD_COLLAPSED_MIN_HEIGHT
		);
		expect(railCardCollapsedHeightForAvailable(220)).toBe(208);
		expect(railCardCollapsedHeightForAvailable(999)).toBe(
			RAIL_CARD_COLLAPSED_MAX_HEIGHT
		);
	});

	it("uses a small tolerance when deciding whether content overflows", () => {
		expect(railCardContentOverflows(178, 176)).toBe(true);
		expect(railCardContentOverflows(177, 176)).toBe(false);
		expect(railCardContentOverflows(176, 176)).toBe(false);
	});

	it("measures rail card content against the next card position", () => {
		withDocument(() => {
			const root = document.createElement("div");
			const first = document.createElement("div");
			first.className = "cuecraft-editor-rail-card";
			const firstContent = document.createElement("div");
			firstContent.className = "cuecraft-editor-rail-card-content";
			const firstToggle = document.createElement("button");
			firstToggle.className = "cuecraft-editor-rail-card-toggle";
			firstToggle.hidden = true;
			first.append(firstContent, firstToggle);
			Object.defineProperty(firstContent, "scrollHeight", {
				configurable: true,
				value: 260,
			});
			first.getBoundingClientRect = () =>
				({ top: 10 }) as DOMRect;

			const second = document.createElement("div");
			second.className = "cuecraft-editor-rail-card";
			const secondContent = document.createElement("div");
			secondContent.className = "cuecraft-editor-rail-card-content";
			const secondToggle = document.createElement("button");
			secondToggle.className = "cuecraft-editor-rail-card-toggle";
			secondToggle.hidden = true;
			second.append(secondContent, secondToggle);
			Object.defineProperty(secondContent, "scrollHeight", {
				configurable: true,
				value: 80,
			});
			second.getBoundingClientRect = () =>
				({ top: 210 }) as DOMRect;
			root.append(first, second);

			const measurements = measureRailOverflowCards(root);
			expect(measurements).toHaveLength(2);
			expect(measurements[0]).toMatchObject({
				card: first,
				collapsedHeight: 188,
				overflowing: true,
			});
			expect(measurements[1]).toMatchObject({
				card: second,
				collapsedHeight: RAIL_CARD_COLLAPSED_DEFAULT_HEIGHT,
				overflowing: false,
			});

			applyRailOverflowMeasurements(measurements);
			expect(first.dataset.overflowing).toBe("true");
			expect(first.style.getPropertyValue("--cuecraft-rail-collapsed-max-height")).toBe(
				"188px"
			);
			expect(firstToggle.hidden).toBe(false);
			expect(second.dataset.overflowing).toBe("false");
			expect(secondToggle.hidden).toBe(true);
		});
	});

	it("toggles overflowing rail cards between collapsed and expanded states", () => {
		withDocument(() => {
			const el = renderCueElement(cue, "anchored-card-rail");
			const toggle = el.querySelector<HTMLButtonElement>(
				".cuecraft-editor-rail-card-toggle"
			);
			expect(toggle).not.toBeNull();
			el.dataset.overflowing = "true";
			toggle!.hidden = false;

			toggle!.click();
			expect(el.dataset.expanded).toBe("true");
			expect(toggle!.textContent).toBe("Show less");
			expect(toggle!.getAttribute("aria-expanded")).toBe("true");

			toggle!.click();
			expect(el.dataset.expanded).toBe("false");
			expect(toggle!.textContent).toBe("Show more");
			expect(toggle!.getAttribute("aria-expanded")).toBe("false");
		});
	});

	it("preserves card-wide expansion across section overflow changes", () => {
		withDocument(() => {
			const el = renderCueElement(cue, "anchored-card-rail");
			const toggle = el.querySelector<HTMLButtonElement>(
				".cuecraft-editor-rail-card-toggle"
			);
			if (!toggle) throw new Error("Expected rail card toggle");

			applyRailOverflowMeasurements([
				{ card: el, collapsedHeight: 176, overflowing: true },
			]);
			toggle.click();
			expect(el.dataset.expanded).toBe("true");

			applyRailOverflowMeasurements([
				{ card: el, collapsedHeight: 176, overflowing: false },
			]);
			expect(toggle.hidden).toBe(true);
			expect(el.dataset.expanded).toBe("true");

			applyRailOverflowMeasurements([
				{ card: el, collapsedHeight: 176, overflowing: true },
			]);
			expect(toggle.hidden).toBe(false);
			expect(el.dataset.expanded).toBe("true");
			expect(toggle.textContent).toBe("Show less");
			expect(toggle.getAttribute("aria-expanded")).toBe("true");
		});
	});

	it("does not add rail overflow controls to inline cues", () => {
		withDocument(() => {
			const el = renderCueElement(cue, "inline-cues");
			expect(el.classList.contains("cuecraft-editor-rail-card")).toBe(false);
			expect(el.querySelector(".cuecraft-editor-rail-card-content")).toBeNull();
			expect(el.querySelector(".cuecraft-editor-rail-card-toggle")).toBeNull();
		});
	});
});

describe("rail spacers", () => {
	const cues = [
		{
			line: 1,
			heading: "A",
			question: "What is A?",
			keywords: ["alpha"],
			confidence: "high" as const,
			sectionLens: SECTION_LENS,
			error: null,
		},
		{
			line: 3,
			heading: "B",
			question: "What is B?",
			keywords: ["beta"],
			confidence: "medium" as const,
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

	it("builds invisible block spacer widgets for rail displays only", () => {
		withDocument(() => {
			const state = EditorState.create({ doc: NOTE });
			const railDecorations = buildRailSpacerDecorations(
				state,
				{ cues, display: "anchored-card-rail" },
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
				display: "anchored-card-rail",
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

	it("dispatches a rail toggle event after Show more changes expansion state", () => {
		withDocument(() => {
			const el = renderCueElement(cues[0], "anchored-card-rail");
			const events: string[] = [];
			el.addEventListener(RAIL_CARD_TOGGLE_EVENT, () => {
				events.push("toggle");
			});
			const toggle = el.querySelector<HTMLButtonElement>(
				".cuecraft-editor-rail-card-toggle"
			);
			expect(toggle).not.toBeNull();
			toggle!.hidden = false;
			toggle!.click();

			expect(el.dataset.expanded).toBe("true");
			expect(events).toEqual(["toggle"]);
		});
	});

	it("requests another measurement after spacer decorations are applied", () => {
		const state = EditorState.create({ doc: NOTE });
		const transaction = state.update({
			effects: setRailSpacersEffect.of(new Map([[3, 120]])),
		});
		expect(
			railOverflowUpdateNeedsMeasure({
				docChanged: false,
				viewportChanged: false,
				selectionSet: false,
				transactions: [transaction],
			} as Parameters<typeof railOverflowUpdateNeedsMeasure>[0])
		).toBe(true);
	});
});
