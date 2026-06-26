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
	"How does tailoring AI with organizational knowledge upskill employees, and why does encoding that expertise into reusable plugins or agents make them faster and smarter?";

const SAMPLE_SUPPORTS = [
	"org knowledge",
	"standards/workflows",
	"shippable output",
];

const DISPLAY_SAMPLE_QUESTION = "How do agents differ from chatbots?";
const DISPLAY_SAMPLE_SUPPORTS = ["active recall", "MCP"];

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
			renderCuePreview(previewEl, [
				"cuecraft-preview-style",
				`cuecraft-preview-style-${option.id}`,
			]);
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
			renderCuePreview(previewEl, [
				"cuecraft-preview-width",
				`cuecraft-preview-width-${option.id}`,
			]);
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
			renderCuePreview(previewEl, [
				"cuecraft-preview-font",
				`cuecraft-preview-font-${option.id}`,
			]);
		},
	}));
}

export function cueAccentThumbnailOptions(): AppearanceThumbnailOption<CueAccent>[] {
	return CUE_ACCENTS.map((option) => ({
		id: option.id,
		label: option.label,
		renderPreview: (previewEl) => {
			renderCuePreview(previewEl, [
				"cuecraft-preview-accent",
				`cuecraft-preview-accent-${option.id}`,
			]);
		},
	}));
}

function renderCuePreview(
	previewEl: HTMLElement,
	classes: string[],
	previewContent: { question?: string; supports?: readonly string[] } = {}
): void {
	const doc = previewEl.ownerDocument;
	const surface = doc.createElement("div");
	surface.className = ["cuecraft-preview-surface", ...classes].join(" ");
	const questionText = previewContent.question ?? SAMPLE_QUESTION;
	const supportTerms = previewContent.supports ?? SAMPLE_SUPPORTS;

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
	question.textContent = questionText;
	content.appendChild(question);

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

	previewEl.appendChild(surface);
}
