import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { CUE_ACCENTS } from "../src/cornell-accent";
import { CORNELL_DISPLAY_MODES } from "../src/cornell-display";
import { CUE_COLUMN_WIDTHS, CUE_FONT_SIZES } from "../src/cornell-layout";
import { CORNELL_STYLES } from "../src/cornell-style";
import { EDITOR_CUE_DISPLAY_OPTIONS } from "../src/editor-cue-display";
import { EDITOR_HOOK_CARD_STYLE_OPTIONS } from "../src/editor-hook-card-style";
import {
	cornellDisplayModeThumbnailOptions,
	cornellStyleThumbnailOptions,
	cueAccentThumbnailOptions,
	cueColumnWidthThumbnailOptions,
	cueFontSizeThumbnailOptions,
	editorCueDisplayThumbnailOptions,
	editorHookCardStyleThumbnailOptions,
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
			groupLabel: "Cornell view style",
		});

		const buttons = root.querySelectorAll<HTMLButtonElement>(
			".cuecraft-thumbnail-button"
		);
		expect(buttons).toHaveLength(3);
		expect(buttons[0].classList.contains("is-selected")).toBe(true);
		expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
		expect(buttons[1].classList.contains("is-selected")).toBe(false);
		expect(buttons[1].getAttribute("aria-pressed")).toBe("false");
		expect(root.querySelector(".cuecraft-thumbnail-selected")).toBeNull();
		expect(
			root.querySelector(".cuecraft-thumbnail-group")?.getAttribute("aria-label")
		).toBe("Cornell view style");
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

	it("renders labels, descriptions, preview content, and stable option ids", () => {
		const root = setupDom();

		renderAppearanceThumbnailGroup({
			parentEl: root,
			options: options(),
			value: "classic",
			onSelect: vi.fn(),
		});

		expect(root.textContent).toContain("Cornell Classic");
		expect(root.textContent).toContain("Handwritten");
		expect(root.textContent).toContain("Theme-aware cue rail.");
		expect(root.textContent).toContain("classic-preview");
		expect(
			root.querySelector("[data-option-id='handwritten']")?.tagName
		).toBe("BUTTON");
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

describe("Cornell View thumbnail option recipes", () => {
	it("covers every existing Cornell View option with a preview recipe", () => {
		expect(cornellDisplayModeThumbnailOptions().map((option) => option.id)).toEqual(
			CORNELL_DISPLAY_MODES.map((option) => option.id)
		);
		expect(cornellStyleThumbnailOptions().map((option) => option.id)).toEqual(
			CORNELL_STYLES.map((option) => option.id)
		);
		expect(cueColumnWidthThumbnailOptions().map((option) => option.id)).toEqual(
			CUE_COLUMN_WIDTHS.map((option) => option.id)
		);
		expect(cueFontSizeThumbnailOptions().map((option) => option.id)).toEqual(
			CUE_FONT_SIZES.map((option) => option.id)
		);
		expect(cueAccentThumbnailOptions().map((option) => option.id)).toEqual(
			CUE_ACCENTS.map((option) => option.id)
		);
	});

	it("renders Cornell and Hook rail display previews with concise cue text", () => {
		const root = setupDom();
		renderAppearanceThumbnailGroup({
			parentEl: root,
			options: cornellDisplayModeThumbnailOptions(),
			value: "classic",
			onSelect: vi.fn(),
		});

		expect(root.textContent).toContain("How do agents differ");
		expect(root.textContent).toContain("active recall");
		expect(root.textContent).not.toContain("organizational knowledge");
		expect(
			root.querySelector(".cuecraft-preview-display-classic")
		).not.toBeNull();
		expect(root.querySelector(".cuecraft-preview-display-hook")).not.toBeNull();
	});

	it("renders Handwritten as a first-class distinct style preview", () => {
		const root = setupDom();
		renderAppearanceThumbnailGroup({
			parentEl: root,
			options: cornellStyleThumbnailOptions(),
			value: "classic",
			onSelect: vi.fn(),
		});

		const handwrittenButton = root.querySelector<HTMLElement>(
			"[data-option-id='handwritten']"
		);
		expect(handwrittenButton?.textContent).toContain("Handwritten");
		expect(
			handwrittenButton?.querySelector(".cuecraft-preview-style-handwritten")
		).not.toBeNull();
		expect(root.textContent).toContain("How does org-trained AI");
		expect(root.querySelector(".cuecraft-preview-style .cuecraft-preview-support"))
			.toBeNull();
	});

	it("renders distinct width and font-size preview classes", () => {
		const root = setupDom();
		renderAppearanceThumbnailGroup({
			parentEl: root,
			options: cueColumnWidthThumbnailOptions(),
			value: "medium",
			onSelect: vi.fn(),
		});
		renderAppearanceThumbnailGroup({
			parentEl: root,
			options: cueFontSizeThumbnailOptions(),
			value: "medium",
			onSelect: vi.fn(),
		});

		expect(root.querySelector(".cuecraft-preview-width-narrow")).not.toBeNull();
		expect(root.querySelector(".cuecraft-preview-width-medium")).not.toBeNull();
		expect(root.querySelector(".cuecraft-preview-width-wide")).not.toBeNull();
		expect(root.querySelector(".cuecraft-preview-font-small")).not.toBeNull();
		expect(root.querySelector(".cuecraft-preview-font-medium")).not.toBeNull();
		expect(root.querySelector(".cuecraft-preview-font-large")).not.toBeNull();
		expect(root.textContent).toContain("How does org-trained AI");
		expect(root.querySelector(".cuecraft-preview-support")).toBeNull();
		expect(root.textContent).not.toContain("organizational knowledge");
		expect(root.textContent).not.toContain("standards/workflows");
	});

	it("renders accent previews that tint the rail and support text", () => {
		const root = setupDom();
		renderAppearanceThumbnailGroup({
			parentEl: root,
			options: cueAccentThumbnailOptions(),
			value: "violet",
			onSelect: vi.fn(),
		});

		for (const accent of CUE_ACCENTS) {
			const button = root.querySelector<HTMLElement>(
				`[data-option-id='${accent.id}']`
			);
			expect(
				button?.querySelector(`.cuecraft-preview-accent-${accent.id}`)
			).not.toBeNull();
			expect(button?.querySelector(".cuecraft-preview-question")).toBeNull();
			expect(button?.querySelector(".cuecraft-preview-rail")).not.toBeNull();
			expect(button?.querySelector(".cuecraft-preview-support")).not.toBeNull();
			expect(button?.textContent).toContain("organizations");
			expect(button?.textContent).toContain("workflows");
		}
	});
});

describe("Editing View thumbnail option recipes", () => {
	it("covers every existing Editing View option with a preview recipe", () => {
		expect(editorCueDisplayThumbnailOptions().map((option) => option.id)).toEqual(
			EDITOR_CUE_DISPLAY_OPTIONS.map((option) => option.id)
		);
		expect(
			editorHookCardStyleThumbnailOptions().map((option) => option.id)
		).toEqual(EDITOR_HOOK_CARD_STYLE_OPTIONS.map((option) => option.id));
	});

	it("renders editor-truth display previews with stable placement classes", () => {
		const root = setupDom();
		renderAppearanceThumbnailGroup({
			parentEl: root,
			options: editorCueDisplayThumbnailOptions(),
			value: "inline-cues",
			onSelect: vi.fn(),
		});

		for (const option of EDITOR_CUE_DISPLAY_OPTIONS) {
			expect(
				root.querySelector(`.cuecraft-preview-editor-display-${option.id}`)
			).not.toBeNull();
		}
		expect(root.querySelectorAll(".cuecraft-preview-editor-scene")).toHaveLength(
			EDITOR_CUE_DISPLAY_OPTIONS.length
		);
		expect(root.querySelector(".cuecraft-preview-display-classic")).toBeNull();
		expect(root.textContent).toContain("Inline cues");
		expect(root.textContent).toContain("Hook minimap");
	});

	it("renders rail card background previews without changing display placement", () => {
		const root = setupDom();
		renderAppearanceThumbnailGroup({
			parentEl: root,
			options: editorHookCardStyleThumbnailOptions(),
			value: "classic",
			onSelect: vi.fn(),
		});

		for (const option of EDITOR_HOOK_CARD_STYLE_OPTIONS) {
			expect(
				root.querySelector(`.cuecraft-preview-editor-card-style-${option.id}`)
			).not.toBeNull();
		}
		expect(
			root.querySelectorAll(".cuecraft-preview-editor-card-style")
		).toHaveLength(EDITOR_HOOK_CARD_STYLE_OPTIONS.length);
		expect(root.textContent).toContain("Classic warm/cool");
		expect(root.textContent).toContain("Soft gradients");
	});
});
