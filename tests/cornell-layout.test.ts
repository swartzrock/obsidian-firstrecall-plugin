import { describe, it, expect } from "vitest";
import {
	CUE_FONT_SIZES,
	DEFAULT_CUE_FONT_SIZE,
	cueFontSizeClass,
	isCueFontSize,
} from "../src/cornell-layout";

describe("editor cue font size", () => {
	it("exposes small/medium/large with unique ids and non-empty copy", () => {
		const ids = CUE_FONT_SIZES.map((f) => f.id);
		expect(ids).toEqual(["small", "medium", "large"]);
		expect(new Set(ids).size).toBe(ids.length);
		for (const f of CUE_FONT_SIZES) {
			expect(f.label.length).toBeGreaterThan(0);
			expect(f.description.length).toBeGreaterThan(0);
		}
	});

	it("defaults to medium", () => {
		expect(DEFAULT_CUE_FONT_SIZE).toBe("medium");
		expect(isCueFontSize(DEFAULT_CUE_FONT_SIZE)).toBe(true);
	});

	it("recognizes known sizes and rejects everything else", () => {
		for (const f of CUE_FONT_SIZES) expect(isCueFontSize(f.id)).toBe(true);
		for (const bad of ["", "Large", "tiny", null, undefined, 1, {}]) {
			expect(isCueFontSize(bad)).toBe(false);
		}
	});

	it("maps each known size to its scoped CSS class", () => {
		for (const f of CUE_FONT_SIZES) {
			expect(cueFontSizeClass(f.id)).toBe(`firstrecall-cuefont-${f.id}`);
		}
	});

	it("falls back to the default class for unknown/garbage values", () => {
		const fallback = `firstrecall-cuefont-${DEFAULT_CUE_FONT_SIZE}`;
		for (const bad of ["nope", null, undefined, 42, {}]) {
			expect(cueFontSizeClass(bad)).toBe(fallback);
		}
	});
});
