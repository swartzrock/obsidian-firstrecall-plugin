import {
	normalizeStringId,
	sortModelOptions,
	type ModelOption,
} from "@cuecraft/byok";

let nextComboboxId = 0;

export function buildModelComboboxOptions(opts: {
	options: ModelOption[];
	currentModelId: string;
}): ModelOption[] {
	const byId = new Map<string, ModelOption>();
	for (const option of opts.options) {
		if (option.id.trim()) byId.set(option.id, option);
	}
	const currentModelId = opts.currentModelId.trim();
	if (currentModelId && !byId.has(currentModelId)) {
		byId.set(currentModelId, normalizeStringId(currentModelId));
	}
	return sortModelOptions([...byId.values()], currentModelId);
}

export function modelOptionSearchText(option: ModelOption): string {
	return [
		option.id,
		option.label,
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

export function filterModelOptions(
	options: ModelOption[],
	query: string
): ModelOption[] {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return options;
	return options.filter((option) =>
		modelOptionSearchText(option).includes(normalizedQuery)
	);
}

export function buildModelComboboxSuggestions(opts: {
	options: ModelOption[];
	selectedModelId: string;
	query: string;
}): ModelOption[] {
	return filterModelOptions(
		buildModelComboboxOptions({
			options: opts.options,
			currentModelId: opts.selectedModelId,
		}),
		opts.query
	);
}

export function renderModelCombobox(opts: {
	containerEl: HTMLElement;
	value: string;
	options: ModelOption[];
	placeholder: string;
	emptyMessage: string;
	onCommit: (value: string) => void | Promise<void>;
	renderToggleIcon?: (containerEl: HTMLElement) => void;
	pinnedOptionIds?: string[];
	suggestionsLabel?: string;
}): void {
	const comboboxId = `cuecraft-model-combobox-${++nextComboboxId}`;
	const listboxId = `${comboboxId}-list`;
	let isOpen = false;
	let activeIndex = -1;
	let committedModelId = opts.value.trim();
	const suggestionsLabel = opts.suggestionsLabel ?? "model suggestions";
	const pinnedOptionIds = opts.pinnedOptionIds ?? [];
	const pinnedRank = new Map(
		pinnedOptionIds.map((id, index) => [id.trim(), index])
	);

	const rootEl = opts.containerEl.createDiv({
		cls: "cuecraft-model-combobox",
	});
	const inputEl = rootEl.createEl("input", {
		cls: "cuecraft-model-combobox-input",
		attr: {
			id: comboboxId,
			type: "text",
			role: "combobox",
			"aria-controls": listboxId,
			"aria-expanded": "false",
			"aria-autocomplete": "list",
			placeholder: opts.placeholder,
		},
	});
	inputEl.value = opts.value;

	const toggleEl = rootEl.createEl("button", {
		cls: "cuecraft-model-combobox-toggle",
		attr: {
			type: "button",
			"aria-label": `Show ${suggestionsLabel}`,
			tabindex: "-1",
		},
	});
	opts.renderToggleIcon?.(toggleEl);

	const listEl = rootEl.createDiv({
		cls: "cuecraft-model-combobox-list cuecraft-model-combobox-list-hidden",
		attr: { id: listboxId, role: "listbox" },
	});

	const matches = () => {
		const suggestions = buildModelComboboxSuggestions({
			options: opts.options,
			selectedModelId: committedModelId,
			query: inputEl.value,
		});
		if (!pinnedRank.size) return suggestions;
		return [...suggestions].sort((a, b) => {
			const aRank = pinnedRank.get(a.id);
			const bRank = pinnedRank.get(b.id);
			if (aRank != null && bRank != null) return aRank - bRank;
			if (aRank != null) return -1;
			if (bRank != null) return 1;
			return 0;
		});
	};

	const closeList = () => {
		isOpen = false;
		inputEl.setAttr("aria-expanded", "false");
		inputEl.removeAttribute("aria-activedescendant");
		toggleEl.setAttr("aria-label", `Show ${suggestionsLabel}`);
		rootEl.removeClass("cuecraft-model-combobox-open");
		listEl.addClass("cuecraft-model-combobox-list-hidden");
	};

	const commitValue = (value: string) => {
		const nextValue = value.trim();
		if (nextValue === committedModelId) {
			inputEl.value = nextValue;
			return;
		}
		committedModelId = nextValue;
		inputEl.value = nextValue;
		void opts.onCommit(nextValue);
	};

	const chooseOption = (option: ModelOption) => {
		commitValue(option.id);
		closeList();
	};

	const renderList = () => {
		listEl.replaceChildren();
		if (!isOpen) {
			closeList();
			return;
		}
		const visibleOptions = matches();
		rootEl.addClass("cuecraft-model-combobox-open");
		listEl.removeClass("cuecraft-model-combobox-list-hidden");
		inputEl.setAttr("aria-expanded", "true");
		toggleEl.setAttr("aria-label", `Hide ${suggestionsLabel}`);
		if (visibleOptions.length === 0) {
			listEl.createDiv({
				cls: "cuecraft-model-combobox-empty",
				text: opts.emptyMessage,
			});
			inputEl.removeAttribute("aria-activedescendant");
			return;
		}

		if (activeIndex >= visibleOptions.length) {
			activeIndex = visibleOptions.length - 1;
		}
		if (activeIndex < 0) {
			inputEl.removeAttribute("aria-activedescendant");
		}
		for (const [index, option] of visibleOptions.entries()) {
			const optionId = `${comboboxId}-option-${index}`;
			const optionEl = listEl.createEl("button", {
				cls: "cuecraft-model-combobox-option",
				attr: {
					id: optionId,
					type: "button",
					role: "option",
					"aria-selected": index === activeIndex ? "true" : "false",
				},
			});
			if (index === activeIndex) {
				inputEl.setAttr("aria-activedescendant", optionId);
			}
			optionEl.createDiv({
				cls: "cuecraft-model-combobox-option-label",
				text: option.label || option.id,
			});
			const detailText =
				option.label && option.label !== option.id ? option.id : "";
			if (detailText) {
				optionEl.createDiv({
					cls: "cuecraft-model-combobox-option-detail",
					text: detailText,
				});
			}
			optionEl.addEventListener("mousedown", (event) => {
				event.preventDefault();
				chooseOption(option);
			});
		}
	};

	toggleEl.addEventListener("mousedown", (event) => {
		event.preventDefault();
	});
	toggleEl.addEventListener("click", (event) => {
		event.preventDefault();
		if (isOpen) {
			closeList();
			return;
		}
		isOpen = true;
		activeIndex = -1;
		renderList();
		inputEl.focus();
	});
	inputEl.addEventListener("focus", () => {
		isOpen = true;
		activeIndex = -1;
		renderList();
	});
	inputEl.addEventListener("input", () => {
		isOpen = true;
		activeIndex = -1;
		renderList();
	});
	inputEl.addEventListener("keydown", (event) => {
		const visibleOptions = matches();
		if (event.key === "ArrowDown") {
			event.preventDefault();
			isOpen = true;
			activeIndex =
				visibleOptions.length === 0
					? 0
					: activeIndex < 0
						? 0
						: (activeIndex + 1) % visibleOptions.length;
			renderList();
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			isOpen = true;
			activeIndex =
				visibleOptions.length === 0
					? 0
					: activeIndex < 0
						? visibleOptions.length - 1
						: (activeIndex - 1 + visibleOptions.length) %
							visibleOptions.length;
			renderList();
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			if (isOpen && visibleOptions[activeIndex]) {
				chooseOption(visibleOptions[activeIndex]);
				return;
			}
			commitValue(inputEl.value);
			closeList();
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			closeList();
		}
	});
	inputEl.addEventListener("blur", () => {
		window.setTimeout(() => {
			commitValue(inputEl.value);
			closeList();
		}, 100);
	});
}
