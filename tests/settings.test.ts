import { JSDOM } from "jsdom";
import { describe, it, expect, vi } from "vitest";
import {
	AUTO_GENERATION_SETTLE_DELAY_SECONDS_OPTIONS,
	DEFAULT_AUTO_GENERATION_SETTLE_DELAY_SECONDS,
	formatAutoGenerationSettleDelayLabel,
	normalizeAutoGenerationSettleDelaySeconds,
} from "../src/auto-generation-delay";
import {
	DEFAULT_EDITOR_CUE_DISPLAY,
	EDITOR_CUE_DISPLAY_OPTIONS,
	editorCueDisplayOption,
	isEditorCueDisplay,
} from "../src/editor-cue-display";
import {
	DEFAULT_SHOW_NOTE_BRIEF,
	DEFAULT_SHOW_SECTION_LENS,
} from "../src/review-surfaces";
import {
	buildSectionCueInstructionsTemplate,
} from "../src/cue-instructions";
import { buildNoteBriefInstructionsTemplate } from "../src/review-artifact-prompts";
import { QUESTION_TYPES } from "../src/cue-generation";

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

	class MockButton {
		constructor(private button: HTMLButtonElement) {}

		setButtonText(value: string): this {
			this.button.textContent = value;
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
	refreshReadingModeSurface: ReturnType<typeof vi.fn>;
	noteCueSettingsChanged: ReturnType<typeof vi.fn>;
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
		refreshReadingModeSurface: vi.fn(),
		noteCueSettingsChanged: vi.fn(),
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

async function changeDropdown(
	containerEl: HTMLElement,
	name: string,
	value: string
): Promise<void> {
	const setting = containerEl.querySelector<HTMLElement>(
		`[data-setting-name="${name}"]`
	);
	if (!setting) throw new Error(`Missing setting: ${name}`);
	const dropdown = setting.querySelector<HTMLSelectElement>(
		"[data-control='dropdown']"
	) as HTMLSelectElement & {
		__onChange?: (value: string) => void | Promise<void>;
	};
	if (!dropdown.__onChange) throw new Error(`Missing dropdown callback: ${name}`);
	dropdown.value = value;
	await dropdown.__onChange(value);
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
	it("includes LM Studio as a local URL provider", async () => {
		const { DEFAULT_SETTINGS } = await loadSettingsModule();

		expect(DEFAULT_SETTINGS.byok.providers["lm-studio"]).toMatchObject({
			credential: "http://localhost:1234/v1",
			model: "",
			availableModels: [],
			modelOptions: [],
			hasFetchedModels: false,
		});
	});

	it("uses one Question type and canonical artifact visibility defaults", async () => {
		const { DEFAULT_SETTINGS } = await loadSettingsModule();

		expect(DEFAULT_SETTINGS).toMatchObject({
			questionType: "conceptual",
			showNoteBrief: true,
			showSummary: true,
			showQuestion: true,
			showTerms: true,
		});
		for (const key of [
			"cuePreset",
			"cueDensity",
			"questionStyle",
			"generateKeywords",
			"cueInstructionsOverride",
			"noteBriefInstructionsOverride",
			"showSectionLens",
			"showRailSummary",
			"showRailQuestions",
			"showRailSupportTerms",
			"renderInReadingMode",
		]) {
			expect(DEFAULT_SETTINGS).not.toHaveProperty(key);
		}
	});

	it("discards legacy custom instruction overrides", async () => {
		const { default: CueCraftPlugin } = await import("../src/main");
		const saveData = vi.fn(async () => {});
		const missing = async () => ({
			ok: false as const,
			reason: "missing-credential" as const,
		});
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: {
				availability: () => ({ ok: true }),
				metadata: missing,
				read: missing,
				save: missing,
				clear: missing,
			},
			loadData: vi.fn(async () => ({
				settings: {
					cueInstructionsOverride: "Custom Cue policy.",
					noteBriefInstructionsOverride: "Custom Note Brief policy.",
					summaryInstructionsOverride: "Legacy Summary policy.",
				},
			})),
			saveData,
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		expect(plugin.settings).not.toHaveProperty("cueInstructionsOverride");
		expect(plugin.settings).not.toHaveProperty("noteBriefInstructionsOverride");
		expect(plugin.settings).not.toHaveProperty("summaryInstructionsOverride");
		expect(saveData).toHaveBeenCalledTimes(1);
	});

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

	it("uses fixed inline Reading cues without a display preference", async () => {
		const { DEFAULT_SETTINGS } = await loadSettingsModule();
		expect("readingModeDisplay" in DEFAULT_SETTINGS).toBe(false);
	});

	it("contains no dedicated Cornell pane settings", async () => {
		const { DEFAULT_SETTINGS } = await loadSettingsModule();
		for (const key of [
			"cornellDisplayMode",
			"cornellStyle",
			"cueColumnWidth",
			"cueAccent",
			"showCueBorder",
			"compactChips",
			"foldCueColumnOnMobile",
		]) {
			expect(DEFAULT_SETTINGS).not.toHaveProperty(key);
		}
	});

	it("shows every Section cue component by default", async () => {
		const { DEFAULT_SETTINGS } = await loadSettingsModule();

		expect(DEFAULT_SETTINGS.showSummary).toBe(true);
		expect(DEFAULT_SETTINGS.showQuestion).toBe(true);
		expect(DEFAULT_SETTINGS.showTerms).toBe(true);
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

	it("validates persisted editor cue display values", () => {
		expect(EDITOR_CUE_DISPLAY_OPTIONS.map((option) => option.id)).toEqual([
			"cornell",
			"inline-cues",
			"collapsed-tabs",
			"active-section-composer",
			"hook-minimap",
		]);
		expect(isEditorCueDisplay("cornell")).toBe(true);
		expect(isEditorCueDisplay("inline-cues")).toBe(true);
		expect(isEditorCueDisplay("collapsed-tabs")).toBe(true);
		expect(isEditorCueDisplay("active-section-composer")).toBe(true);
		expect(isEditorCueDisplay("hook-minimap")).toBe(true);
		for (const bad of [
			"",
			"hook",
			"classic",
			"cornell-exam-prep",
			"cornell-minimal",
			"anchored-card-rail",
			"threaded-margin-notes",
			null,
			undefined,
			1,
			{},
		]) {
			expect(isEditorCueDisplay(bad)).toBe(false);
		}
	});
	it("maps main-page controls to visible Note Brief and Section cue components", async () => {
		const { tab } = await setupSettingsTab();
		tab.display();

		const text = settingText(tab.containerEl);
		expect(text).toContain("Generated components");
		expect(text).toContain("Appearance");
		expect(text).not.toContain("Editing View");
		expect(text).not.toContain("Note format");
		for (const groupName of ["Note Brief", "Section cue"]) {
			expect(
				tab.containerEl.querySelector(`[role="group"][aria-label="${groupName}"]`)
			).not.toBeNull();
		}
		for (const label of [
			"Show Note Brief",
			"Show Summary",
			"Show Question",
			"Show Terms",
		]) {
			expect(tab.containerEl.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
		}
		expect(text).toContain("Core idea");
		expect(text).toContain("Review first");
		expect(text).toContain("Self-test");
	});

	it("allows every generated component to be hidden without marking content dirty", async () => {
		const { tab, plugin } = await setupSettingsTab();
		tab.display();

		for (const label of [
			"Show Note Brief",
			"Show Summary",
			"Show Question",
			"Show Terms",
		]) {
			await changeToggle(tab.containerEl, label, false);
		}

		expect(plugin.settings).toMatchObject({
			showNoteBrief: false,
			showSummary: false,
			showQuestion: false,
			showTerms: false,
		});
		expect(plugin.saveSettings).toHaveBeenCalledTimes(4);
		for (const call of plugin.saveSettings.mock.calls) {
			expect(call).toEqual([{ refreshReviewSurfaces: false }]);
		}
		expect(plugin.refreshEditorCues).toHaveBeenCalledTimes(4);
		expect(plugin.refreshReadingModeSurface).toHaveBeenCalledTimes(4);
		expect(plugin.noteCueSettingsChanged).not.toHaveBeenCalled();
	});

	it("keeps Cue display Editing-only and cue font size shared", async () => {
		const { tab, plugin } = await setupSettingsTab();
		tab.display();

		expect(settingText(tab.containerEl)).toContain("Changes Section cue layout in Editing only; Reading remains inline.");
		expect(settingText(tab.containerEl)).toContain("Applies in Editing and Reading.");
		await clickThumbnail(tab.containerEl, "Cue display", "cornell");
		expect(plugin.saveSettings).toHaveBeenLastCalledWith({
			refreshReviewSurfaces: false,
		});
		expect(plugin.refreshEditorCues).toHaveBeenCalledTimes(1);
		expect(plugin.refreshReadingModeSurface).not.toHaveBeenCalled();

		await clickThumbnail(tab.containerEl, "Cue font size", "large");
		expect(plugin.refreshEditorCues).toHaveBeenCalledTimes(2);
		expect(plugin.refreshReadingModeSurface).toHaveBeenCalledTimes(1);
		expect(plugin.noteCueSettingsChanged).not.toHaveBeenCalled();
	});

	it("shows one Question type control and exact read-only Advanced templates", async () => {
		const { tab, plugin } = await setupSettingsTab();
		tab.display();
		openSettingsCard(tab, "Cue Generation");

		const text = settingText(tab.containerEl);
		expect(text).toContain("Question type");
		expect(text).toContain("Auto-generate on save");
		expect(text).not.toContain("Cue preset");
		expect(text).not.toContain("Cue density");
		expect(text).not.toContain("Question style");
		expect(text).not.toContain("Generate cue supports");
		expect(text).not.toContain("system prompt");
		const select = tab.containerEl.querySelector<HTMLSelectElement>(
			'[data-setting-name="Question type"] select'
		);
		expect([...select!.options].map((option) => option.textContent)).toEqual(
			QUESTION_TYPES.map((type) => type.label)
		);

		const advanced = tab.containerEl.querySelector<HTMLDetailsElement>(
			".cuecraft-generation-advanced"
		)!;
		const disclosure = advanced.querySelector("summary")!;
		expect(advanced.open).toBe(false);
		expect(disclosure.getAttribute("aria-expanded")).toBe("false");
		expect(disclosure.getAttribute("aria-controls")).toBe(
			"cuecraft-generation-instructions"
		);
		const section = advanced.querySelector<HTMLTextAreaElement>(
			'textarea[aria-label="Section cue instructions"]'
		)!;
		const brief = advanced.querySelector<HTMLTextAreaElement>(
			'textarea[aria-label="Note Brief instructions"]'
		)!;
		expect(section.readOnly).toBe(true);
		expect(brief.readOnly).toBe(true);
		expect(section.value).toBe(
			buildSectionCueInstructionsTemplate(plugin.settings.questionType, "single")
		);
		expect(brief.value).toBe(buildNoteBriefInstructionsTemplate());
		expect(section.value).toContain("{{section_content}}");
		expect(brief.value).toContain("{{full_note_source}}");
		advanced.open = true;
		advanced.dispatchEvent(new window.Event("toggle"));
		expect(disclosure.getAttribute("aria-expanded")).toBe("true");
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(plugin.noteCueSettingsChanged).not.toHaveBeenCalled();
	});

	it("uses the selected provider route in Section cue instructions", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.byok.selectedProvider = "codex-cli";
		tab.display();
		openSettingsCard(tab, "Cue Generation");

		const section = tab.containerEl.querySelector<HTMLTextAreaElement>(
			'textarea[aria-label="Section cue instructions"]'
		)!;
		expect(section.value).toBe(
			buildSectionCueInstructionsTemplate(plugin.settings.questionType, "batch")
		);
		expect(section.value).toContain("{{section_list}}");
	});

	it("updates Question type explanation and template before save completes", async () => {
		const { tab, plugin } = await setupSettingsTab();
		let finishSave: (() => void) | undefined;
		plugin.saveSettings.mockImplementationOnce(
			() => new Promise<void>((resolve) => { finishSave = resolve; })
		);
		tab.display();
		openSettingsCard(tab, "Cue Generation");

		const change = changeDropdown(tab.containerEl, "Question type", "exam-practice");
		await vi.waitFor(() => expect(plugin.saveSettings).toHaveBeenCalledTimes(1));
		expect(plugin.noteCueSettingsChanged).toHaveBeenCalledTimes(1);
		expect(settingText(tab.containerEl)).toContain("Uses precise wording similar to an exam prompt.");
		expect(settingText(tab.containerEl)).toContain("newly generated or regenerated Questions only");
		expect(settingText(tab.containerEl)).toContain("does not directly guide Summary, Terms, or Note Brief");
		expect(settingText(tab.containerEl)).toContain("Cached Questions change only after regeneration");
		expect(
			tab.containerEl.querySelector<HTMLTextAreaElement>(
				'textarea[aria-label="Section cue instructions"]'
			)?.value
		).toBe(buildSectionCueInstructionsTemplate("exam-practice", "single"));

		finishSave?.();
		await change;
	});
});
