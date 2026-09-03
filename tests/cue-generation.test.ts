import { describe, expect, it } from "vitest";
import {
	DEFAULT_QUESTION_TYPE,
	QUESTION_TYPES,
	isQuestionType,
	questionTypeInfo,
} from "../src/cue-generation";

describe("cue-generation: Question type", () => {
	it("defines stable persisted Question type IDs with generation guidance", () => {
		expect(QUESTION_TYPES.map(({ id }) => id)).toEqual([
			"conceptual",
			"direct-recall",
			"exam-practice",
			"vocabulary-check",
			"socratic-reasoning",
		]);
		for (const type of QUESTION_TYPES) {
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
