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

	for (const option of config.options) {
		const button = doc.createElement("button");
		button.type = "button";
		button.className = "cuecraft-thumbnail-button";
		button.dataset.optionId = option.id;
		button.disabled = Boolean(option.disabled);
		button.setAttribute("aria-label", option.label);

		const preview = doc.createElement("span");
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

		const selected = doc.createElement("span");
		selected.className = "cuecraft-thumbnail-selected";
		selected.textContent = "Selected";
		button.appendChild(selected);

		button.addEventListener("click", () => {
			if (button.disabled || option.id === config.value) return;
			updateSelected(option.id);
			void config.onSelect(option.id);
		});

		root.appendChild(button);
		buttons.set(option.id, button);
	}

	function updateSelected(value: T): void {
		config.value = value;
		for (const [id, button] of buttons) {
			const selected = id === value;
			button.classList.toggle("is-selected", selected);
			button.setAttribute("aria-pressed", String(selected));
			const selectedLabel = button.querySelector<HTMLElement>(
				".cuecraft-thumbnail-selected"
			);
			if (selectedLabel) selectedLabel.hidden = !selected;
		}
	}

	config.parentEl.appendChild(root);
	updateSelected(config.value);

	return {
		rootEl: root,
		setValue: updateSelected,
	};
}
