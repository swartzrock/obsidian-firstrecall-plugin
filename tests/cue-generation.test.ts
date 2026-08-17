import { describe, expect, it } from "vitest";
import {
	DEFAULT_QUESTION_TYPE,
	QUESTION_TYPES,
	isQuestionType,
	questionTypeInfo,
	resolveLegacyQuestionType,
} from "../src/cue-generation";

describe("cue-generation: Question type", () => {
	it("defines the five artifact-matched Question types", () => {
		expect(QUESTION_TYPES.map(({ id, label }) => ({ id, label }))).toEqual([
			{ id: "conceptual", label: "Conceptual question" },
			{ id: "direct-recall", label: "Direct recall" },
			{ id: "exam-practice", label: "Exam practice" },
			{ id: "vocabulary-check", label: "Vocabulary check" },
			{ id: "socratic-reasoning", label: "Socratic reasoning" },
		]);
		for (const type of QUESTION_TYPES) {
			expect(type.description.length).toBeGreaterThan(0);
			expect(type.guidance.length).toBeGreaterThan(0);
		}
	});

	it("defaults invalid values to Conceptual question", () => {
		expect(DEFAULT_QUESTION_TYPE).toBe("conceptual");
		expect(questionTypeInfo("not-a-type")).toBe(
			questionTypeInfo(DEFAULT_QUESTION_TYPE)
		);
		for (const type of QUESTION_TYPES) expect(isQuestionType(type.id)).toBe(true);
		for (const invalid of ["", "exam", null, undefined, 1, {}]) {
			expect(isQuestionType(invalid)).toBe(false);
		}
	});
});

describe("cue-generation: legacy Question type migration", () => {
	it.each([
		[{}, "conceptual"],
		[{ cuePreset: "conceptual", cueDensity: 2, questionStyle: "recall" }, "conceptual"],
		[{ cueDensity: 3 }, "conceptual"],
		[{ cuePreset: "exam-prep" }, "exam-practice"],
		[{ questionStyle: "exam" }, "exam-practice"],
		[{ cuePreset: "exam-prep", questionStyle: "exam" }, "exam-practice"],
		[{ cuePreset: "vocabulary" }, "vocabulary-check"],
		[{ cuePreset: "minimal" }, "direct-recall"],
		[{ cueDensity: 1 }, "direct-recall"],
		[{ cuePreset: "minimal", cueDensity: 1 }, "direct-recall"],
		[{ questionStyle: "socratic" }, "socratic-reasoning"],
	] as const)("maps compatible legacy settings %#", (legacy, expected) => {
		expect(resolveLegacyQuestionType(legacy)).toBe(expected);
	});

	it.each([
		{ cuePreset: "vocabulary", questionStyle: "exam" },
		{ cuePreset: "minimal", questionStyle: "socratic" },
		{ cuePreset: "unknown" },
		{ cueDensity: "1" },
		{ questionStyle: "quiz" },
		{ cuePreset: "exam-prep", cueDensity: 0 },
	] as const)("falls back for conflicting or invalid settings %#", (legacy) => {
		expect(resolveLegacyQuestionType(legacy)).toBe("conceptual");
	});
});
