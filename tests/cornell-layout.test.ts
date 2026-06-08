import { describe, it, expect } from "vitest";
import {
	CUE_COLUMN_WIDTHS,
	CUE_FONT_SIZES,
	DEFAULT_CUE_COLUMN_WIDTH,
	DEFAULT_CUE_FONT_SIZE,
	cueColumnWidthClass,
	cueFontSizeClass,
	isCueColumnWidth,
	isCueFontSize,
} from "../src/cornell-layout";

describe("cornell-layout: cue column width", () => {
	it("exposes narrow/medium/wide with unique ids and non-empty copy", () => {
		const ids = CUE_COLUMN_WIDTHS.map((w) => w.id);
		expect(ids).toEqual(["narrow", "medium", "wide"]);
		expect(new Set(ids).size).toBe(ids.length);
		for (const w of CUE_COLUMN_WIDTHS) {
			expect(w.label.length).toBeGreaterThan(0);
			expect(w.description.length).toBeGreaterThan(0);
		}
	});

	it("defaults to medium", () => {
		expect(DEFAULT_CUE_COLUMN_WIDTH).toBe("medium");
		expect(isCueColumnWidth(DEFAULT_CUE_COLUMN_WIDTH)).toBe(true);
	});

	it("recognizes known widths and rejects everything else", () => {
		for (const w of CUE_COLUMN_WIDTHS) expect(isCueColumnWidth(w.id)).toBe(true);
		for (const bad of ["", "Wide", "huge", null, undefined, 2, {}]) {
			expect(isCueColumnWidth(bad)).toBe(false);
		}
	});

	it("maps each known width to its scoped CSS class", () => {
		for (const w of CUE_COLUMN_WIDTHS) {
			expect(cueColumnWidthClass(w.id)).toBe(`cuecraft-cuewidth-${w.id}`);
		}
	});

	it("falls back to the default class for unknown/garbage values", () => {
		const fallback = `cuecraft-cuewidth-${DEFAULT_CUE_COLUMN_WIDTH}`;
		for (const bad of ["nope", null, undefined, 42, {}]) {
			expect(cueColumnWidthClass(bad)).toBe(fallback);
		}
	});
});

describe("cornell-layout: cue font size", () => {
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
			expect(cueFontSizeClass(f.id)).toBe(`cuecraft-cuefont-${f.id}`);
		}
	});

	it("falls back to the default class for unknown/garbage values", () => {
		const fallback = `cuecraft-cuefont-${DEFAULT_CUE_FONT_SIZE}`;
		for (const bad of ["nope", null, undefined, 42, {}]) {
			expect(cueFontSizeClass(bad)).toBe(fallback);
		}
	});
});
