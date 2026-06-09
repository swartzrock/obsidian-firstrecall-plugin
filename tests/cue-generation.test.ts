import { describe, it, expect } from "vitest";
import {
	CUE_DENSITIES,
	DEFAULT_CUE_DENSITY,
	DEFAULT_QUESTION_STYLE,
	QUESTION_STYLES,
	cueDensityLabel,
	isCueDensity,
	isQuestionStyle,
} from "../src/cue-generation";

describe("cue-generation: question style", () => {
	it("exposes recall/socratic/exam with unique ids and non-empty copy", () => {
		const ids = QUESTION_STYLES.map((q) => q.id);
		expect(ids).toEqual(["recall", "socratic", "exam"]);
		expect(new Set(ids).size).toBe(ids.length);
		for (const q of QUESTION_STYLES) {
			expect(q.label.length).toBeGreaterThan(0);
			expect(q.description.length).toBeGreaterThan(0);
		}
	});

	it("defaults to recall", () => {
		expect(DEFAULT_QUESTION_STYLE).toBe("recall");
		expect(isQuestionStyle(DEFAULT_QUESTION_STYLE)).toBe(true);
	});

	it("recognizes known styles and rejects everything else", () => {
		for (const q of QUESTION_STYLES) expect(isQuestionStyle(q.id)).toBe(true);
		for (const bad of ["", "Recall", "quiz", null, undefined, 1, {}]) {
			expect(isQuestionStyle(bad)).toBe(false);
		}
	});
});

describe("cue-generation: cue density", () => {
	it("exposes 1/2/3 with unique values and non-empty labels", () => {
		const values = CUE_DENSITIES.map((d) => d.value);
		expect(values).toEqual([1, 2, 3]);
		expect(new Set(values).size).toBe(values.length);
		for (const d of CUE_DENSITIES) {
			expect(d.label.length).toBeGreaterThan(0);
		}
	});

	it("defaults to 2 (Balanced)", () => {
		expect(DEFAULT_CUE_DENSITY).toBe(2);
		expect(isCueDensity(DEFAULT_CUE_DENSITY)).toBe(true);
		expect(cueDensityLabel(DEFAULT_CUE_DENSITY)).toBe("Balanced");
	});

	it("recognizes known densities and rejects everything else", () => {
		for (const d of CUE_DENSITIES) expect(isCueDensity(d.value)).toBe(true);
		for (const bad of [0, 4, "2", null, undefined, {}]) {
			expect(isCueDensity(bad)).toBe(false);
		}
	});

	it("maps each known density to its label and falls back for garbage", () => {
		expect(cueDensityLabel(1)).toBe("Minimal");
		expect(cueDensityLabel(3)).toBe("Thorough");
		for (const bad of [0, 9, "x", null, undefined, {}]) {
			expect(cueDensityLabel(bad)).toBe("Balanced");
		}
	});
});
