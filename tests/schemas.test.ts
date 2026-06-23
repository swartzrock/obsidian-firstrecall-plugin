import { describe, it, expect } from "vitest";
import {
	extractJson,
	validateCue,
	validateCueBatch,
	validateSummary,
} from "../src/schemas";

describe("extractJson", () => {
	it("parses raw JSON", () => {
		expect(extractJson('{"a":1}')).toEqual({ a: 1 });
	});

	it("parses JSON inside ```json fences", () => {
		expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
	});

	it("parses JSON embedded in prose", () => {
		expect(extractJson('Sure! Here you go: {"a":3} hope that helps')).toEqual({
			a: 3,
		});
	});

	it("returns null when no JSON object is present", () => {
		expect(extractJson("no json here")).toBeNull();
	});
});

describe("validateCue", () => {
	it("accepts a well-formed cue", () => {
		const r = validateCue(
			'{"question":"What is X?","keywords":["a","b"],"confidence":"high"}'
		);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.keywords).toHaveLength(2);
	});

	it("rejects fewer than 2 keywords (H1.1)", () => {
		const r = validateCue(
			'{"question":"Q","keywords":["only"],"confidence":"high"}'
		);
		expect(r.ok).toBe(false);
	});

	it("trims more than 5 keywords down to 5 instead of failing", () => {
		const r = validateCue(
			'{"question":"Q","keywords":["a","b","c","d","e","f","g"],"confidence":"high"}'
		);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.keywords).toEqual(["a", "b", "c", "d", "e"]);
	});

	it("drops blank and duplicate keywords before validating", () => {
		const r = validateCue(
			'{"question":"Q","keywords":["a"," ","A","b","a"],"confidence":"low"}'
		);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.keywords).toEqual(["a", "b"]);
	});

	it("normalizes confidence casing", () => {
		const r = validateCue(
			'{"question":"Q","keywords":["a","b"],"confidence":" High "}'
		);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.confidence).toBe("high");
	});

	it("accepts an optional rationale", () => {
		const r = validateCue(
			'{"question":"Q","keywords":["a","b"],"confidence":"low","rationale":"The section is sparse."}'
		);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.rationale).toBe("The section is sparse.");
	});

	it("accepts a nullable rationale from strict structured output", () => {
		const r = validateCue(
			'{"question":"Q","keywords":["a","b"],"confidence":"high","rationale":null}'
		);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.rationale).toBeUndefined();
	});

	it("falls back to medium for an unrecognized confidence value", () => {
		const r = validateCue(
			'{"question":"Q","keywords":["a","b"],"confidence":"sure"}'
		);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.confidence).toBe("medium");
	});

	it("rejects an empty question", () => {
		const r = validateCue(
			'{"question":"","keywords":["a","b"],"confidence":"low"}'
		);
		expect(r.ok).toBe(false);
	});

	it("reports a readable error for non-JSON", () => {
		const r = validateCue("not json");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/not valid JSON/);
	});
});

describe("validateCueBatch", () => {
	it("accepts a cue array wrapped in a cues object", () => {
		const r = validateCueBatch(
			JSON.stringify({
				cues: [
					{ question: "Q1?", keywords: ["a", "b"], confidence: "high" },
					{ question: "Q2?", keywords: ["c", "d"], confidence: "medium" },
				],
			}),
			2
		);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.map((item) => item.value?.question)).toEqual(["Q1?", "Q2?"]);
			expect(r.value.every((item) => item.error === null)).toBe(true);
		}
	});

	it("keeps item-level errors isolated", () => {
		const r = validateCueBatch(
			JSON.stringify({
				cues: [
					{ question: "Q1?", keywords: ["a", "b"], confidence: "high" },
					{ question: "", keywords: ["c", "d"], confidence: "medium" },
				],
			}),
			3
		);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value[0].value?.question).toBe("Q1?");
			expect(r.value[1].error).toMatch(/question/);
			expect(r.value[2].error).toMatch(/missing cue/i);
		}
	});
});

describe("validateSummary", () => {
	it("accepts a summary with optional learningObjective", () => {
		const r = validateSummary(
			'{"summary":"It covers X and Y.","learningObjective":"Understand X."}'
		);
		expect(r.ok).toBe(true);
	});

	it("accepts a nullable learningObjective from strict structured output", () => {
		const r = validateSummary(
			'{"summary":"It covers X and Y.","learningObjective":null}'
		);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.learningObjective).toBeUndefined();
	});

	it("rejects a missing summary", () => {
		expect(validateSummary("{}").ok).toBe(false);
	});
});
