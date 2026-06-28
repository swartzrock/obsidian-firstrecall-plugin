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
import { DEFAULT_CUE_ACCENT, type CueAccent } from "./cornell-accent";
import {
	DEFAULT_CORNELL_DISPLAY_MODE,
	cornellDisplayModeOption,
	type CornellDisplayMode,
} from "./cornell-display";
import {
	cornellDisplayModeThumbnailOptions,
	cornellStyleThumbnailOptions,
	cueAccentThumbnailOptions,
	cueColumnWidthThumbnailOptions,
	cueFontSizeThumbnailOptions,
	renderAppearanceThumbnailGroup,
	type AppearanceThumbnailGroup,
	type AppearanceThumbnailOption,
} from "./appearance-thumbnail-controls";
import {
	DEFAULT_READING_MODE_DISPLAY,
	READING_MODE_DISPLAY_OPTIONS,
	type ReadingModeDisplay,
} from "./reading-cues";
import {
	DEFAULT_EDITOR_CUE_DISPLAY,
	EDITOR_CUE_DISPLAY_OPTIONS,
	editorCueDisplayOption,
	type EditorCueDisplay,
} from "./editor-cue-display";
import {
	ANTHROPIC_CUSTOM_MODEL_ID,
	buildAnthropicModelOptions,
	describeAnthropicModel,
	formatAnthropicModelHint,
	formatAnthropicUnavailableModelMessage,
	isAnthropicCustomModelSelection,
	refreshAnthropicModelOptions,
	modelCompatibilityBadges,
	modelCompatibilityWarning,
	normalizeModelIds,
	sortFetchedModelIds,
	type ByokStoredSettings,
	type ModelOption,
	type ModelOptionSource,
} from "./byok";
import { formatParallelRequestsDescription } from "./parallel-requests-guidance";
import {
	applyCueCraftListedModels,
	applyCueCraftModelRefreshFailure,
	cueCraftProviderCredential,
	cueCraftProviderLabel,
	cueCraftProviderModel,
	deriveCueCraftProviderSetupStatus,
	isCueCraftLocalCliProvider,
	recordCueCraftProviderConnectionSuccess,
	resetCueCraftFetchedModels,
	type CueCraftFetchedModelProvider,
	type CueCraftProviderConnectionStatusMap,
} from "./byok-cuecraft-adapter";
import { resolveModelRefreshDescription } from "./model-refresh";
import {
	buildModelComboboxOptions,
	renderModelCombobox,
} from "./model-combobox";
import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";
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
import { formatCueCraftNotice } from "./notice";
import type { ProviderId } from "./provider-id";
import {
	AUTO_GENERATION_SETTLE_DELAY_SECONDS_OPTIONS,
	DEFAULT_AUTO_GENERATION_SETTLE_DELAY_SECONDS,
	formatAutoGenerationSettleDelayLabel,
	normalizeAutoGenerationSettleDelaySeconds,
	type AutoGenerationSettleDelaySeconds,
} from "./auto-generation-delay";

/**
 * CueCraft supports a local provider (Ollama), local CLI providers, and several
 * cloud providers via the Vercel AI SDK (Anthropic, OpenAI, Google, xAI). Each
 * cloud provider keeps its own API key + model id; only the selected provider's
 * fields are surfaced.
 */
export type CuePreset = "conceptual" | "exam-prep" | "vocabulary" | "minimal";
export type StudyHideMode = "blur" | "collapse";
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
	codexCliCommand: string;
	codexCliModel: string;
	claudeCliCommand: string;
	claudeCliModel: string;
	ollamaAvailableModels: string[];
	ollamaHasFetchedModels: boolean;
	ollamaModelRefreshMessage: string;
	providerConnectionStatus: CueCraftProviderConnectionStatusMap;
	byok: ByokStoredSettings;
	cuePreset: CuePreset;
	studyHideMode: StudyHideMode;
	cornellDisplayMode: CornellDisplayMode;
	editorCueDisplay: EditorCueDisplay;
	cornellStyle: CornellStyle;
	cueColumnWidth: CueColumnWidth;
	cueFontSize: CueFontSize;
	autoGenerateOnSave: boolean;
	autoGenerationSettleDelaySeconds: AutoGenerationSettleDelaySeconds;
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
	codexCliCommand: "codex",
	codexCliModel: "",
	claudeCliCommand: "claude",
	claudeCliModel: "",
	ollamaAvailableModels: [],
	ollamaHasFetchedModels: false,
	ollamaModelRefreshMessage: "",
	providerConnectionStatus: {},
	byok: {
		selectedProvider: "ollama",
		providers: {
			ollama: {
				credential: "http://localhost:11434",
				model: "llama3.1:8b",
				availableModels: [],
				modelOptions: [],
				hasFetchedModels: false,
				modelRefreshMessage: "",
			},
			"codex-cli": {
				credential: "codex",
				model: "",
				availableModels: [],
				modelOptions: [],
				hasFetchedModels: false,
				modelRefreshMessage: "",
			},
			"claude-cli": {
				credential: "claude",
				model: "",
				availableModels: [],
				modelOptions: [],
				hasFetchedModels: false,
				modelRefreshMessage: "",
			},
		},
		verification: {},
	},
	cuePreset: "conceptual",
	studyHideMode: "blur",
	cornellDisplayMode: DEFAULT_CORNELL_DISPLAY_MODE,
	editorCueDisplay: DEFAULT_EDITOR_CUE_DISPLAY,
	cornellStyle: DEFAULT_CORNELL_STYLE,
	cueColumnWidth: DEFAULT_CUE_COLUMN_WIDTH,
	cueFontSize: DEFAULT_CUE_FONT_SIZE,
	autoGenerateOnSave: false,
	autoGenerationSettleDelaySeconds:
		DEFAULT_AUTO_GENERATION_SETTLE_DELAY_SECONDS,
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
					"Cue Generation",
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
					"Study Areas",
					"Generate cues for your vault or specific folders. CueCraft keeps cues up-to-date for notes in these areas."
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
			title: "AI Provider & Settings",
			description: "Provider & model selection, connection check, and parallel request tuning.",
			summary: this.aiModelSummary(),
			onOpen: () => this.openSubpage("ai-model"),
		});
		this.renderSettingsNavCard(navEl, {
			title: "Study Areas",
			description: "Generate cues for your vault or specific folders.",
			summary: this.studyAreasSummary(),
			onOpen: () => this.openSubpage("study-areas"),
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
		const setup = deriveCueCraftProviderSetupStatus(this.plugin.settings);
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
		const editorDisplay = editorCueDisplayOption(
			this.plugin.settings.editorCueDisplay
		).label;
		const mode = cornellDisplayModeOption(
			this.plugin.settings.cornellDisplayMode
		).label;
		const style =
			CORNELL_STYLES.find(
				(item) => item.id === this.plugin.settings.cornellStyle
			)?.label ?? "Custom";
		return `${editorDisplay} · ${mode} · ${style} · ${this.plugin.settings.cueColumnWidth} width · ${this.plugin.settings.cueFontSize} text`;
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
			return `${this.vaultStudyAreaLabel()} · ${entireVaultArea.maintenanceMode === "maintain-on-save"
				? "updates on save"
				: "manual updates"
				}`;
		}
		return `${count} area${count === 1 ? "" : "s"} · ${enabled} update on save`;
	}

	private vaultStudyAreaLabel(): string {
		const vaultName = this.app.vault.getName().trim();
		if (!vaultName) return ENTIRE_VAULT_STUDY_AREA_LABEL;
		return /\bvault$/i.test(vaultName) ? vaultName : `${vaultName} Vault`;
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
			case "codex-cli":
				return "Codex CLI";
			case "claude-cli":
				return "Claude CLI";
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
			case "codex-cli":
				return settings.codexCliModel.trim() || "CLI default";
			case "claude-cli":
				return settings.claudeCliModel.trim() || "CLI default";
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
			.setDesc("Where cues are generated. Ollama runs locally; API providers use saved keys; CLI providers use your local command login.")
			.addDropdown((dd) =>
				dd
					.addOption("ollama", "Ollama (local)")
					.addOption("anthropic", "Anthropic (Claude)")
					.addOption("openai", "OpenAI (ChatGPT)")
					.addOption("google", "Google (Gemini)")
					.addOption("xai", "xAI (Grok)")
					.addOption("openrouter", "OpenRouter")
					.addOption("codex-cli", "Codex CLI")
					.addOption("claude-cli", "Claude CLI")
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
			"Enter the API key, host, or local CLI command so CueCraft can reach this provider."
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
			isCueCraftLocalCliProvider(this.plugin.settings.provider)
				? "Optionally override the model. Leave it blank to use your CLI default."
				: "Select the model CueCraft should use after the provider is connected."
		);

		this.renderProviderModelSettings(setupFlowEl);
		this.renderProviderSetupStatus(setupFlowEl);

		this.renderSettingsFlowHeading(
			setupFlowEl,
			"5. Tune speed",
			isCueCraftLocalCliProvider(this.plugin.settings.provider)
				? "Adjust how many sections CueCraft batches into each local CLI request."
				: "Adjust how aggressively CueCraft generates section cues in parallel."
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
		const status = deriveCueCraftProviderSetupStatus(this.plugin.settings);
		const isCli = isCueCraftLocalCliProvider(this.plugin.settings.provider);
		const cliModelLabel = this.selectedModelLabel() === "CLI default"
			? "CLI default"
			: "Model override";
		const statusSetting = new Setting(containerEl)
			.setName("Setup status")
			.setDesc(
				status.connection === "verified" && status.testedAt
					? isCli
						? `Last verified the current CLI command and model setting ${new Date(status.testedAt).toLocaleString()}.`
						: status.modelSelected
						? `Last verified the current key and selected model ${new Date(status.testedAt).toLocaleString()}.`
						: `Last verified provider access ${new Date(status.testedAt).toLocaleString()}. Choose a model and test again to verify generation with that model.`
					: status.connection === "stale"
						? isCli
							? "The saved connection check no longer matches the current CLI command or model setting."
							: "The saved connection check no longer matches the current key or selected model."
						: isCli
							? "Save the CLI command, then run Test connection. Leave the model blank to use your CLI default."
							: "Save the key or host, choose a model, then run Test connection. Without a selected model, CueCraft checks provider access only."
			);
		statusSetting.controlEl.addClass("cuecraft-status-chips");
		this.renderStatusChip(
			statusSetting.controlEl,
			isCli
				? status.keySaved
					? "Command saved"
					: "Command missing"
				: status.keySaved
					? "Key saved"
					: "Key missing",
			status.keySaved ? "is-positive" : "is-muted"
		);
		this.renderStatusChip(
			statusSetting.controlEl,
			isCli
				? cliModelLabel
				: status.modelSelected
					? "Model selected"
					: "Model missing",
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

		new Setting(containerEl)
			.setName("Auto-generation delay")
			.setDesc(
				"Wait this long after you stop typing before CueCraft auto-generates cues. Longer delays reduce repeated API calls."
			)
			.addDropdown((dropdown) => {
				for (const seconds of AUTO_GENERATION_SETTLE_DELAY_SECONDS_OPTIONS) {
					dropdown.addOption(
						String(seconds),
						formatAutoGenerationSettleDelayLabel(seconds)
					);
				}
				dropdown
					.setValue(
						String(this.plugin.settings.autoGenerationSettleDelaySeconds)
					)
					.onChange(async (value) => {
						this.plugin.settings.autoGenerationSettleDelaySeconds =
							normalizeAutoGenerationSettleDelaySeconds(Number(value));
						await this.plugin.saveSettings();
					});
			});
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
		const vaultScopeLabel = this.vaultStudyAreaLabel();
		const availableScopes = hasEntireVaultArea
			? []
			: [
					...(!hasStudyAreas ? [vaultScopeLabel] : []),
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
					? `${vaultScopeLabel} is already a study area`
					: "Choose notes to include"
			)
			.setDesc(
				hasEntireVaultArea
					? "Remove the existing study area above before adding a specific folder."
					: hasStudyAreas
						? `Type to filter existing vault folders. Remove folder study areas above to choose ${vaultScopeLabel}.`
						: `Select ${vaultScopeLabel} or an existing folder; hidden notes are not eligible.`
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
					? `No matching scopes. Choose ${vaultScopeLabel} or an existing vault folder.`
					: "No unassigned folders found.",
				onCommit: async (value) => {
					const selectedScope = value.trim();
					const isEntireVaultSelection =
						selectedScope.toLowerCase() ===
							ENTIRE_VAULT_STUDY_AREA_LABEL.toLowerCase() ||
						selectedScope.toLowerCase() === vaultScopeLabel.toLowerCase();
					const normalized = isEntireVaultSelection
						? ""
						: normalizeVaultPath(selectedScope);
					if (!normalized && !isEntireVaultSelection) return;
					if (isEntireVaultSelection && hasStudyAreas) {
						new Notice(
							`CueCraft: remove folder study areas before using ${vaultScopeLabel}.`
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
				pinnedOptionIds: [vaultScopeLabel],
				suggestionsLabel: "scope suggestions",
			});
		}
	}

	private renderStudyAreaRow(containerEl: HTMLElement, area: StudyArea): void {
		const setting = new Setting(containerEl).setName(
			isEntireVaultStudyArea(area) ? this.vaultStudyAreaLabel() : area.name
		);
		setting.settingEl.addClass("cuecraft-study-area-row");
		setting.descEl.empty();
		if (!isEntireVaultStudyArea(area)) {
			setting.descEl.createDiv({
				cls: "cuecraft-study-area-path",
				text: studyAreaScopeLabel(area.parentPath),
			});
		}
		const countsEl = setting.descEl.createDiv({
			cls: "cuecraft-study-area-counts",
			text: "Checking notes...",
		});
		const upToDateEl = setting.descEl.createDiv({
			cls: "cuecraft-study-area-status",
			text: "Up to date",
		});
		upToDateEl.hidden = true;
		setting.descEl.createDiv({
			cls: "cuecraft-study-area-help",
			text:
				area.maintenanceMode === "maintain-on-save"
					? "Cues update automatically when notes in this area are saved."
					: "Saved notes in this area will not update automatically.",
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
			text: "Generate missing cues",
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
			this.renderStudyAreaPlan(
				countsEl,
				upToDateEl,
				backfillBtn,
				retryBtn,
				plan
			);
		});

		this.plugin.registerDomEvent(backfillBtn, "click", async () => {
			upToDateEl.hidden = true;
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
		upToDateEl: HTMLElement,
		backfillBtn: HTMLButtonElement,
		retryBtn: HTMLButtonElement,
		plan: StudyAreaGenerationPlan | null
	): void {
		if (!plan) {
			countsEl.setText("Study area no longer exists.");
			upToDateEl.hidden = true;
			backfillBtn.disabled = true;
			backfillBtn.textContent = "Generate missing cues";
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
		const hasMissingCueWork = plan.items.some(
			(item) => item.readiness === "uncued" || item.readiness === "stale"
		);
		const hasFailedWork = plan.counts.failed > 0;
		upToDateEl.hidden =
			hasMissingCueWork || hasFailedWork || plan.counts.ready === 0;
		backfillBtn.disabled = !hasMissingCueWork;
		backfillBtn.textContent = "Generate missing cues";
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

		const editorDisplaySetting = new Setting(containerEl)
			.setName("Editor cue display")
			.addDropdown((dd) => {
				for (const option of EDITOR_CUE_DISPLAY_OPTIONS) {
					dd.addOption(option.id, option.label);
				}
				dd.setValue(this.plugin.settings.editorCueDisplay).onChange(
					async (value) => {
						this.plugin.settings.editorCueDisplay =
							value as EditorCueDisplay;
						await this.plugin.saveSettings();
						this.plugin.refreshEditorCues();
						editorDisplaySetting.setDesc(editorDisplayDesc());
					}
				);
			});
		const editorDisplayDesc = (): string =>
			editorCueDisplayOption(this.plugin.settings.editorCueDisplay).description;
		editorDisplaySetting.setDesc(editorDisplayDesc());

		const displayDesc = (): string =>
			cornellDisplayModeOption(this.plugin.settings.cornellDisplayMode)
				.description;
		this.renderAppearanceThumbnailSetting<CornellDisplayMode>(containerEl, {
			name: "Cornell display mode",
			description: displayDesc,
			options: cornellDisplayModeThumbnailOptions(),
			value: () => this.plugin.settings.cornellDisplayMode,
			setValue: (value) => {
				this.plugin.settings.cornellDisplayMode = value;
			},
			className: "cuecraft-thumbnail-group-display-mode",
		});

		const styleDesc = (): string =>
			CORNELL_STYLES.find((s) => s.id === this.plugin.settings.cornellStyle)
				?.description ?? "Visual preset for the Cornell view.";
		this.renderAppearanceThumbnailSetting<CornellStyle>(containerEl, {
			name: "Cornell view style",
			description: styleDesc,
			options: cornellStyleThumbnailOptions(),
			value: () => this.plugin.settings.cornellStyle,
			setValue: (value) => {
				this.plugin.settings.cornellStyle = value;
			},
			className: "cuecraft-thumbnail-group-view-style",
		});

		const widthDesc = (): string =>
			CUE_COLUMN_WIDTHS.find(
				(w) => w.id === this.plugin.settings.cueColumnWidth
			)?.description ?? "Width of the Cornell cue rail.";
		this.renderAppearanceThumbnailSetting<CueColumnWidth>(containerEl, {
			name: "Cue column width",
			description: widthDesc,
			options: cueColumnWidthThumbnailOptions(),
			value: () => this.plugin.settings.cueColumnWidth,
			setValue: (value) => {
				this.plugin.settings.cueColumnWidth = value;
			},
			className: "cuecraft-thumbnail-group-cue-width",
		});

		const fontDesc = (): string =>
			CUE_FONT_SIZES.find((f) => f.id === this.plugin.settings.cueFontSize)
				?.description ?? "Font size of the Cornell cue text.";
		this.renderAppearanceThumbnailSetting<CueFontSize>(containerEl, {
			name: "Cue font size",
			description: fontDesc,
			options: cueFontSizeThumbnailOptions(),
			value: () => this.plugin.settings.cueFontSize,
			setValue: (value) => {
				this.plugin.settings.cueFontSize = value;
			},
			className: "cuecraft-thumbnail-group-cue-font",
		});

		this.renderAppearanceThumbnailSetting<CueAccent>(containerEl, {
			name: "Cue accent color",
			description: () => "Accent used for the cue rail and support text.",
			options: cueAccentThumbnailOptions(),
			value: () => this.plugin.settings.cueAccent,
			setValue: (value) => {
				this.plugin.settings.cueAccent = value;
			},
			className: "cuecraft-thumbnail-group-accent",
		});

		new Setting(containerEl)
			.setName("Show cue column border")
			.setDesc("Draw a divider between the cue column and note content.")
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.showCueBorder)
					.onChange(async (value) => {
						this.plugin.settings.showCueBorder = value;
						await this.saveAppearanceChange();
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
						await this.saveAppearanceChange();
					})
			);
	}

	private async saveAppearanceChange(afterSave?: () => void): Promise<void> {
		await this.plugin.saveSettings();
		this.plugin.refreshCornellViews();
		afterSave?.();
	}

	private renderAppearanceThumbnailSetting<T extends string>(
		containerEl: HTMLElement,
		config: {
			name: string;
			description: () => string;
			options: readonly AppearanceThumbnailOption<T>[];
			value: () => T;
			setValue: (value: T) => void;
			className?: string;
		}
	): void {
		const setting = new Setting(containerEl)
			.setName(config.name)
			.setDesc(config.description());
		setting.settingEl.addClass("cuecraft-thumbnail-setting");
		setting.then(() => {
			let group: AppearanceThumbnailGroup<T>;
			group = renderAppearanceThumbnailGroup({
				parentEl: setting.controlEl,
				options: config.options,
				value: config.value(),
				groupLabel: config.name,
				className: config.className,
				onSelect: async (value) => {
					config.setValue(value);
					await this.saveAppearanceChange(() => {
						setting.setDesc(config.description());
						group.setValue(config.value());
					});
				},
			});
		});
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
						resetCueCraftFetchedModels(
							this.plugin.settings,
							"ollama",
							"Enter your Ollama host first to fetch local models."
						);
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

	private renderCliCredentialSettings(
		containerEl: HTMLElement,
		opts: {
			providerName: string;
			commandPlaceholder: string;
			getCommand: () => string;
			setCommand: (value: string) => void;
		}
	): void {
		const setting = new Setting(containerEl)
			.setName(`${opts.providerName} command`)
			.setDesc(
				`Command name or absolute path for your local ${opts.providerName}. CueCraft uses your existing CLI login and does not store an API key for this provider.`
			)
			.addText((text) => {
				text.inputEl.addClass("cuecraft-cli-text-input");
				text
					.setPlaceholder(opts.commandPlaceholder)
					.setValue(opts.getCommand())
					.onChange(async (value) => {
						opts.setCommand(value.trim());
						await this.plugin.saveSettings();
					});
			});
		setting.settingEl.addClass("cuecraft-cli-text-setting");
	}

	private renderCliModelSettings(
		containerEl: HTMLElement,
		opts: {
			providerName: string;
			modelPlaceholder: string;
			getModel: () => string;
			setModel: (value: string) => void;
		}
	): void {
		const setting = new Setting(containerEl)
			.setName(`${opts.providerName} model override`)
			.setDesc(
				`Optional. Leave blank to use your ${opts.providerName} default model.`
			)
			.addText((text) => {
				text.inputEl.addClass("cuecraft-cli-text-input");
				text
					.setPlaceholder(opts.modelPlaceholder)
					.setValue(opts.getModel())
					.onChange(async (value) => {
						opts.setModel(value.trim());
						await this.plugin.saveSettings();
					});
			});
		setting.settingEl.addClass("cuecraft-cli-text-setting");
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
						resetCueCraftFetchedModels(
							s,
							"anthropic",
							"Enter your Anthropic API key, then fetch models to load account-specific Claude options."
						);
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
		const result = await refreshAnthropicModelOptions({
			listModels: async () =>
				(await provider.listModels?.()) as unknown as ModelInfo[],
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
						resetCueCraftFetchedModels(
							s,
							"openai",
							"Enter your OpenAI API key first to fetch available models."
						);
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
						resetCueCraftFetchedModels(
							s,
							"google",
							"Enter your Google API key first to fetch available models."
						);
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
						resetCueCraftFetchedModels(
							s,
							"xai",
							"Enter your xAI API key first to fetch available models."
						);
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
						resetCueCraftFetchedModels(
							s,
							"openrouter",
							"Enter your OpenRouter API key first to fetch available models."
						);
					},
				});
				return;
			case "codex-cli":
				this.renderCliCredentialSettings(containerEl, {
					providerName: "Codex CLI",
					commandPlaceholder: "codex",
					getCommand: () => s.codexCliCommand,
					setCommand: (value) => (s.codexCliCommand = value),
				});
				return;
			case "claude-cli":
				this.renderCliCredentialSettings(containerEl, {
					providerName: "Claude CLI",
					commandPlaceholder: "claude",
					getCommand: () => s.claudeCliCommand,
					setCommand: (value) => (s.claudeCliCommand = value),
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
					provider: "openai",
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
				});
				return;
			case "google":
				this.renderCloudModelSettings(containerEl, {
					provider: "google",
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
				});
				return;
			case "xai":
				this.renderCloudModelSettings(containerEl, {
					provider: "xai",
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
				});
				return;
			case "openrouter":
				this.renderCloudModelSettings(containerEl, {
					provider: "openrouter",
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
				});
				return;
			case "codex-cli":
				this.renderCliModelSettings(containerEl, {
					providerName: "Codex CLI",
					modelPlaceholder: "CLI default",
					getModel: () => s.codexCliModel,
					setModel: (value) => (s.codexCliModel = value),
				});
				return;
			case "claude-cli":
				this.renderCliModelSettings(containerEl, {
					providerName: "Claude CLI",
					modelPlaceholder: "sonnet",
					getModel: () => s.claudeCliModel,
					setModel: (value) => (s.claudeCliModel = value),
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
			provider: CueCraftFetchedModelProvider;
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
							provider: opts.provider,
							providerName: opts.providerName,
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

	private modelRefreshCount(provider: CueCraftFetchedModelProvider): number {
		const s = this.plugin.settings;
		switch (provider) {
			case "ollama":
				return s.ollamaAvailableModels.length;
			case "openai":
				return s.openaiAvailableModels.length;
			case "google":
				return s.googleAvailableModels.length;
			case "xai":
				return s.xaiAvailableModels.length;
			case "openrouter":
				return s.openrouterAvailableModels.length;
		}
	}

	private modelRefreshMessage(provider: CueCraftFetchedModelProvider): string {
		const s = this.plugin.settings;
		switch (provider) {
			case "ollama":
				return s.ollamaModelRefreshMessage;
			case "openai":
				return s.openaiModelRefreshMessage;
			case "google":
				return s.googleModelRefreshMessage;
			case "xai":
				return s.xaiModelRefreshMessage;
			case "openrouter":
				return s.openrouterModelRefreshMessage;
		}
	}

	private async refreshCloudModels(opts: {
		provider: CueCraftFetchedModelProvider;
		providerName: string;
	}): Promise<void> {
		const provider = this.plugin.makeProvider();
		if (!provider.listModels) {
			applyCueCraftModelRefreshFailure(
				this.plugin.settings,
				opts.provider,
				`CueCraft: ${opts.providerName} model fetch is unavailable.`
			);
			await this.plugin.saveSettings();
			this.display();
			return;
		}
		try {
			const raw = await provider.listModels();
			applyCueCraftListedModels(
				this.plugin.settings,
				opts.provider,
				raw,
				`No ${opts.providerName} models were returned for this account.`
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			applyCueCraftModelRefreshFailure(
				this.plugin.settings,
				opts.provider,
				message
					? `Could not fetch ${opts.providerName} models (${message}).`
					: `Could not fetch ${opts.providerName} models.`
			);
		}
		await this.plugin.saveSettings();
		this.display();
		const successCount = this.modelRefreshCount(opts.provider);
		const refreshMessage = this.modelRefreshMessage(opts.provider);
		new Notice(
			successCount > 0
				? `CueCraft: Fetched ${successCount} ${opts.providerName} model${successCount === 1 ? "" : "s"}.`
				: `CueCraft: ${refreshMessage}`
		);
	}

	private async refreshOllamaModels(): Promise<void> {
		const s = this.plugin.settings;
		const provider = this.plugin.makeProvider();
		if (provider.id !== "ollama" || !provider.listModels) {
			applyCueCraftModelRefreshFailure(
				s,
				"ollama",
				"CueCraft: Ollama model fetch is unavailable."
			);
			await this.plugin.saveSettings();
			this.display();
			return;
		}
		try {
			applyCueCraftListedModels(
				s,
				"ollama",
				await provider.listModels(),
				"No Ollama models were returned by the configured host."
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			applyCueCraftModelRefreshFailure(
				s,
				"ollama",
				message
					? `Could not fetch Ollama models (${message}).`
					: "Could not fetch Ollama models."
			);
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
		if (isCueCraftLocalCliProvider(this.plugin.settings.provider)) {
			await this.testLocalCliProvider();
			return;
		}
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
				recordCueCraftProviderConnectionSuccess(this.plugin.settings);
			await this.plugin.saveSettings();
			this.display();
			new Notice(`CueCraft: connected to Ollama (${models.length} model(s) available).`);
		} catch (err) {
			console.error("CueCraft test connection failed", err);
			new Notice("CueCraft: Ollama server unreachable. Check the host and that Ollama is running.");
		}
	}

	private async testLocalCliProvider(): Promise<void> {
		const command =
			this.plugin.settings.provider === "codex-cli"
				? this.plugin.settings.codexCliCommand
				: this.plugin.settings.claudeCliCommand;
		if (!command.trim()) {
			const providerName =
				this.plugin.settings.provider === "codex-cli" ? "Codex CLI" : "Claude CLI";
			new Notice(`CueCraft: enter your ${providerName} command first.`);
			return;
		}
		const provider = this.plugin.makeProvider();
		const status = await provider.testConnection();
		if (status.ok) {
			this.plugin.settings.providerConnectionStatus =
				recordCueCraftProviderConnectionSuccess(this.plugin.settings);
			await this.plugin.saveSettings();
			this.display();
		}
		new Notice(formatCueCraftNotice(status.message));
	}

	private async testCloudProvider(): Promise<void> {
		const provider = this.plugin.makeProvider();
		const apiKey = cueCraftProviderCredential(this.plugin.settings, provider.id);
		if (provider.id !== "ollama" && !apiKey.trim()) {
			const providerName = cueCraftProviderLabel(provider.id);
			new Notice(`CueCraft: enter your ${providerName} API key first.`);
			return;
		}
		const selectedModel = cueCraftProviderModel(
			this.plugin.settings,
			provider.id
		).trim();
		if (!selectedModel && provider.listModels) {
			try {
				const models = await provider.listModels();
				this.plugin.settings.providerConnectionStatus =
					recordCueCraftProviderConnectionSuccess(this.plugin.settings);
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
				new Notice(formatCueCraftNotice(message));
				return;
			}
		}
		const status = await provider.testConnection();
		if (status.ok) {
			this.plugin.settings.providerConnectionStatus =
				recordCueCraftProviderConnectionSuccess(this.plugin.settings);
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
			new Notice(formatCueCraftNotice(status.message));
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
		new Notice(formatCueCraftNotice(status.message));
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
