import { describe, it, expect } from "vitest";
import { extractJson, validateCue, validateSummary } from "../src/schemas";

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

	it("rejects an invalid confidence value", () => {
		const r = validateCue(
			'{"question":"Q","keywords":["a","b"],"confidence":"sure"}'
		);
		expect(r.ok).toBe(false);
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

describe("validateSummary", () => {
	it("accepts a summary with optional learningObjective", () => {
		const r = validateSummary(
			'{"summary":"It covers X and Y.","learningObjective":"Understand X."}'
		);
		expect(r.ok).toBe(true);
	});

	it("rejects a missing summary", () => {
		expect(validateSummary("{}").ok).toBe(false);
	});
});
