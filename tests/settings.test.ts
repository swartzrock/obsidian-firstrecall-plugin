import { describe, it, expect } from "vitest";
import {
	AUTO_GENERATION_SETTLE_DELAY_SECONDS_OPTIONS,
	DEFAULT_AUTO_GENERATION_SETTLE_DELAY_SECONDS,
	formatAutoGenerationSettleDelayLabel,
	normalizeAutoGenerationSettleDelaySeconds,
} from "../src/auto-generation-delay";
import {
	DEFAULT_CORNELL_DISPLAY_MODE,
	cornellDisplayModeOption,
	isCornellDisplayMode,
} from "../src/cornell-display";
import { DEFAULT_READING_MODE_DISPLAY } from "../src/reading-cues";
import {
	DEFAULT_EDITOR_CUE_DISPLAY,
	EDITOR_CUE_DISPLAY_OPTIONS,
	editorCueDisplayOption,
	isEditorCueDisplay,
} from "../src/editor-cue-display";
import {
	DEFAULT_EDITOR_HOOK_CARD_STYLE,
	EDITOR_HOOK_CARD_STYLE_OPTIONS,
	editorHookCardStyleOption,
	isEditorHookCardStyle,
} from "../src/editor-hook-card-style";
import {
	DEFAULT_SHOW_NOTE_BRIEF,
	DEFAULT_SHOW_SECTION_LENS,
} from "../src/review-surfaces";

describe("settings defaults", () => {
	it("defaults auto-generation settle delay to 10 seconds", () => {
		expect(DEFAULT_AUTO_GENERATION_SETTLE_DELAY_SECONDS).toBe(10);
	});

	it("offers supported auto-generation settle delay presets", () => {
		expect(AUTO_GENERATION_SETTLE_DELAY_SECONDS_OPTIONS).toEqual([
			1,
			5,
			10,
			25,
			60,
		]);
	});

	it("normalizes persisted auto-generation settle delay values", () => {
		expect(normalizeAutoGenerationSettleDelaySeconds(1)).toBe(1);
		expect(normalizeAutoGenerationSettleDelaySeconds(60)).toBe(60);
		for (const bad of [0, 2, 100, "", "10", null, undefined, {}, []]) {
			expect(normalizeAutoGenerationSettleDelaySeconds(bad)).toBe(10);
		}
	});

	it("formats auto-generation settle delay preset labels", () => {
		expect(
			AUTO_GENERATION_SETTLE_DELAY_SECONDS_OPTIONS.map((seconds) =>
				formatAutoGenerationSettleDelayLabel(seconds)
			)
		).toEqual([
			"1 second",
			"5 seconds",
			"10 seconds",
			"25 seconds",
			"60 seconds",
		]);
	});

	it("defaults Reading mode to the compact review button", () => {
		expect(DEFAULT_READING_MODE_DISPLAY).toBe("review-button");
	});

	it("defaults Cornell display mode to the classic Cornell view", () => {
		expect(DEFAULT_CORNELL_DISPLAY_MODE).toBe("classic");
		expect(cornellDisplayModeOption(DEFAULT_CORNELL_DISPLAY_MODE).label).toBe(
			"Cornell"
		);
	});

	it("defaults editor cue display to inline cues", () => {
		expect(DEFAULT_EDITOR_CUE_DISPLAY).toBe("inline-cues");
		expect(editorCueDisplayOption(DEFAULT_EDITOR_CUE_DISPLAY).label).toBe(
			"Inline cues"
		);
	});

	it("defaults generated review surfaces to visible", () => {
		expect(DEFAULT_SHOW_SECTION_LENS).toBe(true);
		expect(DEFAULT_SHOW_NOTE_BRIEF).toBe(true);
	});

	it("defaults rail cards to the classic style", () => {
		expect(DEFAULT_EDITOR_HOOK_CARD_STYLE).toBe("classic");
		expect(editorHookCardStyleOption(DEFAULT_EDITOR_HOOK_CARD_STYLE).label).toBe(
			"Classic warm/cool"
		);
	});

	it("validates persisted Cornell display mode values", () => {
		expect(isCornellDisplayMode("classic")).toBe(true);
		expect(isCornellDisplayMode("hook")).toBe(true);
		for (const bad of ["", "hooks", "study", null, undefined, 1, {}]) {
			expect(isCornellDisplayMode(bad)).toBe(false);
		}
	});

	it("validates persisted editor cue display values", () => {
		expect(EDITOR_CUE_DISPLAY_OPTIONS.map((option) => option.id)).toEqual([
			"inline-cues",
			"anchored-card-rail",
			"collapsed-tabs",
			"threaded-margin-notes",
			"active-section-composer",
			"hook-minimap",
		]);
		expect(isEditorCueDisplay("inline-cues")).toBe(true);
		expect(isEditorCueDisplay("anchored-card-rail")).toBe(true);
		expect(isEditorCueDisplay("collapsed-tabs")).toBe(true);
		expect(isEditorCueDisplay("threaded-margin-notes")).toBe(true);
		expect(isEditorCueDisplay("active-section-composer")).toBe(true);
		expect(isEditorCueDisplay("hook-minimap")).toBe(true);
		for (const bad of ["", "hook", "cornell", null, undefined, 1, {}]) {
			expect(isEditorCueDisplay(bad)).toBe(false);
		}
	});
	it("validates persisted editor hook card style values", () => {
		expect(EDITOR_HOOK_CARD_STYLE_OPTIONS.map((option) => option.id)).toEqual([
			"classic",
			"gradient",
		]);
		expect(isEditorHookCardStyle("classic")).toBe(true);
		expect(isEditorHookCardStyle("gradient")).toBe(true);
		for (const bad of ["", "orange", "soft", null, undefined, 1, {}]) {
			expect(isEditorHookCardStyle(bad)).toBe(false);
		}
	});
});
