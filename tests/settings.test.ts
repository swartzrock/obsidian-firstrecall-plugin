import { JSDOM } from "jsdom";
import * as obsidian from "obsidian";
import { Setting, type SettingDefinition, type SettingDefinitionItem } from "obsidian";
import { beforeEach, describe, it, expect, vi, type Mock } from "vitest";
import {
	AUTO_GENERATION_SETTLE_DELAY_SECONDS_OPTIONS,
	DEFAULT_AUTO_GENERATION_SETTLE_DELAY_SECONDS,
	formatAutoGenerationSettleDelayLabel,
	normalizeAutoGenerationSettleDelaySeconds,
} from "../src/auto-generation-delay";
import {
	DEFAULT_EDITOR_CUE_DISPLAY,
	EDITOR_CUE_DISPLAY_OPTIONS,
	isEditorCueDisplay,
} from "../src/editor-cue-display";
import { DEFAULT_SHOW_NOTE_BRIEF } from "../src/review-surfaces";
import {
	buildSectionCueInstructionsTemplate,
} from "../src/cue-instructions";
import { buildNoteBriefInstructionsTemplate } from "../src/study-material-instructions";
import { QUESTION_TYPES } from "../src/cue-generation";
import {
	byokProviderDefinition,
	firstRecallProviderDefinitions,
	type FirstRecallProviderDefinition,
} from "../src/byok-provider-metadata";

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

	class MockModal {
		readonly contentEl: HTMLElement;

		constructor(_app: unknown) {
			this.contentEl = document.createElement("div");
			this.contentEl.className = "modal-content";
		}

		open(): void {
			document.body.appendChild(this.contentEl);
			(this as MockModal & { onOpen?: () => void }).onOpen?.();
		}

		close(): void {
			this.contentEl.remove();
			(this as MockModal & { onClose?: () => void }).onClose?.();
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

	return {
		App: class {},
		requireApiVersion: (_version: string) => false,
		Modal: MockModal,
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
type FirstRecallSettingTab = import("../src/settings").FirstRecallSettingTab;
type FirstRecallSettings = import("../src/settings").FirstRecallSettings;

let settingsModulePromise: Promise<SettingsModule> | undefined;

function loadSettingsModule(): Promise<SettingsModule> {
	settingsModulePromise ??= import("../src/settings");
	return settingsModulePromise;
}

type MockPlugin = {
	settings: FirstRecallSettings;
	saveSettings: Mock<() => Promise<void>>;
	refreshEditorCues: ReturnType<typeof vi.fn>;
	refreshReadingModeSurface: ReturnType<typeof vi.fn>;
	noteCueSettingsChanged: ReturnType<typeof vi.fn>;
	promptForCueSettingsRegeneration: ReturnType<typeof vi.fn>;
	isProviderConfigured: ReturnType<typeof vi.fn>;
	secureCredentialStorageStatus: ReturnType<typeof vi.fn>;
	isProviderCredentialSaved: ReturnType<typeof vi.fn>;
	saveCloudProviderCredential: ReturnType<typeof vi.fn>;
	clearCloudProviderCredential: ReturnType<typeof vi.fn>;
	createStudyArea: Mock<(parentPath: string) => Promise<FirstRecallSettings["studyAreas"][number] | null>>;
	updateStudyArea: ReturnType<typeof vi.fn>;
	removeStudyArea: ReturnType<typeof vi.fn>;
	recoverDisabledStudyArea: ReturnType<typeof vi.fn>;
	previewStudyArea: Mock<() => Promise<unknown>>;
	runStudyArea: Mock<() => Promise<unknown>>;
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

async function setupSettingsTab(opts: {
	providerConfigured?: boolean;
	loadedFiles?: Array<{ path: string; extension?: string; folder?: boolean }>;
} = {}): Promise<{
	tab: FirstRecallSettingTab;
	plugin: MockPlugin;
}> {
	const { FirstRecallSettingTab, DEFAULT_SETTINGS } = await loadSettingsModule();
	const dom = new JSDOM("<div id=\"root\"></div>");
	globalThis.window = dom.window as unknown as typeof globalThis.window;
	globalThis.document = dom.window.document;
	globalThis.HTMLElement = dom.window.HTMLElement;
	Object.assign(globalThis, {
		activeDocument: dom.window.document,
		createEl: (tag: string, options: DomCreateOptions = {}) => {
			const wrapper = dom.window.document.createElement("div");
			return appendElement(wrapper, tag, options);
		},
	});

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
		isProviderConfigured: vi.fn(() => opts.providerConfigured ?? false),
		secureCredentialStorageStatus: vi.fn(() => ({ ok: true })),
		isProviderCredentialSaved: vi.fn(() => false),
		saveCloudProviderCredential: vi.fn(async () => ({ ok: true })),
		clearCloudProviderCredential: vi.fn(async () => ({ ok: true })),
		createStudyArea: vi.fn(async () => null),
		updateStudyArea: vi.fn(async (
			area: FirstRecallSettings["studyAreas"][number]
		) => {
			plugin.settings.studyAreas = plugin.settings.studyAreas.map((current) =>
				current.id === area.id ? area : current
			);
		}),
		removeStudyArea: vi.fn(async () => undefined),
		recoverDisabledStudyArea: vi.fn(async () => undefined),
		previewStudyArea: vi.fn(async () => ({
			mode: "backfill",
			readiness: [],
			counts: { ready: 0, uncued: 0, stale: 0, failed: 0, skipped: 0 },
			items: [],
		})),
		runStudyArea: vi.fn(async () => ({
			total: 0,
			completed: 0,
			failed: 0,
			skipped: 0,
			remaining: 0,
			canceled: false,
		})),
		registerDomEvent: (el, type, handler) => {
			el.addEventListener(type, handler);
		},
	};
	const app = {
		vault: {
			getName: () => "FirstRecall",
			getAllLoadedFiles: () =>
				(opts.loadedFiles ?? []).map((file) =>
					file.folder ? { path: file.path, children: [] } : file
				),
		},
	};
	const tab = new FirstRecallSettingTab(app as never, plugin as never);
	return { tab, plugin };
}

function settingText(containerEl: HTMLElement): string {
	return containerEl.textContent ?? "";
}

function openSettingsCard(tab: FirstRecallSettingTab, label: string): void {
	const card = [...tab.containerEl.querySelectorAll<HTMLElement>(
		".firstrecall-settings-nav-card"
	)].find((candidate) =>
		candidate.querySelector(".setting-item-name")?.textContent === label
	);
	if (!card) throw new Error(`Missing settings card: ${label}`);
	card.click();
}

function providerPathButton(
	containerEl: HTMLElement,
	label: string
): HTMLButtonElement {
	const button = [...containerEl.querySelectorAll<HTMLButtonElement>(
		".firstrecall-provider-path-button"
	)].find((candidate) => candidate.textContent === label);
	if (!button) throw new Error(`Missing provider path: ${label}`);
	return button;
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

async function clickButton(button: HTMLButtonElement): Promise<void> {
	const mockButton = button as HTMLButtonElement & {
		__onClick?: () => void | Promise<void>;
	};
	if (mockButton.__onClick) {
		await mockButton.__onClick();
	} else {
		button.click();
		await Promise.resolve();
	}
}

function dropdownWithValues(
	containerEl: HTMLElement,
	values: readonly string[]
): HTMLSelectElement {
	const dropdown = [...containerEl.querySelectorAll<HTMLSelectElement>("select")]
		.find((candidate) =>
			[...candidate.options].map((option) => option.value).join("\0") ===
			values.join("\0")
		);
	if (!dropdown) throw new Error(`Missing dropdown with values: ${values.join(", ")}`);
	return dropdown;
}

function studyArea(overrides: Record<string, unknown> = {}) {
	return {
		id: "biology",
		name: "Biology",
		parentPath: "Courses/Biology",
		excludedPaths: [],
		maintenanceMode: "paused" as const,
		createdAt: "2026-08-18T00:00:00.000Z",
		...overrides,
	};
}

function studyAreaPlan(overrides: Record<string, unknown> = {}) {
	return {
		mode: "backfill" as const,
		readiness: [],
		counts: { ready: 0, uncued: 0, stale: 0, failed: 0, skipped: 0 },
		items: [],
		...overrides,
	};
}

async function clickThumbnail(
	containerEl: HTMLElement,
	optionId: string
): Promise<void> {
	const button = containerEl.querySelector<HTMLButtonElement>(
		`[data-option-id="${optionId}"]`
	);
	if (!button) throw new Error(`Missing thumbnail option: ${optionId}`);
	button.click();
	await Promise.resolve();
}

describe("settings defaults", () => {
	it("uses visible navigation text without redundant hover labels", async () => {
		const { tab } = await setupSettingsTab();
		tab.display();

		const cards = [...tab.containerEl.querySelectorAll<HTMLElement>(
			".firstrecall-settings-nav-card"
		)];
		expect(cards).toHaveLength(3);
		expect(cards.every((card) => !card.hasAttribute("aria-label"))).toBe(true);
	});

	it("does not choose models for providers", async () => {
		const { DEFAULT_SETTINGS } = await loadSettingsModule();

		expect(
			Object.values(DEFAULT_SETTINGS.byok.providers).every(
				(provider) => provider?.model === ""
			)
		).toBe(true);
	});

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

	it("uses one recall-question style and canonical content visibility defaults", async () => {
		const { DEFAULT_SETTINGS } = await loadSettingsModule();

		expect(DEFAULT_SETTINGS).toMatchObject({
			byok: { selectedProvider: "hosted-demo" },
			questionType: "exam-practice",
			requestsPerTenSeconds: 5,
			showNoteBrief: true,
			showSummary: true,
			showQuestion: true,
			showTerms: true,
		});
	});

	it("defaults a clean install to the hosted trial with accessible connection controls", async () => {
		const { tab, plugin } = await setupSettingsTab();
		tab.display();
		openSettingsCard(tab, "AI model");

		const group = [...tab.containerEl.querySelectorAll<HTMLElement>('[role="group"]')]
			.find((candidate) => candidate.querySelector('button[aria-expanded]'))!;
		const labelledBy = group.getAttribute("aria-labelledby");
		expect(labelledBy).toBeTruthy();
		expect(tab.containerEl.querySelector(`#${labelledBy}`)).not.toBeNull();
		const pathButtons = [
			...group.querySelectorAll<HTMLButtonElement>('button[aria-expanded][aria-controls]'),
		];
		expect(pathButtons).toHaveLength(
			new Set(firstRecallProviderDefinitions().map(({ credentialKind }) => credentialKind)).size
		);
		for (const button of pathButtons) {
			const descriptionId = button.getAttribute("aria-describedby");
			const descriptionEl = descriptionId
				? tab.containerEl.querySelector<HTMLElement>(`#${descriptionId}`)
				: null;
			expect(button.hasAttribute("aria-label")).toBe(false);
			expect(button.textContent?.trim()).toBeTruthy();
			expect(descriptionEl).not.toBeNull();
			expect(button.contains(descriptionEl)).toBe(false);
			expect(button.getAttribute("aria-expanded")).toBe(
				button.textContent === "Simonides hosted AI trial" ? "true" : "false"
			);
			expect(button.getAttribute("aria-controls")).toBeTruthy();
		}
		expect(tab.containerEl.querySelectorAll('[role="radio"]')).toHaveLength(0);
		expect(plugin.settings.byok.selectedProvider).toBe("hosted-demo");
		expect(plugin.saveSettings).not.toHaveBeenCalled();
	});

	it("reveals each provider kind without selecting a provider", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.byok.selectedProvider = null;
		tab.display();
		openSettingsCard(tab, "AI model");
		const definitions = firstRecallProviderDefinitions();
		const expectedGroups = ["api-key", "command", "url"]
			.map((kind) => definitions
				.filter((definition) => definition.credentialKind === kind)
				.map((definition) => definition.id)
				.sort())
			.sort((left, right) => left.join().localeCompare(right.join()));
		const group = [...tab.containerEl.querySelectorAll<HTMLElement>('[role="group"]')]
			.find((candidate) => candidate.querySelector('button[aria-expanded]'))!;
		const buttons = [...group.querySelectorAll<HTMLButtonElement>('button[aria-expanded][aria-controls]')];
		const repeatedControlId = [...new Set(buttons.map((button) => button.getAttribute("aria-controls")))]
			.find((id) => buttons.filter((button) => button.getAttribute("aria-controls") === id).length > 1);
		const observedGroups: string[][] = [];

		for (const button of buttons.filter((candidate) => candidate.getAttribute("aria-controls") === repeatedControlId)) {
			button.click();
			const radios = [
				...tab.containerEl.querySelectorAll<HTMLElement>(
					"[role='radiogroup'] [role='radio'][data-provider]"
				),
			];
			observedGroups.push(radios.map((radio) => radio.dataset.provider!).sort());
			expect(radios.every((radio) => !radio.hasAttribute("aria-label"))).toBe(true);
			for (const radio of radios) {
				const definition = firstRecallProviderDefinitions().find(
					(candidate) => candidate.id === radio.dataset.provider
				)!;
				const labelledBy = radio.getAttribute("aria-labelledby")!;
				expect(tab.containerEl.querySelector(`#${labelledBy}`)?.textContent).toBe(
					definition.label
				);
			}
			expect(
				buttons.filter((candidate) => candidate.getAttribute("aria-expanded") === "true")
			).toEqual([button]);
		}

		expect(observedGroups.sort((left, right) => left.join().localeCompare(right.join())))
			.toEqual(expectedGroups);
		expect(plugin.settings.byok.selectedProvider).toBeNull();
		expect(plugin.saveSettings).not.toHaveBeenCalled();
	});

	it("selects the hosted trial without requiring setup fields", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.byok.selectedProvider = null;
		tab.display();
		openSettingsCard(tab, "AI model");

		const group = [...tab.containerEl.querySelectorAll<HTMLElement>('[role="group"]')]
			.find((candidate) => candidate.querySelector('button[aria-expanded]'))!;
		const pathButtons = [...group.querySelectorAll<HTMLButtonElement>('button[aria-expanded][aria-controls]')];
		const hostedButton = pathButtons.find((button) =>
			pathButtons.filter((candidate) => candidate.getAttribute("aria-controls") === button.getAttribute("aria-controls")).length === 1
		)!;
		hostedButton.click();
		await vi.waitFor(() =>
			expect(plugin.settings.byok.selectedProvider).toBe("hosted-demo")
		);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		expect(tab.containerEl.querySelectorAll('[role="radio"]')).toHaveLength(0);
		expect(tab.containerEl.querySelector('input[type="password"]')).toBeNull();
		expect(tab.containerEl.querySelector('[role="combobox"]')).toBeNull();
		expect(plugin.settings.byok.providers).not.toHaveProperty("hosted-demo");
	});

	it("introduces Simonides and links to more information", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.byok.selectedProvider = "hosted-demo";
		tab.display();
		openSettingsCard(tab, "AI model");

		const hostedOption = [...tab.containerEl.querySelectorAll<HTMLElement>(
			".firstrecall-provider-path-option"
		)].find((option) => option.querySelector("button")?.textContent ===
			"Simonides hosted AI trial");
		expect(
			hostedOption?.querySelector(".firstrecall-provider-path-description")
				?.textContent
		).toBe("Generate study materials without an API key.");

		const trialCopy = tab.containerEl.querySelector<HTMLElement>(
			".firstrecall-hosted-trial-copy"
		);
		expect([...trialCopy!.querySelectorAll("p")].map((paragraph) =>
			paragraph.textContent
		)).toEqual([
			"Simonides is FirstRecall's hosted AI service. It uses your note content to generate study materials.",
			"Free during the trial. Usage and capacity limits apply.",
			"Simonides processes your note content transiently without intentionally writing it to its application database, analytics dataset, request logs, or AI Gateway payload logs, and does not use it to train its own models. Privacy policy",
		]);
		const infoLink = tab.containerEl.querySelector<HTMLAnchorElement>(
			'.firstrecall-hosted-trial-copy > a[href="https://simonides.ai/"]'
		);
		expect(infoLink?.textContent).toBe("Learn more about Simonides");
		const privacyLink = tab.containerEl.querySelector<HTMLAnchorElement>(
			'.firstrecall-hosted-trial-copy a[href="https://simonides.ai/privacy"]'
		);
		expect(privacyLink?.textContent).toBe("Privacy policy");
	});

	it("uses the Simonides logo for the hosted trial", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.byok.selectedProvider = "hosted-demo";
		tab.display();
		openSettingsCard(tab, "AI model");

		const hostedLogo = tab.containerEl.querySelector<HTMLImageElement>(
			'.firstrecall-provider-icon[data-provider="hosted-demo"] img'
		);
		expect(hostedLogo?.alt).toBe("");
		expect(hostedLogo?.getAttribute("src")).toMatch(
			/^(?:data:image\/png;base64,|\/src\/assets\/simonides-logo\.png)$/
		);
	});

	it("locks the trial rate and restores the editable rate when switching providers", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.requestsPerTenSeconds = 20;
		tab.display();
		openSettingsCard(tab, "AI model");
		const requestRate = () => dropdownWithValues(tab.containerEl, ["1", "5", "10", "20"]);

		expect(requestRate().value).toBe("1");
		expect(requestRate().disabled).toBe(true);

		providerPathButton(tab.containerEl, "API key").click();
		tab.containerEl.querySelector<HTMLButtonElement>('[data-provider="openai"][role="radio"]')!.click();
		await vi.waitFor(() => expect(requestRate().disabled).toBe(false));
		expect(requestRate().value).toBe("20");
		const editableRate = requestRate() as HTMLSelectElement & {
			__onChange: (value: string) => Promise<void>;
		};
		await editableRate.__onChange("10");
		expect(plugin.settings.requestsPerTenSeconds).toBe(10);

		providerPathButton(tab.containerEl, "Simonides hosted AI trial").click();
		await vi.waitFor(() => expect(requestRate().disabled).toBe(true));
		expect(requestRate().value).toBe("1");
	});

	it("restores an existing provider route and rate-limit value", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.byok.selectedProvider = "codex-cli";
		tab.display();
		openSettingsCard(tab, "AI model");

		const selectedProvider = tab.containerEl.querySelector<HTMLElement>(
			'[role="radio"][data-provider="codex-cli"]'
		);
		expect(selectedProvider?.getAttribute("aria-checked")).toBe("true");
		const connectionGroup = [...tab.containerEl.querySelectorAll<HTMLElement>('[role="group"]')]
			.find((candidate) => candidate.querySelector('button[aria-expanded="true"]'));
		expect(connectionGroup).toBeDefined();
		const requestRate = [...tab.containerEl.querySelectorAll<HTMLSelectElement>("select")]
			.find((select) => [...select.options].map((option) => option.value).join() === "1,5,10,20");
		expect(requestRate?.value).toBe("5");
		expect([...(requestRate?.options ?? [])].map((option) => option.value)).toEqual([
			"1", "5", "10", "20",
		]);
	});

	it("hides mismatched setup without losing provider input or focus", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.byok.selectedProvider = "anthropic";
		document.body.appendChild(tab.containerEl);
		tab.display();
		openSettingsCard(tab, "AI model");
		const setupPanel = tab.containerEl.querySelector<HTMLElement>(
			".firstrecall-active-provider-panel"
		)!;
		const performanceControl = tab.containerEl.querySelector<HTMLInputElement>(
			'[data-setting-name="Parallel requests"] input'
		)!;
		const apiKeyInput = setupPanel.querySelector<HTMLInputElement>(
			".firstrecall-api-key-input"
		) as HTMLInputElement & { __onChange?: (value: string) => void };
		apiKeyInput.value = "sk-ant-unsaved";
		apiKeyInput.__onChange?.(apiKeyInput.value);
		const installedButton = providerPathButton(tab.containerEl, "Terminal apps");
		installedButton.focus();
		installedButton.click();

		expect(document.activeElement).toBe(installedButton);
		expect(tab.containerEl.querySelector(".firstrecall-active-provider-panel")).toBe(
			setupPanel
		);
		expect(setupPanel.hidden).toBe(true);
		expect(tab.containerEl.querySelector(".firstrecall-api-key-input")).toBe(
			apiKeyInput
		);
		expect(
			setupPanel.querySelector(".firstrecall-active-provider-title")?.textContent
		).toBe("Anthropic (Claude)");
		expect(apiKeyInput.value).toBe("sk-ant-unsaved");
		expect(
			tab.containerEl.querySelector('[data-setting-name="Parallel requests"] input')
		).toBe(performanceControl);
		expect(
			[...tab.containerEl.querySelectorAll('[role="radio"]')].every(
				(radio) => radio.getAttribute("aria-checked") === "false"
			)
		).toBe(true);
		expect(plugin.settings.byok.selectedProvider).toBe("anthropic");
		expect(plugin.saveSettings).not.toHaveBeenCalled();

		const firstRadio = tab.containerEl.querySelector('[role="radio"]');
		installedButton.click();
		expect(tab.containerEl.querySelector('[role="radio"]')).toBe(firstRadio);

		const apiButton = providerPathButton(tab.containerEl, "API key");
		apiButton.click();
		expect(setupPanel.hidden).toBe(false);
		expect(tab.containerEl.querySelector(".firstrecall-active-provider-panel")).toBe(
			setupPanel
		);
		expect(tab.containerEl.querySelector(".firstrecall-api-key-input")).toBe(
			apiKeyInput
		);
		expect(apiKeyInput.value).toBe("sk-ant-unsaved");
		expect(
			tab.containerEl.querySelector(
				'[role="radio"][data-provider="anthropic"]'
			)?.getAttribute("aria-checked")
		).toBe("true");
		expect(plugin.settings.byok.selectedProvider).toBe("anthropic");
		expect(plugin.saveSettings).not.toHaveBeenCalled();
	});

	it("links a cloud credential field to the selected provider's API key guide", async () => {
		const { tab, plugin } = await setupSettingsTab();
		const definition = byokProviderDefinition("anthropic");
		tab.display();
		openSettingsCard(tab, "AI model");
		providerPathButton(tab.containerEl, "API key").click();
		tab.containerEl
			.querySelector<HTMLButtonElement>('[role="radio"][data-provider="anthropic"]')
			?.click();

		await vi.waitFor(() =>
			expect(plugin.settings.byok.selectedProvider).toBe("anthropic")
		);
		const apiKeyInput = tab.containerEl.querySelector<HTMLInputElement>(
			".firstrecall-api-key-input"
		) as HTMLInputElement & { __onChange?: (value: string) => void };
		const eye = tab.containerEl.querySelector<HTMLButtonElement>(
			".firstrecall-key-eye"
		)!;
		expect(eye.hasAttribute("aria-label")).toBe(false);
		const eyeLabelledBy = eye.getAttribute("aria-labelledby")!;
		expect(tab.containerEl.querySelector(`#${eyeLabelledBy}`)?.textContent).toBe(
			"Show typed API key"
		);
		apiKeyInput.value = "sk-ant-replacement";
		apiKeyInput.__onChange?.(apiKeyInput.value);
		eye.click();
		expect(apiKeyInput.type).toBe("text");
		expect(tab.containerEl.querySelector(`#${eyeLabelledBy}`)?.textContent).toBe(
			"Hide typed API key"
		);
		const link = [...tab.containerEl.querySelectorAll<HTMLAnchorElement>("a")]
			.find((candidate) => candidate.href === definition.credentialField.helpUrl);
		expect(link).toBeDefined();
	});

	it("renders every provider icon with real paint", async () => {
		const { tab, plugin } = await setupSettingsTab();
		const definitions = firstRecallProviderDefinitions();
		const expectedProviderIds = new Set(
			definitions.map((definition) => definition.id)
		);
		const trialProvider = definitions.find(
			(definition) => definition.credentialKind === "trial"
		)!;
		const renderedProviderIds = new Set<string>();
		tab.display();
		openSettingsCard(tab, "AI model");

		const pathButtons = [
			...tab.containerEl.querySelectorAll<HTMLButtonElement>(
				'[role="group"] button[aria-expanded][aria-controls]'
			),
		];
		const controlUsage = new Map<string, number>();
		for (const button of pathButtons) {
			const controls = button.getAttribute("aria-controls") ?? "";
			controlUsage.set(controls, (controlUsage.get(controls) ?? 0) + 1);
		}
		pathButtons.sort((left, right) => {
			const leftCount = controlUsage.get(left.getAttribute("aria-controls") ?? "") ?? 0;
			const rightCount = controlUsage.get(right.getAttribute("aria-controls") ?? "") ?? 0;
			return rightCount - leftCount;
		});

		for (const button of pathButtons) {
			button.click();
			if ((controlUsage.get(button.getAttribute("aria-controls") ?? "") ?? 0) === 1) {
				await vi.waitFor(() =>
					expect(plugin.settings.byok.selectedProvider).toBe(trialProvider.id)
				);
			}
			const icons = [
				...tab.containerEl.querySelectorAll<HTMLElement>(
					".firstrecall-provider-icon[data-provider]"
				),
			];
			expect(icons.length).toBeGreaterThan(0);
			for (const iconEl of icons) {
				renderedProviderIds.add(iconEl.dataset.provider!);
				const svg = iconEl.querySelector("svg");
				const image = iconEl.querySelector("img");
				if (svg) {
					const paths = [...svg.querySelectorAll("path")];
					expect(paths.length).toBeGreaterThan(0);
					expect(paths.every((path) => Boolean(path.getAttribute("d")))).toBe(true);
				} else if (image) {
					expect(image.getAttribute("src")).toMatch(
						/^(?:data:image\/(?:svg\+xml|png;base64),|\/src\/assets\/simonides-logo\.png)$/
					);
				} else {
					expect(iconEl.dataset.icon).toBeTruthy();
				}
			}
		}

		expect(renderedProviderIds).toEqual(expectedProviderIds);
	});

	it("gives duplicate gradient icons unique ids so two instances on the page don't collide", async () => {
		// Google's Gemini icon uses three gradient fills. In the real settings page it's
		// rendered once in the provider list and once more in the active-provider header
		// when it's selected; exercise that directly against the icon renderer rather than
		// through the full credential-settings render tree.
		const { tab } = await setupSettingsTab();
		const renderer = tab as unknown as {
			renderProviderIcon(
				containerEl: HTMLElement,
				definition: FirstRecallProviderDefinition
			): void;
		};
		const definition = byokProviderDefinition("google");
		const first = document.createElement("div");
		const second = document.createElement("div");
		renderer.renderProviderIcon(first, definition);
		renderer.renderProviderIcon(second, definition);

		const gradientIds = [
			...first.querySelectorAll("linearGradient"),
			...second.querySelectorAll("linearGradient"),
		].map((el) => el.getAttribute("id") ?? "");
		expect(gradientIds).toHaveLength(6);
		expect(new Set(gradientIds).size).toBe(6);

		// Every gradient-filled path resolves to a gradient id defined in its own instance.
		for (const container of [first, second]) {
			for (const path of container.querySelectorAll("path[fill^='url(#']")) {
				const fillId = path.getAttribute("fill")?.slice(5, -1) ?? "";
				expect(container.querySelector(`[id="${fillId}"]`)).not.toBeNull();
			}
		}
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

	it("defaults the editor section card layout to Cornell", () => {
		expect(DEFAULT_EDITOR_CUE_DISPLAY).toBe("cornell");
	});

	it("defaults the Note Brief to visible", () => {
		expect(DEFAULT_SHOW_NOTE_BRIEF).toBe(true);
	});

	it("validates persisted editor cue display values", () => {
		for (const option of EDITOR_CUE_DISPLAY_OPTIONS) {
			expect(isEditorCueDisplay(option.id)).toBe(true);
		}
		for (const bad of ["", "retired-layout", null, 1, {}]) {
			expect(isEditorCueDisplay(bad)).toBe(false);
		}
	});

	it("allows every generated component to be hidden without marking content dirty", async () => {
		const { tab, plugin } = await setupSettingsTab();
		tab.display();
		const labels = [
			"Show Note Brief",
			"Show summary",
			"Show recall question",
			"Show key terms",
		];
		const cards = [...tab.containerEl.querySelectorAll<HTMLElement>(
			".firstrecall-settings-artifact-card"
		)];
		for (const card of cards) {
			expect(card.hasAttribute("aria-label")).toBe(false);
			const labelledBy = card.getAttribute("aria-labelledby");
			expect(labelledBy).toBeTruthy();
			expect(tab.containerEl.querySelector(`#${labelledBy}`)?.textContent).toBeTruthy();
		}

		for (const label of labels) {
			const toggle = tab.containerEl.querySelector<HTMLInputElement>(
				`[data-setting-name="${label}"] [data-control="toggle"]`
			)!;
			expect(toggle.hasAttribute("aria-label")).toBe(false);
			const labelledBy = toggle.getAttribute("aria-labelledby");
			expect(labelledBy).toBeTruthy();
			expect(tab.containerEl.querySelector(`#${labelledBy}`)?.textContent).toBe(
				label
			);
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

	it("keeps section card layout Editing-only and study text size shared", async () => {
		const { tab, plugin } = await setupSettingsTab();
		tab.display();

		await clickThumbnail(tab.containerEl, "inline-cues");
		expect(plugin.settings.editorCueDisplay).toBe("inline-cues");
		expect(plugin.saveSettings).toHaveBeenLastCalledWith({
			refreshReviewSurfaces: false,
		});
		expect(plugin.refreshEditorCues).toHaveBeenCalledTimes(1);
		expect(plugin.refreshReadingModeSurface).not.toHaveBeenCalled();

		await clickThumbnail(tab.containerEl, "large");
		expect(plugin.settings.cueFontSize).toBe("large");
		expect(plugin.refreshEditorCues).toHaveBeenCalledTimes(2);
		expect(plugin.refreshReadingModeSurface).toHaveBeenCalledTimes(1);
		expect(plugin.noteCueSettingsChanged).not.toHaveBeenCalled();
	});

	it("shows read-only generation templates with an accessible disclosure", async () => {
		const { tab, plugin } = await setupSettingsTab();
		tab.display();
		openSettingsCard(tab, "Generation");

		const questionTypeIds = QUESTION_TYPES.map((type) => type.id);
		const select = dropdownWithValues(tab.containerEl, questionTypeIds);
		expect([...select.options].map((option) => option.value)).toEqual(
			questionTypeIds
		);

		const advanced = tab.containerEl.querySelector<HTMLDetailsElement>("details")!;
		const disclosure = advanced.querySelector("summary")!;
		expect(advanced.open).toBe(false);
		expect(disclosure.getAttribute("aria-expanded")).toBe("false");
		const controlledId = disclosure.getAttribute("aria-controls");
		expect(controlledId).toBeTruthy();
		expect(advanced.querySelector(`#${controlledId}`)).not.toBeNull();
		const textareas = [...advanced.querySelectorAll<HTMLTextAreaElement>("textarea")];
		for (const textarea of textareas) {
			expect(textarea.hasAttribute("aria-label")).toBe(false);
			const labelledBy = textarea.getAttribute("aria-labelledby");
			expect(labelledBy).toBeTruthy();
			expect(tab.containerEl.querySelector(`#${labelledBy}`)?.textContent).toBeTruthy();
		}
		const section = textareas.find((textarea) => textarea.value.includes("{{section_content}}"))!;
		const brief = textareas.find((textarea) => textarea.value.includes("{{full_note_source}}"))!;
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

	it("uses the selected provider route in section study card instructions", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.byok.selectedProvider = "codex-cli";
		tab.display();
		openSettingsCard(tab, "Generation");

		const section = [...tab.containerEl.querySelectorAll<HTMLTextAreaElement>("textarea")]
			.find((textarea) => textarea.value.includes("{{section_list}}"))!;
		expect(section.value).toBe(
			buildSectionCueInstructionsTemplate(plugin.settings.questionType, "batch")
		);
		expect(section.value).toContain("{{section_list}}");
	});

	it("updates recall-question explanation and template before save completes", async () => {
		const { tab, plugin } = await setupSettingsTab();
		let finishSave: (() => void) | undefined;
		plugin.saveSettings.mockImplementationOnce(
			() => new Promise<void>((resolve) => { finishSave = resolve; })
		);
		tab.display();
		openSettingsCard(tab, "Generation");

		const select = dropdownWithValues(
			tab.containerEl,
			QUESTION_TYPES.map((type) => type.id)
		) as HTMLSelectElement & {
			__onChange?: (value: string) => void | Promise<void>;
		};
		const change = select.__onChange?.("exam-practice") ?? Promise.resolve();
		await vi.waitFor(() => expect(plugin.saveSettings).toHaveBeenCalledTimes(1));
		expect(plugin.noteCueSettingsChanged).toHaveBeenCalledTimes(1);
		expect(plugin.settings.questionType).toBe("exam-practice");
		expect(
			[...tab.containerEl.querySelectorAll<HTMLTextAreaElement>("textarea")]
				.find((textarea) => textarea.value.includes("{{section_content}}"))?.value
		).toBe(buildSectionCueInstructionsTemplate("exam-practice", "single"));

		finishSave?.();
		await change;
	});
});

describe("folders and automatic updates settings", () => {
	it("creates a paused scope, scans it, and never starts generation", async () => {
		const { tab, plugin } = await setupSettingsTab({
			loadedFiles: [
				{ path: "Courses/Biology", folder: true },
				{ path: "Courses/Chemistry", folder: true },
			],
		});
		plugin.createStudyArea.mockImplementationOnce(async (parentPath: string) => {
			const area = studyArea({ parentPath });
			plugin.settings.studyAreas = [area];
			return area;
		});
		tab.display();
		openSettingsCard(tab, "Managed folders");
		const input = tab.containerEl.querySelector<HTMLInputElement>('[role="combobox"]')!;
		input.dispatchEvent(new window.Event("focus"));
		const option = [...tab.containerEl.querySelectorAll<HTMLButtonElement>(
			"[role='option']"
		)].find((candidate) => candidate.textContent === "Courses/Biology")!;
		option.dispatchEvent(
			new window.MouseEvent("mousedown", { bubbles: true, cancelable: true })
		);

		await vi.waitFor(() => expect(plugin.createStudyArea).toHaveBeenCalledWith("Courses/Biology"));
		await vi.waitFor(() => expect(plugin.previewStudyArea).toHaveBeenCalledWith("biology"));
		expect(plugin.settings.studyAreas[0]?.maintenanceMode).toBe("paused");
		expect(plugin.runStudyArea).not.toHaveBeenCalled();
		expect(plugin.updateStudyArea).not.toHaveBeenCalled();
	});

	it("shows excluded and failed scan counts without requiring a provider", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.studyAreas = [studyArea()];
		plugin.previewStudyArea.mockResolvedValueOnce(studyAreaPlan({
			readiness: [
				{ path: "Courses/Biology/Skip.md", readiness: "skipped", reason: "excluded" },
				{ path: "Courses/Biology/Fail.md", readiness: "failed", reason: null },
			],
			counts: { ready: 0, uncued: 0, stale: 0, failed: 1, skipped: 1 },
			items: [{
				path: "Courses/Biology/Fail.md",
				action: "retry-failed-sections",
				sectionIds: ["a"],
				readiness: "failed",
				sectionCount: 1,
			}],
		}) as never);
		tab.display();
		openSettingsCard(tab, "Managed folders");

		await vi.waitFor(() => {
			expect(settingText(tab.containerEl)).toContain("1 note failed · 1 note excluded");
		});
		expect(settingText(tab.containerEl)).toContain("Configure AI model");
		expect(
			tab.containerEl.querySelector<HTMLButtonElement>("button.mod-cta")?.disabled
		).toBe(true);
		expect(plugin.runStudyArea).not.toHaveBeenCalled();
	});

	it("runs explicit catch-up once and reports partial failure", async () => {
		const { tab, plugin } = await setupSettingsTab({ providerConfigured: true });
		plugin.settings.studyAreas = [studyArea()];
		const plan = studyAreaPlan({
			readiness: [
				{ path: "Courses/Biology/Missing.md", readiness: "uncued", reason: null },
				{ path: "Courses/Biology/Outdated.md", readiness: "stale", reason: null },
				{ path: "Courses/Biology/Failed.md", readiness: "failed", reason: null },
			],
			counts: { ready: 0, uncued: 1, stale: 1, failed: 1, skipped: 0 },
			items: [
				{
					path: "Courses/Biology/Missing.md",
					action: "generate-note",
					sectionIds: [],
					readiness: "uncued",
					sectionCount: 2,
				},
				{
					path: "Courses/Biology/Outdated.md",
					action: "refresh-stale-sections",
					sectionIds: ["old"],
					readiness: "stale",
					sectionCount: 1,
				},
				{
					path: "Courses/Biology/Failed.md",
					action: "retry-failed-sections",
					sectionIds: ["failed"],
					readiness: "failed",
					sectionCount: 1,
				},
			],
		});
		plugin.previewStudyArea.mockResolvedValue(plan as never);
		let finishRun!: (value: unknown) => void;
		plugin.runStudyArea.mockImplementationOnce(
			() => new Promise((resolve) => { finishRun = resolve; })
		);
		tab.display();
		openSettingsCard(tab, "Managed folders");
		await vi.waitFor(() =>
			expect(tab.containerEl.querySelector<HTMLButtonElement>("button.mod-cta")?.disabled).toBe(false)
		);
		const button = tab.containerEl.querySelector<HTMLButtonElement>("button.mod-cta")!;
		button.click();
		button.click();
		await vi.waitFor(() => {
			expect(
				settingText(tab.containerEl).match(/Updating study material\.\.\./g)
			).toHaveLength(1);
		});
		expect(plugin.runStudyArea).toHaveBeenCalledTimes(1);
		expect(plugin.runStudyArea).toHaveBeenCalledWith("biology", "backfill");
		finishRun({ total: 2, completed: 1, failed: 1, skipped: 0, remaining: 0, canceled: false });
		await vi.waitFor(() => {
			expect(settingText(tab.containerEl)).toContain("1 updated · 1 failed");
		});
	});

	it("makes automatic updates future-only", async () => {
		const { tab, plugin } = await setupSettingsTab({ providerConfigured: true });
		plugin.settings.studyAreas = [studyArea()];
		tab.display();
		openSettingsCard(tab, "Managed folders");
		const toggle = tab.containerEl.querySelector<HTMLInputElement>(
			'[data-setting-name="Biology"] [data-control="toggle"]'
		) as HTMLInputElement & { __onChange?: (value: boolean) => Promise<void> };
		expect(toggle.hasAttribute("aria-label")).toBe(false);
		const labelledBy = toggle.getAttribute("aria-labelledby")!;
		expect(tab.containerEl.querySelector(`#${labelledBy}`)?.textContent).toBe(
			"Update automatically for Courses/Biology"
		);
		await toggle.__onChange?.(true);

		expect(plugin.updateStudyArea).toHaveBeenCalledWith(
			expect.objectContaining({ maintenanceMode: "maintain-on-save" })
		);
		expect(plugin.runStudyArea).not.toHaveBeenCalled();
	});

	it("cancels a scan, discards its result, and exposes Scan again", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.studyAreas = [studyArea()];
		let finishScan!: (value: unknown) => void;
		plugin.previewStudyArea.mockImplementationOnce(
			() => new Promise((resolve) => { finishScan = resolve; })
		);
		tab.display();
		openSettingsCard(tab, "Managed folders");
		await vi.waitFor(() => expect(settingText(tab.containerEl)).toContain("Cancel scan"));
		const cancelScan = tab.containerEl.querySelector<HTMLButtonElement>(
			"button.firstrecall-study-area-scan"
		)!;
		expect(cancelScan.hasAttribute("aria-label")).toBe(false);
		const cancelScanLabelledBy = cancelScan.getAttribute("aria-labelledby")!;
		expect(tab.containerEl.querySelector(`#${cancelScanLabelledBy}`)?.textContent).toBe(
			"Cancel scan for Courses/Biology"
		);
		await clickButton(cancelScan);
		expect(settingText(tab.containerEl)).toContain("Scan canceled");
		expect(settingText(tab.containerEl)).toContain("Scan again");
		finishScan(studyAreaPlan({ counts: { ready: 9, uncued: 0, stale: 0, failed: 0, skipped: 0 } }));
		await Promise.resolve();
		expect(settingText(tab.containerEl)).not.toContain("9 notes ready");
		expect(plugin.runStudyArea).not.toHaveBeenCalled();
	});

	it("requires confirmation before removing a managed folder", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.studyAreas = [studyArea({
			name: "Claudes",
			parentPath: "Claudes",
			maintenanceMode: "paused",
		})];
		tab.display();
		openSettingsCard(tab, "Managed folders");
		await vi.waitFor(() => expect(plugin.previewStudyArea).toHaveBeenCalled());

		const removeButton = tab.containerEl.querySelector<HTMLButtonElement>(
			"button.firstrecall-study-area-remove"
		)!;
		expect(removeButton.hasAttribute("aria-label")).toBe(false);
		const removeLabelledBy = removeButton.getAttribute("aria-labelledby")!;
		expect(tab.containerEl.querySelector(`#${removeLabelledBy}`)?.textContent).toBe(
			"Remove Claudes"
		);
		removeButton.click();
		expect(plugin.removeStudyArea).not.toHaveBeenCalled();
		let actions = document.body.querySelector<HTMLElement>(
			".modal-content .firstrecall-modal-actions"
		)!;
		actions.querySelector<HTMLButtonElement>('button[type="button"]')?.click();
		expect(plugin.removeStudyArea).not.toHaveBeenCalled();

		removeButton.click();
		actions = document.body.querySelector<HTMLElement>(
			".modal-content .firstrecall-modal-actions"
		)!;
		const actionButtons = actions.querySelectorAll<HTMLButtonElement>('button[type="button"]');
		actionButtons[actionButtons.length - 1]?.click();
		await vi.waitFor(() => expect(plugin.removeStudyArea).toHaveBeenCalledWith("biology"));
	});

	it("names a legacy conflict and offers direct recovery", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.studyAreas = [studyArea({ id: "parent" })];
		plugin.settings.disabledStudyAreas = [studyArea({
			id: "child",
			name: "Year 1",
			parentPath: "Courses/Biology/Year 1",
			disabledReason: "overlapping-path",
		}) as never];
		tab.display();
		openSettingsCard(tab, "Managed folders");

		const disabledRow = tab.containerEl.querySelector<HTMLElement>(
			'.firstrecall-study-area-row[aria-disabled="true"]'
		)!;
		expect(disabledRow).not.toBeNull();
		await clickButton(disabledRow.querySelector<HTMLButtonElement>("button")!);
		await vi.waitFor(() =>
			expect(plugin.recoverDisabledStudyArea).toHaveBeenCalledWith("child", "parent")
		);
	});

	it("scans without a provider while the gated action opens AI setup", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.studyAreas = [studyArea()];
		tab.display();
		openSettingsCard(tab, "Managed folders");
		await vi.waitFor(() => expect(plugin.previewStudyArea).toHaveBeenCalled());
		expect(plugin.runStudyArea).not.toHaveBeenCalled();
		const providerSetupButton = tab.containerEl.querySelector<HTMLButtonElement>(
			".firstrecall-study-area-provider-setup button"
		)!;
		await clickButton(providerSetupButton);

		expect(providerSetupButton.isConnected).toBe(false);
		expect(
			tab.containerEl.querySelector(
				'[role="group"] button[aria-expanded][aria-controls]'
			)
		).not.toBeNull();
		expect(
			tab.containerEl.querySelector(".firstrecall-study-area-provider-setup")
		).toBeNull();
	});
});

function searchableEntries(items: SettingDefinitionItem[], pagePath: string[] = []): Array<{
	definition: SettingDefinition;
	pagePath: string[];
}> {
	return items.flatMap((item) => {
		if ("type" in item) {
			return searchableEntries(item.items ?? [], item.type === "page"
				? [...pagePath, item.name]
				: pagePath);
		}
		return [{ definition: item, pagePath }];
	});
}

function renderSearchSection(tab: FirstRecallSettingTab, query: string): Setting {
	const entry = searchableEntries(tab.getSettingDefinitions()).find(({ definition }) =>
		definition.name === query || definition.aliases?.includes(query)
	);
	if (!entry || !("render" in entry.definition) || !entry.definition.render) {
		throw new Error(`No renderable search result for ${query}`);
	}
	tab.containerEl.empty();
	const setting = new Setting(tab.containerEl).setName(entry.definition.name);
	entry.definition.render(setting, {} as never);
	return setting;
}

describe("searchable settings", () => {
	beforeEach(() => vi.restoreAllMocks());
	it("indexes every settings section without rendering, accessing credentials, or scanning the vault", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.studyAreas = [studyArea()];
		const enumerate = vi.spyOn(tab.app.vault, "getAllLoadedFiles");
		const entries = searchableEntries(tab.getSettingDefinitions());
		const terms = entries.flatMap(({ definition }) => [definition.name, ...(definition.aliases ?? [])]);
		expect(terms).toEqual(expect.arrayContaining([
			"API key", "Custom model ID", "Parallel requests", "API Rate limit",
			"Recall question style", "Note Brief instructions", "Automatic update delay",
			"Show Note Brief", "Show summary", "Show recall question", "Show key terms",
			"Section card layout", "Study text size", "Study Mode hide style",
		]));
		expect(entries.find(({ definition }) => definition.aliases?.includes("API key"))?.pagePath).toEqual(["AI model"]);
		expect(entries.find(({ definition }) => definition.aliases?.includes("Automatic update delay"))?.pagePath).toEqual(["Managed folders"]);
		expect(tab.containerEl.childElementCount).toBe(0);
		expect(enumerate).not.toHaveBeenCalled();
		expect(plugin.previewStudyArea).not.toHaveBeenCalled();
		expect(plugin.isProviderCredentialSaved).not.toHaveBeenCalled();
		expect(plugin.saveSettings).not.toHaveBeenCalled();
	});

	it("keeps the host search row while saving display controls through the plugin's existing persistence path", async () => {
		const { tab, plugin } = await setupSettingsTab();
		const host = renderSearchSection(tab, "Show summary");
		expect(host.settingEl.parentElement).toBe(tab.containerEl);
		expect(host.settingEl.classList.contains("firstrecall-searchable-settings-section")).toBe(true);
		await changeToggle(host.settingEl, "Show summary", false);
		expect(plugin.settings.showSummary).toBe(false);
		expect(plugin.saveSettings).toHaveBeenCalledWith({ refreshReviewSurfaces: false });
		expect(plugin.refreshEditorCues).toHaveBeenCalledOnce();
		expect(plugin.refreshReadingModeSurface).toHaveBeenCalledOnce();
	});

	it("refreshes native definitions after changing provider instead of calling legacy display", async () => {
		const { tab, plugin } = await setupSettingsTab();
		const legacy = vi.spyOn(tab, "display");
		vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
		tab.update = vi.fn(() => { renderSearchSection(tab, "Provider and model"); });
		renderSearchSection(tab, "API key");
		providerPathButton(tab.containerEl, "API key").click();
		tab.containerEl.querySelector<HTMLButtonElement>('[data-provider="anthropic"]')!.click();
		await vi.waitFor(() => expect(tab.update).toHaveBeenCalled());
		expect(plugin.settings.byok.selectedProvider).toBe("anthropic");
		expect(tab.containerEl.querySelectorAll(".firstrecall-active-provider-panel")).toHaveLength(1);
		expect(tab.containerEl.querySelector(".firstrecall-api-key-input")).not.toBeNull();
		expect(legacy).not.toHaveBeenCalled();
	});

	it("updates native appearance controls and refreshes review surfaces", async () => {
		const { tab, plugin } = await setupSettingsTab();
		vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
		tab.update = vi.fn(() => { renderSearchSection(tab, "Appearance"); });
		renderSearchSection(tab, "Section card layout");
		await clickThumbnail(tab.containerEl.querySelector(".firstrecall-thumbnail-group-editor-display")!, "inline-cues");
		await vi.waitFor(() => expect(tab.update).toHaveBeenCalledOnce());
		expect(plugin.settings.editorCueDisplay).toBe("inline-cues");
		expect(plugin.refreshEditorCues).toHaveBeenCalledOnce();
	});

	it("defers refreshes triggered by a folder scan until the native render finishes", async () => {
		const { tab, plugin } = await setupSettingsTab({ providerConfigured: true });
		plugin.settings.studyAreas = [studyArea()];
		let resolveScan!: (value: ReturnType<typeof studyAreaPlan>) => void;
		plugin.previewStudyArea.mockImplementation(() => new Promise((resolve) => { resolveScan = resolve; }));
		vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
		tab.update = vi.fn(() => { renderSearchSection(tab, "Automatic update delay"); });
		renderSearchSection(tab, "Automatic update delay");
		expect(plugin.previewStudyArea).toHaveBeenCalledOnce();
		expect(tab.update).not.toHaveBeenCalled();
		await Promise.resolve();
		expect(tab.update).toHaveBeenCalledOnce();
		resolveScan(studyAreaPlan());
		await vi.waitFor(() => expect(tab.update).toHaveBeenCalledTimes(2));
		expect(plugin.previewStudyArea).toHaveBeenCalledOnce();
		expect(tab.containerEl.querySelectorAll(".firstrecall-study-area-row")).toHaveLength(1);
	});

	it("opens the native managed-folder page for programmatic navigation", async () => {
		const { tab } = await setupSettingsTab();
		vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
		tab.update = vi.fn();
		const navigateToSearchResult = vi.fn();
		Object.assign(tab.app, { setting: { navigateToSearchResult } });
		tab.openStudyAreas();
		expect(tab.update).toHaveBeenCalledOnce();
		expect(navigateToSearchResult).toHaveBeenCalledWith({ tab, pagePath: ["Managed folders"] });
	});

	it("uses legacy settings below 1.13 even when an update method exists", async () => {
		const { tab } = await setupSettingsTab();
		const update = vi.fn();
		tab.update = update;
		const version = vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(false);
		tab.openStudyAreas();
		expect(version).toHaveBeenCalledWith("1.13.0");
		expect(update).not.toHaveBeenCalled();
		expect(settingText(tab.containerEl)).toContain("Add folder or vault");
	});

	it("continues to navigate and save on hosts without the declarative API", async () => {
		const { tab, plugin } = await setupSettingsTab();
		expect(typeof tab.update).toBe("undefined");
		tab.display();
		await changeToggle(tab.containerEl, "Show Note Brief", false);
		expect(plugin.settings.showNoteBrief).toBe(false);
		tab.openStudyAreas();
		expect(settingText(tab.containerEl)).toContain("Add folder or vault");
	});
});
