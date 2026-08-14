import { describe, expect, it } from "vitest";
import {
	DEFAULT_EDITOR_CUE_WIDTH_PRESET,
	EDITOR_CUE_WIDTH_MAX_PX,
	EDITOR_CUE_WIDTH_MIN_PX,
	editorCueWidthFromKeyboard,
	editorCueWidthFromLeftEdgeDrag,
	editorCueDynamicMaxWidthPx,
	normalizeEditorCueCustomWidthPx,
} from "../src/editor-cue-width";

describe("Editing View cue width preferences", () => {
	it("uses Medium as the fixed starting width before a custom drag", () => {
		expect(DEFAULT_EDITOR_CUE_WIDTH_PRESET).toBe("medium");
	});

	it("accepts only finite, whole custom pixel widths inside the stored bounds", () => {
		for (const valid of [96, 240, 512]) {
			expect(normalizeEditorCueCustomWidthPx(valid)).toBe(valid);
		}
		for (const invalid of [
			undefined,
			null,
			"240",
			Number.NaN,
			Number.POSITIVE_INFINITY,
			95,
			96.5,
			513,
		]) {
			expect(normalizeEditorCueCustomWidthPx(invalid)).toBeNull();
		}
	});

	it("applies left-edge drag direction and absolute or dynamic bounds", () => {
		expect(editorCueWidthFromLeftEdgeDrag(240, 400, 360, 300)).toBe(280);
		expect(editorCueWidthFromLeftEdgeDrag(240, 400, 440, 300)).toBe(200);
		expect(editorCueWidthFromLeftEdgeDrag(500, 400, 300, 480)).toBe(480);
		expect(editorCueWidthFromLeftEdgeDrag(100, 400, 500, 480)).toBe(
			EDITOR_CUE_WIDTH_MIN_PX
		);
		expect(editorCueWidthFromLeftEdgeDrag(500, 400, 300, 900)).toBe(
			EDITOR_CUE_WIDTH_MAX_PX
		);
	});

	it("derives the dynamic maximum from the fixed card edge and inset workspace boundary", () => {
		expect(editorCueDynamicMaxWidthPx(500, 100)).toBe(388);
		expect(editorCueDynamicMaxWidthPx(900, 100)).toBe(
			EDITOR_CUE_WIDTH_MAX_PX
		);
		expect(editorCueDynamicMaxWidthPx(180, 100)).toBe(
			EDITOR_CUE_WIDTH_MIN_PX
		);
	});

	it("maps separator keys to physical width changes and bounds", () => {
		expect(editorCueWidthFromKeyboard("ArrowLeft", 240, 300)).toBe(248);
		expect(editorCueWidthFromKeyboard("ArrowRight", 240, 300)).toBe(232);
		expect(editorCueWidthFromKeyboard("Home", 240, 300)).toBe(
			EDITOR_CUE_WIDTH_MIN_PX
		);
		expect(editorCueWidthFromKeyboard("End", 240, 300)).toBe(300);
		expect(editorCueWidthFromKeyboard("Enter", 240, 300)).toBeNull();
	});
});
