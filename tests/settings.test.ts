import { JSDOM } from "jsdom";
import { describe, it, expect, vi } from "vitest";
import {
	AUTO_GENERATION_SETTLE_DELAY_SECONDS_OPTIONS,
	DEFAULT_AUTO_GENERATION_SETTLE_DELAY_SECONDS,
	formatAutoGenerationSettleDelayLabel,
	normalizeAutoGenerationSettleDelaySeconds,
} from "../src/auto-generation-delay";
import {
	DEFAULT_CORNELL_DISPLAY_MODE,
	cornellDisplayModeOption,
	isCornellDisplayMode,
} from "../src/cornell-display";
import { DEFAULT_READING_MODE_DISPLAY } from "../src/reading-cues";
import {
	DEFAULT_EDITOR_CUE_DISPLAY,
	EDITOR_CUE_DISPLAY_OPTIONS,
	editorCueDisplayOption,
	isEditorCueDisplay,
} from "../src/editor-cue-display";
import {
	DEFAULT_EDITOR_HOOK_CARD_STYLE,
	EDITOR_HOOK_CARD_STYLE_OPTIONS,
	editorHookCardStyleOption,
	isEditorHookCardStyle,
} from "../src/editor-hook-card-style";
import {
	DEFAULT_SHOW_NOTE_BRIEF,
	DEFAULT_SHOW_SECTION_LENS,
} from "../src/review-surfaces";
import {
	cornellViewSettingsSummary,
	editingViewSettingsSummary,
} from "../src/settings-summaries";

function createObsidianMock() {
	class MockPluginSettingTab {
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

	class MockSetting {
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

	return {
		App: class {},
		Modal: class {},
		Notice: class {},
		PluginSettingTab: MockPluginSettingTab,
		Setting: MockSetting,
		TFolder: class {},
		requestUrl: vi.fn(),
		setIcon: (el: HTMLElement, icon: string) => {
			el.dataset.icon = icon;
		},
	};
}

if ("Bun" in globalThis && !process.env.VITEST) {
	const bunTest = (await import("bun" + ":test")) as {
		mock: {
			module: (specifier: string, factory: () => unknown) => void;
		};
	};
	bunTest.mock.module("obsidian", createObsidianMock);
}

type SettingsModule = typeof import("../src/settings");
type CueCraftSettingTab = import("../src/settings").CueCraftSettingTab;
type CueCraftSettings = import("../src/settings").CueCraftSettings;

let settingsModulePromise: Promise<SettingsModule> | undefined;

function loadSettingsModule(): Promise<SettingsModule> {
	settingsModulePromise ??= import("../src/settings");
	return settingsModulePromise;
}

type MockPlugin = {
	settings: CueCraftSettings;
	saveSettings: ReturnType<typeof vi.fn>;
	refreshEditorCues: ReturnType<typeof vi.fn>;
	refreshCornellViews: ReturnType<typeof vi.fn>;
	refreshReadingModeSurface: ReturnType<typeof vi.fn>;
	promptForCueSettingsRegeneration: ReturnType<typeof vi.fn>;
	registerDomEvent: (
		el: HTMLElement,
		type: string,
		handler: EventListener
	) => void;
};

type DomCreateOptions = {
	text?: string;
	cls?: string | string[];
	attr?: Record<string, string>;
};

function appendElement(
	parent: HTMLElement,
	tag: string,
	options: DomCreateOptions = {}
): HTMLElement {
	const child = parent.ownerDocument.createElement(tag);
	if (options.text) child.textContent = options.text;
	if (options.cls) {
		const classes = Array.isArray(options.cls) ? options.cls : [options.cls];
		child.classList.add(
			...classes.flatMap((cls) => cls.split(/\s+/).filter(Boolean))
		);
	}
	for (const [name, value] of Object.entries(options.attr ?? {})) {
		child.setAttribute(name, value);
	}
	parent.appendChild(child);
	return child;
}

async function setupSettingsTab(): Promise<{
	tab: CueCraftSettingTab;
	plugin: MockPlugin;
}> {
	const { CueCraftSettingTab, DEFAULT_SETTINGS } = await loadSettingsModule();
	const dom = new JSDOM("<div id=\"root\"></div>");
	globalThis.window = dom.window as unknown as typeof globalThis.window;
	globalThis.document = dom.window.document;
	globalThis.HTMLElement = dom.window.HTMLElement;

	const proto = dom.window.HTMLElement.prototype as HTMLElement & {
		empty?: () => void;
		addClass?: (...classes: string[]) => void;
		removeClass?: (...classes: string[]) => void;
		setAttr?: (name: string, value: string) => void;
		createEl?: (
			tag: string,
			options?: DomCreateOptions
		) => HTMLElement;
		createDiv?: (options?: { text?: string; cls?: string }) => HTMLElement;
		createSpan?: (options?: { text?: string; cls?: string }) => HTMLElement;
	};
	proto.empty = function empty() {
		this.replaceChildren();
	};
	proto.addClass = function addClass(...classes: string[]) {
		this.classList.add(...classes);
	};
	proto.removeClass = function removeClass(...classes: string[]) {
		this.classList.remove(...classes);
	};
	proto.setAttr = function setAttr(name: string, value: string) {
		this.setAttribute(name, value);
	};
	proto.createEl = function createEl(tag: string, options: DomCreateOptions = {}) {
		return appendElement(this, tag, options);
	};
	proto.createDiv = function createDiv(options: DomCreateOptions = {}) {
		return appendElement(this, "div", options);
	};
	proto.createSpan = function createSpan(options: DomCreateOptions = {}) {
		return appendElement(this, "span", options);
	};

	const plugin: MockPlugin = {
		settings: structuredClone(DEFAULT_SETTINGS),
		saveSettings: vi.fn(async () => undefined),
		refreshEditorCues: vi.fn(),
		refreshCornellViews: vi.fn(),
		refreshReadingModeSurface: vi.fn(),
		promptForCueSettingsRegeneration: vi.fn(),
		registerDomEvent: (el, type, handler) => {
			el.addEventListener(type, handler);
		},
	};
	const app = {
		vault: {
			getName: () => "CueCraft",
		},
	};
	const tab = new CueCraftSettingTab(app as never, plugin as never);
	return { tab, plugin };
}

function settingText(containerEl: HTMLElement): string {
	return containerEl.textContent ?? "";
}

function openSettingsCard(tab: CueCraftSettingTab, label: string): void {
	const card = tab.containerEl.querySelector<HTMLElement>(
		`[aria-label="${label}"]`
	);
	if (!card) throw new Error(`Missing settings card: ${label}`);
	card.click();
}

async function changeToggle(
	containerEl: HTMLElement,
	name: string,
	value: boolean
): Promise<void> {
	const setting = containerEl.querySelector<HTMLElement>(
		`[data-setting-name="${name}"]`
	);
	if (!setting) throw new Error(`Missing setting: ${name}`);
	const toggle = setting.querySelector<HTMLInputElement>(
		"[data-control='toggle']"
	) as HTMLInputElement & {
		__onChange?: (value: boolean) => void | Promise<void>;
	};
	if (!toggle.__onChange) throw new Error(`Missing toggle callback: ${name}`);
	await toggle.__onChange(value);
}

async function clickThumbnail(
	containerEl: HTMLElement,
	name: string,
	optionId: string
): Promise<void> {
	const setting = containerEl.querySelector<HTMLElement>(
		`[data-setting-name="${name}"]`
	);
	if (!setting) throw new Error(`Missing setting: ${name}`);
	const button = setting.querySelector<HTMLButtonElement>(
		`[data-option-id="${optionId}"]`
	);
	if (!button) throw new Error(`Missing thumbnail option: ${name} ${optionId}`);
	button.click();
	await Promise.resolve();
}

describe("settings defaults", () => {
	it("defaults auto-generation settle delay to 10 seconds", () => {
		expect(DEFAULT_AUTO_GENERATION_SETTLE_DELAY_SECONDS).toBe(10);
	});

	it("offers supported auto-generation settle delay presets", () => {
		expect(AUTO_GENERATION_SETTLE_DELAY_SECONDS_OPTIONS).toEqual([
			1,
			5,
			10,
			25,
			60,
		]);
	});

	it("normalizes persisted auto-generation settle delay values", () => {
		expect(normalizeAutoGenerationSettleDelaySeconds(1)).toBe(1);
		expect(normalizeAutoGenerationSettleDelaySeconds(60)).toBe(60);
		for (const bad of [0, 2, 100, "", "10", null, undefined, {}, []]) {
			expect(normalizeAutoGenerationSettleDelaySeconds(bad)).toBe(10);
		}
	});

	it("formats auto-generation settle delay preset labels", () => {
		expect(
			AUTO_GENERATION_SETTLE_DELAY_SECONDS_OPTIONS.map((seconds) =>
				formatAutoGenerationSettleDelayLabel(seconds)
			)
		).toEqual([
			"1 second",
			"5 seconds",
			"10 seconds",
			"25 seconds",
			"60 seconds",
		]);
	});

	it("defaults Reading mode to the compact review button", () => {
		expect(DEFAULT_READING_MODE_DISPLAY).toBe("review-button");
	});

	it("defaults Cornell display mode to the classic Cornell view", () => {
		expect(DEFAULT_CORNELL_DISPLAY_MODE).toBe("classic");
		expect(cornellDisplayModeOption(DEFAULT_CORNELL_DISPLAY_MODE).label).toBe(
			"Cornell"
		);
	});

	it("defaults editor cue display to inline cues", () => {
		expect(DEFAULT_EDITOR_CUE_DISPLAY).toBe("inline-cues");
		expect(editorCueDisplayOption(DEFAULT_EDITOR_CUE_DISPLAY).label).toBe(
			"Inline cues"
		);
	});

	it("defaults generated review surfaces to visible", () => {
		expect(DEFAULT_SHOW_SECTION_LENS).toBe(true);
		expect(DEFAULT_SHOW_NOTE_BRIEF).toBe(true);
	});

	it("defaults rail cards to the classic style", () => {
		expect(DEFAULT_EDITOR_HOOK_CARD_STYLE).toBe("classic");
		expect(editorHookCardStyleOption(DEFAULT_EDITOR_HOOK_CARD_STYLE).label).toBe(
			"Classic warm/cool"
		);
	});

	it("validates persisted Cornell display mode values", () => {
		expect(isCornellDisplayMode("classic")).toBe(true);
		expect(isCornellDisplayMode("hook")).toBe(true);
		for (const bad of ["", "hooks", "study", null, undefined, 1, {}]) {
			expect(isCornellDisplayMode(bad)).toBe(false);
		}
	});

	it("validates persisted editor cue display values", () => {
		expect(EDITOR_CUE_DISPLAY_OPTIONS.map((option) => option.id)).toEqual([
			"cornell",
			"inline-cues",
			"anchored-card-rail",
			"collapsed-tabs",
			"threaded-margin-notes",
			"active-section-composer",
			"hook-minimap",
		]);
		expect(isEditorCueDisplay("cornell")).toBe(true);
		expect(isEditorCueDisplay("inline-cues")).toBe(true);
		expect(isEditorCueDisplay("anchored-card-rail")).toBe(true);
		expect(isEditorCueDisplay("collapsed-tabs")).toBe(true);
		expect(isEditorCueDisplay("threaded-margin-notes")).toBe(true);
		expect(isEditorCueDisplay("active-section-composer")).toBe(true);
		expect(isEditorCueDisplay("hook-minimap")).toBe(true);
		for (const bad of ["", "hook", "classic", null, undefined, 1, {}]) {
			expect(isEditorCueDisplay(bad)).toBe(false);
		}
	});
	it("validates persisted editor hook card style values", () => {
		expect(EDITOR_HOOK_CARD_STYLE_OPTIONS.map((option) => option.id)).toEqual([
			"classic",
			"gradient",
		]);
		expect(isEditorHookCardStyle("classic")).toBe(true);
		expect(isEditorHookCardStyle("gradient")).toBe(true);
		for (const bad of ["", "orange", "soft", null, undefined, 1, {}]) {
			expect(isEditorHookCardStyle(bad)).toBe(false);
		}
	});

	it("summarizes Cornell View settings without editor-only state", () => {
		const settings = {
			cornellDisplayMode: "hook",
			cornellStyle: "legal-pad",
			cueColumnWidth: "wide",
			cueFontSize: "large",
			editorCueDisplay: "hook-minimap",
			editorHookCardStyle: "gradient",
			showRailQuestions: false,
			showRailSupportTerms: false,
		} as const;

		expect(cornellViewSettingsSummary(settings)).toBe(
			"Hook rail · Legal Pad · wide width · large text"
		);
		expect(cornellViewSettingsSummary(settings)).not.toContain("Hook minimap");
		expect(cornellViewSettingsSummary(settings)).not.toContain("Soft gradients");
		expect(cornellViewSettingsSummary(settings)).not.toContain("questions");
	});

	it("summarizes Editing View settings without Cornell-only state", () => {
		const settings = {
			cornellDisplayMode: "hook",
			cornellStyle: "legal-pad",
			cueColumnWidth: "wide",
			cueFontSize: "large",
			editorCueDisplay: "hook-minimap",
			editorHookCardStyle: "gradient",
			showRailQuestions: false,
			showRailSupportTerms: true,
		} as const;

		expect(editingViewSettingsSummary(settings)).toBe(
			"Hook minimap · Soft gradients · wide width · large text · questions hidden · supports shown"
		);
		expect(editingViewSettingsSummary(settings)).not.toContain("Legal Pad");
	});

	it("renders Cornell View and Editing View settings destinations", async () => {
		const { tab } = await setupSettingsTab();

		tab.display();

		const text = settingText(tab.containerEl);
		expect(text).toContain("Cornell View");
		expect(text).toContain("Editing View");
		expect(text).not.toContain("Appearance");
	});

	it("keeps Cornell View controls Cornell-only", async () => {
		const { tab } = await setupSettingsTab();

		tab.display();
		openSettingsCard(tab, "Cornell View");

		const text = settingText(tab.containerEl);
		expect(text).toContain("Cornell display mode");
		expect(text).toContain("Cornell view style");
		expect(text).toContain("Cue column width");
		expect(text).toContain("Cue font size");
		expect(text).toContain("Cue accent color");
		expect(text).toContain("Show cue column border");
		expect(text).toContain("Compact supports");
		expect(text).toContain("Fold cue column on mobile");
		expect(text).not.toContain("Editor cue display");
		expect(text).not.toContain("Rail card background");
		expect(text).not.toContain("Show rail questions");
		expect(text).not.toContain("Show rail support terms");
	});

	it("shows Editing View controls for all editor cue display options", async () => {
		const { tab } = await setupSettingsTab();

		tab.display();
		openSettingsCard(tab, "Editing View");

		const text = settingText(tab.containerEl);
		expect(text).toContain("Editor cue display");
		expect(text).toContain("Rail card background");
		expect(text).toContain("Cue column width");
		expect(text).toContain("Cue font size");
		expect(text).toContain("Show rail questions");
		expect(text).toContain("Show rail support terms");
		expect(text).not.toContain("Cornell display mode");
		expect(text).not.toContain("Cornell view style");
		expect(text).not.toContain("Cue accent color");
	});

	it("keeps cross-view review controls in Note format", async () => {
		const { tab } = await setupSettingsTab();

		tab.display();

		const text = settingText(tab.containerEl);
		expect(text).toContain("Note format");
		expect(text).toContain("Show CueCraft in Reading mode");
		expect(text).toContain("Reading mode display");
		expect(text).toContain("Show Section Lens");
		expect(text).toContain("Show Note Brief");
		expect(text).not.toContain("Show rail questions");
		expect(text).not.toContain("Show rail support terms");
	});

	it("refreshes editor cues for Editing View controls", async () => {
		const { tab, plugin } = await setupSettingsTab();

		tab.display();
		openSettingsCard(tab, "Editing View");
		await changeToggle(tab.containerEl, "Show rail questions", false);

		expect(plugin.settings.showRailQuestions).toBe(false);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		expect(plugin.refreshEditorCues).toHaveBeenCalledTimes(1);
		expect(plugin.refreshCornellViews).not.toHaveBeenCalled();
	});

	it("refreshes editor cues for Editing View display and card-style thumbnails", async () => {
		const { tab, plugin } = await setupSettingsTab();

		tab.display();
		openSettingsCard(tab, "Editing View");
		await clickThumbnail(tab.containerEl, "Editor cue display", "hook-minimap");
		await clickThumbnail(tab.containerEl, "Rail card background", "gradient");

		expect(plugin.settings.editorCueDisplay).toBe("hook-minimap");
		expect(plugin.settings.editorHookCardStyle).toBe("gradient");
		expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
		expect(plugin.refreshEditorCues).toHaveBeenCalledTimes(2);
		expect(plugin.refreshCornellViews).not.toHaveBeenCalled();
	});

	it("refreshes editor cues for Editing View width and font controls", async () => {
		const { tab, plugin } = await setupSettingsTab();

		tab.display();
		openSettingsCard(tab, "Editing View");
		await clickThumbnail(tab.containerEl, "Cue column width", "wide");
		await clickThumbnail(tab.containerEl, "Cue font size", "large");

		expect(plugin.settings.cueColumnWidth).toBe("wide");
		expect(plugin.settings.cueFontSize).toBe("large");
		expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
		expect(plugin.refreshEditorCues).toHaveBeenCalledTimes(2);
		expect(plugin.refreshCornellViews).not.toHaveBeenCalled();
	});

	it("refreshes Cornell views for Cornell View controls", async () => {
		const { tab, plugin } = await setupSettingsTab();

		tab.display();
		openSettingsCard(tab, "Cornell View");
		await changeToggle(tab.containerEl, "Show cue column border", false);

		expect(plugin.settings.showCueBorder).toBe(false);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		expect(plugin.refreshCornellViews).toHaveBeenCalledTimes(1);
		expect(plugin.refreshEditorCues).not.toHaveBeenCalled();
	});
});
