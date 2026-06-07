import { describe, it, expect } from "vitest";
import {
	CORNELL_STYLES,
	DEFAULT_CORNELL_STYLE,
	cornellStyleClass,
	isCornellStyle,
} from "../src/cornell-style";

describe("cornell-style", () => {
	it("exposes the five V1.2 presets with unique ids and labels", () => {
		const ids = CORNELL_STYLES.map((s) => s.id);
		expect(ids).toEqual([
			"classic",
			"exam-prep",
			"legal-pad",
			"minimal",
			"handwritten",
		]);
		expect(new Set(ids).size).toBe(ids.length);
		for (const s of CORNELL_STYLES) {
			expect(s.label.length).toBeGreaterThan(0);
			expect(s.description.length).toBeGreaterThan(0);
		}
	});

	it("defaults to the classic preset", () => {
		expect(DEFAULT_CORNELL_STYLE).toBe("classic");
		expect(isCornellStyle(DEFAULT_CORNELL_STYLE)).toBe(true);
	});

	it("recognizes known styles and rejects everything else", () => {
		for (const s of CORNELL_STYLES) expect(isCornellStyle(s.id)).toBe(true);
		for (const bad of ["", "cornell", "Classic", null, undefined, 3, {}]) {
			expect(isCornellStyle(bad)).toBe(false);
		}
	});

	it("maps each known style to its scoped CSS class", () => {
		for (const s of CORNELL_STYLES) {
			expect(cornellStyleClass(s.id)).toBe(`cuecraft-style-${s.id}`);
		}
	});

	it("falls back to the default class for unknown/garbage values", () => {
		const fallback = `cuecraft-style-${DEFAULT_CORNELL_STYLE}`;
		for (const bad of ["nope", null, undefined, 42, {}]) {
			expect(cornellStyleClass(bad)).toBe(fallback);
		}
	});
});
