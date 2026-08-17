import { describe, expect, it } from "vitest";
import {
	buildEditorHookCard,
	buildEditorHookTitle,
	editorHookTitleDensity,
} from "../src/editor-hook-rail";
import type { CueLineData } from "../src/cue-extension";

function cue(overrides: Partial<CueLineData> = {}): CueLineData {
	return {
		line: 3,
		sectionId: "terms",
		heading: "Terms",
		question:
			"How do agents differ from chatbots, and how do tools make them useful?",
		keywords: ["agents", "tools"],
		sectionLens: null,
		error: null,
		...overrides,
	};
}

describe("buildEditorHookCard", () => {
	it("builds editor hook cards from cue line data", () => {
		const card = buildEditorHookCard(cue(), "collapsed-tabs");
		expect(card).toMatchObject({
			kind: "hook",
			display: "collapsed-tabs",
			line: 3,
			heading: "Terms",
			hookTitle:
				"How do agents differ from chatbots, and how do tools make them useful",
			keywords: ["agents", "tools"],
			error: null,
			titleDensity: "long",
			state: "upcoming",
			tone: "warm",
			gradientIndex: 0,
			showSummary: true,
			showQuestion: true,
			showTerms: true,
		});
		expect(card).not.toHaveProperty("category");
	});

	it("does not mark cards current without active section state", () => {
		const first = buildEditorHookCard(cue(), "collapsed-tabs", 0);
		const card = buildEditorHookCard(cue(), "collapsed-tabs", 1);
		expect(first.state).toBe("upcoming");
		expect(card.state).toBe("upcoming");
		expect(card.tone).toBe("cool");
	});

	it("accepts display-only hook card options", () => {
		const card = buildEditorHookCard(cue(), "collapsed-tabs", 4, "upcoming", {
			showSummary: false,
			showQuestion: false,
			showTerms: false,
		});
		expect(card.showSummary).toBe(false);
		expect(card.showQuestion).toBe(false);
		expect(card.showTerms).toBe(false);
		expect(card.gradientIndex).toBe(1);
	});

	it("accepts explicit active section state", () => {
		const card = buildEditorHookCard(
			cue(),
			"active-section-composer",
			0,
			"current"
		);
		expect(card.state).toBe("current");
	});

	it("marks long hook titles with density metadata", () => {
		const card = buildEditorHookCard(
			cue({
				question:
					"How does tailoring AI with organizational knowledge upskill employees, and why does encoding that expertise into reusable plugins or agents make them faster and smarter?",
			}),
			"collapsed-tabs"
		);
		expect(card.titleDensity).toBe("dense");
	});

	it("preserves failed cue states", () => {
		const card = buildEditorHookCard(
			cue({ question: "", keywords: [], error: "boom" }),
			"collapsed-tabs"
		);
		expect(card).toMatchObject({
			kind: "failed",
			hookTitle: "Section cue unavailable",
			error: "boom",
			keywords: [],
		});
		expect(card).not.toHaveProperty("category");
	});
});

describe("editor hook title presentation", () => {
	it("normalizes a question and removes its terminal question mark", () => {
		expect(buildEditorHookTitle("  What   makes retrieval work ?  ")).toBe(
			"What makes retrieval work"
		);
		expect(buildEditorHookTitle("   ")).toBeNull();
	});

	it("classifies standard, long, and dense titles", () => {
		expect(editorHookTitleDensity("Short hook")).toBe("standard");
		expect(
			editorHookTitleDensity(
				"Why does retrieval practice improve durable learning across several different contexts"
			)
		).toBe("long");
		expect(
			editorHookTitleDensity(
				"How does tailoring artificial intelligence with organizational knowledge improve employee learning while creating reusable agents that preserve local workflows and standards"
			)
		).toBe("dense");
	});
});
