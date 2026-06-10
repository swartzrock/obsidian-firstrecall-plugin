import { describe, it, expect } from "vitest";
import {
	CUE_ACCENTS,
	DEFAULT_CUE_ACCENT,
	cueAccentClass,
	isCueAccent,
} from "../src/cornell-accent";

describe("cornell-accent", () => {
	it("exposes violet/teal/amber/rose with unique ids and non-empty labels", () => {
		const ids = CUE_ACCENTS.map((a) => a.id);
		expect(ids).toEqual(["violet", "teal", "amber", "rose"]);
		expect(new Set(ids).size).toBe(ids.length);
		for (const a of CUE_ACCENTS) {
			expect(a.label.length).toBeGreaterThan(0);
		}
	});

	it("defaults to violet", () => {
		expect(DEFAULT_CUE_ACCENT).toBe("violet");
		expect(isCueAccent(DEFAULT_CUE_ACCENT)).toBe(true);
	});

	it("recognizes known accents and rejects everything else", () => {
		for (const a of CUE_ACCENTS) expect(isCueAccent(a.id)).toBe(true);
		for (const bad of ["", "Violet", "blue", null, undefined, 1, {}]) {
			expect(isCueAccent(bad)).toBe(false);
		}
	});

	it("maps each known accent to its scoped CSS class", () => {
		for (const a of CUE_ACCENTS) {
			expect(cueAccentClass(a.id)).toBe(`cuecraft-accent-${a.id}`);
		}
	});

	it("falls back to the default class for unknown/garbage values", () => {
		const fallback = `cuecraft-accent-${DEFAULT_CUE_ACCENT}`;
		for (const bad of ["nope", null, undefined, 42, {}]) {
			expect(cueAccentClass(bad)).toBe(fallback);
		}
	});
});
