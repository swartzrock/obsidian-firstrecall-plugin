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

describe("Editing View thumbnail option recipes", () => {
	const displayedEditorCueDisplayOptions = EDITOR_CUE_DISPLAY_OPTIONS.filter(
		(option) =>
			!["collapsed-tabs", "active-section-composer", "hook-minimap"].includes(
				option.id
			)
	);

	it("covers every currently offered Editing View option with a preview recipe", () => {
		expect(editorCueDisplayThumbnailOptions().map((option) => option.id)).toEqual(
			displayedEditorCueDisplayOptions.map((option) => option.id)
		);
	});

	it("covers every retained cue-font option with a preview recipe", () => {
		expect(cueFontSizeThumbnailOptions().map((option) => option.id)).toEqual(
			CUE_FONT_SIZES.map((option) => option.id)
		);
	});

	it("renders the current Cornell rail and Inline cue card layouts", () => {
		const root = setupDom();
		renderAppearanceThumbnailGroup({
			parentEl: root,
			options: editorCueDisplayThumbnailOptions(),
			value: "inline-cues",
			onSelect: vi.fn(),
		});

		for (const option of displayedEditorCueDisplayOptions) {
			expect(
				root.querySelector(`.cuecraft-preview-editor-display-${option.id}`)
			).not.toBeNull();
		}
		for (const optionId of [
			"collapsed-tabs",
			"active-section-composer",
			"hook-minimap",
		]) {
			expect(
				root.querySelector(`.cuecraft-preview-editor-display-${optionId}`)
			).toBeNull();
		}
		expect(root.querySelectorAll(".cuecraft-preview-editor-scene")).toHaveLength(
			displayedEditorCueDisplayOptions.length
		);
		const cornell = root.querySelector<HTMLElement>(
			"[data-option-id='cornell']"
		);
		const inline = root.querySelector<HTMLElement>(
			"[data-option-id='inline-cues']"
		);
		expect(
			cornell?.querySelector(".cuecraft-preview-editor-cue-card-cornell")
		).not.toBeNull();
		expect(
			inline?.querySelector(".cuecraft-preview-editor-cue-card-inline-cues")
		).not.toBeNull();
		expect(
			cornell?.querySelector(".cuecraft-preview-editor-cue-grip")
		).not.toBeNull();
		expect(
			inline?.querySelector(".cuecraft-preview-editor-cue-grip")
		).toBeNull();
		expect(
			cornell?.querySelectorAll(".cuecraft-preview-editor-cue-section")
		).toHaveLength(3);
		expect(
			inline?.querySelectorAll(".cuecraft-preview-editor-cue-section")
		).toHaveLength(3);
		expect(cornell?.textContent).toContain("SUMMARY");
		expect(cornell?.textContent).toContain("QUESTION");
		expect(cornell?.textContent).toContain("TERMS");
		expect(inline?.textContent).toContain("SUMMARY");
		expect(inline?.textContent).toContain("QUESTION");
		expect(inline?.textContent).toContain("TERMS");
		expect(root.textContent).toContain("Cornell");
		expect(root.textContent).toContain("Inline cues");
		expect(root.textContent).not.toContain("Cornell Exam Prep");
		expect(root.textContent).not.toContain("Cornell Minimal");
		expect(root.textContent).not.toContain("Anchored card rail");
		expect(root.textContent).not.toContain("Threaded margin notes");
		expect(root.textContent).not.toContain("Collapsed color tabs");
		expect(root.textContent).not.toContain("Active-section composer");
		expect(root.textContent).not.toContain("Hook minimap");
	});

	it("uses polished question text in key editor-truth previews", () => {
		const root = setupDom();
		renderAppearanceThumbnailGroup({
			parentEl: root,
			options: editorCueDisplayThumbnailOptions(),
			value: "inline-cues",
			onSelect: vi.fn(),
		});

		const button = root.querySelector<HTMLElement>(
			"[data-option-id='inline-cues']"
		);
		expect(
			button?.querySelector(".cuecraft-preview-editor-cue-question")
				?.textContent
		).toBe(
			"How does org-trained AI help upskill employees and improve agent reusability?"
		);
	});
});
