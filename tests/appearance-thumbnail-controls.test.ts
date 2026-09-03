import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { CUE_FONT_SIZES } from "../src/cornell-layout";
import { EDITOR_CUE_DISPLAY_OPTIONS } from "../src/editor-cue-display";
import {
	cueFontSizeThumbnailOptions,
	editorCueDisplayThumbnailOptions,
	renderAppearanceThumbnailGroup,
	type AppearanceThumbnailOption,
} from "../src/appearance-thumbnail-controls";

type PreviewId = "classic" | "handwritten" | "disabled";

function setupDom(): HTMLElement {
	const dom = new JSDOM("<div id=\"root\"></div>");
	return dom.window.document.getElementById("root") as HTMLElement;
}

function options(): AppearanceThumbnailOption<PreviewId>[] {
	return [
		{
			id: "classic",
			label: "Cornell Classic",
			description: "Theme-aware cue rail.",
			renderPreview: (previewEl) => {
				previewEl.append("classic-preview");
			},
		},
		{
			id: "handwritten",
			label: "Handwritten",
			description: "Casual handwriting.",
			renderPreview: (previewEl) => {
				previewEl.append("handwritten-preview");
			},
		},
		{
			id: "disabled",
			label: "Disabled",
			disabled: true,
		},
	];
}

describe("renderAppearanceThumbnailGroup", () => {
	it("marks exactly the current option as selected", () => {
		const root = setupDom();

		renderAppearanceThumbnailGroup({
			parentEl: root,
			options: options(),
			value: "classic",
			onSelect: vi.fn(),
			groupLabel: "Editor cue style",
		});

		const buttons = root.querySelectorAll<HTMLButtonElement>(
			".firstrecall-thumbnail-button"
		);
		expect(buttons).toHaveLength(options().length);
		expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
		expect(buttons[1].getAttribute("aria-pressed")).toBe("false");
		expect(
			root.querySelector(".firstrecall-thumbnail-group")?.getAttribute("aria-label")
		).toBe("Editor cue style");
	});

	it("selects a non-current option and invokes onSelect", () => {
		const root = setupDom();
		const onSelect = vi.fn();

		renderAppearanceThumbnailGroup({
			parentEl: root,
			options: options(),
			value: "classic",
			onSelect,
		});

		root
			.querySelector<HTMLButtonElement>("[data-option-id='handwritten']")
			?.click();

		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith("handwritten");
		expect(
			root
				.querySelector<HTMLButtonElement>("[data-option-id='handwritten']")
				?.classList.contains("is-selected")
		).toBe(true);
	});

	it("does not invoke onSelect for the current or disabled option", () => {
		const root = setupDom();
		const onSelect = vi.fn();

		renderAppearanceThumbnailGroup({
			parentEl: root,
			options: options(),
			value: "classic",
			onSelect,
		});

		root
			.querySelector<HTMLButtonElement>("[data-option-id='classic']")
			?.click();
		root
			.querySelector<HTMLButtonElement>("[data-option-id='disabled']")
			?.click();

		expect(onSelect).not.toHaveBeenCalled();
	});

	it("can update selected state after rendering", () => {
		const root = setupDom();
		const group = renderAppearanceThumbnailGroup({
			parentEl: root,
			options: options(),
			value: "classic",
			onSelect: vi.fn(),
		});

		group.setValue("handwritten");

		expect(
			root
				.querySelector<HTMLButtonElement>("[data-option-id='classic']")
				?.classList.contains("is-selected")
		).toBe(false);
		expect(
			root
				.querySelector<HTMLButtonElement>("[data-option-id='handwritten']")
				?.classList.contains("is-selected")
		).toBe(true);
	});
});

describe("Editing View thumbnail option recipes", () => {
	it("covers every currently offered Editing View option with a preview recipe", () => {
		expect(editorCueDisplayThumbnailOptions().map((option) => option.id)).toEqual(
			EDITOR_CUE_DISPLAY_OPTIONS.map((option) => option.id)
		);
	});

	it("covers every retained cue-font option with a preview recipe", () => {
		expect(cueFontSizeThumbnailOptions().map((option) => option.id)).toEqual(
			CUE_FONT_SIZES.map((option) => option.id)
		);
	});

	it("renders a distinct preview for every current editor layout", () => {
		const root = setupDom();
		renderAppearanceThumbnailGroup({
			parentEl: root,
			options: editorCueDisplayThumbnailOptions(),
			value: "inline-cues",
			onSelect: vi.fn(),
		});

		const previews = EDITOR_CUE_DISPLAY_OPTIONS.map((option) => {
			const button = root.querySelector<HTMLButtonElement>(
				`button[aria-label="${option.label}"]`
			)!;
			const preview = button.querySelector<HTMLElement>('[aria-hidden="true"]')!;
			expect(preview.childElementCount).toBeGreaterThan(0);
			return preview.innerHTML;
		});
		expect(new Set(previews).size).toBe(EDITOR_CUE_DISPLAY_OPTIONS.length);
	});
});
