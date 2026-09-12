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

let nextAppearanceThumbnailGroupLabelId = 0;

export function renderAppearanceThumbnailGroup<T extends string>(
	config: AppearanceThumbnailGroupOptions<T>
): AppearanceThumbnailGroup<T> {
	const doc = config.parentEl.ownerDocument;
	const root = doc.defaultView!.createDiv();
	root.className = [
		"firstrecall-thumbnail-group",
		config.className ?? "",
	]
		.filter(Boolean)
		.join(" ");
	if (config.groupLabel) {
		const label = doc.defaultView!.createSpan();
		label.id = `firstrecall-thumbnail-group-label-${nextAppearanceThumbnailGroupLabelId++}`;
		label.hidden = true;
		label.textContent = config.groupLabel;
		root.setAttribute("role", "group");
		root.setAttribute("aria-labelledby", label.id);
		root.appendChild(label);
	}

	const buttons = new Map<T, HTMLButtonElement>();
	let currentValue = config.value;

	for (const option of config.options) {
		const button = doc.defaultView!.createEl("button");
		button.type = "button";
		button.className = "firstrecall-thumbnail-button";
		button.dataset.optionId = option.id;
		button.disabled = Boolean(option.disabled);

		const preview = doc.defaultView!.createDiv();
		preview.className = "firstrecall-thumbnail-preview";
		preview.setAttribute("aria-hidden", "true");
		option.renderPreview?.(preview, option);
		button.appendChild(preview);

		const label = doc.defaultView!.createSpan();
		label.className = "firstrecall-thumbnail-label";
		label.textContent = option.label;
		button.appendChild(label);

		if (option.description) {
			const description = doc.defaultView!.createSpan();
			description.className = "firstrecall-thumbnail-description";
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
				"firstrecall-preview-font",
				`firstrecall-preview-font-${option.id}`,
				"firstrecall-preview-cue-only",
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
	const surface = doc.defaultView!.createDiv();
	surface.className = ["firstrecall-preview-surface", ...classes].join(" ");
	const card = doc.defaultView!.createDiv();
	card.className = "firstrecall-preview-card";
	surface.appendChild(card);

	const rail = doc.defaultView!.createDiv();
	rail.className = "firstrecall-preview-rail";
	card.appendChild(rail);

	const content = doc.defaultView!.createDiv();
	content.className = "firstrecall-preview-content";
	card.appendChild(content);

	const question = doc.defaultView!.createDiv();
	question.className = "firstrecall-preview-question";
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
		"firstrecall-preview-editor-display",
		`firstrecall-preview-editor-display-${display}`,
	]);
	surface.appendChild(editorCueCardScene(doc, display));
	previewEl.appendChild(surface);
}

function editorCueCardScene(
	doc: Document,
	display: "cornell" | "inline-cues"
): HTMLElement {
	const scene = editorScene(doc);
	scene.classList.add(`firstrecall-preview-editor-scene-${display}`);
	scene.appendChild(editorCueCard(doc, display));
	return scene;
}

function editorCueCard(
	doc: Document,
	display: "cornell" | "inline-cues"
): HTMLElement {
	const card = doc.defaultView!.createDiv();
	card.className = [
		"firstrecall-preview-editor-cue-card",
		`firstrecall-preview-editor-cue-card-${display}`,
	].join(" ");

	if (display === "cornell") {
		const grip = doc.defaultView!.createSpan();
		grip.className = "firstrecall-preview-editor-cue-grip";
		card.appendChild(grip);
	}

	card.append(
		editorCueSection(
			doc,
			"summary",
			"SUMMARY",
			"AI and expertise shape trusted products."
		),
		editorCueSection(doc, "question", "RECALL QUESTION", SAMPLE_QUESTION),
		editorCueSection(doc, "terms", "KEY TERMS", null)
	);
	return card;
}

function editorCueSection(
	doc: Document,
	kind: "summary" | "question" | "terms",
	labelText: string,
	bodyText: string | null
): HTMLElement {
	const section = doc.defaultView!.createDiv();
	section.className = "firstrecall-preview-editor-cue-section";

	const label = doc.defaultView!.createSpan();
	label.className = "firstrecall-preview-editor-cue-section-label";
	const icon = doc.defaultView!.createSpan();
	icon.className = "firstrecall-preview-editor-cue-icon";
	icon.dataset.section = kind;
	const text = doc.defaultView!.createSpan();
	text.textContent = labelText;
	const chevron = doc.defaultView!.createSpan();
	chevron.className = "firstrecall-preview-editor-cue-chevron";
	label.append(icon, text, chevron);
	section.appendChild(label);

	if (kind === "terms") {
		const terms = doc.defaultView!.createSpan();
		terms.className = "firstrecall-preview-editor-cue-terms";
		for (const termText of ["frontier AI", "data"]) {
			const term = doc.defaultView!.createSpan();
			term.className = "firstrecall-preview-editor-cue-term";
			term.textContent = termText;
			terms.appendChild(term);
		}
		section.appendChild(terms);
	} else if (bodyText) {
		const body = doc.defaultView!.createSpan();
		body.className = [
			"firstrecall-preview-editor-cue-body",
			kind === "question" ? "firstrecall-preview-editor-cue-question" : "",
		]
			.filter(Boolean)
			.join(" ");
		body.textContent = bodyText;
		section.appendChild(body);
	}

	return section;
}

function editorPreviewSurface(doc: Document, classes: string[]): HTMLElement {
	const surface = doc.defaultView!.createDiv();
	surface.className = ["firstrecall-preview-editor-surface", ...classes].join(" ");
	return surface;
}

function editorScene(doc: Document): HTMLElement {
	const scene = doc.defaultView!.createDiv();
	scene.className = "firstrecall-preview-editor-scene";
	for (const variant of ["short", "long", "medium"] as const) {
		const line = doc.defaultView!.createSpan();
		line.className = `firstrecall-preview-editor-line firstrecall-preview-editor-line-${variant}`;
		scene.appendChild(line);
	}
	return scene;
}
