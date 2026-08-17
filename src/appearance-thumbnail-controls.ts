import {
	CUE_FONT_SIZES,
	type CueFontSize,
} from "./cornell-layout";
import {
	EDITOR_CUE_DISPLAY_OPTIONS,
	type EditorCueDisplay,
} from "./editor-cue-display";

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

export function cueFontSizeThumbnailOptions(): AppearanceThumbnailOption<
	CueFontSize
>[] {
	return CUE_FONT_SIZES.map((option) => ({
		id: option.id,
		label: option.label,
		description: option.description,
		renderPreview: (previewEl) => {
			renderCuePreview(previewEl, [
				"cuecraft-preview-font",
				`cuecraft-preview-font-${option.id}`,
				"cuecraft-preview-cue-only",
			]);
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

function renderCuePreview(
	previewEl: HTMLElement,
	classes: string[]
): void {
	const doc = previewEl.ownerDocument;
	const surface = doc.createElement("div");
	surface.className = ["cuecraft-preview-surface", ...classes].join(" ");
	const card = doc.createElement("div");
	card.className = "cuecraft-preview-card";
	surface.appendChild(card);

	const rail = doc.createElement("div");
	rail.className = "cuecraft-preview-rail";
	card.appendChild(rail);

	const content = doc.createElement("div");
	content.className = "cuecraft-preview-content";
	card.appendChild(content);

	const question = doc.createElement("div");
	question.className = "cuecraft-preview-question";
	question.textContent = SAMPLE_QUESTION;
	content.appendChild(question);

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
	surface.appendChild(editorCueCardScene(doc, display));
	previewEl.appendChild(surface);
}

function editorCueCardScene(
	doc: Document,
	display: "cornell" | "inline-cues"
): HTMLElement {
	const scene = editorScene(doc);
	scene.classList.add(`cuecraft-preview-editor-scene-${display}`);
	scene.appendChild(editorCueCard(doc, display));
	return scene;
}

function editorCueCard(
	doc: Document,
	display: "cornell" | "inline-cues"
): HTMLElement {
	const card = doc.createElement("div");
	card.className = [
		"cuecraft-preview-editor-cue-card",
		`cuecraft-preview-editor-cue-card-${display}`,
	].join(" ");

	if (display === "cornell") {
		const grip = doc.createElement("span");
		grip.className = "cuecraft-preview-editor-cue-grip";
		card.appendChild(grip);
	}

	card.append(
		editorCueSection(
			doc,
			"summary",
			"SUMMARY",
			"AI and expertise shape trusted products."
		),
		editorCueSection(doc, "question", "QUESTION", SAMPLE_QUESTION),
		editorCueSection(doc, "terms", "TERMS", null)
	);
	return card;
}

function editorCueSection(
	doc: Document,
	kind: "summary" | "question" | "terms",
	labelText: string,
	bodyText: string | null
): HTMLElement {
	const section = doc.createElement("div");
	section.className = "cuecraft-preview-editor-cue-section";

	const label = doc.createElement("span");
	label.className = "cuecraft-preview-editor-cue-section-label";
	const icon = doc.createElement("span");
	icon.className = "cuecraft-preview-editor-cue-icon";
	icon.dataset.section = kind;
	const text = doc.createElement("span");
	text.textContent = labelText;
	const chevron = doc.createElement("span");
	chevron.className = "cuecraft-preview-editor-cue-chevron";
	label.append(icon, text, chevron);
	section.appendChild(label);

	if (kind === "terms") {
		const terms = doc.createElement("span");
		terms.className = "cuecraft-preview-editor-cue-terms";
		for (const termText of ["frontier AI", "data"]) {
			const term = doc.createElement("span");
			term.className = "cuecraft-preview-editor-cue-term";
			term.textContent = termText;
			terms.appendChild(term);
		}
		section.appendChild(terms);
	} else if (bodyText) {
		const body = doc.createElement("span");
		body.className = [
			"cuecraft-preview-editor-cue-body",
			kind === "question" ? "cuecraft-preview-editor-cue-question" : "",
		]
			.filter(Boolean)
			.join(" ");
		body.textContent = bodyText;
		section.appendChild(body);
	}

	return section;
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
