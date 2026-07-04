import { CUE_ACCENTS, type CueAccent } from "./cornell-accent";
import {
	CORNELL_DISPLAY_MODES,
	type CornellDisplayMode,
} from "./cornell-display";
import {
	CORNELL_STYLES,
	type CornellStyle,
} from "./cornell-style";
import {
	CUE_COLUMN_WIDTHS,
	CUE_FONT_SIZES,
	type CueColumnWidth,
	type CueFontSize,
} from "./cornell-layout";
import {
	EDITOR_CUE_DISPLAY_OPTIONS,
	type EditorCueDisplay,
} from "./editor-cue-display";
import {
	EDITOR_HOOK_CARD_STYLE_OPTIONS,
	type EditorHookCardStyle,
} from "./editor-hook-card-style";

export interface AppearanceThumbnailOption<T extends string> {
	id: T;
	label: string;
	description?: string;
	disabled?: boolean;
	renderPreview?: (
		previewEl: HTMLElement,
		option: AppearanceThumbnailOption<T>
	) => void;
}

export interface AppearanceThumbnailGroupOptions<T extends string> {
	parentEl: HTMLElement;
	options: readonly AppearanceThumbnailOption<T>[];
	value: T;
	onSelect: (value: T) => void | Promise<void>;
	groupLabel?: string;
	className?: string;
}

export interface AppearanceThumbnailGroup<T extends string> {
	rootEl: HTMLElement;
	setValue: (value: T) => void;
}

export function renderAppearanceThumbnailGroup<T extends string>(
	config: AppearanceThumbnailGroupOptions<T>
): AppearanceThumbnailGroup<T> {
	const doc = config.parentEl.ownerDocument;
	const root = doc.createElement("div");
	root.className = [
		"cuecraft-thumbnail-group",
		config.className ?? "",
	]
		.filter(Boolean)
		.join(" ");
	if (config.groupLabel) {
		root.setAttribute("aria-label", config.groupLabel);
	}

	const buttons = new Map<T, HTMLButtonElement>();
	let currentValue = config.value;

	for (const option of config.options) {
		const button = doc.createElement("button");
		button.type = "button";
		button.className = "cuecraft-thumbnail-button";
		button.dataset.optionId = option.id;
		button.disabled = Boolean(option.disabled);
		button.setAttribute("aria-label", option.label);

		const preview = doc.createElement("div");
		preview.className = "cuecraft-thumbnail-preview";
		preview.setAttribute("aria-hidden", "true");
		option.renderPreview?.(preview, option);
		button.appendChild(preview);

		const label = doc.createElement("span");
		label.className = "cuecraft-thumbnail-label";
		label.textContent = option.label;
		button.appendChild(label);

		if (option.description) {
			const description = doc.createElement("span");
			description.className = "cuecraft-thumbnail-description";
			description.textContent = option.description;
			button.appendChild(description);
		}

		button.addEventListener("click", () => {
			if (button.disabled || option.id === currentValue) return;
			updateSelected(option.id);
			void config.onSelect(option.id);
		});

		root.appendChild(button);
		buttons.set(option.id, button);
	}

	function updateSelected(value: T): void {
		currentValue = value;
		for (const [id, button] of buttons) {
			const selected = id === value;
			button.classList.toggle("is-selected", selected);
			button.setAttribute("aria-pressed", String(selected));
		}
	}

	config.parentEl.appendChild(root);
	updateSelected(config.value);

	return {
		rootEl: root,
		setValue: updateSelected,
	};
}

const SAMPLE_QUESTION =
	"How does org-trained AI help upskill employees and improve agent reusability?";

const SAMPLE_SUPPORTS = ["organizations", "workflows"];

const DISPLAY_SAMPLE_QUESTION = "How do agents differ from chatbots?";
const DISPLAY_SAMPLE_SUPPORTS = ["active recall", "MCP"];

interface CuePreviewContent {
	question?: string | null;
	supports?: readonly string[] | null;
}

export function cornellDisplayModeThumbnailOptions(): AppearanceThumbnailOption<
	CornellDisplayMode
>[] {
	return CORNELL_DISPLAY_MODES.map((option) => ({
		id: option.id,
		label: option.label,
		description:
			option.id === "classic" ? "Cue column beside note." : "Compact hook cards.",
		renderPreview: (previewEl) => {
			renderCuePreview(
				previewEl,
				[
					"cuecraft-preview-display",
					`cuecraft-preview-display-${option.id}`,
				],
				{
					question: DISPLAY_SAMPLE_QUESTION,
					supports: DISPLAY_SAMPLE_SUPPORTS,
				}
			);
		},
	}));
}

export function cornellStyleThumbnailOptions(): AppearanceThumbnailOption<
	CornellStyle
>[] {
	return CORNELL_STYLES.map((option) => ({
		id: option.id,
		label: option.label,
		description: option.description,
		renderPreview: (previewEl) => {
			renderCuePreview(
				previewEl,
				[
					"cuecraft-preview-style",
					`cuecraft-preview-style-${option.id}`,
					"cuecraft-preview-cue-only",
				],
				{ supports: null }
			);
		},
	}));
}

export function cueColumnWidthThumbnailOptions(): AppearanceThumbnailOption<
	CueColumnWidth
>[] {
	return CUE_COLUMN_WIDTHS.map((option) => ({
		id: option.id,
		label: option.label,
		description: option.description,
		renderPreview: (previewEl) => {
			renderCuePreview(
				previewEl,
				[
					"cuecraft-preview-width",
					`cuecraft-preview-width-${option.id}`,
					"cuecraft-preview-cue-only",
				],
				{ supports: null }
			);
		},
	}));
}

export function cueFontSizeThumbnailOptions(): AppearanceThumbnailOption<
	CueFontSize
>[] {
	return CUE_FONT_SIZES.map((option) => ({
		id: option.id,
		label: option.label,
		description: option.description,
		renderPreview: (previewEl) => {
			renderCuePreview(
				previewEl,
				[
					"cuecraft-preview-font",
					`cuecraft-preview-font-${option.id}`,
					"cuecraft-preview-cue-only",
				],
				{ supports: null }
			);
		},
	}));
}

export function cueAccentThumbnailOptions(): AppearanceThumbnailOption<CueAccent>[] {
	return CUE_ACCENTS.map((option) => ({
		id: option.id,
		label: option.label,
		renderPreview: (previewEl) => {
			renderCuePreview(
				previewEl,
				[
					"cuecraft-preview-accent",
					`cuecraft-preview-accent-${option.id}`,
					"cuecraft-preview-terms-only",
				],
				{ question: null }
			);
		},
	}));
}

export function editorCueDisplayThumbnailOptions(): AppearanceThumbnailOption<
	EditorCueDisplay
>[] {
	return EDITOR_CUE_DISPLAY_OPTIONS.map((option) => ({
		id: option.id,
		label: option.label,
		description: option.description,
		renderPreview: (previewEl) => {
			renderEditorCueDisplayPreview(previewEl, option.id);
		},
	}));
}

export function editorHookCardStyleThumbnailOptions(): AppearanceThumbnailOption<
	EditorHookCardStyle
>[] {
	return EDITOR_HOOK_CARD_STYLE_OPTIONS.map((option) => ({
		id: option.id,
		label: option.label,
		description: option.description,
		renderPreview: (previewEl) => {
			renderEditorCardStylePreview(previewEl, option.id);
		},
	}));
}

function renderCuePreview(
	previewEl: HTMLElement,
	classes: string[],
	previewContent: CuePreviewContent = {}
): void {
	const doc = previewEl.ownerDocument;
	const surface = doc.createElement("div");
	surface.className = ["cuecraft-preview-surface", ...classes].join(" ");
	const questionText =
		previewContent.question === undefined
			? SAMPLE_QUESTION
			: previewContent.question;
	const supportTerms =
		previewContent.supports === undefined
			? SAMPLE_SUPPORTS
			: previewContent.supports;

	const card = doc.createElement("div");
	card.className = "cuecraft-preview-card";
	surface.appendChild(card);

	const rail = doc.createElement("div");
	rail.className = "cuecraft-preview-rail";
	card.appendChild(rail);

	const content = doc.createElement("div");
	content.className = "cuecraft-preview-content";
	card.appendChild(content);

	if (questionText) {
		const question = doc.createElement("div");
		question.className = "cuecraft-preview-question";
		question.textContent = questionText;
		content.appendChild(question);
	}

	if (supportTerms?.length) {
		const support = doc.createElement("div");
		support.className = "cuecraft-preview-support";
		for (const [index, term] of supportTerms.entries()) {
			const item = doc.createElement("span");
			item.className = "cuecraft-preview-support-term";
			item.textContent = term;
			support.appendChild(item);
			if (index < supportTerms.length - 1) {
				const separator = doc.createElement("span");
				separator.className = "cuecraft-preview-support-separator";
				separator.textContent = "\u00b7";
				support.appendChild(separator);
			}
		}
		content.appendChild(support);
	}

	previewEl.appendChild(surface);
}

function renderEditorCueDisplayPreview(
	previewEl: HTMLElement,
	display: EditorCueDisplay
): void {
	const doc = previewEl.ownerDocument;
	const surface = editorPreviewSurface(doc, [
		"cuecraft-preview-editor-display",
		`cuecraft-preview-editor-display-${display}`,
	]);
	const scene = editorScene(doc);
	surface.appendChild(scene);

	switch (display) {
		case "inline-cues":
			scene.appendChild(editorInlineCue(doc));
			break;
		case "anchored-card-rail":
			scene.appendChild(editorHookCard(doc, "warm", "first"));
			scene.appendChild(editorHookCard(doc, "cool", "second"));
			break;
		case "collapsed-tabs":
			scene.appendChild(editorTab(doc, "warm", "first"));
			scene.appendChild(editorTab(doc, "cool", "second"));
			scene.appendChild(editorPeek(doc));
			break;
		case "threaded-margin-notes":
			scene.appendChild(editorThread(doc));
			scene.appendChild(editorThreadDot(doc, "cool", "first"));
			scene.appendChild(editorThreadDot(doc, "warm", "second"));
			break;
		case "active-section-composer":
			scene.appendChild(editorComposerCard(doc));
			break;
		case "hook-minimap":
			scene.appendChild(editorMinimap(doc));
			scene.appendChild(editorMinimapPopout(doc));
			break;
		default:
			assertNever(display);
	}

	previewEl.appendChild(surface);
}

function renderEditorCardStylePreview(
	previewEl: HTMLElement,
	style: EditorHookCardStyle
): void {
	const doc = previewEl.ownerDocument;
	const surface = editorPreviewSurface(doc, [
		"cuecraft-preview-editor-card-style",
		`cuecraft-preview-editor-card-style-${style}`,
	]);
	const scene = editorScene(doc);
	switch (style) {
		case "classic":
			scene.appendChild(editorHookCard(doc, "warm", "first"));
			scene.appendChild(editorHookCard(doc, "cool", "second"));
			break;
		case "gradient":
			scene.appendChild(editorHookCard(doc, "gradient", "first"));
			scene.appendChild(editorHookCard(doc, "gradient-alt", "second"));
			break;
		default:
			assertNever(style);
	}
	surface.appendChild(scene);
	previewEl.appendChild(surface);
}

function editorPreviewSurface(doc: Document, classes: string[]): HTMLElement {
	const surface = doc.createElement("div");
	surface.className = ["cuecraft-preview-editor-surface", ...classes].join(" ");
	return surface;
}

function editorScene(doc: Document): HTMLElement {
	const scene = doc.createElement("div");
	scene.className = "cuecraft-preview-editor-scene";
	for (const variant of ["short", "long", "medium"] as const) {
		const line = doc.createElement("span");
		line.className = `cuecraft-preview-editor-line cuecraft-preview-editor-line-${variant}`;
		scene.appendChild(line);
	}
	return scene;
}

function editorInlineCue(doc: Document): HTMLElement {
	const cue = doc.createElement("span");
	cue.className = "cuecraft-preview-editor-inline-cue";
	return cue;
}

function editorHookCard(
	doc: Document,
	tone: "warm" | "cool" | "gradient" | "gradient-alt",
	slot: "first" | "second"
): HTMLElement {
	const card = doc.createElement("span");
	card.className = [
		"cuecraft-preview-editor-hook-card",
		`cuecraft-preview-editor-hook-card-${tone}`,
		`cuecraft-preview-editor-hook-card-${slot}`,
	].join(" ");
	return card;
}

function editorTab(
	doc: Document,
	tone: "warm" | "cool",
	slot: "first" | "second"
): HTMLElement {
	const tab = doc.createElement("span");
	tab.className = [
		"cuecraft-preview-editor-tab",
		`cuecraft-preview-editor-tab-${tone}`,
		`cuecraft-preview-editor-tab-${slot}`,
	].join(" ");
	return tab;
}

function editorPeek(doc: Document): HTMLElement {
	const peek = doc.createElement("span");
	peek.className = "cuecraft-preview-editor-peek";
	return peek;
}

function editorThread(doc: Document): HTMLElement {
	const thread = doc.createElement("span");
	thread.className = "cuecraft-preview-editor-thread";
	return thread;
}

function editorThreadDot(
	doc: Document,
	tone: "warm" | "cool",
	slot: "first" | "second"
): HTMLElement {
	const dot = doc.createElement("span");
	dot.className = [
		"cuecraft-preview-editor-thread-dot",
		`cuecraft-preview-editor-thread-dot-${tone}`,
		`cuecraft-preview-editor-thread-dot-${slot}`,
	].join(" ");
	return dot;
}

function editorComposerCard(doc: Document): HTMLElement {
	const card = doc.createElement("span");
	card.className = "cuecraft-preview-editor-composer-card";
	return card;
}

function editorMinimap(doc: Document): HTMLElement {
	const minimap = doc.createElement("span");
	minimap.className = "cuecraft-preview-editor-minimap";
	return minimap;
}

function editorMinimapPopout(doc: Document): HTMLElement {
	const popout = doc.createElement("span");
	popout.className = "cuecraft-preview-editor-minimap-popout";
	return popout;
}

function assertNever(_value: never): never {
	throw new Error("Unhandled editor thumbnail variant");
}
