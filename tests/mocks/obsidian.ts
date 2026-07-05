export class App {}

export class Modal {}

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

	then(callback: (setting: this) => void): this {
		callback(this);
		return this;
	}
}

class MockToggle {
	constructor(private input: HTMLInputElement) {}

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

export function requestUrl(): Promise<unknown> {
	return Promise.resolve({});
}

export function setIcon(el: HTMLElement, icon: string): void {
	el.dataset.icon = icon;
}
