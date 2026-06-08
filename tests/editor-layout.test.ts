import { describe, it, expect } from "vitest";
import {
	EDITOR_CUE_PLACEMENTS,
	DEFAULT_EDITOR_CUE_PLACEMENT,
	editorCuePlacementClass,
	isEditorCuePlacement,
} from "../src/editor-layout";

describe("editor-layout: cue placement", () => {
	it("exposes under/rail with unique ids and non-empty copy", () => {
		const ids = EDITOR_CUE_PLACEMENTS.map((p) => p.id);
		expect(ids).toEqual(["under", "rail"]);
		expect(new Set(ids).size).toBe(ids.length);
		for (const p of EDITOR_CUE_PLACEMENTS) {
			expect(p.label.length).toBeGreaterThan(0);
			expect(p.description.length).toBeGreaterThan(0);
		}
	});

	it("defaults to under-heading", () => {
		expect(DEFAULT_EDITOR_CUE_PLACEMENT).toBe("under");
		expect(isEditorCuePlacement(DEFAULT_EDITOR_CUE_PLACEMENT)).toBe(true);
	});

	it("recognizes known placements and rejects everything else", () => {
		for (const p of EDITOR_CUE_PLACEMENTS) {
			expect(isEditorCuePlacement(p.id)).toBe(true);
		}
		for (const bad of ["", "Rail", "gutter", null, undefined, 0, {}]) {
			expect(isEditorCuePlacement(bad)).toBe(false);
		}
	});

	it("maps each known placement to its scoped CSS class", () => {
		for (const p of EDITOR_CUE_PLACEMENTS) {
			expect(editorCuePlacementClass(p.id)).toBe(
				`cuecraft-editorcue-${p.id}`
			);
		}
	});

	it("falls back to the default class for unknown/garbage values", () => {
		const fallback = `cuecraft-editorcue-${DEFAULT_EDITOR_CUE_PLACEMENT}`;
		for (const bad of ["nope", null, undefined, 42, {}]) {
			expect(editorCuePlacementClass(bad)).toBe(fallback);
		}
	});
});
