import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { buildCornellModel } from "../src/cornell";
import {
	applyShortFormHookFocusState,
	buildShortFormHookModel,
	buildShortFormHookSummary,
	buildShortFormHookTitle,
	shortFormHookCardState,
	shortFormHookFocusLabel,
	shortFormHookStatusIcon,
	type ShortFormHookRailCard,
} from "../src/short-form-hook";
import { buildNoteCache } from "../src/cache";
import { parseSections } from "../src/parser";
import type { NoteGenerationResult } from "../src/generator";

const NOTE = "# A\nalpha\n## B\nbeta\n## C\ngamma";

function cacheFrom(
	overrides: (
		s: ReturnType<typeof parseSections>[number],
		i: number
	) => Partial<NoteGenerationResult["sections"][number]> = () => ({}),
	top: Partial<Pick<NoteGenerationResult, "summary" | "learningObjective">> = {}
) {
	const sections = parseSections(NOTE).map((s, i) => ({
		id: s.id,
		heading: s.heading,
		level: s.level,
		lineNumber: s.lineNumber,
		contentHash: s.contentHash,
		keywords: ["k1", "k2"],
		question: ` What does ${s.heading} explain? `,
		confidence: "high" as const,
		error: null as string | null,
		...overrides(s, i),
	}));
	const result: NoteGenerationResult = {
		sections,
		summary: top.summary ?? " the summary ",
		learningObjective: top.learningObjective ?? " the objective ",
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

describe("buildShortFormHookTitle", () => {
	it("normalizes a cue question into a compact hook title", () => {
		expect(buildShortFormHookTitle("  What   makes spaced repetition work ?  ")).toBe(
			"What makes spaced repetition work"
		);
	});

	it("rejects empty cue questions", () => {
		expect(buildShortFormHookTitle("   ")).toBeNull();
		expect(buildShortFormHookTitle(null)).toBeNull();
	});

	it("keeps long titles compact without mutating the source question", () => {
		const title = buildShortFormHookTitle(
			"How does a retrieval cue help learners reconstruct the original answer intent when the section is dense with details?"
		);
		expect(title?.length).toBeLessThanOrEqual(96);
		expect(title).toMatch(/\.\.\.$/);
	});
});

describe("buildShortFormHookModel", () => {
	it("builds hook cards from usable cues while preserving original questions", () => {
		const model = buildCornellModel(cacheFrom(), parseSections(NOTE));
		const hook = buildShortFormHookModel(model);
		expect(hook.cards).toHaveLength(3);
		expect(hook.cards[0]).toMatchObject({
			kind: "hook",
			sectionId: model.rows[0].id,
			heading: "A",
			hookTitle: "What does A explain",
			originalQuestion: " What does A explain? ",
			confidence: "high",
		});
		expect("keywords" in hook.cards[0]).toBe(false);
	});

	it("skips missing or whitespace-only questions instead of creating normal hook cards", () => {
		const cache = cacheFrom((_s, i) =>
			i === 1
				? {
						question: "   ",
						keywords: ["hidden"],
					}
				: {}
		);
		const hook = buildShortFormHookModel(
			buildCornellModel(cache, parseSections(NOTE))
		);
		expect(hook.cards.map((card) => card.heading)).toEqual(["A", "C"]);
	});

	it("keeps failed cues visible as compact unavailable cards", () => {
		const cache = cacheFrom((_s, i) =>
			i === 1 ? { error: "boom", question: null } : {}
		);
		const hook = buildShortFormHookModel(
			buildCornellModel(cache, parseSections(NOTE))
		);
		expect(hook.cards).toHaveLength(3);
		expect(hook.cards[1]).toMatchObject({
			kind: "failed",
			heading: "B",
			error: "boom",
			label: "Cue unavailable",
		});
	});

	it("passes confidence and section identity through for display state", () => {
		const cache = cacheFrom((_s, i) =>
			i === 0 ? { confidence: "low", rationale: "thin section" } : {}
		);
		const model = buildCornellModel(cache, parseSections(NOTE));
		const hook = buildShortFormHookModel(model);
		expect(hook.cards[0]).toMatchObject({
			sectionId: model.rows[0].id,
			confidence: "low",
		});
	});

	it("creates a final synthesis card from cached summary fields", () => {
		const hook = buildShortFormHookModel(
			buildCornellModel(cacheFrom(), parseSections(NOTE))
		);
		expect(hook.summary).toEqual({
			label: "Synthesis",
			takeaway: "the summary",
			objective: "the objective",
		});
	});

	it("omits the final synthesis card when no summary fields exist", () => {
		expect(
			buildShortFormHookSummary({
				summary: " ",
				learningObjective: null,
			})
		).toBeNull();
	});
});

describe("short-form hook focus presentation", () => {
	it("marks only the focused section as current", () => {
		const model = buildCornellModel(cacheFrom(), parseSections(NOTE));
		const hook = buildShortFormHookModel(model);
		expect(shortFormHookCardState(hook.cards[0], hook.cards[0].sectionId)).toBe(
			"current"
		);
		expect(shortFormHookCardState(hook.cards[1], hook.cards[0].sectionId)).toBe(
			"upcoming"
		);
		expect(shortFormHookCardState(hook.cards[0], null)).toBe("upcoming");
	});

	it("keeps status icons quiet and label text action-oriented", () => {
		const model = buildCornellModel(cacheFrom(), parseSections(NOTE));
		const card = buildShortFormHookModel(model).cards[0];
		expect(shortFormHookStatusIcon("current")).toBe("\u2022");
		expect(shortFormHookStatusIcon("upcoming")).toBe("\u25e6");
		expect(shortFormHookFocusLabel(card)).toBe("Focus A");
	});

	it("uses a generic focus label when a card has no heading", () => {
		const card: ShortFormHookRailCard = {
			kind: "hook",
			sectionId: "intro",
			heading: "",
			hookTitle: "Intro",
			originalQuestion: "What opens this note?",
			confidence: "high",
		};
		expect(shortFormHookFocusLabel(card)).toBe("Focus section");
	});

	it("updates rail focus state without replacing note content", () => {
		const dom = new JSDOM(`
			<div>
				<button class="cuecraft-hook-card-action" data-section="a" aria-current="false">
					<span class="cuecraft-hook-status">\u25e6</span>
					<span>Alpha hook</span>
				</button>
				<button class="cuecraft-hook-card-action" data-section="b" aria-current="false">
					<span class="cuecraft-hook-status">\u25e6</span>
					<span>Beta hook</span>
				</button>
				<section class="cuecraft-cornell-body" data-section="a">alpha</section>
				<section class="cuecraft-cornell-body" data-section="b">beta</section>
			</div>
		`);
		const root = dom.window.document.body;
		const noteBodies = Array.from(
			root.querySelectorAll<HTMLElement>(".cuecraft-cornell-body")
		);
		const before = noteBodies.map((body) => body.innerHTML);

		applyShortFormHookFocusState(root, "b");

		const cards = Array.from(
			root.querySelectorAll<HTMLElement>(".cuecraft-hook-card-action")
		);
		expect(cards[0].classList.contains("is-current")).toBe(false);
		expect(cards[0].getAttribute("aria-current")).toBe("false");
		expect(cards[0].querySelector(".cuecraft-hook-status")?.textContent).toBe(
			"\u25e6"
		);
		expect(cards[1].classList.contains("is-current")).toBe(true);
		expect(cards[1].getAttribute("aria-current")).toBe("location");
		expect(cards[1].querySelector(".cuecraft-hook-status")?.textContent).toBe(
			"\u2022"
		);
		expect(noteBodies.map((body) => body.innerHTML)).toEqual(before);
	});
});
