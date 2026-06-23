import {
	App,
	Modal,
	Notice,
	PluginSettingTab,
	Setting,
	TFolder,
	requestUrl,
	setIcon,
} from "obsidian";
import type CueCraftPlugin from "./main";
import {
	CORNELL_STYLES,
	DEFAULT_CORNELL_STYLE,
	type CornellStyle,
} from "./cornell-style";
import {
	CUE_COLUMN_WIDTHS,
	CUE_FONT_SIZES,
	DEFAULT_CUE_COLUMN_WIDTH,
	DEFAULT_CUE_FONT_SIZE,
	type CueColumnWidth,
	type CueFontSize,
} from "./cornell-layout";
import {
	CUE_DENSITIES,
	DEFAULT_CUE_DENSITY,
	DEFAULT_QUESTION_STYLE,
	QUESTION_STYLES,
	cueDensityLabel,
	type CueDensity,
	type QuestionStyle,
} from "./cue-generation";
import {
	CUE_ACCENTS,
	DEFAULT_CUE_ACCENT,
	type CueAccent,
} from "./cornell-accent";
import {
	DEFAULT_READING_MODE_DISPLAY,
	READING_MODE_DISPLAY_OPTIONS,
	type ReadingModeDisplay,
} from "./reading-cues";
import {
	ANTHROPIC_CUSTOM_MODEL_ID,
	buildAnthropicModelOptions,
	describeAnthropicModel,
	formatAnthropicModelHint,
	formatAnthropicUnavailableModelMessage,
	isAnthropicCustomModelSelection,
	refreshAnthropicModelOptions,
} from "./anthropic-models";
import { formatParallelRequestsDescription } from "./parallel-requests-guidance";
import {
	deriveProviderSetupStatus,
	recordProviderConnectionSuccess,
	type ProviderConnectionStatusMap,
} from "./provider-setup-status";
import { sortFetchedModelIds } from "./fetched-model-sorting";
import { resolveModelRefreshDescription } from "./model-refresh";
import {
	isModelOption,
	normalizeModelIds,
	type ModelOption,
	type ModelOptionSource,
} from "./model-options";
import {
	buildModelComboboxOptions,
	renderModelCombobox,
} from "./model-combobox";
import {
	modelCompatibilityBadges,
	modelCompatibilityWarning,
} from "./model-compatibility";
import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";
import type { AnthropicProvider } from "./providers/anthropic-provider";
import {
	DEFAULT_STUDY_AREAS,
	ENTIRE_VAULT_STUDY_AREA_LABEL,
	formatStudyAreaReadinessCounts,
	isEntireVaultStudyArea,
	normalizeVaultPath,
	studyAreaScopeLabel,
	type StudyArea,
	type StudyAreaGenerationPlan,
} from "./study-area";

/**
 * CueCraft supports a local provider (Ollama) and several cloud providers via
 * the Vercel AI SDK (Anthropic, OpenAI, Google, xAI). Each cloud provider keeps
 * its own API key + model id; only the selected provider's fields are surfaced.
 */
export type CuePreset = "conceptual" | "exam-prep" | "vocabulary" | "minimal";
export type StudyHideMode = "blur" | "collapse";
export type ProviderId = "ollama" | "anthropic" | "openai" | "google" | "xai" | "openrouter";
type SettingsSubpage = "home" | "ai-model" | "cue-generation" | "appearance";
type CueCraftSettingsSubpage =
	| SettingsSubpage
	| "study-areas";

export interface CueCraftSettings {
	provider: ProviderId;
	ollamaHost: string;
	ollamaModel: string;
	anthropicApiKey: string;
	anthropicModel: string;
	anthropicModelSelection: string;
	anthropicAvailableModels: ModelInfo[];
	anthropicHasFetchedModels: boolean;
	anthropicModelRefreshMessage: string;
	openaiApiKey: string;
	openaiModel: string;
	openaiAvailableModels: string[];
	openaiHasFetchedModels: boolean;
	openaiModelRefreshMessage: string;
	googleApiKey: string;
	googleModel: string;
	googleAvailableModels: string[];
	googleHasFetchedModels: boolean;
	googleModelRefreshMessage: string;
	xaiApiKey: string;
	xaiModel: string;
	xaiAvailableModels: string[];
	xaiHasFetchedModels: boolean;
	xaiModelRefreshMessage: string;
	openrouterApiKey: string;
	openrouterModel: string;
	openrouterAvailableModels: string[];
	openrouterModelOptions: ModelOption[];
	openrouterHasFetchedModels: boolean;
	openrouterModelRefreshMessage: string;
	ollamaAvailableModels: string[];
	ollamaHasFetchedModels: boolean;
	ollamaModelRefreshMessage: string;
	providerConnectionStatus: ProviderConnectionStatusMap;
	cuePreset: CuePreset;
	studyHideMode: StudyHideMode;
	cornellStyle: CornellStyle;
	cueColumnWidth: CueColumnWidth;
	cueFontSize: CueFontSize;
	autoGenerateOnSave: boolean;
	studyAreas: StudyArea[];
	sectionConcurrency: number;
	cueDensity: CueDensity;
	questionStyle: QuestionStyle;
	generateKeywords: boolean;
	autoSummary: boolean;
	renderInReadingMode: boolean;
	readingModeDisplay: ReadingModeDisplay;
	foldCueColumnOnMobile: boolean;
	cueAccent: CueAccent;
	showCueBorder: boolean;
	compactChips: boolean;
}

export const DEFAULT_SETTINGS: CueCraftSettings = {
	provider: "ollama",
	ollamaHost: "http://localhost:11434",
	ollamaModel: "llama3.1:8b",
	anthropicApiKey: "",
	anthropicModel: "",
	anthropicModelSelection: "",
	anthropicAvailableModels: [],
	anthropicHasFetchedModels: false,
	anthropicModelRefreshMessage: "",
	openaiApiKey: "",
	openaiModel: "",
	openaiAvailableModels: [],
	openaiHasFetchedModels: false,
	openaiModelRefreshMessage: "",
	googleApiKey: "",
	googleModel: "",
	googleAvailableModels: [],
	googleHasFetchedModels: false,
	googleModelRefreshMessage: "",
	xaiApiKey: "",
	xaiModel: "",
	xaiAvailableModels: [],
	xaiHasFetchedModels: false,
	xaiModelRefreshMessage: "",
	openrouterApiKey: "",
	openrouterModel: "",
	openrouterAvailableModels: [],
	openrouterModelOptions: [],
	openrouterHasFetchedModels: false,
	openrouterModelRefreshMessage: "",
	ollamaAvailableModels: [],
	ollamaHasFetchedModels: false,
	ollamaModelRefreshMessage: "",
	providerConnectionStatus: {},
	cuePreset: "conceptual",
	studyHideMode: "blur",
	cornellStyle: DEFAULT_CORNELL_STYLE,
	cueColumnWidth: DEFAULT_CUE_COLUMN_WIDTH,
	cueFontSize: DEFAULT_CUE_FONT_SIZE,
	autoGenerateOnSave: false,
	studyAreas: DEFAULT_STUDY_AREAS,
	sectionConcurrency: 5,
	cueDensity: DEFAULT_CUE_DENSITY,
	questionStyle: DEFAULT_QUESTION_STYLE,
	generateKeywords: true,
	autoSummary: true,
	renderInReadingMode: true,
	readingModeDisplay: DEFAULT_READING_MODE_DISPLAY,
	foldCueColumnOnMobile: true,
	cueAccent: DEFAULT_CUE_ACCENT,
	showCueBorder: true,
	compactChips: false,
};

export class CueCraftSettingTab extends PluginSettingTab {
	private plugin: CueCraftPlugin;
	private currentSubpage: CueCraftSettingsSubpage = "home";

	constructor(app: App, plugin: CueCraftPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		switch (this.currentSubpage) {
			case "ai-model":
				this.renderSubpageHeader(
					containerEl,
					"AI model",
					"Provider setup, connection checks, model selection, and speed tuning."
				);
				this.renderAiModelSection(containerEl, false);
				break;
			case "cue-generation":
				this.renderSubpageHeader(
					containerEl,
					"Cue generation",
					"Question style, density, summaries, and auto-generation behavior."
				);
				this.renderCueGenerationSection(containerEl, false);
				break;
			case "appearance":
				this.renderSubpageHeader(
					containerEl,
					"Appearance",
					"Cornell view styling, layout, cue accents, and visual density."
				);
				this.renderAppearanceSection(containerEl, false);
				break;
			case "study-areas":
				this.renderSubpageHeader(
					containerEl,
					"Study areas",
					""
				);
				this.renderStudyAreasSection(containerEl, false);
				break;
			default:
				containerEl.createEl("p", {
					text: "CueCraft generates study cues using a local Ollama model, a frontier model (Claude, ChatGPT, Gemini, Grok), or any model via OpenRouter. Your Markdown files are never modified.",
					cls: "cuecraft-settings-intro",
				});
				this.renderSettingsHome(containerEl);
				break;
		}
	}

	hide(): void {
		super.hide();
		this.currentSubpage = "home";
		this.plugin.promptForCueSettingsRegeneration();
	}

	private renderSettingsHome(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Settings").setHeading();

		const navEl = containerEl.createDiv({ cls: "cuecraft-settings-nav" });
		this.renderSettingsNavCard(navEl, {
			title: "AI model",
			description: "Provider setup, connection checks, model selection, and parallel request tuning.",
			summary: this.aiModelSummary(),
			onOpen: () => this.openSubpage("ai-model"),
		});
		this.renderSettingsNavCard(navEl, {
			title: "Cue generation",
			description: "Control cue style, density, keywords, summaries, and save-time generation.",
			summary: this.cueGenerationSummary(),
			onOpen: () => this.openSubpage("cue-generation"),
		});
		this.renderSettingsNavCard(navEl, {
			title: "Appearance",
			description: "Adjust Cornell view styling, sizing, accents, and compact display options.",
			summary: this.appearanceSummary(),
			onOpen: () => this.openSubpage("appearance"),
		});
		this.renderSettingsNavCard(navEl, {
			title: "Study areas",
			description: "Generate cues for study areas and keep saved notes updated.",
			summary: this.studyAreasSummary(),
			onOpen: () => this.openSubpage("study-areas"),
		});

		this.renderNoteFormatSection(containerEl, true);
		this.renderStudySection(containerEl, true);
	}

	private renderSubpageHeader(
		containerEl: HTMLElement,
		title: string,
		description: string
	): void {
		const titleSetting = new Setting(containerEl).setName(title).setHeading();
		titleSetting.settingEl.addClass("cuecraft-settings-subpage-header");
		titleSetting.nameEl.empty();

		const backBtn = titleSetting.nameEl.createEl("button", {
			cls: "clickable-icon cuecraft-settings-back",
			attr: { type: "button", "aria-label": "Back to settings" },
		});
		setIcon(backBtn, "chevron-left");
		this.plugin.registerDomEvent(backBtn, "click", () =>
			this.openSubpage("home")
		);
		titleSetting.nameEl.createSpan({
			cls: "cuecraft-settings-subpage-title",
			text: title,
		});
		titleSetting.descEl.empty();
		if (description) {
			titleSetting.descEl.createDiv({
				cls: "cuecraft-settings-subpage-desc",
				text: description,
			});
		}
	}

	private renderSettingsNavCard(
		containerEl: HTMLElement,
		opts: {
			title: string;
			description: string;
			summary: string;
			onOpen: () => void;
		}
	): void {
		const setting = new Setting(containerEl)
			.setName(opts.title)
			.setDesc(opts.description);
		setting.settingEl.addClass("cuecraft-settings-nav-card");
		setting.descEl.createDiv({
			cls: "cuecraft-settings-nav-summary",
			text: opts.summary,
		});
		const chevronEl = setting.controlEl.createSpan({
			cls: "cuecraft-settings-nav-chevron",
		});
		setIcon(chevronEl, "chevron-right");
		chevronEl.setAttr("aria-hidden", "true");
		setting.settingEl.tabIndex = 0;
		setting.settingEl.setAttr("role", "button");
		setting.settingEl.setAttr("aria-label", opts.title);
		this.plugin.registerDomEvent(setting.settingEl, "click", (event) => {
			if (this.isSettingsNavInteractiveTarget(event.target)) return;
			opts.onOpen();
		});
		this.plugin.registerDomEvent(setting.settingEl, "keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			opts.onOpen();
		});
	}

	private isSettingsNavInteractiveTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		return Boolean(
			target.closest(
				"button, a, input, select, textarea, .clickable-icon, [contenteditable='true']"
			)
		);
	}

	openStudyAreas(): void {
		this.openSubpage("study-areas");
	}

	private openSubpage(subpage: CueCraftSettingsSubpage): void {
		this.currentSubpage = subpage;
		this.display();
	}

	private aiModelSummary(): string {
		const setup = deriveProviderSetupStatus(this.plugin.settings);
		const providerLabel = this.providerDisplayName(this.plugin.settings.provider);
		const modelLabel = this.selectedModelLabel() || "No model selected";
		const connectionLabel =
			setup.connection === "verified"
				? "Connection verified"
				: setup.connection === "stale"
					? "Connection stale"
					: "Connection untested";
		return `${providerLabel} · ${modelLabel} · ${connectionLabel}`;
	}

	private cueGenerationSummary(): string {
		return `${this.plugin.settings.cuePreset} preset · ${cueDensityLabel(
			this.plugin.settings.cueDensity
		)} density · ${this.plugin.settings.questionStyle} questions`;
	}

	private appearanceSummary(): string {
		const style =
			CORNELL_STYLES.find(
				(item) => item.id === this.plugin.settings.cornellStyle
			)?.label ?? "Custom";
		return `${style} · ${this.plugin.settings.cueColumnWidth} width · ${this.plugin.settings.cueFontSize} text`;
	}

	private studyAreasSummary(): string {
		const count = this.plugin.settings.studyAreas.length;
		const enabled = this.plugin.settings.studyAreas.filter(
			(area) => area.maintenanceMode === "maintain-on-save"
		).length;
		if (!count) return "No study areas";
		const entireVaultArea = this.plugin.settings.studyAreas.find((area) =>
			isEntireVaultStudyArea(area)
		);
		if (entireVaultArea) {
			return `${ENTIRE_VAULT_STUDY_AREA_LABEL} · ${
				entireVaultArea.maintenanceMode === "maintain-on-save"
					? "update on save on"
					: "update on save off"
			}`;
		}
		return `${count} area${count === 1 ? "" : "s"} · ${enabled} update on save`;
	}

	private providerDisplayName(provider: ProviderId): string {
		switch (provider) {
			case "ollama":
				return "Ollama";
			case "anthropic":
				return "Anthropic";
			case "openai":
				return "OpenAI";
			case "google":
				return "Gemini";
			case "xai":
				return "xAI";
			case "openrouter":
				return "OpenRouter";
		}
	}

	private selectedModelLabel(): string {
		const settings = this.plugin.settings;
		switch (settings.provider) {
			case "anthropic": {
				const modelId = settings.anthropicModel.trim();
				if (!modelId) return "";
				const described = describeAnthropicModel(
					modelId,
					settings.anthropicAvailableModels
				);
				return described.label === "Custom model ID"
					? described.rawId || described.label
					: described.label;
			}
			case "openai":
				return settings.openaiModel.trim();
			case "google":
				return settings.googleModel.trim();
			case "xai":
				return settings.xaiModel.trim();
			case "openrouter":
				return settings.openrouterModel.trim();
			case "ollama":
				return settings.ollamaModel.trim();
		}
	}

	// ── AI model ──────────────────────────────────────────────────────────
	private renderAiModelSection(
		containerEl: HTMLElement,
		showHeading: boolean
	): void {
		if (showHeading) {
			new Setting(containerEl).setName("AI model").setHeading();
		}

		const setupFlowEl = containerEl.createDiv({
			cls: "cuecraft-settings-flow",
		});
		this.renderSettingsFlowHeading(
			setupFlowEl,
			"1. Choose provider",
			"Pick where CueCraft should generate cues."
		);

		new Setting(setupFlowEl)
			.setName("AI provider")
			.setDesc("Where cues are generated. Ollama runs locally; the rest call a cloud API.")
			.addDropdown((dd) =>
				dd
					.addOption("ollama", "Ollama (local)")
					.addOption("anthropic", "Anthropic (Claude)")
					.addOption("openai", "OpenAI (ChatGPT)")
					.addOption("google", "Google (Gemini)")
					.addOption("xai", "xAI (Grok)")
					.addOption("openrouter", "OpenRouter")
					.setValue(this.plugin.settings.provider)
					.onChange(async (value) => {
						this.plugin.settings.provider = value as ProviderId;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		this.renderSettingsFlowHeading(
			setupFlowEl,
			"2. Add credentials",
			"Enter the provider key or host details so CueCraft can reach this provider."
		);

		this.renderProviderCredentialSettings(setupFlowEl);

		this.renderSettingsFlowHeading(
			setupFlowEl,
			"3. Verify the setup",
			"Run a quick provider check before generating cues."
		);

		new Setting(setupFlowEl)
			.setName("Test connection")
			.setDesc("Verify CueCraft can reach the selected provider.")
			.addButton((btn) =>
				btn
					.setButtonText("Test connection")
					.onClick(() => this.testConnection())
			);

		this.renderSettingsFlowHeading(
			setupFlowEl,
			"4. Choose a model",
			"Select the model CueCraft should use after the provider is connected."
		);

		this.renderProviderModelSettings(setupFlowEl);
		this.renderProviderSetupStatus(setupFlowEl);

		this.renderSettingsFlowHeading(
			setupFlowEl,
			"5. Tune speed",
			"Adjust how aggressively CueCraft generates section cues in parallel."
		);

		const concurrencyDesc = (): string =>
			formatParallelRequestsDescription(this.plugin.settings);
		const concurrencySetting = new Setting(setupFlowEl)
			.setName("Parallel requests")
			.addSlider((sl) =>
				sl
					.setLimits(1, 5, 1)
					.setValue(this.plugin.settings.sectionConcurrency)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.sectionConcurrency = value;
						await this.plugin.saveSettings();
						concurrencySetting.setDesc(concurrencyDesc());
					})
			);
		concurrencySetting.setDesc(concurrencyDesc());

	}

	private renderProviderSetupStatus(containerEl: HTMLElement): void {
		const status = deriveProviderSetupStatus(this.plugin.settings);
		const statusSetting = new Setting(containerEl)
			.setName("Setup status")
			.setDesc(
				status.connection === "verified" && status.testedAt
					? status.modelSelected
						? `Last verified the current key and selected model ${new Date(status.testedAt).toLocaleString()}.`
						: `Last verified provider access ${new Date(status.testedAt).toLocaleString()}. Choose a model and test again to verify generation with that model.`
					: status.connection === "stale"
						? "The saved connection check no longer matches the current key or selected model."
						: "Save the key or host, choose a model, then run Test connection. Without a selected model, CueCraft checks provider access only."
			);
		statusSetting.controlEl.addClass("cuecraft-status-chips");
		this.renderStatusChip(
			statusSetting.controlEl,
			status.keySaved ? "Key saved" : "Key missing",
			status.keySaved ? "is-positive" : "is-muted"
		);
		this.renderStatusChip(
			statusSetting.controlEl,
			status.modelSelected ? "Model selected" : "Model missing",
			status.modelSelected ? "is-positive" : "is-muted"
		);
		this.renderStatusChip(
			statusSetting.controlEl,
			status.connection === "verified"
				? "Connection verified"
				: status.connection === "stale"
					? "Connection stale"
					: "Connection untested",
			status.connection === "verified"
				? "is-positive"
				: status.connection === "stale"
					? "is-warning"
					: "is-muted"
		);
	}

	private renderStatusChip(
		containerEl: HTMLElement,
		label: string,
		stateClass: string
	): void {
		const chipEl = containerEl.createEl("span", {
			cls: `cuecraft-status-chip ${stateClass}`,
		});
		chipEl.createEl("span", { cls: "cuecraft-status-chip-dot" });
		chipEl.createEl("span", {
			cls: "cuecraft-status-chip-label",
			text: label,
		});
	}

	private renderSettingsFlowHeading(
		containerEl: HTMLElement,
		title: string,
		description: string
	): void {
		const headingEl = containerEl.createDiv({
			cls: "cuecraft-settings-flow-heading",
		});
		headingEl.createEl("div", {
			cls: "cuecraft-settings-flow-title",
			text: title,
		});
		headingEl.createEl("div", {
			cls: "cuecraft-settings-flow-desc",
			text: description,
		});
	}

	// ── Cue generation ────────────────────────────────────────────────────
	private renderCueGenerationSection(
		containerEl: HTMLElement,
		showHeading: boolean
	): void {
		if (showHeading) {
			new Setting(containerEl).setName("Cue generation").setHeading();
		}

		new Setting(containerEl)
			.setName("Cue preset")
			.setDesc("Controls the style of generated questions.")
			.addDropdown((dd) =>
				dd
					.addOption("conceptual", "Conceptual")
					.addOption("exam-prep", "Exam prep")
					.addOption("vocabulary", "Vocabulary-heavy")
					.addOption("minimal", "Minimal")
					.setValue(this.plugin.settings.cuePreset)
					.onChange(async (value) => {
						this.plugin.settings.cuePreset = value as CuePreset;
						await this.plugin.saveSettings();
						this.plugin.noteCueSettingsChanged();
					})
			);

		const densityDesc = (): string =>
			`How detailed each section's recall cue should be \u2014 ${cueDensityLabel(
				this.plugin.settings.cueDensity
			)}.`;
		const densitySetting = new Setting(containerEl)
			.setName("Cue density")
			.addSlider((sl) =>
				sl
					.setLimits(
						CUE_DENSITIES[0].value,
						CUE_DENSITIES[CUE_DENSITIES.length - 1].value,
						1
					)
					.setValue(this.plugin.settings.cueDensity)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.cueDensity = value as CueDensity;
						await this.plugin.saveSettings();
						densitySetting.setDesc(densityDesc());
						this.plugin.noteCueSettingsChanged();
					})
			);
		densitySetting.setDesc(densityDesc());

		new Setting(containerEl)
			.setName("Question style")
			.setDesc("Tone of the generated questions.")
			.addDropdown((dd) => {
				for (const q of QUESTION_STYLES) dd.addOption(q.id, q.label);
				dd.setValue(this.plugin.settings.questionStyle).onChange(
					async (value) => {
						this.plugin.settings.questionStyle =
							value as QuestionStyle;
						await this.plugin.saveSettings();
						this.plugin.noteCueSettingsChanged();
					}
				);
			});

		new Setting(containerEl)
			.setName("Generate cue supports")
			.setDesc("Add short evidence terms beneath each cue question.")
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.generateKeywords)
					.onChange(async (value) => {
						this.plugin.settings.generateKeywords = value;
						await this.plugin.saveSettings();
						this.plugin.noteCueSettingsChanged();
					})
			);

		new Setting(containerEl)
			.setName("Auto-write section summary")
			.setDesc("Draft a whole-note summary after section cues are generated.")
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.autoSummary)
					.onChange(async (value) => {
						this.plugin.settings.autoSummary = value;
						await this.plugin.saveSettings();
						this.plugin.noteCueSettingsChanged();
					})
			);

		new Setting(containerEl)
			.setName("Auto-generate on save")
			.setDesc("Draft cues and a summary automatically whenever a note is saved.")
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.autoGenerateOnSave)
					.onChange(async (value) => {
						this.plugin.settings.autoGenerateOnSave = value;
						await this.plugin.saveSettings();
					})
			);
	}

	// ── Study areas ───────────────────────────────────────────────────────
	private studyAreaFolderPaths(): string[] {
		return this.app.vault
			.getAllLoadedFiles()
			.filter((file): file is TFolder => file instanceof TFolder)
			.map((folder) => normalizeVaultPath(folder.path))
			.filter(Boolean)
			.sort((a, b) => a.localeCompare(b));
	}

	private renderStudyAreasSection(
		containerEl: HTMLElement,
		showHeading: boolean
	): void {
		if (showHeading) {
			new Setting(containerEl).setName("Study areas").setHeading();
		}
		const folderPaths = this.studyAreaFolderPaths();
		const assignedFolderPaths = new Set(
			this.plugin.settings.studyAreas.map((area) =>
				normalizeVaultPath(area.parentPath)
			)
		);
		const availableFolderPaths = folderPaths.filter(
			(path) => !assignedFolderPaths.has(path)
		);
		const hasStudyAreas = this.plugin.settings.studyAreas.length > 0;
		const hasEntireVaultArea = this.plugin.settings.studyAreas.some((area) =>
			isEntireVaultStudyArea(area)
		);
		const availableScopes = hasEntireVaultArea
			? []
			: [
					...(!hasStudyAreas ? [ENTIRE_VAULT_STUDY_AREA_LABEL] : []),
					...availableFolderPaths,
				];

		if (hasStudyAreas) {
			new Setting(containerEl).setName("Manage Study Areas").setHeading();
			const manageEl = containerEl.createDiv({
				cls: "cuecraft-settings-flow",
			});
			for (const area of this.plugin.settings.studyAreas) {
				this.renderStudyAreaRow(manageEl, area);
			}
		}

		new Setting(containerEl).setName("Create Study Area").setHeading();
		const createEl = containerEl.createDiv({
			cls: "cuecraft-settings-flow",
		});
		const parentFolderSetting = new Setting(createEl);
		parentFolderSetting.settingEl.addClass("cuecraft-study-area-create-row");
		parentFolderSetting
			.setName(
				hasEntireVaultArea
					? "Entire vault is already a study area"
					: "Choose notes to include"
			)
			.setDesc(
				hasEntireVaultArea
					? "Remove the existing study area above before adding a specific folder."
					: hasStudyAreas
						? "Type to filter existing vault folders. Remove folder study areas above to choose Entire vault."
						: "Select Entire vault or an existing folder; hidden notes are not eligible."
			);
		if (hasEntireVaultArea) {
			parentFolderSetting.controlEl.empty();
		} else {
			renderModelCombobox({
				containerEl: parentFolderSetting.controlEl,
				value: "",
				options: normalizeModelIds(availableScopes, "string"),
				source: "string",
				placeholder: availableScopes.length
					? "Choose a scope..."
					: "No unassigned folders",
				emptyMessage: availableScopes.length
					? "No matching scopes. Choose Entire vault or an existing vault folder."
					: "No unassigned folders found.",
				onCommit: async (value) => {
					const isEntireVaultSelection =
						value.trim().toLowerCase() ===
						ENTIRE_VAULT_STUDY_AREA_LABEL.toLowerCase();
					const normalized = isEntireVaultSelection
						? ""
						: normalizeVaultPath(value);
					if (!normalized && !isEntireVaultSelection) return;
					if (isEntireVaultSelection && hasStudyAreas) {
						new Notice(
							"CueCraft: remove folder study areas before using Entire vault."
						);
						this.display();
						return;
					}
					if (assignedFolderPaths.has(normalized)) {
						new Notice("CueCraft: that study area already exists.");
						this.display();
						return;
					}
					if (!isEntireVaultSelection && !folderPaths.includes(normalized)) {
						new Notice(`CueCraft: "${normalized}" is not an existing folder.`);
						this.display();
						return;
					}
					const area = await this.plugin.createStudyArea(normalized);
					if (area) this.display();
				},
				renderToggleIcon: (iconEl) => setIcon(iconEl, "chevron-down"),
				pinnedOptionIds: [ENTIRE_VAULT_STUDY_AREA_LABEL],
				suggestionsLabel: "scope suggestions",
			});
		}
	}

	private renderStudyAreaRow(containerEl: HTMLElement, area: StudyArea): void {
		const setting = new Setting(containerEl).setName(area.name);
		setting.settingEl.addClass("cuecraft-study-area-row");
		setting.descEl.empty();
		setting.descEl.createDiv({
			cls: "cuecraft-study-area-path",
			text: studyAreaScopeLabel(area.parentPath),
		});
		const countsEl = setting.descEl.createDiv({
			cls: "cuecraft-study-area-counts",
			text: "Previewing notes...",
		});

		setting.controlEl.addClass("cuecraft-study-area-controls");
		setting.controlEl.createSpan({
			cls: "cuecraft-study-area-toggle-label",
			text: "Update on save",
		});
		setting.addToggle((tg) =>
			tg
				.setValue(area.maintenanceMode === "maintain-on-save")
				.onChange(async (value) => {
					await this.plugin.updateStudyArea({
						...area,
						maintenanceMode: value ? "maintain-on-save" : "paused",
					});
					this.display();
				})
		);

		const backfillBtn = setting.controlEl.createEl("button", {
			text: "Generate Cues",
			attr: { type: "button" },
		});
		backfillBtn.addClass("mod-cta");
		backfillBtn.disabled = true;
		const retryBtn = setting.controlEl.createEl("button", {
			text: "Retry failed",
			attr: { type: "button" },
		});
		retryBtn.addClass("cuecraft-study-area-retry");
		retryBtn.disabled = true;
		retryBtn.hidden = true;
		retryBtn.addClass("cuecraft-study-area-hidden");
		const removeBtn = setting.controlEl.createEl("button", {
			cls: "clickable-icon cuecraft-study-area-remove",
			attr: { type: "button", "aria-label": `Remove ${area.name}` },
		});
		setIcon(removeBtn, "trash-2");

		void this.plugin.previewStudyArea(area.id).then((plan) => {
			this.renderStudyAreaPlan(countsEl, backfillBtn, retryBtn, plan);
		});

		this.plugin.registerDomEvent(backfillBtn, "click", async () => {
			backfillBtn.disabled = true;
			backfillBtn.textContent = "Generating...";
			countsEl.setText("Generating cues...");
			await this.plugin.runStudyArea(area.id, "backfill");
			this.display();
		});
		this.plugin.registerDomEvent(retryBtn, "click", async () => {
			await this.plugin.runStudyArea(area.id, "retry-failed");
			this.display();
		});
		this.plugin.registerDomEvent(removeBtn, "click", () => {
			new StudyAreaConfirmModal(this.app, {
				title: "Remove study area?",
				message: `Remove study area "${area.name}"? Generated cues stay cached.`,
				confirmText: "Remove",
				onConfirm: async () => {
					await this.plugin.removeStudyArea(area.id);
					this.display();
				},
			}).open();
		});
	}

	private renderStudyAreaPlan(
		countsEl: HTMLElement,
		backfillBtn: HTMLButtonElement,
		retryBtn: HTMLButtonElement,
		plan: StudyAreaGenerationPlan | null
	): void {
		if (!plan) {
			countsEl.setText("Study area no longer exists.");
			backfillBtn.disabled = true;
			retryBtn.disabled = true;
			retryBtn.hidden = true;
			retryBtn.addClass("cuecraft-study-area-hidden");
			return;
		}
		const cueSectionCount = plan.items
			.filter((item) => item.readiness === "uncued" || item.readiness === "stale")
			.reduce((total, item) => total + item.sectionCount, 0);
		countsEl.setText(formatStudyAreaReadinessCounts(plan.counts, {
			cueSectionCount,
		}));
		backfillBtn.disabled = plan.items.length === 0;
		const hasFailedWork = plan.counts.failed > 0;
		retryBtn.disabled = !hasFailedWork;
		retryBtn.hidden = !hasFailedWork;
		retryBtn.toggleClass("cuecraft-study-area-hidden", !hasFailedWork);
	}

	// ── Note format ───────────────────────────────────────────────────────
	private renderNoteFormatSection(
		containerEl: HTMLElement,
		showHeading: boolean
	): void {
		if (showHeading) {
			new Setting(containerEl).setName("Note format").setHeading();
		}

		new Setting(containerEl)
			.setName("Show CueCraft in Reading mode")
			.setDesc("Show a lightweight study surface when viewing notes in Reading mode.")
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.renderInReadingMode)
					.onChange(async (value) => {
						this.plugin.settings.renderInReadingMode = value;
						await this.plugin.saveSettings();
						this.plugin.refreshReadingModeSurface();
					})
			);

		const readingDisplaySetting = new Setting(containerEl)
			.setName("Reading mode display")
			.addDropdown((dd) => {
				for (const option of READING_MODE_DISPLAY_OPTIONS) {
					dd.addOption(option.id, option.label);
				}
				dd.setValue(this.plugin.settings.readingModeDisplay).onChange(
					async (value) => {
						this.plugin.settings.readingModeDisplay =
							value as ReadingModeDisplay;
						await this.plugin.saveSettings();
						readingDisplaySetting.setDesc(readingDisplayDesc());
						this.plugin.refreshReadingModeSurface();
					}
				);
			});
		const readingDisplayDesc = (): string =>
			READING_MODE_DISPLAY_OPTIONS.find(
				(option) => option.id === this.plugin.settings.readingModeDisplay
			)?.description ?? "Choose how CueCraft appears in Reading mode.";
		readingDisplaySetting.setDesc(readingDisplayDesc());

		new Setting(containerEl)
			.setName("Fold cue column on mobile")
			.setDesc("Collapse the left cue column into a tap-to-expand panel on narrow screens.")
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.foldCueColumnOnMobile)
					.onChange(async (value) => {
						this.plugin.settings.foldCueColumnOnMobile = value;
						await this.plugin.saveSettings();
					})
			);
	}

	// ── Appearance ────────────────────────────────────────────────────────
	private renderAppearanceSection(
		containerEl: HTMLElement,
		showHeading: boolean
	): void {
		if (showHeading) {
			new Setting(containerEl).setName("Appearance").setHeading();
		}

		const styleSetting = new Setting(containerEl)
			.setName("Cornell view style")
			.addDropdown((dd) => {
				for (const s of CORNELL_STYLES) dd.addOption(s.id, s.label);
				dd.setValue(this.plugin.settings.cornellStyle).onChange(
					async (value) => {
						this.plugin.settings.cornellStyle = value as CornellStyle;
						await this.plugin.saveSettings();
						this.plugin.refreshCornellViews();
						styleSetting.setDesc(styleDesc());
					}
				);
			});
		const styleDesc = (): string =>
			CORNELL_STYLES.find((s) => s.id === this.plugin.settings.cornellStyle)
				?.description ?? "Visual preset for the Cornell view.";
		styleSetting.setDesc(styleDesc());

		const widthSetting = new Setting(containerEl)
			.setName("Cue column width")
			.addDropdown((dd) => {
				for (const w of CUE_COLUMN_WIDTHS) dd.addOption(w.id, w.label);
				dd.setValue(this.plugin.settings.cueColumnWidth).onChange(
					async (value) => {
						this.plugin.settings.cueColumnWidth =
							value as CueColumnWidth;
						await this.plugin.saveSettings();
						this.plugin.refreshCornellViews();
						widthSetting.setDesc(widthDesc());
					}
				);
			});
		const widthDesc = (): string =>
			CUE_COLUMN_WIDTHS.find(
				(w) => w.id === this.plugin.settings.cueColumnWidth
			)?.description ?? "Width of the Cornell cue rail.";
		widthSetting.setDesc(widthDesc());

		const fontSetting = new Setting(containerEl)
			.setName("Cue font size")
			.addDropdown((dd) => {
				for (const f of CUE_FONT_SIZES) dd.addOption(f.id, f.label);
				dd.setValue(this.plugin.settings.cueFontSize).onChange(
					async (value) => {
						this.plugin.settings.cueFontSize = value as CueFontSize;
						await this.plugin.saveSettings();
						this.plugin.refreshCornellViews();
						fontSetting.setDesc(fontDesc());
					}
				);
			});
		const fontDesc = (): string =>
			CUE_FONT_SIZES.find((f) => f.id === this.plugin.settings.cueFontSize)
				?.description ?? "Font size of the Cornell cue text.";
		fontSetting.setDesc(fontDesc());

		this.renderAccentSwatches(containerEl);

		new Setting(containerEl)
			.setName("Show cue column border")
			.setDesc("Draw a divider between the cue column and note content.")
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.showCueBorder)
					.onChange(async (value) => {
						this.plugin.settings.showCueBorder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Compact supports")
			.setDesc("Use smaller support text with tighter spacing.")
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.compactChips)
					.onChange(async (value) => {
						this.plugin.settings.compactChips = value;
						await this.plugin.saveSettings();
					})
			);
	}

	// ── Study Mode ────────────────────────────────────────────────────────
	private renderStudySection(
		containerEl: HTMLElement,
		showHeading: boolean
	): void {
		if (showHeading) {
			new Setting(containerEl).setName("Study Mode").setHeading();
		}

		new Setting(containerEl)
			.setName("Study Mode hide style")
			.setDesc("How section bodies are hidden during Study Mode.")
			.addDropdown((dd) =>
				dd
					.addOption("blur", "Blur")
					.addOption("collapse", "Collapse")
					.setValue(this.plugin.settings.studyHideMode)
					.onChange(async (value) => {
						this.plugin.settings.studyHideMode = value as StudyHideMode;
						await this.plugin.saveSettings();
					})
			);
	}

	/** Accent-color swatches (Appearance) rendered as custom buttons. */
	private renderAccentSwatches(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Cue accent color")
			.setDesc("Accent used for the cue rail and support text.")
			.then((setting) => {
				const wrap = setting.controlEl.createDiv({
					cls: "cuecraft-swatches",
				});
				const paint = (): void => {
					wrap.empty();
					for (const accent of CUE_ACCENTS) {
						const selected =
							this.plugin.settings.cueAccent === accent.id;
						const btn = wrap.createEl("button", {
							cls: `cuecraft-swatch cuecraft-accent-${accent.id}`,
							attr: {
								type: "button",
								"aria-label": accent.label,
								title: accent.label,
								"aria-pressed": String(selected),
							},
						});
						if (selected) btn.addClass("is-selected");
						this.plugin.registerDomEvent(btn, "click", async () => {
							this.plugin.settings.cueAccent = accent.id;
							await this.plugin.saveSettings();
							this.plugin.refreshCornellViews();
							paint();
						});
					}
				};
				paint();
			});
	}

	private renderOllamaCredentialSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Ollama host")
			.setDesc("Base URL of your local Ollama server.")
			.addText((text) =>
				text
					.setPlaceholder("http://localhost:11434")
					.setValue(this.plugin.settings.ollamaHost)
					.onChange(async (value) => {
						this.plugin.settings.ollamaHost = value.trim();
						this.plugin.settings.ollamaAvailableModels = [];
						this.plugin.settings.ollamaHasFetchedModels = false;
						this.plugin.settings.ollamaModelRefreshMessage =
							"Enter your Ollama host first to fetch local models.";
						await this.plugin.saveSettings();
					})
			);

	}

	private renderOllamaModelSettings(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		this.renderFetchedModelSelector(containerEl, {
			modelLabel: "Ollama model",
			modelDesc: "Name of an installed Ollama model (e.g. llama3.1:8b).",
			modelPlaceholder: "Select a model",
			availableModels: s.ollamaAvailableModels,
			modelOptionSource: "ollama",
			getModel: () => s.ollamaModel,
			setModel: (value) => (s.ollamaModel = value),
		});
		new Setting(containerEl)
			.setName("Ollama models")
			.setDesc(
				this.resolveModelRefreshDescription(
					s.ollamaModelRefreshMessage,
					s.ollamaHost.trim()
						? "Fetch locally available Ollama models from the configured host."
						: "Enter your Ollama host first to fetch local models."
				)
			)
			.addButton((btn) =>
				btn
					.setButtonText(
						s.ollamaHasFetchedModels ? "Refresh models" : "Fetch Ollama models"
					)
					.setDisabled(!s.ollamaHost.trim())
					.onClick(() => void this.refreshOllamaModels())
			);
	}

	private renderAnthropicCredentialSettings(containerEl: HTMLElement): void {
		const s = this.plugin.settings;

		new Setting(containerEl)
			.setName("Anthropic API key")
			.setDesc(
				"Your Anthropic API key (from console.anthropic.com). Stored locally in this vault's plugin data."
			)
			.addText((text) => {
				text
					.setPlaceholder("sk-ant-...")
					.setValue(s.anthropicApiKey)
					.onChange(async (value) => {
						s.anthropicApiKey = value.trim();
						s.anthropicAvailableModels = [];
						s.anthropicHasFetchedModels = false;
						s.anthropicModelRefreshMessage =
							"Enter your Anthropic API key, then fetch models to load account-specific Claude options.";
						this.syncAnthropicModelSelection();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";

				const eye = text.inputEl.insertAdjacentElement(
					"afterend",
					createEl("button", {
						cls: "cuecraft-key-eye",
						attr: { type: "button", "aria-label": "Show API key" },
					})
				) as HTMLButtonElement;
				setIcon(eye, "eye");
				this.plugin.registerDomEvent(eye, "click", () => {
					const masked = text.inputEl.type === "password";
					text.inputEl.type = masked ? "text" : "password";
					setIcon(eye, masked ? "eye-off" : "eye");
					eye.setAttr(
						"aria-label",
						masked ? "Hide API key" : "Show API key"
					);
				});
			});
	}

	private renderAnthropicModelSettings(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		const isCustomSelection = isAnthropicCustomModelSelection(s);
		const modelHint = formatAnthropicModelHint(
			s.anthropicModel,
			s.anthropicAvailableModels
		);
		const modelOptions = buildAnthropicModelOptions(
			s.anthropicAvailableModels
		);
		const hasApiKey = s.anthropicApiKey.trim().length > 0;

		const modelSetting = new Setting(containerEl).setName("Claude model");
		if (modelHint) modelSetting.setDesc(modelHint);
		modelSetting.addDropdown((dd) => {
				dd.addOption(ANTHROPIC_CUSTOM_MODEL_ID, "Custom model ID...");
				for (const model of modelOptions) {
					dd.addOption(model.id, model.label);
				}
				dd
					.setValue(
						isCustomSelection
							? ANTHROPIC_CUSTOM_MODEL_ID
							: s.anthropicModel
					)
					.onChange(async (value) => {
						if (value === ANTHROPIC_CUSTOM_MODEL_ID) {
							s.anthropicModelSelection = ANTHROPIC_CUSTOM_MODEL_ID;
							await this.plugin.saveSettings();
							this.display();
							return;
						}
						s.anthropicModelSelection = value;
						s.anthropicModel = value;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (isCustomSelection) {
			new Setting(containerEl)
				.setName("Custom model ID")
				.setDesc("Enter the exact Anthropic model ID CueCraft should use.")
				.addText((text) =>
					text
						.setPlaceholder("claude-sonnet-4-6")
						.setValue(s.anthropicModel)
						.onChange(async (value) => {
							s.anthropicModel = value.trim();
							s.anthropicModelSelection = ANTHROPIC_CUSTOM_MODEL_ID;
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName("Anthropic models")
			.setDesc(
				this.resolveModelRefreshDescription(
					s.anthropicModelRefreshMessage,
					hasApiKey
						? "Fetch Anthropic's account-specific model list so you can choose from your account."
						: "Enter your Anthropic API key first to fetch account-specific models."
				)
			)
			.addButton((btn) =>
				btn
					.setButtonText(
						s.anthropicHasFetchedModels
							? "Refresh models"
							: "Fetch Anthropic models"
					)
					.setDisabled(!hasApiKey)
					.onClick(() => void this.refreshAnthropicModels())
			);

	}

	private syncAnthropicModelSelection(): void {
		const s = this.plugin.settings;
		const knownIds = new Set(
			buildAnthropicModelOptions(s.anthropicAvailableModels).map(
				(model) => model.id
			)
		);
		s.anthropicModelSelection = knownIds.has(s.anthropicModel)
			? s.anthropicModel
			: ANTHROPIC_CUSTOM_MODEL_ID;
	}

	private async refreshAnthropicModels(): Promise<void> {
		const s = this.plugin.settings;
		if (!s.anthropicApiKey.trim()) {
			new Notice("CueCraft: enter your Anthropic API key first.");
			return;
		}
		const provider = this.plugin.makeProvider();
		s.anthropicHasFetchedModels = true;
		if (provider.id !== "anthropic" || !provider.listModels) {
			s.anthropicAvailableModels = [];
			s.anthropicModelRefreshMessage =
				"CueCraft: Anthropic model fetch is unavailable. You can still enter a custom model ID.";
			this.syncAnthropicModelSelection();
			await this.plugin.saveSettings();
			this.display();
			return;
		}
		const anthropicProvider = provider as AnthropicProvider & {
			listModels(): Promise<ModelInfo[]>;
		};
		const result = await refreshAnthropicModelOptions({
			listModels: () => anthropicProvider.listModels(),
		});
		s.anthropicAvailableModels = result.availableModels;
		s.anthropicModelRefreshMessage =
			result.availableModels.length > 0 ? "" : result.message;
		this.syncAnthropicModelSelection();
		await this.plugin.saveSettings();
		this.display();
		new Notice(`CueCraft: ${result.message}`);
	}

	private renderProviderCredentialSettings(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		switch (s.provider) {
			case "ollama":
				this.renderOllamaCredentialSettings(containerEl);
				return;
			case "anthropic":
				this.renderAnthropicCredentialSettings(containerEl);
				return;
			case "openai":
				this.renderCloudCredentialSettings(containerEl, {
					vendor: "OpenAI",
					keyDesc: "Your OpenAI API key (from platform.openai.com). Stored locally in this vault's plugin data.",
					keyPlaceholder: "sk-...",
					getKey: () => s.openaiApiKey,
					setKey: (v) => {
						s.openaiApiKey = v;
						s.openaiAvailableModels = [];
						s.openaiHasFetchedModels = false;
						s.openaiModelRefreshMessage =
							"Enter your OpenAI API key first to fetch available models.";
					},
				});
				return;
			case "google":
				this.renderCloudCredentialSettings(containerEl, {
					vendor: "Google",
					keyDesc: "Your Google AI (Gemini) API key (from aistudio.google.com). Stored locally in this vault's plugin data.",
					keyPlaceholder: "AIza...",
					getKey: () => s.googleApiKey,
					setKey: (v) => {
						s.googleApiKey = v;
						s.googleAvailableModels = [];
						s.googleHasFetchedModels = false;
						s.googleModelRefreshMessage =
							"Enter your Google API key first to fetch available models.";
					},
				});
				return;
			case "xai":
				this.renderCloudCredentialSettings(containerEl, {
					vendor: "xAI",
					keyDesc: "Your xAI API key (from console.x.ai). Stored locally in this vault's plugin data.",
					keyPlaceholder: "xai-...",
					getKey: () => s.xaiApiKey,
					setKey: (v) => {
						s.xaiApiKey = v;
						s.xaiAvailableModels = [];
						s.xaiHasFetchedModels = false;
						s.xaiModelRefreshMessage =
							"Enter your xAI API key first to fetch available models.";
					},
				});
				return;
			case "openrouter":
				this.renderCloudCredentialSettings(containerEl, {
					vendor: "OpenRouter",
					keyDesc: "Your OpenRouter API key (from openrouter.ai/keys). Stored locally in this vault's plugin data.",
					keyPlaceholder: "sk-or-...",
					getKey: () => s.openrouterApiKey,
					setKey: (v) => {
						s.openrouterApiKey = v;
						s.openrouterAvailableModels = [];
						s.openrouterModelOptions = [];
						s.openrouterHasFetchedModels = false;
						s.openrouterModelRefreshMessage =
							"Enter your OpenRouter API key first to fetch available models.";
					},
				});
				return;
		}
	}

	private renderProviderModelSettings(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		switch (s.provider) {
			case "ollama":
				this.renderOllamaModelSettings(containerEl);
				return;
			case "anthropic":
				this.renderAnthropicModelSettings(containerEl);
				return;
			case "openai":
				this.renderCloudModelSettings(containerEl, {
					providerName: "OpenAI",
					modelLabel: "OpenAI model",
					modelDesc: "An OpenAI model id (e.g. gpt-4o-mini, gpt-4o).",
					modelPlaceholder: "Select a model",
					modelOptionSource: "openai",
					getModel: () => s.openaiModel,
					setModel: (v) => (s.openaiModel = v),
					getApiKey: () => s.openaiApiKey,
					getAvailableModels: () => s.openaiAvailableModels,
					getHasFetchedModels: () => s.openaiHasFetchedModels,
					getRefreshMessage: () => s.openaiModelRefreshMessage,
					setAvailableModels: (models) => (s.openaiAvailableModels = models),
					setHasFetchedModels: (value) => (s.openaiHasFetchedModels = value),
					setRefreshMessage: (value) => (s.openaiModelRefreshMessage = value),
				});
				return;
			case "google":
				this.renderCloudModelSettings(containerEl, {
					providerName: "Gemini",
					modelLabel: "Gemini model",
					modelDesc: "A Gemini model id (e.g. gemini-1.5-flash, gemini-1.5-pro).",
					modelPlaceholder: "Select a model",
					modelOptionSource: "google",
					getModel: () => s.googleModel,
					setModel: (v) => (s.googleModel = v),
					getApiKey: () => s.googleApiKey,
					getAvailableModels: () => s.googleAvailableModels,
					getHasFetchedModels: () => s.googleHasFetchedModels,
					getRefreshMessage: () => s.googleModelRefreshMessage,
					setAvailableModels: (models) => (s.googleAvailableModels = models),
					setHasFetchedModels: (value) => (s.googleHasFetchedModels = value),
					setRefreshMessage: (value) => (s.googleModelRefreshMessage = value),
				});
				return;
			case "xai":
				this.renderCloudModelSettings(containerEl, {
					providerName: "xAI",
					modelLabel: "Grok model",
					modelDesc: "An xAI model id (e.g. grok-2-latest, grok-beta).",
					modelPlaceholder: "Select a model",
					modelOptionSource: "xai",
					getModel: () => s.xaiModel,
					setModel: (v) => (s.xaiModel = v),
					getApiKey: () => s.xaiApiKey,
					getAvailableModels: () => s.xaiAvailableModels,
					getHasFetchedModels: () => s.xaiHasFetchedModels,
					getRefreshMessage: () => s.xaiModelRefreshMessage,
					setAvailableModels: (models) => (s.xaiAvailableModels = models),
					setHasFetchedModels: (value) => (s.xaiHasFetchedModels = value),
					setRefreshMessage: (value) => (s.xaiModelRefreshMessage = value),
				});
				return;
			case "openrouter":
				this.renderCloudModelSettings(containerEl, {
					providerName: "OpenRouter",
					modelLabel: "OpenRouter model",
					modelDesc: "An OpenRouter model ID in provider/model format (e.g. anthropic/claude-sonnet-4, openai/gpt-4o).",
					modelPlaceholder: "Select a model",
					modelOptionSource: "openrouter",
					getModel: () => s.openrouterModel,
					setModel: (v) => (s.openrouterModel = v),
					getApiKey: () => s.openrouterApiKey,
					getAvailableModels: () => s.openrouterAvailableModels,
					getModelOptions: () => s.openrouterModelOptions,
					getHasFetchedModels: () => s.openrouterHasFetchedModels,
					getRefreshMessage: () => s.openrouterModelRefreshMessage,
					setAvailableModels: (models) => (s.openrouterAvailableModels = models),
					setHasFetchedModels: (value) => (s.openrouterHasFetchedModels = value),
					setRefreshMessage: (value) => (s.openrouterModelRefreshMessage = value),
					setModelOptions: (options) => (s.openrouterModelOptions = options),
				});
				return;
		}
	}

	private renderCloudCredentialSettings(
		containerEl: HTMLElement,
		opts: {
			vendor: string;
			keyDesc: string;
			keyPlaceholder: string;
			getKey: () => string;
			setKey: (v: string) => void;
		}
	): void {
		new Setting(containerEl)
			.setName(`${opts.vendor} API key`)
			.setDesc(opts.keyDesc)
			.addText((text) => {
				text
					.setPlaceholder(opts.keyPlaceholder)
					.setValue(opts.getKey())
					.onChange(async (value) => {
						opts.setKey(value.trim());
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";

				const eye = text.inputEl.insertAdjacentElement(
					"afterend",
					createEl("button", {
						cls: "cuecraft-key-eye",
						attr: { type: "button", "aria-label": "Show API key" },
					})
				) as HTMLButtonElement;
				setIcon(eye, "eye");
				this.plugin.registerDomEvent(eye, "click", () => {
					const masked = text.inputEl.type === "password";
					text.inputEl.type = masked ? "text" : "password";
					setIcon(eye, masked ? "eye-off" : "eye");
					eye.setAttr(
						"aria-label",
						masked ? "Hide API key" : "Show API key"
					);
				});
			});
	}

	private renderFetchedModelSelector(
		containerEl: HTMLElement,
		opts: {
			modelLabel: string;
			modelDesc: string;
			modelPlaceholder: string;
			availableModels: string[];
			modelOptions?: ModelOption[];
			modelOptionSource: ModelOptionSource;
			getModel: () => string;
			setModel: (v: string) => void;
		}
	): void {
		const currentModel = opts.getModel();
		const modelOptions =
			opts.modelOptions && opts.modelOptions.length > 0
				? opts.modelOptions
				: normalizeModelIds(
						sortFetchedModelIds(opts.availableModels),
						opts.modelOptionSource
					);
		const selectedOption = buildModelComboboxOptions({
			options: modelOptions,
			currentModelId: currentModel,
			source: opts.modelOptionSource,
		}).find((option) => option.id === currentModel.trim()) ?? null;

		const modelSetting = new Setting(containerEl)
			.setName(opts.modelLabel)
			.setDesc(opts.modelDesc);
		const warning =
			opts.modelOptionSource === "openrouter"
				? modelCompatibilityWarning(selectedOption)
				: "";
		if (warning) {
			modelSetting.descEl.createDiv({
				cls: "cuecraft-model-compatibility-warning",
				text: warning,
			});
		}
		renderModelCombobox({
			containerEl: modelSetting.controlEl,
			value: currentModel,
			options: modelOptions,
			source: opts.modelOptionSource,
			placeholder: opts.modelPlaceholder,
			emptyMessage: "No fetched models match. Press Enter or leave the field to keep a custom model ID.",
			onCommit: async (value) => {
				const previousValue = opts.getModel().trim();
				opts.setModel(value);
				await this.plugin.saveSettings();
				if (value !== previousValue) this.display();
			},
			renderToggleIcon: (iconEl) => setIcon(iconEl, "chevron-down"),
			badgesForOption: modelCompatibilityBadges,
		});
	}

	private renderCloudModelSettings(
		containerEl: HTMLElement,
		opts: {
			providerName: string;
			modelLabel: string;
			modelDesc: string;
			modelPlaceholder: string;
			modelOptionSource: ModelOptionSource;
			getModel: () => string;
			setModel: (v: string) => void;
			getApiKey: () => string;
			getAvailableModels: () => string[];
			getModelOptions?: () => ModelOption[];
			getHasFetchedModels: () => boolean;
			getRefreshMessage: () => string;
			setAvailableModels: (models: string[]) => void;
			setHasFetchedModels: (value: boolean) => void;
			setRefreshMessage: (value: string) => void;
			setModelOptions?: (options: ModelOption[]) => void;
		}
	): void {
		this.renderFetchedModelSelector(containerEl, {
			modelLabel: opts.modelLabel,
			modelDesc: opts.modelDesc,
			modelPlaceholder: opts.modelPlaceholder,
			availableModels: opts.getAvailableModels(),
			modelOptions: opts.getModelOptions?.(),
			modelOptionSource: opts.modelOptionSource,
			getModel: opts.getModel,
			setModel: opts.setModel,
		});

		new Setting(containerEl)
			.setName(`${opts.providerName} models`)
			.setDesc(
				this.resolveModelRefreshDescription(
					opts.getRefreshMessage(),
					opts.getApiKey().trim()
						? `Fetch ${opts.providerName}'s available model IDs for this account.`
						: `Enter your ${opts.providerName} API key first to fetch available models.`
				)
			)
			.addButton((btn) =>
				btn
					.setButtonText(
						opts.getHasFetchedModels() ? "Refresh models" : `Fetch ${opts.providerName} models`
					)
					.setDisabled(!opts.getApiKey().trim())
					.onClick(() =>
						void this.refreshCloudModels({
							providerName: opts.providerName,
							getAvailableModels: opts.getAvailableModels,
							getHasFetchedModels: opts.getHasFetchedModels,
							getRefreshMessage: opts.getRefreshMessage,
							setAvailableModels: opts.setAvailableModels,
							setHasFetchedModels: opts.setHasFetchedModels,
							setRefreshMessage: opts.setRefreshMessage,
							setModelOptions: opts.setModelOptions,
						})
					)
			);
	}

	private resolveModelRefreshDescription(
		refreshMessage: string,
		defaultDescription: string
	): string {
		return resolveModelRefreshDescription(refreshMessage, defaultDescription);
	}

	private async refreshCloudModels(opts: {
		providerName: string;
		getAvailableModels: () => string[];
		getHasFetchedModels: () => boolean;
		getRefreshMessage: () => string;
		setAvailableModels: (models: string[]) => void;
		setHasFetchedModels: (value: boolean) => void;
		setRefreshMessage: (value: string) => void;
		setModelOptions?: (options: ModelOption[]) => void;
	}): Promise<void> {
		const provider = this.plugin.makeProvider();
		opts.setHasFetchedModels(true);
		if (!provider.listModels) {
			opts.setAvailableModels([]);
			opts.setModelOptions?.([]);
			opts.setRefreshMessage(
				`CueCraft: ${opts.providerName} model fetch is unavailable.`
			);
			await this.plugin.saveSettings();
			this.display();
			return;
		}
		try {
			const raw = await provider.listModels();
			let ids: string[];
			if (raw.length > 0 && isModelOption(raw[0])) {
				const options = raw as ModelOption[];
				ids = options.map((o) => o.id);
				opts.setModelOptions?.(options);
			} else {
				ids = raw as string[];
				opts.setModelOptions?.([]);
			}
			const models = sortFetchedModelIds(ids);
			opts.setAvailableModels(models);
			opts.setRefreshMessage(
				models.length > 0
					? ""
					: `No ${opts.providerName} models were returned for this account.`
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			opts.setAvailableModels([]);
			opts.setModelOptions?.([]);
			opts.setRefreshMessage(
				message
					? `Could not fetch ${opts.providerName} models (${message}).`
					: `Could not fetch ${opts.providerName} models.`
			);
		}
		await this.plugin.saveSettings();
		this.display();
		const successCount = opts.getAvailableModels().length;
		new Notice(
			successCount > 0
				? `CueCraft: Fetched ${successCount} ${opts.providerName} model${successCount === 1 ? "" : "s"}.`
				: `CueCraft: ${opts.getRefreshMessage()}`
		);
	}

	private async refreshOllamaModels(): Promise<void> {
		const s = this.plugin.settings;
		const provider = this.plugin.makeProvider();
		s.ollamaHasFetchedModels = true;
		if (provider.id !== "ollama" || !provider.listModels) {
			s.ollamaAvailableModels = [];
			s.ollamaModelRefreshMessage =
				"CueCraft: Ollama model fetch is unavailable.";
			await this.plugin.saveSettings();
			this.display();
			return;
		}
		try {
			const models = sortFetchedModelIds((await provider.listModels()) as string[]);
			s.ollamaAvailableModels = models;
			s.ollamaModelRefreshMessage =
				models.length > 0
					? ""
					: "No Ollama models were returned by the configured host.";
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			s.ollamaAvailableModels = [];
			s.ollamaModelRefreshMessage = message
				? `Could not fetch Ollama models (${message}).`
				: "Could not fetch Ollama models.";
		}
		await this.plugin.saveSettings();
		this.display();
		new Notice(
			s.ollamaAvailableModels.length > 0
				? `CueCraft: Fetched ${s.ollamaAvailableModels.length} Ollama model${s.ollamaAvailableModels.length === 1 ? "" : "s"}.`
				: `CueCraft: ${s.ollamaModelRefreshMessage}`
		);
	}

	/** Verify the selected provider is reachable and reports a readable result. */
	private async testConnection(): Promise<void> {
		if (this.plugin.settings.provider !== "ollama") {
			await this.testCloudProvider();
			return;
		}
		const host = this.plugin.settings.ollamaHost.replace(/\/+$/, "");
		const model = this.plugin.settings.ollamaModel;
		try {
			const res = await requestUrl({ url: `${host}/api/tags`, method: "GET" });
			const models: string[] = (res.json?.models ?? []).map(
				(m: { name: string }) => m.name
			);
			if (model && !models.includes(model)) {
				new Notice(
					`CueCraft: connected, but model "${model}" is not installed. Run \`ollama pull ${model}\`.`
				);
				return;
			}
			this.plugin.settings.providerConnectionStatus =
				recordProviderConnectionSuccess(this.plugin.settings);
			await this.plugin.saveSettings();
			this.display();
			new Notice(`CueCraft: connected to Ollama (${models.length} model(s) available).`);
		} catch (err) {
			console.error("CueCraft test connection failed", err);
			new Notice("CueCraft: Ollama server unreachable. Check the host and that Ollama is running.");
		}
	}

	private async testCloudProvider(): Promise<void> {
		const provider = this.plugin.makeProvider();
		const apiKey = (() => {
			switch (provider.id) {
				case "anthropic":
					return this.plugin.settings.anthropicApiKey;
				case "openai":
					return this.plugin.settings.openaiApiKey;
				case "google":
					return this.plugin.settings.googleApiKey;
				case "xai":
					return this.plugin.settings.xaiApiKey;
				case "openrouter":
					return this.plugin.settings.openrouterApiKey;
				default:
					return "";
			}
		})();
		if (provider.id !== "ollama" && !apiKey.trim()) {
			const providerName =
				provider.id === "anthropic"
					? "Anthropic"
					: provider.id === "openai"
						? "OpenAI"
						: provider.id === "google"
							? "Google"
							: provider.id === "openrouter"
								? "OpenRouter"
								: "xAI";
			new Notice(`CueCraft: enter your ${providerName} API key first.`);
			return;
		}
		const selectedModel = (() => {
			switch (provider.id) {
				case "anthropic":
					return this.plugin.settings.anthropicModel.trim();
				case "openai":
					return this.plugin.settings.openaiModel.trim();
				case "google":
					return this.plugin.settings.googleModel.trim();
				case "xai":
					return this.plugin.settings.xaiModel.trim();
				case "openrouter":
					return this.plugin.settings.openrouterModel.trim();
				default:
					return "";
			}
		})();
		if (!selectedModel && provider.listModels) {
			try {
				const models = await provider.listModels();
				this.plugin.settings.providerConnectionStatus =
					recordProviderConnectionSuccess(this.plugin.settings);
				await this.plugin.saveSettings();
				this.display();
				const providerName =
					provider.id === "anthropic" ? "Anthropic" : provider.label;
				new Notice(
					`CueCraft: Connected to ${providerName} (${models.length} model${models.length === 1 ? "" : "s"} available). Choose a model and test again to verify generation with that model.`
				);
				return;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				new Notice(`CueCraft: ${message}`);
				return;
			}
		}
		const status = await provider.testConnection();
		if (status.ok) {
			this.plugin.settings.providerConnectionStatus =
				recordProviderConnectionSuccess(this.plugin.settings);
			await this.plugin.saveSettings();
			this.display();
		}
		if (status.ok && provider.id === "anthropic") {
			const model = describeAnthropicModel(
				this.plugin.settings.anthropicModel,
				this.plugin.settings.anthropicAvailableModels
			);
			new Notice(
				`CueCraft: Connected to Anthropic with ${model.label} (${model.rawId}).`
			);
			return;
		}
		if (status.ok) {
			new Notice(`CueCraft: ${status.message}`);
			return;
		}
		if (
			provider.id === "anthropic" &&
			/authentication_error|model|access|permission|unsupported|not found/i.test(
				status.message
			)
		) {
			new Notice(
				formatAnthropicUnavailableModelMessage(
					this.plugin.settings.anthropicModel,
					this.plugin.settings.anthropicAvailableModels
				)
			);
			return;
		}
		new Notice(`CueCraft: ${status.message}`);
	}
}

class StudyAreaConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly opts: {
			title: string;
			message: string;
			confirmText: string;
			onConfirm: () => void | Promise<void>;
		}
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: this.opts.title });
		contentEl.createEl("p", { text: this.opts.message });
		const actionsEl = contentEl.createDiv({ cls: "cuecraft-modal-actions" });
		const cancelBtn = actionsEl.createEl("button", {
			text: "Cancel",
			attr: { type: "button" },
		});
		cancelBtn.addEventListener("click", () => this.close());
		const confirmBtn = actionsEl.createEl("button", {
			text: this.opts.confirmText,
			attr: { type: "button" },
		});
		confirmBtn.addClass("mod-cta");
		confirmBtn.addEventListener("click", () => {
			void this.confirm();
		});
	}

	private async confirm(): Promise<void> {
		await this.opts.onConfirm();
		this.close();
	}
}
