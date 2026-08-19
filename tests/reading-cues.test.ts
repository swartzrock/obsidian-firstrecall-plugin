import { JSDOM } from "jsdom";
import { describe, it, expect, vi } from "vitest";
import {
	buildReadingCueMap,
	projectReadingStudyBlock,
	readingCueDisplayState,
	readingNoteBriefDisplayState,
	syncReadingStudyControls,
} from "../src/reading-cues";
import { buildNoteCache } from "../src/cache";
import { parseSections } from "../src/parser";
import type { NoteGenerationResult } from "../src/generator";
import type { StudySessionSnapshot } from "../src/study-session";
import { resolveStudySections, type StudySessionController } from "../src/study-session";
import FirstRecallPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/settings";

const NOTE = "# A\nalpha\n## B\nbeta\n## C\ngamma";
const SECTION_SUMMARY = {
	keyPhrase: "agent autonomy",
	takeaway: "Agents use tools to complete multi-step work.",
	explanation: "The section contrasts one-shot chat with tool-using agents.",
};

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
		summary: SECTION_SUMMARY,
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

function studySnapshot(): StudySessionSnapshot {
	return {
		active: true,
		path: "notes/example.md",
		sections: [
			{
				sectionId: "strict",
				heading: "Strict",
				question: "What is strict?",
				contentHash: "hash",
				headingLine: 1,
				bodyStartLine: 2,
				bodyEndLine: 3,
				headingRange: { from: 0, to: 8 },
				bodyRange: { from: 9, to: 20 },
				revealed: false,
			},
		],
		revealedCount: 0,
		total: 1,
	};
}

describe("buildReadingCueMap", () => {
	it("carries affected-section freshness into Reading without marking peers", () => {
		const cache = cacheFrom();
		const map = buildReadingCueMap(cache, NOTE, {
			sectionFreshness: new Map([
				[cache.sections[0].id, "outdated"],
				[cache.sections[1].id, "current"],
			]),
		});

		expect(map.get(1)?.freshness).toBe("outdated");
		expect(map.get(3)?.freshness).toBe("current");
	});

	it("indexes cues by their current heading line", () => {
		const map = buildReadingCueMap(cacheFrom(), NOTE);
		expect([...map.keys()].sort((a, b) => a - b)).toEqual([1, 3, 5]);
		expect(map.get(1)?.question).toBe("Q:A");
		expect(map.get(3)?.heading).toBe("B");
	});

	it("can omit keyword hints from mapped reading cues", () => {
		const map = buildReadingCueMap(cacheFrom(), NOTE, {
			showTerms: false,
		});
		expect(map.get(1)?.question).toBe("Q:A");
		expect(map.get(1)?.keywords).toEqual([]);
	});

	it("can omit Summary from mapped reading Section cues", () => {
		const map = buildReadingCueMap(cacheFrom(), NOTE, {
			showSummary: false,
		});
		expect(map.get(1)?.question).toBe("Q:A");
		expect(map.get(1)?.summary).toBeNull();
	});

	it("includes Summary by default", () => {
		const map = buildReadingCueMap(cacheFrom(), NOTE);
		expect(map.get(1)?.summary?.keyPhrase).toBe("agent autonomy");
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

	it("omits ordinary cues when all components are hidden but preserves errors", () => {
		const cache = cacheFrom((_s, i) =>
			i === 1 ? { error: "boom", question: null } : {}
		);
		const map = buildReadingCueMap(cache, NOTE, {
			showSummary: false,
			showQuestion: false,
			showTerms: false,
		});
		expect([...map.keys()]).toEqual([3]);
		expect(map.get(3)?.error).toBe("boom");
	});

	it("omits sections that were never generated", () => {
		const cache = cacheFrom((_s, i) =>
			i === 1
				? { error: null, question: null, keywords: null }
				: {}
		);
		const map = buildReadingCueMap(cache, NOTE);
		expect(map.has(3)).toBe(false);
		expect(map.size).toBe(2);
	});
});

describe("readingCueDisplayState", () => {
	it("uses global component visibility and lets active Study override it", () => {
		expect(
			readingCueDisplayState({
				hasCache: true,
				isHidden: false,
				studyActive: false,
				hasErrors: false,
				visibility: {
					showSummary: true,
					showQuestion: true,
					showTerms: true,
				},
			})
		).toEqual({ showInlineCues: true });

		for (const savedGate of [
			{
				isHidden: false,
				visibility: {
					showSummary: false,
					showQuestion: false,
					showTerms: false,
				},
			},
			{
				isHidden: true,
				visibility: {
					showSummary: true,
					showQuestion: true,
					showTerms: true,
				},
			},
		]) {
			expect(
				readingCueDisplayState({
					...savedGate,
					hasCache: true,
					studyActive: false,
					hasErrors: false,
				})
			).toEqual({ showInlineCues: false });
			expect(
				readingCueDisplayState({
					...savedGate,
					hasCache: true,
					studyActive: true,
					hasErrors: false,
				})
			).toEqual({ showInlineCues: true });
		}

		expect(
			readingCueDisplayState({
				hasCache: false,
				isHidden: false,
				studyActive: true,
				hasErrors: false,
				visibility: {
					showSummary: false,
					showQuestion: false,
					showTerms: false,
				},
			})
		).toEqual({ showInlineCues: false });
	});
});

describe("Reading freshness memoization", () => {
	it("invalidates a same-source cue map when component freshness changes", () => {
		const plugin = new FirstRecallPlugin({} as never, {} as never);
		const cache = cacheFrom();
		const read = plugin as unknown as {
			readingMapFor(
				path: string,
				text: string,
				cache: ReturnType<typeof cacheFrom>,
				visibility: {
					showSummary: boolean;
					showQuestion: boolean;
					showTerms: boolean;
				},
				freshness: Array<{ id: string; freshness: "current" | "outdated" }>
			): Map<number, { freshness: string }>;
		};
		const visibility = {
			showSummary: true,
			showQuestion: true,
			showTerms: true,
		};
		const current = cache.sections.map((section) => ({
			id: section.id,
			freshness: "current" as const,
		}));
		const outdated = current.map((section, index) => ({
			...section,
			freshness: index === 0 ? "outdated" as const : section.freshness,
		}));

		const first = read.readingMapFor("notes/example.md", NOTE, cache, visibility, current);
		const second = read.readingMapFor(
			"notes/example.md",
			NOTE,
			cache,
			visibility,
			outdated
		);

		expect(first.get(1)?.freshness).toBe("current");
		expect(second.get(1)?.freshness).toBe("outdated");
		expect(second).not.toBe(first);
	});
});

describe("projectReadingStudyBlock", () => {
	it("conceals only confidently owned strict sections and stays idempotent", () => {
		const dom = new JSDOM(`
			<div id="block">
				<h2 data-lines="0:0">Strict</h2>
				<div class="firstrecall-cue" data-firstrecall-section-id="strict">Prompt</div>
				<p id="owned" data-lines="1:1">Owned answer</p>
				<div id="ambiguous-a" data-lines="2:2">Ambiguous A</div>
				<div id="ambiguous-b" data-lines="2:2">Ambiguous B</div>
				<h2 data-lines="3:3">Fallback</h2>
				<div class="firstrecall-cue" data-firstrecall-section-id="fallback">Fallback prompt</div>
				<p data-lines="4:4">Fallback answer</p>
			</div>
		`);
		const block = dom.window.document.querySelector<HTMLElement>("#block")!;
		const toggleSection = vi.fn();
		const projection = {
			snapshot: studySnapshot(),
			toggleSection,
			showAll: vi.fn(),
			hideAll: vi.fn(),
			exit: vi.fn(),
		};
		const getSectionInfo = (element: HTMLElement) => {
			const [lineStart, lineEnd] = (element.dataset.lines ?? "")
				.split(":")
				.map(Number);
			return Number.isFinite(lineStart) && Number.isFinite(lineEnd)
				? { lineStart, lineEnd }
				: null;
		};

		projectReadingStudyBlock(block, getSectionInfo, projection);
		projectReadingStudyBlock(block, getSectionInfo, projection);

		const strictCue = block.querySelector<HTMLElement>(
			'[data-firstrecall-section-id="strict"]'
		)!;
		const fallbackCue = block.querySelector<HTMLElement>(
			'[data-firstrecall-section-id="fallback"]'
		)!;
		expect(strictCue.getAttribute("role")).toBe("note");
		expect(strictCue.hasAttribute("tabindex")).toBe(false);
		expect(fallbackCue.getAttribute("role")).toBe("note");
		expect(fallbackCue.hasAttribute("tabindex")).toBe(false);
		const toggle = strictCue.querySelector<HTMLButtonElement>(
			".firstrecall-study-section-toggle"
		)!;
		expect(toggle.getAttribute("aria-label")).toBe("Show answer");
		expect(toggle.getAttribute("aria-pressed")).toBe("false");
		expect(toggle.dataset.icon).toBe("eye");
		expect(toggle.dataset.tooltip).toBe("Show answer");
		expect(toggle.dataset.tooltipPlacement).toBe("right");
		expect(fallbackCue.querySelector(".firstrecall-study-section-toggle")).toBeNull();

		strictCue.click();
		strictCue.dispatchEvent(
			new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
		);
		strictCue.dispatchEvent(
			new dom.window.KeyboardEvent("keydown", { bubbles: true, key: " " })
		);
		fallbackCue.click();
		expect(toggleSection).not.toHaveBeenCalled();
		toggle.click();
		expect(toggleSection).toHaveBeenCalledOnce();
		expect(toggleSection).toHaveBeenCalledWith("strict");

		const owned = block.querySelector<HTMLElement>("#owned")!;
		expect(owned.classList.contains("firstrecall-reading-study-answer")).toBe(true);
		expect(owned.classList.contains("is-hidden")).toBe(true);
		expect(owned.getAttribute("aria-hidden")).toBe("true");
		for (const id of ["ambiguous-a", "ambiguous-b"]) {
			const ambiguous = block.querySelector<HTMLElement>(`#${id}`)!;
			expect(ambiguous.classList.contains("is-hidden")).toBe(false);
			expect(ambiguous.hasAttribute("aria-hidden")).toBe(false);
		}
	});

	it("reveals and restores answer semantics", () => {
		const dom = new JSDOM(`
			<div id="block">
				<h2 data-lines="0:0">Strict</h2>
				<div class="firstrecall-cue" data-firstrecall-section-id="strict">Prompt</div>
				<p id="answer" data-lines="1:1">Answer</p>
			</div>
		`);
		const block = dom.window.document.querySelector<HTMLElement>("#block")!;
		const getSectionInfo = (element: HTMLElement) => {
			const [lineStart, lineEnd] = (element.dataset.lines ?? "")
				.split(":")
				.map(Number);
			return Number.isFinite(lineStart) && Number.isFinite(lineEnd)
				? { lineStart, lineEnd }
				: null;
		};
		const hidden = studySnapshot();
		projectReadingStudyBlock(block, getSectionInfo, {
			snapshot: hidden,
			toggleSection: vi.fn(),
			showAll: vi.fn(),
			hideAll: vi.fn(),
			exit: vi.fn(),
		});
		const answer = block.querySelector<HTMLElement>("#answer")!;
		expect(answer.getAttribute("aria-hidden")).toBe("true");
		expect(
			block.querySelector<HTMLButtonElement>(".firstrecall-study-section-toggle")
				?.getAttribute("aria-label")
		).toBe("Show answer");

		const revealed = {
			...hidden,
			sections: hidden.sections.map((section) => ({ ...section, revealed: true })),
			revealedCount: 1,
		};
		projectReadingStudyBlock(block, getSectionInfo, {
			snapshot: revealed,
			toggleSection: vi.fn(),
			showAll: vi.fn(),
			hideAll: vi.fn(),
			exit: vi.fn(),
		});
		expect(answer.classList.contains("is-hidden")).toBe(false);
		expect(answer.hasAttribute("aria-hidden")).toBe(false);
		const revealedToggle = block.querySelector<HTMLButtonElement>(
			".firstrecall-study-section-toggle"
		)!;
		expect(revealedToggle.getAttribute("aria-label")).toBe("Hide answer");
		expect(revealedToggle.getAttribute("aria-pressed")).toBe("true");
		expect(revealedToggle.dataset.icon).toBe("eye-off");

		projectReadingStudyBlock(block, getSectionInfo, null);
		expect(answer.classList.contains("firstrecall-reading-study-answer")).toBe(false);
		expect(answer.hasAttribute("aria-hidden")).toBe(false);
		expect(block.querySelector(".firstrecall-study-section-toggle")).toBeNull();
	});
});

describe("syncReadingStudyControls", () => {
	it("keeps one live control host and cleans it up on Exit", () => {
		const dom = new JSDOM(
			"<div id=controls></div><div id=container></div>"
		);
		const container = dom.window.document.querySelector<HTMLElement>("#container")!;
		const controlsContainer = dom.window.document.querySelector<HTMLElement>(
			"#controls"
		)!;
		const showAll = vi.fn();
		const hideAll = vi.fn();
		const exit = vi.fn();
		const projection = {
			snapshot: studySnapshot(),
			toggleSection: vi.fn(),
			showAll,
			hideAll,
			exit,
		};

		syncReadingStudyControls(container, projection, controlsContainer);
		syncReadingStudyControls(container, projection, controlsContainer);

		expect(
			controlsContainer.querySelectorAll(".firstrecall-reading-study-controls")
		).toHaveLength(1);
		expect(container.querySelector(".firstrecall-reading-study-controls")).toBeNull();
		const controls = controlsContainer.querySelector<HTMLElement>(
			".firstrecall-reading-study-controls"
		)!;
		expect(controls.textContent).toContain("0 / 1 answers revealed");
		const help = controls.firstElementChild as HTMLElement;
		expect(help.classList.contains("firstrecall-study-help")).toBe(true);
		expect(help.dataset.icon).toBe("eye");
		expect(help.querySelector(".firstrecall-study-help-title")?.textContent).toBe(
			"Show or hide answers"
		);
		expect(help.querySelector(".firstrecall-study-help-detail")?.textContent).toBe(
			"Click the eye icon on any section card."
		);
		expect(help.querySelectorAll(".firstrecall-study-help-copy > span")).toHaveLength(
			2
		);
		const actions = controls.querySelector<HTMLElement>(
			".firstrecall-study-actions"
		)!;
		expect(actions.querySelectorAll("button")).toHaveLength(3);
		const progressTrack = controls.querySelector<HTMLElement>(
			".firstrecall-study-progress-track"
		)!;
		expect(progressTrack.getAttribute("role")).toBe("progressbar");
		expect(progressTrack.getAttribute("aria-valuenow")).toBe("0");
		expect(progressTrack.getAttribute("aria-valuemax")).toBe("1");
		const buttons = controls.querySelectorAll<HTMLButtonElement>("button");
		expect([...buttons].map((button) => button.textContent)).toEqual([
			"Show All Answers",
			"Hide All Answers",
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
		expect(
			controlsContainer.querySelector(".firstrecall-reading-study-controls")
		).toBeNull();

		buttons[0].click();
		buttons[1].click();
		buttons[2].click();
		expect(showAll).toHaveBeenCalledTimes(1);
		expect(hideAll).not.toHaveBeenCalled();
		expect(exit).toHaveBeenCalledTimes(1);
	});
});

describe("Reading postprocessor Study plumbing", () => {
	it("temporarily forces strict inline cues without mutating saved visibility", () => {
		const dom = new JSDOM(`
			<div class="markdown-preview-view" id="container">
				<div id="block">
					<h1 data-lines="0:0">A</h1><p id="a" data-lines="1:1">alpha</p>
					<h2 data-lines="2:2">B</h2><p id="b" data-lines="3:3">beta</p>
					<h2 data-lines="4:4">C</h2><p id="c" data-lines="5:5">gamma</p>
				</div>
			</div>
		`);
		globalThis.window = dom.window as unknown as typeof globalThis.window;
		globalThis.document = dom.window.document;
		globalThis.HTMLElement = dom.window.HTMLElement;
		const proto = dom.window.HTMLElement.prototype as HTMLElement & {
			addClass?: (...classes: string[]) => void;
			hasClass?: (className: string) => boolean;
			setAttr?: (name: string, value: string) => void;
			createDiv?: (options?: { text?: string; cls?: string }) => HTMLElement;
		};
		proto.addClass = function addClass(...classes: string[]) {
			this.classList.add(...classes);
		};
		proto.hasClass = function hasClass(className: string) {
			return this.classList.contains(className);
		};
		proto.setAttr = function setAttr(name: string, value: string) {
			this.setAttribute(name, value);
		};
		const makeDiv = (options: { text?: string; cls?: string } = {}) => {
			const element = dom.window.document.createElement("div");
			if (options.text) element.textContent = options.text;
			if (options.cls) element.className = options.cls;
			return element;
		};
		proto.createDiv = function createDiv(options = {}) {
			const element = makeDiv(options);
			this.appendChild(element);
			return element;
		};
		(globalThis as unknown as { createDiv: typeof makeDiv }).createDiv = makeDiv;

		const path = "notes/example.md";
		const cache = cacheFrom();
		cache.noteBrief = {
			overview: "Agents use tools to complete work.",
			whatMatters: { title: "Core", detail: "Agents can plan." },
			reviewFirst: { title: "Tools", detail: "Review tool use first." },
			sayItBack: { title: "Recall", detail: "Explain why tools matter." },
		};
		const plugin = new FirstRecallPlugin({} as never, {} as never);
		const container = dom.window.document.querySelector<HTMLElement>("#container")!;
		const block = dom.window.document.querySelector<HTMLElement>("#block")!;
		const view = {
			file: { path },
			getMode: () => "preview",
			containerEl: container,
			editor: { getValue: () => NOTE },
			addAction: () => dom.window.document.createElement("button"),
		};
		Object.assign(plugin as unknown as Record<string, unknown>, {
			settings: {
				...DEFAULT_SETTINGS,
				cueFontSize: "large",
				showSummary: false,
				showQuestion: false,
				showTerms: false,
			},
			app: {
				vault: { cachedRead: async () => NOTE },
				workspace: {
					getActiveFile: () => ({ path }),
					getActiveViewOfType: () => view,
					iterateAllLeaves: () => undefined,
				},
			},
			cacheStore: { get: () => cache, getState: () => null },
			visibility: { isHidden: () => true },
			refreshReadingModeSurface: vi.fn(),
			refreshEditorCues: vi.fn(),
		});
		const controller = (
			plugin as unknown as { studySession: StudySessionController }
		).studySession;
		controller.start(
			path,
			resolveStudySections(NOTE, cache.sections, parseSections(NOTE))
		);
		const context = {
			sourcePath: path,
			getSectionInfo: (element: HTMLElement) => {
				const [lineStart, lineEnd] = (element.dataset.lines ?? "")
					.split(":")
					.map(Number);
				return Number.isFinite(lineStart) && Number.isFinite(lineEnd)
					? { text: NOTE, lineStart, lineEnd }
					: null;
			},
		};

		const render = () =>
			(
				plugin as unknown as {
					renderReadingCues(
						element: HTMLElement,
						context: typeof context
					): void;
				}
			).renderReadingCues(block, context);
		render();
		render();

		expect(block.querySelectorAll(".firstrecall-cue-reading")).toHaveLength(3);
		expect(
			block.querySelectorAll(".firstrecall-cue-reading.firstrecall-cuefont-large")
		).toHaveLength(3);
		expect(block.querySelector<HTMLElement>("#a")?.getAttribute("aria-hidden")).toBe(
			"true"
		);
		expect(plugin.settings.showQuestion).toBe(false);
		expect(
			(plugin as unknown as { visibility: { isHidden(path: string): boolean } })
				.visibility.isHidden(path)
		).toBe(true);
		expect(
			container.querySelector(".firstrecall-study-material-banner")?.textContent
		).toContain("out of date");

		const firstCueSelector =
			`[data-firstrecall-section-id="${cache.sections[0].id}"]`;
		block.querySelector<HTMLElement>(firstCueSelector)?.click();
		render();
		expect(block.querySelector<HTMLElement>("#a")?.getAttribute("aria-hidden")).toBe(
			"true"
		);
		block
			.querySelector<HTMLElement>(firstCueSelector)
			?.querySelector<HTMLButtonElement>(".firstrecall-study-section-toggle")
			?.click();
		render();
		expect(block.querySelector<HTMLElement>("#a")?.hasAttribute("aria-hidden")).toBe(
			false
		);
		expect(block.querySelector<HTMLElement>("#b")?.getAttribute("aria-hidden")).toBe(
			"true"
		);
		expect(
			container.querySelector(".firstrecall-reading-study-controls")?.textContent
		).toContain("1 / 3 answers revealed");

		container
			.querySelector<HTMLButtonElement>(".firstrecall-reading-study-hide-all")
			?.click();
		render();
		expect(block.querySelector<HTMLElement>("#a")?.getAttribute("aria-hidden")).toBe(
			"true"
		);
		expect(
			container.querySelector(".firstrecall-reading-study-controls")?.textContent
		).toContain("0 / 3 answers revealed");

		container
			.querySelector<HTMLButtonElement>(".firstrecall-reading-study-exit")
			?.click();
		expect(block.querySelector<HTMLElement>("#a")?.hasAttribute("aria-hidden")).toBe(
			false
		);
		expect(container.querySelector(".firstrecall-reading-study-controls")).toBeNull();
		expect(controller.snapshot().active).toBe(false);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			visibility: { isHidden: () => false },
		});
		render();
		expect(block.querySelectorAll(".firstrecall-cue-reading")).toHaveLength(0);
		expect(block.querySelector(".firstrecall-note-brief")).not.toBeNull();
		expect(plugin.settings).toMatchObject({
			showSummary: false,
			showQuestion: false,
			showTerms: false,
		});

		plugin.settings.showSummary = true;
		render();
		expect(block.querySelectorAll(".firstrecall-cue-reading")).toHaveLength(3);
		expect(block.querySelector(".firstrecall-summary")).not.toBeNull();
		expect(block.querySelector(".firstrecall-cue-question")).toBeNull();
		expect(block.querySelector(".firstrecall-cue-keywords")).toBeNull();

		plugin.settings.showSummary = false;
		plugin.settings.showTerms = true;
		render();
		expect(block.querySelector(".firstrecall-summary")).toBeNull();
		expect(block.querySelector(".firstrecall-cue-question")).toBeNull();
		expect(block.querySelector(".firstrecall-cue-keywords")?.textContent).toContain(
			"k1"
		);
	});
});

describe("readingNoteBriefDisplayState", () => {
	it("shows Note Brief only when reading surfaces, cache, data, and toggle are available", () => {
		expect(
			readingNoteBriefDisplayState({
				showNoteBrief: true,
				hasCache: true,
				hasNoteBrief: true,
				isHidden: false,
			})
		).toEqual({ showNoteBrief: true });
	});

	it("hides Note Brief when disabled, hidden, uncached, or missing data", () => {
		const hidden = { showNoteBrief: false };
		expect(
			readingNoteBriefDisplayState({
				showNoteBrief: false,
				hasCache: true,
				hasNoteBrief: true,
				isHidden: false,
			})
		).toEqual(hidden);
		expect(
			readingNoteBriefDisplayState({
				showNoteBrief: true,
				hasCache: false,
				hasNoteBrief: true,
				isHidden: false,
			})
		).toEqual(hidden);
		expect(
			readingNoteBriefDisplayState({
				showNoteBrief: true,
				hasCache: true,
				hasNoteBrief: false,
				isHidden: false,
			})
		).toEqual(hidden);
		expect(
			readingNoteBriefDisplayState({
				showNoteBrief: true,
				hasCache: true,
				hasNoteBrief: true,
				isHidden: true,
			})
		).toEqual(hidden);
	});
});
