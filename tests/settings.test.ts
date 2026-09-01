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
	saveSettings: ReturnType<typeof vi.fn>;
	refreshEditorCues: ReturnType<typeof vi.fn>;
	refreshReadingModeSurface: ReturnType<typeof vi.fn>;
	noteCueSettingsChanged: ReturnType<typeof vi.fn>;
	promptForCueSettingsRegeneration: ReturnType<typeof vi.fn>;
	isProviderConfigured: ReturnType<typeof vi.fn>;
	secureCredentialStorageStatus: ReturnType<typeof vi.fn>;
	isProviderCredentialSaved: ReturnType<typeof vi.fn>;
	saveCloudProviderCredential: ReturnType<typeof vi.fn>;
	clearCloudProviderCredential: ReturnType<typeof vi.fn>;
	createStudyArea: ReturnType<typeof vi.fn>;
	updateStudyArea: ReturnType<typeof vi.fn>;
	removeStudyArea: ReturnType<typeof vi.fn>;
	recoverDisabledStudyArea: ReturnType<typeof vi.fn>;
	previewStudyArea: ReturnType<typeof vi.fn>;
	runStudyArea: ReturnType<typeof vi.fn>;
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

async function clickSettingButton(
	containerEl: HTMLElement,
	label: string
): Promise<void> {
	const button = [...containerEl.querySelectorAll<HTMLButtonElement>("button")]
		.find((candidate) => candidate.textContent === label) as
		| (HTMLButtonElement & { __onClick?: () => void | Promise<void> })
		| undefined;
	if (!button) throw new Error(`Missing button: ${label}`);
	if (button.__onClick) {
		await button.__onClick();
	} else {
		button.click();
		await Promise.resolve();
	}
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
			byok: { selectedProvider: null },
			questionType: "exam-practice",
			requestsPerTenSeconds: 5,
			showNoteBrief: true,
			showSummary: true,
			showQuestion: true,
			showTerms: true,
		});
	});

	it("prompts a clean install to select an AI provider", async () => {
		const { tab, plugin } = await setupSettingsTab();
		tab.display();

		expect(settingText(tab.containerEl)).toContain(
			"Select an AI provider to generate study material"
		);
		openSettingsCard(tab, "AI model");

		expect(settingText(tab.containerEl)).toContain(
			"Select an AI provider to generate study material"
		);
		expect(settingText(tab.containerEl)).toContain(
			"When a provider requires an API key, FirstRecall stores it securely in Obsidian's Secret Storage."
		);
		expect(settingText(tab.containerEl)).toContain("Connection type");
		expect(settingText(tab.containerEl)).not.toContain("Available providers");
		expect(
			tab.containerEl
				.querySelector(".firstrecall-provider-paths")
				?.getAttribute("aria-labelledby")
		).toBe("firstrecall-provider-paths-label");
		expect(
			tab.containerEl.querySelector<HTMLAnchorElement>(
				'a[href="https://docs.obsidian.md/plugins/guides/secret-storage"]'
			)?.textContent
		).toBe("Learn more.");
		const pathButtons = [
			...tab.containerEl.querySelectorAll<HTMLButtonElement>(
				".firstrecall-provider-path-button"
			),
		];
		expect(pathButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
			"FirstRecall LLM trial",
			"API key",
			"Installed tool",
			"Local server",
		]);
		expect(settingText(tab.containerEl)).toContain(
			"Use an API key from Anthropic, OpenAI, Gemini, or another provider."
		);
		expect(settingText(tab.containerEl)).toContain(
			"Use Codex or Claude Code if one is already installed and signed in on this device."
		);
		expect(settingText(tab.containerEl)).toContain(
			"Connect to Ollama or LM Studio running on a model server you control."
		);
		expect(settingText(tab.containerEl)).not.toContain("Browse all providers");
		for (const button of pathButtons) {
			const descriptionId = button.getAttribute("aria-describedby");
			const descriptionEl = descriptionId
				? tab.containerEl.querySelector<HTMLElement>(`#${descriptionId}`)
				: null;
			expect(button.textContent).toBe(button.getAttribute("aria-label"));
			expect(descriptionEl).not.toBeNull();
			expect(button.contains(descriptionEl)).toBe(false);
		}
		expect(
			pathButtons.every(
				(button) => button.getAttribute("aria-expanded") === "false"
			)
		).toBe(true);
		expect(pathButtons[0]?.getAttribute("aria-controls")).toBe(
			"firstrecall-active-provider-panel"
		);
		expect(
			pathButtons
				.slice(1)
				.every(
					(button) =>
						button.getAttribute("aria-controls") === "firstrecall-provider-results"
				)
		).toBe(true);
		expect(tab.containerEl.querySelectorAll('[role="radio"]')).toHaveLength(0);
		expect(
			tab.containerEl.querySelector(".firstrecall-active-provider-panel")
		).toBeNull();
		expect(plugin.settings.byok.selectedProvider).toBeNull();
		expect(plugin.saveSettings).not.toHaveBeenCalled();
	});

	it("reveals multi-provider connection paths in stable order without selecting", async () => {
		const { tab, plugin } = await setupSettingsTab();
		tab.display();
		openSettingsCard(tab, "AI model");
		const definitions = firstRecallProviderDefinitions();
		const scenarios = [
			{ label: "API key", kind: "api-key", count: 11 },
			{ label: "Installed tool", kind: "command", count: 2 },
			{ label: "Local server", kind: "url", count: 2 },
		] as const;

		for (const scenario of scenarios) {
			const button = tab.containerEl.querySelector<HTMLButtonElement>(
				`button[aria-label="${scenario.label}"]`
			)!;
			button.click();
			expect(settingText(tab.containerEl)).toContain("Available providers");
			expect(
				tab.containerEl
					.querySelector(".firstrecall-provider-picker")
					?.getAttribute("aria-labelledby")
			).toBe("firstrecall-provider-options-label");
			const expected = definitions.filter(
				(definition) => definition.credentialKind === scenario.kind
			);
			const radios = [
				...tab.containerEl.querySelectorAll<HTMLElement>(
					"#firstrecall-provider-results [role='radio']"
				),
			];
			expect(radios.map((radio) => radio.getAttribute("aria-label"))).toEqual(
				expected.map((definition) => definition.label)
			);
			expect(radios).toHaveLength(scenario.count);
			expect(
				[...tab.containerEl.querySelectorAll<HTMLButtonElement>(
					".firstrecall-provider-path-button"
				)].filter((candidate) => candidate.getAttribute("aria-expanded") === "true")
			).toEqual([button]);
		}

		expect(plugin.settings.byok.selectedProvider).toBeNull();
		expect(plugin.saveSettings).not.toHaveBeenCalled();
	});

	it("offers the FirstRecall LLM trial first and selects it without setup fields", async () => {
		const { tab, plugin } = await setupSettingsTab();
		tab.display();
		openSettingsCard(tab, "AI model");

		const pathButtons = [
			...tab.containerEl.querySelectorAll<HTMLButtonElement>(
				".firstrecall-provider-path-button"
			),
		];
		expect(pathButtons[0]?.getAttribute("aria-label")).toBe("FirstRecall LLM trial");
		expect(settingText(tab.containerEl)).toContain(
			"trial LLM API"
		);
		pathButtons[0]?.click();
		await vi.waitFor(() =>
			expect(plugin.settings.byok.selectedProvider).toBe("hosted-demo")
		);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		expect(settingText(tab.containerEl)).not.toContain("Available providers");
		expect(tab.containerEl.querySelectorAll('[role="radio"]')).toHaveLength(0);
		expect(settingText(tab.containerEl).match(/FirstRecall trial/g)).toHaveLength(1);
		expect(settingText(tab.containerEl)).toContain("Included trial model");
		expect(tab.containerEl.querySelector(".firstrecall-api-key-input")).toBeNull();
		expect(tab.containerEl.querySelector(".firstrecall-model-setting")).toBeNull();
		expect(settingText(tab.containerEl)).not.toContain("Test connection");
		expect(plugin.settings.byok.providers).not.toHaveProperty("hosted-demo");

		tab.containerEl
			.querySelector<HTMLButtonElement>('[aria-label="Back to settings"]')
			?.click();
		expect(settingText(tab.containerEl)).toContain(
			"FirstRecall trial · Included trial model"
		);
	});

	it("derives the connection path for an existing provider", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.byok.selectedProvider = "codex-cli";
		tab.display();
		openSettingsCard(tab, "AI model");

		expect(
			tab.containerEl.querySelector('button[aria-label="Installed tool"]')
				?.getAttribute("aria-expanded")
		).toBe("true");
		expect(
			tab.containerEl.querySelector(
				'[role="radio"][aria-label="Codex terminal tool"]'
			)
				?.getAttribute("aria-checked")
		).toBe("true");
		expect(settingText(tab.containerEl)).toContain("Codex command");
		expect(settingText(tab.containerEl)).not.toContain("Codex CLI");
		expect(
			tab.containerEl.querySelector(
				'.firstrecall-provider-button[data-provider="codex-cli"] .firstrecall-provider-button-label'
			)?.textContent
		).toBe("Codex (terminal)");
		expect(settingText(tab.containerEl)).toContain("Performance");
		const requestRate = tab.containerEl.querySelector<HTMLSelectElement>(
			'[data-setting-name="API Rate limit"] select'
		);
		expect(requestRate?.value).toBe("5");
		expect(
			[...(requestRate?.options ?? [])].map((option) => [
				option.value,
				option.textContent,
			])
		).toEqual([
			["1", "6/minute"],
			["5", "30/minute (recommended)"],
			["10", "60/minute"],
			["20", "120/minute"],
		]);
		expect(
			tab.containerEl.querySelector(
				'[data-setting-name="API Rate limit"] .setting-item-description'
			)?.textContent
		).toBe("Maximum API request rate.");
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
		const installedButton = tab.containerEl.querySelector<HTMLButtonElement>(
			'button[aria-label="Installed tool"]'
		)!;
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

		const apiButton = tab.containerEl.querySelector<HTMLButtonElement>(
			'button[aria-label="API key"]'
		)!;
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
				'[role="radio"][aria-label="Anthropic (Claude)"]'
			)?.getAttribute("aria-checked")
		).toBe("true");
		expect(plugin.settings.byok.selectedProvider).toBe("anthropic");
		expect(plugin.saveSettings).not.toHaveBeenCalled();
	});

	it("preserves the selected path after provider selection and resets it on hide", async () => {
		const { tab, plugin } = await setupSettingsTab();
		tab.display();
		openSettingsCard(tab, "AI model");
		tab.containerEl
			.querySelector<HTMLButtonElement>('button[aria-label="API key"]')!
			.click();
		tab.containerEl
			.querySelector<HTMLElement>(
				'[role="radio"][aria-label="Anthropic (Claude)"] .firstrecall-provider-button-label'
			)!
			.click();

		await vi.waitFor(() => expect(plugin.settings.byok.selectedProvider).toBe("anthropic"));
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		expect(
			tab.containerEl.querySelector('button[aria-label="API key"]')
				?.getAttribute("aria-expanded")
		).toBe("true");
		expect(tab.containerEl.querySelectorAll('[role="radio"]')).toHaveLength(11);

		tab.hide();
		tab.display();
		openSettingsCard(tab, "AI model");
		expect(
			tab.containerEl.querySelector('button[aria-label="API key"]')
				?.getAttribute("aria-expanded")
		).toBe("true");
		expect(tab.containerEl.querySelectorAll('[role="radio"]')).toHaveLength(11);
	});

	it("links a cloud credential field to the selected provider's API key guide", async () => {
		const { tab, plugin } = await setupSettingsTab();
		const definition = byokProviderDefinition("anthropic");
		tab.display();
		openSettingsCard(tab, "AI model");
		tab.containerEl
			.querySelector<HTMLButtonElement>('button[aria-label="API key"]')
			?.click();
		tab.containerEl
			.querySelector<HTMLButtonElement>('[role="radio"][aria-label="Anthropic (Claude)"]')
			?.click();

		await vi.waitFor(() =>
			expect(plugin.settings.byok.selectedProvider).toBe("anthropic")
		);
		const link = tab.containerEl.querySelector<HTMLAnchorElement>(
			".firstrecall-api-key-setting .setting-item-description a"
		);
		expect(link?.textContent).toBe("How to find your API key");
		expect(link?.href).toBe(definition.credentialField.helpUrl);
	});

	it("renders every provider icon with real paint", async () => {
		const { tab, plugin } = await setupSettingsTab();
		tab.display();
		openSettingsCard(tab, "AI model");
		const providerIds = new Set<string>();
		for (const pathLabel of [
			"FirstRecall LLM trial",
			"API key",
			"Installed tool",
			"Local server",
		]) {
			tab.containerEl
				.querySelector<HTMLButtonElement>(`button[aria-label="${pathLabel}"]`)
				?.click();
			if (pathLabel === "FirstRecall LLM trial") {
				await vi.waitFor(() =>
					expect(plugin.settings.byok.selectedProvider).toBe("hosted-demo")
				);
			}
			const icons = [
				...tab.containerEl.querySelectorAll<HTMLElement>(
					"#firstrecall-provider-results .firstrecall-provider-icon, .firstrecall-active-provider-panel .firstrecall-provider-icon"
				),
			];
			for (const iconEl of icons) {
				// The provider id is exposed via data-provider so CSS can target one icon
				// specifically (e.g. OpenRouter's light-mode contrast fix) without touching
				// the shared renderer.
				const providerId = iconEl.getAttribute("data-provider");
				expect(providerId).toBeTruthy();
				providerIds.add(providerId!);

				const svg = iconEl.querySelector("svg");
				if (!svg) {
					expect(iconEl.dataset.icon).toBeTruthy();
					continue;
				}
				const paths = [...(svg?.querySelectorAll("path") ?? [])];
				expect(paths.length).toBeGreaterThan(0);
				for (const path of paths) {
					expect(path.getAttribute("d")).toBeTruthy();
				}
			}
		}
		expect(providerIds.size).toBe(16);
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
		expect(editorCueDisplayOption(DEFAULT_EDITOR_CUE_DISPLAY).label).toBe(
			"Cornell"
		);
	});

	it("defaults the Note Brief to visible", () => {
		expect(DEFAULT_SHOW_NOTE_BRIEF).toBe(true);
	});

	it("validates persisted editor cue display values", () => {
		expect(EDITOR_CUE_DISPLAY_OPTIONS.map((option) => option.id)).toEqual([
			"cornell",
			"inline-cues",
		]);
		expect(isEditorCueDisplay("cornell")).toBe(true);
		expect(isEditorCueDisplay("inline-cues")).toBe(true);
		for (const bad of [
			"",
			"hook",
			"classic",
			"cornell-exam-prep",
			"cornell-minimal",
			"anchored-card-rail",
			"threaded-margin-notes",
			"collapsed-tabs",
			"active-section-composer",
			"hook-minimap",
			null,
			undefined,
			1,
			{},
		]) {
			expect(isEditorCueDisplay(bad)).toBe(false);
		}
	});
	it("maps main-page controls to visible Note Brief and section card components", async () => {
		const { tab } = await setupSettingsTab();
		tab.display();

		const text = settingText(tab.containerEl);
		expect(text).toContain("Display");
		expect(text).not.toContain("Generated components");
		expect(text).toContain("Appearance");
		expect(text).not.toContain("Editing View");
		expect(text).not.toContain("Note format");
		for (const groupName of ["Note Brief", "Section study card"]) {
			expect(
				tab.containerEl.querySelector(`[role="group"][aria-label="${groupName}"]`)
			).not.toBeNull();
		}
		for (const label of [
			"Show Note Brief",
			"Show summary",
			"Show recall question",
			"Show key terms",
		]) {
			expect(tab.containerEl.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
		}
		expect(text).toContain("Summary");
		expect(text).toContain("Recall question");
		expect(text).toContain("Key terms");
		expect(text).not.toContain("Core idea");
		expect(text).not.toContain("Review first");
		expect(text).not.toContain("Self-test");
		expect(
			tab.containerEl.querySelectorAll(".firstrecall-settings-artifact-part")
		).toHaveLength(0);
	});

	it("allows every generated component to be hidden without marking content dirty", async () => {
		const { tab, plugin } = await setupSettingsTab();
		tab.display();

		for (const label of [
			"Show Note Brief",
			"Show summary",
			"Show recall question",
			"Show key terms",
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

	it("keeps section card layout Editing-only and study text size shared", async () => {
		const { tab, plugin } = await setupSettingsTab();
		tab.display();

		expect(settingText(tab.containerEl)).toContain("Changes section card layout in Editing only; Reading remains inline.");
		expect(settingText(tab.containerEl)).toContain("Applies in Editing and Reading.");
		await clickThumbnail(tab.containerEl, "Section card layout", "inline-cues");
		expect(plugin.saveSettings).toHaveBeenLastCalledWith({
			refreshReviewSurfaces: false,
		});
		expect(plugin.refreshEditorCues).toHaveBeenCalledTimes(1);
		expect(plugin.refreshReadingModeSurface).not.toHaveBeenCalled();

		await clickThumbnail(tab.containerEl, "Study text size", "large");
		expect(plugin.refreshEditorCues).toHaveBeenCalledTimes(2);
		expect(plugin.refreshReadingModeSurface).toHaveBeenCalledTimes(1);
		expect(plugin.noteCueSettingsChanged).not.toHaveBeenCalled();
	});

	it("shows one recall-question style control and exact read-only Advanced templates", async () => {
		const { tab, plugin } = await setupSettingsTab();
		tab.display();
		openSettingsCard(tab, "Generation");

		const text = settingText(tab.containerEl);
		expect(text).toContain("Recall question style");
		expect(text).not.toContain("Automatic update delay");
		const select = tab.containerEl.querySelector<HTMLSelectElement>(
			'[data-setting-name="Recall question style"] select'
		);
		expect([...select!.options].map((option) => option.textContent)).toEqual(
			QUESTION_TYPES.map((type) => type.label)
		);

		const advanced = tab.containerEl.querySelector<HTMLDetailsElement>(
			".firstrecall-generation-advanced"
		)!;
		const disclosure = advanced.querySelector("summary")!;
		expect(advanced.open).toBe(false);
		expect(disclosure.getAttribute("aria-expanded")).toBe("false");
		expect(disclosure.getAttribute("aria-controls")).toBe(
			"firstrecall-generation-instructions"
		);
		const section = advanced.querySelector<HTMLTextAreaElement>(
			'textarea[aria-label="Section study card instructions"]'
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

	it("uses the selected provider route in section study card instructions", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.byok.selectedProvider = "codex-cli";
		tab.display();
		openSettingsCard(tab, "Generation");

		const section = tab.containerEl.querySelector<HTMLTextAreaElement>(
			'textarea[aria-label="Section study card instructions"]'
		)!;
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

		const change = changeDropdown(tab.containerEl, "Recall question style", "exam-practice");
		await vi.waitFor(() => expect(plugin.saveSettings).toHaveBeenCalledTimes(1));
		expect(plugin.noteCueSettingsChanged).toHaveBeenCalledTimes(1);
		expect(settingText(tab.containerEl)).toContain("Uses precise wording similar to an exam prompt.");
		expect(settingText(tab.containerEl)).not.toContain(
			"newly generated or regenerated recall questions only"
		);
		expect(settingText(tab.containerEl)).toContain(
			"Recall questions will change after regeneration."
		);
		expect(
			tab.containerEl.querySelector<HTMLTextAreaElement>(
				'textarea[aria-label="Section study card instructions"]'
			)?.value
		).toBe(buildSectionCueInstructionsTemplate("exam-practice", "single"));

		finishSave?.();
		await change;
	});
});

describe("folders and automatic updates settings", () => {
	it("renders the approved introduction and settings order", async () => {
		const { tab } = await setupSettingsTab();
		tab.display();

		const text = settingText(tab.containerEl);
		expect(text).toContain(
			"FirstRecall turns your notes into active-recall study material: a Note Brief for the whole note and a study card for each section. Choose an AI provider and model to get started. Your Markdown files are never modified."
		);
		expect(text).not.toContain("Ollama");
		const ordered = [
			"AI model",
			"Generation",
			"Managed folders",
			"Display",
			"Appearance",
			"Study Mode",
		].map((label) => text.indexOf(label));
		expect(ordered.every((position) => position >= 0)).toBe(true);
		expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
	});

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
		const settingsText = settingText(tab.containerEl);
		expect(settingsText).toContain(
			"Add a folder—or your entire vault—to generate and refresh study material in bulk. Turn on automatic updates when you want FirstRecall to keep future changes current."
		);
		expect(settingsText.indexOf("Add folder or vault")).toBeLessThan(
			settingsText.indexOf("Automatic update delay")
		);
		expect(settingsText).toContain(
			"After you stop typing in an automatically-updated note, FirstRecall waits this long before updating its study material. Longer delays reduce repeated AI requests."
		);
		const input = tab.containerEl.querySelector<HTMLInputElement>(
			'input[placeholder="Choose a folder or Entire vault..."]'
		)!;
		input.dispatchEvent(new window.Event("focus"));
		const listbox = tab.containerEl.querySelector<HTMLElement>("[role='listbox']")!;
		expect(
			[...listbox.querySelectorAll<HTMLElement>("[role='option']")].map(
				(candidate) => candidate.textContent
			)
		).toEqual(["Entire vault", "Courses/Biology", "Courses/Chemistry"]);
		expect(listbox.children[1]?.getAttribute("role")).toBe("separator");
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
			'input[aria-label="Update automatically for Courses/Biology"]'
		) as HTMLInputElement & { __onChange?: (value: boolean) => Promise<void> };
		await toggle.__onChange?.(true);

		expect(plugin.updateStudyArea).toHaveBeenCalledWith(
			expect.objectContaining({ maintenanceMode: "maintain-on-save" })
		);
		expect(settingText(tab.containerEl)).toContain(
			"FirstRecall automatically updates new and changed study material after the selected delay."
		);
		expect(settingText(tab.containerEl)).not.toContain("the wait above");
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
		await clickSettingButton(tab.containerEl, "Cancel scan");
		expect(settingText(tab.containerEl)).toContain("Scan canceled");
		expect(settingText(tab.containerEl)).toContain("Scan again");
		finishScan(studyAreaPlan({ counts: { ready: 9, uncued: 0, stale: 0, failed: 0, skipped: 0 } }));
		await Promise.resolve();
		expect(settingText(tab.containerEl)).not.toContain("9 notes ready");
		expect(plugin.runStudyArea).not.toHaveBeenCalled();
	});

	it("keeps managed-folder rows concise and hides exclusions", async () => {
		const { tab, plugin } = await setupSettingsTab({
			loadedFiles: [
				{ path: "Claudes/Drafts", folder: true },
				{ path: "Claudes/Notes.md", extension: "md" },
			],
		});
		plugin.settings.studyAreas = [studyArea({
			name: "Claudes",
			parentPath: "Claudes",
			excludedPaths: ["Claudes/Drafts"],
		})];
		tab.display();
		openSettingsCard(tab, "Managed folders");
		await vi.waitFor(() => expect(plugin.previewStudyArea).toHaveBeenCalled());
		const text = settingText(tab.containerEl);
		expect(text).not.toContain("Covered notes");
		expect(text).not.toContain("Automatic updates affect future edits only");
		expect(text).not.toContain("Exclusions");
		expect(tab.containerEl.querySelector("[aria-label^='Exclusions for']")).toBeNull();
		const row = tab.containerEl.querySelector<HTMLElement>(
			".firstrecall-study-area-row"
		)!;
		expect(row.textContent?.match(/Claudes/g)).toHaveLength(1);
		expect(plugin.updateStudyArea).not.toHaveBeenCalled();
	});

	it("describes removal as leaving Managed folders when automatic updates are off", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.studyAreas = [studyArea({
			name: "Claudes",
			parentPath: "Claudes",
			maintenanceMode: "paused",
		})];
		tab.display();
		openSettingsCard(tab, "Managed folders");
		await vi.waitFor(() => expect(plugin.previewStudyArea).toHaveBeenCalled());

		tab.containerEl.querySelector<HTMLButtonElement>(
			'.firstrecall-study-area-remove[aria-label="Remove Claudes"]'
		)?.click();

		const modal = document.body.querySelector<HTMLElement>(".modal-content")!;
		expect(modal.querySelector("h2")?.textContent).toBe("Remove managed folder?");
		expect(modal.querySelector("p")?.textContent).toBe(
			'Remove "Claudes" from Managed folders? Existing study material will remain available.'
		);
		expect(modal.textContent).not.toContain("automatic updates");
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

		expect(settingText(tab.containerEl)).toContain(
			"Courses/Biology/Year 1 is disabled because it conflicts with Courses/Biology"
		);
		await clickSettingButton(tab.containerEl, "Remove Courses/Biology and recover");
		expect(plugin.recoverDisabledStudyArea).toHaveBeenCalledWith("child", "parent");
	});

	it("keeps scanning available while provider-gated actions open AI setup", async () => {
		const { tab, plugin } = await setupSettingsTab();
		plugin.settings.studyAreas = [studyArea()];
		tab.display();
		openSettingsCard(tab, "Managed folders");
		await vi.waitFor(() => expect(plugin.previewStudyArea).toHaveBeenCalled());
		const scan = [...tab.containerEl.querySelectorAll<HTMLButtonElement>("button")]
			.find((button) => button.textContent === "Scan again");
		expect(scan?.disabled).toBe(false);
		await clickSettingButton(tab.containerEl, "Configure AI model");
		expect(settingText(tab.containerEl)).toContain("Select an AI provider");
	});

	it("describes hidden study material as presentation-only", async () => {
		const { tab } = await setupSettingsTab();
		tab.display();
		expect(settingText(tab.containerEl)).toContain(
			"Hiding generated material never disables automatic maintenance."
		);
	});
});
