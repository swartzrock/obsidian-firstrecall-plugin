export class App {}

export class Plugin {
	app: unknown;

	constructor(app: unknown) {
		this.app = app;
	}
}

export class ItemView {}

export class FuzzySuggestModal<_T> {}

export class Modal {
	readonly contentEl: HTMLElement;

	constructor(_app: unknown) {
		this.contentEl = document.createElement("div");
		this.contentEl.className = "modal-content";
	}

	open(): void {
		document.body.appendChild(this.contentEl);
		(this as Modal & { onOpen?: () => void }).onOpen?.();
	}

	close(): void {
		this.contentEl.remove();
		(this as Modal & { onClose?: () => void }).onClose?.();
	}
}

export class Notice {}

export class TFolder {}

export class PluginSettingTab {
	app: unknown;
	plugin: unknown;
	containerEl: HTMLElement;

	constructor(app: unknown, plugin: unknown) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = document.createElement("div");
	}

	hide(): void {
		return;
	}
}

export class Setting {
	settingEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		const doc = containerEl.ownerDocument;
		this.settingEl = doc.createElement("div");
		this.settingEl.className = "setting-item";
		this.nameEl = doc.createElement("div");
		this.nameEl.className = "setting-item-name";
		this.descEl = doc.createElement("div");
		this.descEl.className = "setting-item-description";
		this.controlEl = doc.createElement("div");
		this.controlEl.className = "setting-item-control";
		this.settingEl.append(this.nameEl, this.descEl, this.controlEl);
		containerEl.appendChild(this.settingEl);
	}

	setName(name: string): this {
		this.nameEl.textContent = name;
		this.settingEl.dataset.settingName = name;
		return this;
	}

	setDesc(description: string): this {
		this.descEl.textContent = description;
		return this;
	}

	setHeading(): this {
		this.settingEl.classList.add("setting-heading");
		return this;
	}

	addToggle(callback: (toggle: MockToggle) => void): this {
		const input = this.settingEl.ownerDocument.createElement("input");
		input.type = "checkbox";
		input.dataset.control = "toggle";
		this.controlEl.appendChild(input);
		callback(new MockToggle(input));
		return this;
	}

	addDropdown(callback: (dropdown: MockDropdown) => void): this {
		const select = this.settingEl.ownerDocument.createElement("select");
		select.dataset.control = "dropdown";
		this.controlEl.appendChild(select);
		callback(new MockDropdown(select));
		return this;
	}

	addSlider(callback: (slider: MockSlider) => void): this {
		const input = this.settingEl.ownerDocument.createElement("input");
		input.type = "range";
		input.dataset.control = "slider";
		this.controlEl.appendChild(input);
		callback(new MockSlider(input));
		return this;
	}

	addTextArea(callback: (textArea: MockTextArea) => void): this {
		const input = this.settingEl.ownerDocument.createElement("textarea");
		input.dataset.control = "textarea";
		this.controlEl.appendChild(input);
		callback(new MockTextArea(input));
		return this;
	}

	addText(callback: (text: MockText) => void): this {
		const input = this.settingEl.ownerDocument.createElement("input");
		input.type = "text";
		input.dataset.control = "text";
		this.controlEl.appendChild(input);
		callback(new MockText(input));
		return this;
	}

	addButton(callback: (button: MockButton) => void): this {
		const input = this.settingEl.ownerDocument.createElement("button");
		input.type = "button";
		input.dataset.control = "button";
		this.controlEl.appendChild(input);
		callback(new MockButton(input));
		return this;
	}

	then(callback: (setting: this) => void): this {
		callback(this);
		return this;
	}
}

class MockToggle {
	readonly toggleEl: HTMLInputElement;

	constructor(private input: HTMLInputElement) {
		this.toggleEl = input;
	}

	setValue(value: boolean): this {
		this.input.checked = value;
		return this;
	}

	onChange(callback: (value: boolean) => void | Promise<void>): this {
		(this.input as HTMLInputElement & { __onChange?: typeof callback }).__onChange =
			callback;
		return this;
	}
}

class MockDropdown {
	constructor(private select: HTMLSelectElement) {}

	addOption(value: string, label: string): this {
		const option = this.select.ownerDocument.createElement("option");
		option.value = value;
		option.textContent = label;
		this.select.appendChild(option);
		return this;
	}

	setValue(value: string): this {
		this.select.value = value;
		return this;
	}

	onChange(callback: (value: string) => void | Promise<void>): this {
		(this.select as HTMLSelectElement & { __onChange?: typeof callback }).__onChange =
			callback;
		return this;
	}
}

class MockSlider {
	constructor(private input: HTMLInputElement) {}

	setLimits(min: number, max: number, step: number): this {
		this.input.min = String(min);
		this.input.max = String(max);
		this.input.step = String(step);
		return this;
	}

	setValue(value: number): this {
		this.input.value = String(value);
		return this;
	}

	setDynamicTooltip(): this {
		return this;
	}

	onChange(callback: (value: number) => void | Promise<void>): this {
		(this.input as HTMLInputElement & { __onChange?: typeof callback }).__onChange =
			callback;
		return this;
	}
}

class MockTextArea {
	constructor(readonly inputEl: HTMLTextAreaElement) {}

	setValue(value: string): this {
		this.inputEl.value = value;
		return this;
	}

	onChange(callback: (value: string) => void | Promise<void>): this {
		(
			this.inputEl as HTMLTextAreaElement & {
				__onChange?: typeof callback;
			}
		).__onChange = callback;
		return this;
	}
}

class MockText {
	constructor(readonly inputEl: HTMLInputElement) {}

	setPlaceholder(value: string): this {
		this.inputEl.placeholder = value;
		return this;
	}

	setValue(value: string): this {
		this.inputEl.value = value;
		return this;
	}

	setDisabled(value: boolean): this {
		this.inputEl.disabled = value;
		return this;
	}

	onChange(callback: (value: string) => void | Promise<void>): this {
		(
			this.inputEl as HTMLInputElement & {
				__onChange?: typeof callback;
			}
		).__onChange = callback;
		return this;
	}
}

class MockButton {
	constructor(private button: HTMLButtonElement) {}

	setButtonText(value: string): this {
		this.button.textContent = value;
		return this;
	}

	setDisabled(value: boolean): this {
		this.button.disabled = value;
		return this;
	}

	onClick(callback: () => void | Promise<void>): this {
		(
			this.button as HTMLButtonElement & {
				__onClick?: typeof callback;
			}
		).__onClick = callback;
		return this;
	}
}

export function requestUrl(): Promise<unknown> {
	return Promise.resolve({});
}

export function setIcon(el: HTMLElement, icon: string): void {
	el.dataset.icon = icon;
}

export function setTooltip(
	el: HTMLElement,
	tooltip: string,
	options?: { placement?: string }
): void {
	el.dataset.tooltip = tooltip;
	if (options?.placement) el.dataset.tooltipPlacement = options.placement;
}
