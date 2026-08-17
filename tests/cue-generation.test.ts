import { describe, expect, it } from "vitest";
import {
	DEFAULT_QUESTION_TYPE,
	QUESTION_TYPES,
	isQuestionType,
	questionTypeInfo,
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

	it("defaults invalid values to Exam practice", () => {
		expect(DEFAULT_QUESTION_TYPE).toBe("exam-practice");
		expect(questionTypeInfo("not-a-type")).toBe(
			questionTypeInfo(DEFAULT_QUESTION_TYPE)
		);
		for (const type of QUESTION_TYPES) expect(isQuestionType(type.id)).toBe(true);
		for (const invalid of ["", "exam", null, undefined, 1, {}]) {
			expect(isQuestionType(invalid)).toBe(false);
		}
	});
});
