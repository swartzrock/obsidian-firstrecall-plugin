import { describe, expect, it } from "vitest";
import { buildEditorHookCard } from "../src/editor-hook-rail";
import type { CueLineData } from "../src/cue-extension";

function cue(overrides: Partial<CueLineData> = {}): CueLineData {
	return {
		line: 3,
		heading: "Terms",
		question:
			"How do agents differ from chatbots, and how do tools make them useful?",
		keywords: ["agents", "tools"],
		confidence: "high",
		error: null,
		...overrides,
	};
}

describe("buildEditorHookCard", () => {
	it("builds anchored hook cards from cue line data", () => {
		const card = buildEditorHookCard(cue(), "anchored-card-rail");
		expect(card).toMatchObject({
			kind: "hook",
			display: "anchored-card-rail",
			line: 3,
			heading: "Terms",
			hookTitle:
				"How do agents differ from chatbots, and how do tools make them useful",
			keywords: ["agents", "tools"],
			confidence: "high",
			error: null,
			titleDensity: "long",
			state: "upcoming",
			tone: "warm",
		});
	});

	it("does not mark cards current without active section state", () => {
		const first = buildEditorHookCard(cue(), "collapsed-tabs", 0);
		const card = buildEditorHookCard(cue(), "collapsed-tabs", 1);
		expect(first.state).toBe("upcoming");
		expect(card.state).toBe("upcoming");
		expect(card.tone).toBe("cool");
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
			"anchored-card-rail"
		);
		expect(card.titleDensity).toBe("dense");
	});

	it("preserves failed cue states", () => {
		const card = buildEditorHookCard(
			cue({ question: "", keywords: [], confidence: null, error: "boom" }),
			"anchored-card-rail"
		);
		expect(card).toMatchObject({
			kind: "failed",
			hookTitle: "Cue unavailable",
			error: "boom",
			keywords: [],
			confidence: null,
		});
	});
});
