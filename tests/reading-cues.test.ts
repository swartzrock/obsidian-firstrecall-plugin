import { describe, it, expect } from "vitest";
import {
	buildReadingCueMap,
	READING_MODE_DISPLAY_OPTIONS,
	readingModeDisplayState,
	readingNoteBriefDisplayState,
	readingReviewAffordanceState,
} from "../src/reading-cues";
import { buildNoteCache } from "../src/cache";
import { parseSections } from "../src/parser";
import type { NoteGenerationResult } from "../src/generator";

const NOTE = "# A\nalpha\n## B\nbeta\n## C\ngamma";
const SECTION_LENS = {
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

describe("buildReadingCueMap", () => {
	it("indexes cues by their current heading line", () => {
		const map = buildReadingCueMap(cacheFrom(), NOTE);
		expect([...map.keys()].sort((a, b) => a - b)).toEqual([1, 3, 5]);
		expect(map.get(1)?.question).toBe("Q:A");
		expect(map.get(3)?.heading).toBe("B");
	});

	it("can omit keyword hints from mapped reading cues", () => {
		const map = buildReadingCueMap(cacheFrom(), NOTE, {
			showKeywords: false,
		});
		expect(map.get(1)?.question).toBe("Q:A");
		expect(map.get(1)?.keywords).toEqual([]);
	});

	it("can omit Section Lens from mapped reading cues", () => {
		const map = buildReadingCueMap(cacheFrom(), NOTE, {
			showSectionLens: false,
		});
		expect(map.get(1)?.question).toBe("Q:A");
		expect(map.get(1)?.sectionLens).toBeNull();
	});

	it("includes Section Lens by default", () => {
		const map = buildReadingCueMap(cacheFrom(), NOTE);
		expect(map.get(1)?.sectionLens?.keyPhrase).toBe("agent autonomy");
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

	it("omits sections that were never generated", () => {
		const cache = cacheFrom((_s, i) =>
			i === 1
				? { error: null, question: null, keywords: null, confidence: null }
				: {}
		);
		const map = buildReadingCueMap(cache, NOTE);
		expect(map.has(3)).toBe(false);
		expect(map.size).toBe(2);
	});
});

describe("readingReviewAffordanceState", () => {
	it("shows the Cornell review entry when usable cues are available and visible", () => {
		expect(
			readingReviewAffordanceState({
				hasUsableCues: true,
				isHidden: false,
			})
		).toEqual({
			visible: true,
			action: "review-this-note",
		});
	});

	it("hides the Cornell review entry when cues are hidden", () => {
		expect(
			readingReviewAffordanceState({
				hasUsableCues: true,
				isHidden: true,
			})
		).toEqual({
			visible: false,
			action: null,
		});
	});

	it("hides the Cornell review entry when no usable cues exist", () => {
		expect(
			readingReviewAffordanceState({
				hasUsableCues: false,
				isHidden: false,
			})
		).toEqual({
			visible: false,
			action: null,
		});
	});
});

describe("readingModeDisplayState", () => {
	it("keeps Reading mode display choices focused on native Reading surfaces", () => {
		expect(READING_MODE_DISPLAY_OPTIONS.map((option) => option.id)).toEqual([
			"inline-cues",
			"review-button",
		]);
	});

	it("shows only the review button for the default Reading mode display", () => {
		expect(
			readingModeDisplayState({
				display: "review-button",
				renderInReadingMode: true,
				hasCache: true,
				hasUsableCues: true,
				isHidden: false,
			})
		).toEqual({
			showInlineCues: false,
			showReviewButton: true,
		});
	});

	it("shows inline cues only when inline cues are selected", () => {
		expect(
			readingModeDisplayState({
				display: "inline-cues",
				renderInReadingMode: true,
				hasCache: true,
				hasUsableCues: true,
				isHidden: false,
			})
		).toEqual({
			showInlineCues: true,
			showReviewButton: false,
		});
	});

	it("hides all Reading-mode surfaces when disabled, hidden, uncached, or unusable", () => {
		const hidden = {
			showInlineCues: false,
			showReviewButton: false,
		};
		expect(
			readingModeDisplayState({
				display: "review-button",
				renderInReadingMode: false,
				hasCache: true,
				hasUsableCues: true,
				isHidden: false,
			})
		).toEqual(hidden);
		expect(
			readingModeDisplayState({
				display: "review-button",
				renderInReadingMode: true,
				hasCache: false,
				hasUsableCues: true,
				isHidden: false,
			})
		).toEqual(hidden);
		expect(
			readingModeDisplayState({
				display: "review-button",
				renderInReadingMode: true,
				hasCache: true,
				hasUsableCues: true,
				isHidden: true,
			})
		).toEqual(hidden);
		expect(
			readingModeDisplayState({
				display: "review-button",
				renderInReadingMode: true,
				hasCache: true,
				hasUsableCues: false,
				isHidden: false,
			})
		).toEqual(hidden);
	});
});

describe("readingNoteBriefDisplayState", () => {
	it("shows Note Brief only when reading surfaces, cache, data, and toggle are available", () => {
		expect(
			readingNoteBriefDisplayState({
				renderInReadingMode: true,
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
				renderInReadingMode: false,
				showNoteBrief: true,
				hasCache: true,
				hasNoteBrief: true,
				isHidden: false,
			})
		).toEqual(hidden);
		expect(
			readingNoteBriefDisplayState({
				renderInReadingMode: true,
				showNoteBrief: false,
				hasCache: true,
				hasNoteBrief: true,
				isHidden: false,
			})
		).toEqual(hidden);
		expect(
			readingNoteBriefDisplayState({
				renderInReadingMode: true,
				showNoteBrief: true,
				hasCache: false,
				hasNoteBrief: true,
				isHidden: false,
			})
		).toEqual(hidden);
		expect(
			readingNoteBriefDisplayState({
				renderInReadingMode: true,
				showNoteBrief: true,
				hasCache: true,
				hasNoteBrief: false,
				isHidden: false,
			})
		).toEqual(hidden);
		expect(
			readingNoteBriefDisplayState({
				renderInReadingMode: true,
				showNoteBrief: true,
				hasCache: true,
				hasNoteBrief: true,
				isHidden: true,
			})
		).toEqual(hidden);
	});
});
