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
	anthropicModelInfoToByokModelOption,
	buildAnthropicModelOptions,
	byokProviderDefinition,
	byokProviderDefinitions,
	describeAnthropicModel,
	formatAnthropicModelHint,
	formatAnthropicUnavailableModelMessage,
	isByokProviderId,
	isAnthropicCustomModelSelection,
	refreshAnthropicModelOptions,
	modelCompatibilityBadges,
	modelCompatibilityWarning,
	normalizeModelIds,
	sortFetchedModelIds,
	type ByokProviderDefinition,
	type ByokProviderId,
	type ByokProviderRuntime,
	type ByokStoredSettings,
	type ModelOption,
	type ModelOptionSource,
} from "./byok";
import { formatParallelRequestsDescription } from "./parallel-requests-guidance";
import {
	applyCueCraftListedModels,
	applyCueCraftModelRefreshFailure,
	cueCraftFetchedModelCount,
	cueCraftModelRefreshMessage,
	cueCraftProviderCredential,
	cueCraftProviderCredentialLength,
	cueCraftProviderLabel,
	cueCraftProviderModel,
	cueCraftProviderSettings,
	cueCraftSelectedProvider,
	deriveCueCraftProviderSetupStatus,
	isCueCraftLocalCliProvider,
	recordCueCraftProviderConnectionSuccess,
	resetCueCraftFetchedModels,
	setCueCraftProviderCredential,
	setCueCraftProviderModel,
	setCueCraftSelectedProvider,
	type CueCraftFetchedModelProvider,
} from "./byok-cuecraft-adapter";
import { isCueCraftCloudCredentialProvider } from "./secure-credential-store";
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
import {
	SAVED_CLOUD_CREDENTIAL_MASK,
	cloudCredentialMask,
	cloudCredentialDisplayState,
} from "./cloud-credential-settings";
import {
	AUTO_GENERATION_SETTLE_DELAY_SECONDS_OPTIONS,
	DEFAULT_AUTO_GENERATION_SETTLE_DELAY_SECONDS,
	formatAutoGenerationSettleDelayLabel,
	normalizeAutoGenerationSettleDelaySeconds,
	type AutoGenerationSettleDelaySeconds,
} from "./auto-generation-delay";
import {
	DEFAULT_SHOW_NOTE_BRIEF,
	DEFAULT_SHOW_SECTION_LENS,
} from "./review-surfaces";

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
const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_PATH_ATTRIBUTE_ALLOWLIST = new Set([
	"clip-rule",
	"d",
	"fill",
	"fill-rule",
	"stroke",
	"stroke-width",
]);

export interface CueCraftSettings {
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
	showSectionLens: boolean;
	showNoteBrief: boolean;
	renderInReadingMode: boolean;
	readingModeDisplay: ReadingModeDisplay;
	foldCueColumnOnMobile: boolean;
	cueAccent: CueAccent;
	showCueBorder: boolean;
	compactChips: boolean;
}

export const DEFAULT_SETTINGS: CueCraftSettings = {
	byok: {
		selectedProvider: "ollama",
		providers: {
				ollama: {
					credential: "http://localhost:11434",
					model: "llama3.1:8b",
					modelSelection: "",
					availableModels: [],
					modelOptions: [],
					hasFetchedModels: false,
				modelRefreshMessage: "",
			},
				"codex-cli": {
					credential: "codex",
					model: "",
					modelSelection: "",
					availableModels: [],
					modelOptions: [],
					hasFetchedModels: false,
				modelRefreshMessage: "",
			},
				"claude-cli": {
					credential: "claude",
					model: "",
					modelSelection: "",
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
	showSectionLens: DEFAULT_SHOW_SECTION_LENS,
	showNoteBrief: DEFAULT_SHOW_NOTE_BRIEF,
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
		const providerLabel = this.providerDisplayName(
			cueCraftSelectedProvider(this.plugin.settings)
		);
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

	private providerDisplayName(provider: ByokProviderId): string {
		return byokProviderDefinition(provider).shortLabel;
	}

	private selectedModelLabel(): string {
		const settings = this.plugin.settings;
		const provider = cueCraftSelectedProvider(settings);
		const modelId = cueCraftProviderModel(settings).trim();
		if (provider === "anthropic") {
			if (!modelId) return "";
			const stored = cueCraftProviderSettings(settings, "anthropic");
			const described = describeAnthropicModel(
				modelId,
				stored.modelOptions
			);
			return described.label === "Custom model ID"
				? described.rawId || described.label
				: described.label;
		}
		return byokProviderDefinition(provider).modelBehavior === "optional"
			? modelId || "CLI default"
			: modelId;
	}

	// ── AI model ──────────────────────────────────────────────────────────
	private renderAiModelSection(
		containerEl: HTMLElement,
		showHeading: boolean
	): void {
		if (showHeading) {
			new Setting(containerEl).setName("AI model").setHeading();
		}

		const providerFlowEl = containerEl.createDiv({
			cls: "cuecraft-settings-flow",
		});
		this.renderSettingsFlowHeading(
			providerFlowEl,
			"Provider",
			"Pick where CueCraft should generate cues."
		);

		this.renderProviderPicker(providerFlowEl);

		this.renderProviderSetupPanel(providerFlowEl);

		this.renderAiModelPerformanceSection(containerEl);
	}

	private renderAiModelPerformanceSection(containerEl: HTMLElement): void {
		const performanceFlowEl = containerEl.createDiv({
			cls: "cuecraft-settings-flow",
		});
		this.renderSettingsFlowHeading(
			performanceFlowEl,
			"Performance",
			"Tune how quickly CueCraft generates cues."
		);
		this.renderParallelRequestsSetting(performanceFlowEl);
	}

	private renderParallelRequestsSetting(containerEl: HTMLElement): void {
		const concurrencyDesc = (): string =>
			formatParallelRequestsDescription(this.plugin.settings);
		const concurrencySetting = new Setting(containerEl)
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

	private renderProviderSetupPanel(containerEl: HTMLElement): void {
		const definition = byokProviderDefinition(
			cueCraftSelectedProvider(this.plugin.settings)
		);
		const panelEl = containerEl.createDiv({
			cls: "cuecraft-active-provider-panel",
		});
		const headerEl = panelEl.createDiv({
			cls: "cuecraft-active-provider-header",
		});
		this.renderProviderIcon(headerEl, definition);
		headerEl.createDiv({
			cls: "cuecraft-active-provider-title",
			text: definition.label,
		});
		const fieldsEl = panelEl.createDiv({
			cls: "cuecraft-active-provider-fields",
		});
		this.renderProviderCredentialSettings(fieldsEl);
		this.renderProviderModelSettings(fieldsEl);
		this.renderProviderSetupStatus(fieldsEl);
	}

	private renderProviderPicker(containerEl: HTMLElement): void {
		const pickerEl = containerEl.createDiv({
			cls: "cuecraft-provider-picker",
			attr: {
				role: "radiogroup",
				"aria-label": "AI provider",
			},
		});
		const selectedProvider = cueCraftSelectedProvider(this.plugin.settings);
		for (const definition of byokProviderDefinitions()) {
			const isSelected = definition.id === selectedProvider;
			const buttonEl = pickerEl.createEl("button", {
				cls: `cuecraft-provider-button${isSelected ? " is-selected" : ""}`,
				attr: {
					type: "button",
					role: "radio",
					"aria-checked": String(isSelected),
					"aria-label": definition.label,
				},
			});
			this.renderProviderIcon(buttonEl, definition);
			buttonEl.createSpan({
				cls: "cuecraft-provider-button-label",
				text: definition.shortLabel,
			});
			buttonEl.createSpan({ cls: "cuecraft-provider-radio" });
			this.plugin.registerDomEvent(buttonEl, "click", () => {
				void this.selectProvider(definition.id);
			});
		}
	}

	private renderProviderIcon(
		containerEl: HTMLElement,
		definition: ByokProviderDefinition
	): void {
		const iconEl = containerEl.createSpan({
			cls: "cuecraft-provider-icon",
			attr: { "aria-hidden": "true" },
		});
		const svgEl = activeDocument.createElementNS(SVG_NS, "svg");
		svgEl.setAttribute("viewBox", definition.icon.viewBox);
		svgEl.setAttribute("fill", "currentColor");
		svgEl.setAttribute("stroke", "currentColor");
		svgEl.setAttribute("focusable", "false");
		for (const match of definition.icon.svg.matchAll(/<path\s+([^>]*)\/?>/g)) {
			const pathEl = activeDocument.createElementNS(SVG_NS, "path");
			for (const attr of (match[1] ?? "").matchAll(/([a-z-]+)="([^"]*)"/g)) {
				const [, name, value] = attr;
				if (name && value && SVG_PATH_ATTRIBUTE_ALLOWLIST.has(name)) {
					pathEl.setAttribute(name, value);
				}
			}
			svgEl.appendChild(pathEl);
		}
		iconEl.appendChild(svgEl);
	}

	private async selectProvider(provider: string): Promise<void> {
		if (!isByokProviderId(provider)) return;
		if (provider === cueCraftSelectedProvider(this.plugin.settings)) return;
		setCueCraftSelectedProvider(this.plugin.settings, provider);
		await this.plugin.saveSettings();
		this.display();
	}

	private renderProviderSetupStatus(containerEl: HTMLElement): void {
		const status = deriveCueCraftProviderSetupStatus(this.plugin.settings);
		const isCli = isCueCraftLocalCliProvider(
			cueCraftSelectedProvider(this.plugin.settings)
		);
		const cliModelLabel = this.selectedModelLabel() === "CLI default"
			? "CLI default"
			: "Model override";
		const description =
			status.connection === "verified" && status.testedAt
				? `Last checked ${new Date(status.testedAt).toLocaleString()}.`
				: status.connection === "stale"
					? "Saved check no longer matches these settings."
					: "Run a quick provider check before generating cues.";
		const statusSetting = new Setting(containerEl)
			.setName("Connection")
			.setDesc(description);
		statusSetting.settingEl.addClass("cuecraft-provider-connection-setting");
		const chipsEl = statusSetting.controlEl.createDiv({
			cls: "cuecraft-status-chips",
		});
		this.renderStatusChip(
			chipsEl,
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
			chipsEl,
			isCli
				? cliModelLabel
				: status.modelSelected
					? "Model selected"
					: "Model missing",
			status.modelSelected ? "is-positive" : "is-muted"
		);
		this.renderStatusChip(
			chipsEl,
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
		statusSetting.addButton((btn) =>
			btn
				.setButtonText("Test connection")
				.onClick(() => void this.testConnection())
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
			.setName("Show Section Lens")
			.setDesc("Show the generated key phrase and takeaway for each section.")
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.showSectionLens)
					.onChange(async (value) => {
						this.plugin.settings.showSectionLens = value;
						await this.plugin.saveSettings();
						this.refreshReviewSurfaces();
					})
			);

		new Setting(containerEl)
			.setName("Show Note Brief")
			.setDesc("Show the generated whole-note brief when review surfaces support it.")
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.showNoteBrief)
					.onChange(async (value) => {
						this.plugin.settings.showNoteBrief = value;
						await this.plugin.saveSettings();
						this.refreshReviewSurfaces();
					})
			);

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

	private refreshReviewSurfaces(): void {
		this.plugin.refreshEditorCues();
		this.plugin.refreshReadingModeSurface();
		this.plugin.refreshCornellViews();
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
		const field = byokProviderDefinition("ollama").credentialField;
		const s = this.plugin.settings;
		new Setting(containerEl)
			.setName(field.label)
			.setDesc(field.description)
			.addText((text) =>
				text
					.setPlaceholder(field.placeholder)
					.setValue(cueCraftProviderCredential(s, "ollama"))
					.onChange(async (value) => {
						setCueCraftProviderCredential(s, "ollama", value.trim());
						resetCueCraftFetchedModels(
							s,
							"ollama",
							field.resetModelsMessage ?? field.missingMessage
						);
						await this.plugin.saveSettings();
					})
			);

	}

	private renderOllamaModelSettings(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		const stored = cueCraftProviderSettings(s, "ollama");
		const definition = byokProviderDefinition("ollama");
		const field = definition.modelField;
		const modelSetting = this.renderFetchedModelSelector(containerEl, {
			modelLabel: field.label,
			modelDesc: this.resolveModelRefreshDescription(
				stored.modelRefreshMessage,
				field.description
			),
			modelPlaceholder: field.placeholder,
			availableModels: stored.availableModels,
			modelOptionSource: field.optionSource ?? "ollama",
			getModel: () => cueCraftProviderModel(s, "ollama"),
			setModel: (value) => setCueCraftProviderModel(s, "ollama", value),
		});
		this.addModelRefreshButton(modelSetting, {
			definition,
			hasFetchedModels: stored.hasFetchedModels,
			disabled: !cueCraftProviderCredential(s, "ollama").trim(),
			onClick: () =>
				void this.refreshProviderModels({
					provider: "ollama",
					providerName: definition.shortLabel,
					emptyMessage:
						definition.modelField.emptyListMessage ??
						`No ${definition.shortLabel} models were returned.`,
				}),
		});
	}

	private renderCliCredentialSettings(
		containerEl: HTMLElement,
		opts: {
			label: string;
			description: string;
			commandPlaceholder: string;
			getCommand: () => string;
			setCommand: (value: string) => void;
		}
	): void {
		const setting = new Setting(containerEl)
			.setName(opts.label)
			.setDesc(opts.description)
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
			label: string;
			description: string;
			modelPlaceholder: string;
			getModel: () => string;
			setModel: (value: string) => void;
		}
	): void {
		const setting = new Setting(containerEl)
			.setName(opts.label)
			.setDesc(opts.description)
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
		const field = byokProviderDefinition("anthropic").credentialField;
		this.renderCloudCredentialSettings(containerEl, {
			provider: "anthropic",
			field,
			onSaved: () => this.syncAnthropicModelSelection(),
		});
	}

	private renderAnthropicModelSettings(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		const stored = cueCraftProviderSettings(s, "anthropic");
		const definition = byokProviderDefinition("anthropic");
		const field = definition.modelField;
		const model = cueCraftProviderModel(s, "anthropic");
		const storedModels =
			stored.modelOptions.length > 0
				? stored.modelOptions
				: normalizeModelIds(stored.availableModels, "anthropic");
		const isCustomSelection = isAnthropicCustomModelSelection({
			anthropicModel: model,
			anthropicModelSelection: stored.modelSelection,
			anthropicAvailableModels: storedModels,
		});
		const modelHint = formatAnthropicModelHint(
			model,
			storedModels
		);
		const modelOptions = buildAnthropicModelOptions(storedModels);
		const hasApiKey = this.plugin.isProviderCredentialSaved("anthropic");

		const modelSetting = new Setting(containerEl)
			.setName(field.label)
			.setDesc(
				this.resolveModelRefreshDescription(
					stored.modelRefreshMessage,
					modelHint || field.description
				)
			);
		modelSetting.settingEl.addClass("cuecraft-model-setting");
		modelSetting.addDropdown((dd) => {
			dd.addOption(ANTHROPIC_CUSTOM_MODEL_ID, "Custom model ID...");
			for (const model of modelOptions) {
				dd.addOption(model.id, model.label);
			}
			dd
				.setValue(
					isCustomSelection
						? ANTHROPIC_CUSTOM_MODEL_ID
						: cueCraftProviderModel(s, "anthropic")
				)
				.onChange(async (value) => {
					if (value === ANTHROPIC_CUSTOM_MODEL_ID) {
						stored.modelSelection = ANTHROPIC_CUSTOM_MODEL_ID;
						await this.plugin.saveSettings();
						this.display();
						return;
					}
					stored.modelSelection = value;
					setCueCraftProviderModel(s, "anthropic", value);
					await this.plugin.saveSettings();
					this.display();
				});
		});
		this.addModelRefreshButton(modelSetting, {
			definition,
			hasFetchedModels: stored.hasFetchedModels,
			disabled: !hasApiKey,
			onClick: () => void this.refreshAnthropicModels(),
		});

		if (isCustomSelection) {
			new Setting(containerEl)
				.setName("Custom model ID")
				.setDesc("Enter the exact Anthropic model ID CueCraft should use.")
				.addText((text) =>
					text
						.setPlaceholder("claude-sonnet-4-6")
						.setValue(cueCraftProviderModel(s, "anthropic"))
						.onChange(async (value) => {
							setCueCraftProviderModel(s, "anthropic", value.trim());
							stored.modelSelection = ANTHROPIC_CUSTOM_MODEL_ID;
							await this.plugin.saveSettings();
						})
				);
		}

	}

	private syncAnthropicModelSelection(): void {
		const s = this.plugin.settings;
		const stored = cueCraftProviderSettings(s, "anthropic");
		const knownIds = new Set(
			buildAnthropicModelOptions(stored.modelOptions).map(
				(model) => model.id
			)
		);
		const model = cueCraftProviderModel(s, "anthropic");
		stored.modelSelection = knownIds.has(model)
			? model
			: ANTHROPIC_CUSTOM_MODEL_ID;
	}

	private async refreshAnthropicModels(): Promise<void> {
		const s = this.plugin.settings;
		if (!this.plugin.isProviderCredentialSaved("anthropic")) {
			new Notice("CueCraft: enter your Anthropic API key first.");
			return;
		}
		let provider: ByokProviderRuntime;
		try {
			provider = await this.plugin.makeProvider();
		} catch (error) {
			new Notice(formatCueCraftNotice(error instanceof Error ? error.message : String(error)));
			return;
		}
		const stored = cueCraftProviderSettings(s, "anthropic");
		stored.hasFetchedModels = true;
		if (provider.id !== "anthropic" || !provider.listModels) {
			stored.availableModels = [];
			stored.modelOptions = [];
			stored.modelRefreshMessage =
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
		stored.availableModels = result.availableModels.map((model) => model.id);
		stored.modelOptions = result.availableModels.map(
			anthropicModelInfoToByokModelOption
		);
		stored.hasFetchedModels = true;
		stored.modelRefreshMessage =
			result.availableModels.length > 0 ? "" : result.message;
		this.syncAnthropicModelSelection();
		await this.plugin.saveSettings();
		this.display();
		new Notice(`CueCraft: ${result.message}`);
	}

	private renderProviderCredentialSettings(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		switch (cueCraftSelectedProvider(s)) {
			case "ollama":
				this.renderOllamaCredentialSettings(containerEl);
				return;
			case "anthropic":
				this.renderAnthropicCredentialSettings(containerEl);
				return;
			case "openai": {
				const definition = byokProviderDefinition("openai");
				this.renderCloudCredentialSettings(containerEl, {
					provider: "openai",
					field: definition.credentialField,
					onSaved: () => {
						resetCueCraftFetchedModels(
							s,
							"openai",
							definition.credentialField.resetModelsMessage ??
								definition.credentialField.missingMessage
						);
					},
				});
				return;
			}
			case "google": {
				const definition = byokProviderDefinition("google");
				this.renderCloudCredentialSettings(containerEl, {
					provider: "google",
					field: definition.credentialField,
					onSaved: () => {
						resetCueCraftFetchedModels(
							s,
							"google",
							definition.credentialField.resetModelsMessage ??
								definition.credentialField.missingMessage
						);
					},
				});
				return;
			}
			case "xai": {
				const definition = byokProviderDefinition("xai");
				this.renderCloudCredentialSettings(containerEl, {
					provider: "xai",
					field: definition.credentialField,
					onSaved: () => {
						resetCueCraftFetchedModels(
							s,
							"xai",
							definition.credentialField.resetModelsMessage ??
								definition.credentialField.missingMessage
						);
					},
				});
				return;
			}
			case "openrouter": {
				const definition = byokProviderDefinition("openrouter");
				this.renderCloudCredentialSettings(containerEl, {
					provider: "openrouter",
					field: definition.credentialField,
					onSaved: () => {
						resetCueCraftFetchedModels(
							s,
							"openrouter",
							definition.credentialField.resetModelsMessage ??
								definition.credentialField.missingMessage
						);
					},
				});
				return;
			}
			case "codex-cli": {
				const definition = byokProviderDefinition("codex-cli");
				this.renderCliCredentialSettings(containerEl, {
					label: definition.credentialField.label,
					description: definition.credentialField.description,
					commandPlaceholder: definition.credentialField.placeholder,
					getCommand: () => cueCraftProviderCredential(s, "codex-cli"),
					setCommand: (value) =>
						setCueCraftProviderCredential(s, "codex-cli", value),
				});
				return;
			}
			case "claude-cli": {
				const definition = byokProviderDefinition("claude-cli");
				this.renderCliCredentialSettings(containerEl, {
					label: definition.credentialField.label,
					description: definition.credentialField.description,
					commandPlaceholder: definition.credentialField.placeholder,
					getCommand: () => cueCraftProviderCredential(s, "claude-cli"),
					setCommand: (value) =>
						setCueCraftProviderCredential(s, "claude-cli", value),
				});
				return;
			}
		}
	}

	private renderProviderModelSettings(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		switch (cueCraftSelectedProvider(s)) {
			case "ollama":
				this.renderOllamaModelSettings(containerEl);
				return;
			case "anthropic":
				this.renderAnthropicModelSettings(containerEl);
				return;
			case "openai": {
				const definition = byokProviderDefinition("openai");
				this.renderCloudModelSettings(containerEl, {
					provider: "openai",
					definition,
					getModel: () => cueCraftProviderModel(s, "openai"),
					setModel: (v) => setCueCraftProviderModel(s, "openai", v),
					hasApiKey: () => this.plugin.isProviderCredentialSaved("openai"),
					getAvailableModels: () =>
						cueCraftProviderSettings(s, "openai").availableModels,
					getHasFetchedModels: () =>
						cueCraftProviderSettings(s, "openai").hasFetchedModels,
					getRefreshMessage: () =>
						cueCraftProviderSettings(s, "openai").modelRefreshMessage,
				});
				return;
			}
			case "google": {
				const definition = byokProviderDefinition("google");
				this.renderCloudModelSettings(containerEl, {
					provider: "google",
					definition,
					getModel: () => cueCraftProviderModel(s, "google"),
					setModel: (v) => setCueCraftProviderModel(s, "google", v),
					hasApiKey: () => this.plugin.isProviderCredentialSaved("google"),
					getAvailableModels: () =>
						cueCraftProviderSettings(s, "google").availableModels,
					getHasFetchedModels: () =>
						cueCraftProviderSettings(s, "google").hasFetchedModels,
					getRefreshMessage: () =>
						cueCraftProviderSettings(s, "google").modelRefreshMessage,
				});
				return;
			}
			case "xai": {
				const definition = byokProviderDefinition("xai");
				this.renderCloudModelSettings(containerEl, {
					provider: "xai",
					definition,
					getModel: () => cueCraftProviderModel(s, "xai"),
					setModel: (v) => setCueCraftProviderModel(s, "xai", v),
					hasApiKey: () => this.plugin.isProviderCredentialSaved("xai"),
					getAvailableModels: () =>
						cueCraftProviderSettings(s, "xai").availableModels,
					getHasFetchedModels: () =>
						cueCraftProviderSettings(s, "xai").hasFetchedModels,
					getRefreshMessage: () =>
						cueCraftProviderSettings(s, "xai").modelRefreshMessage,
				});
				return;
			}
			case "openrouter": {
				const definition = byokProviderDefinition("openrouter");
				this.renderCloudModelSettings(containerEl, {
					provider: "openrouter",
					definition,
					getModel: () => cueCraftProviderModel(s, "openrouter"),
					setModel: (v) => setCueCraftProviderModel(s, "openrouter", v),
					hasApiKey: () => this.plugin.isProviderCredentialSaved("openrouter"),
					getAvailableModels: () =>
						cueCraftProviderSettings(s, "openrouter").availableModels,
					getModelOptions: () =>
						cueCraftProviderSettings(s, "openrouter").modelOptions,
					getHasFetchedModels: () =>
						cueCraftProviderSettings(s, "openrouter").hasFetchedModels,
					getRefreshMessage: () =>
						cueCraftProviderSettings(s, "openrouter").modelRefreshMessage,
				});
				return;
			}
			case "codex-cli": {
				const definition = byokProviderDefinition("codex-cli");
				this.renderCliModelSettings(containerEl, {
					label: definition.modelField.label,
					description: definition.modelField.description,
					modelPlaceholder: definition.modelField.placeholder,
					getModel: () => cueCraftProviderModel(s, "codex-cli"),
					setModel: (value) =>
						setCueCraftProviderModel(s, "codex-cli", value),
				});
				return;
			}
			case "claude-cli": {
				const definition = byokProviderDefinition("claude-cli");
				this.renderCliModelSettings(containerEl, {
					label: definition.modelField.label,
					description: definition.modelField.description,
					modelPlaceholder: definition.modelField.placeholder,
					getModel: () => cueCraftProviderModel(s, "claude-cli"),
					setModel: (value) =>
						setCueCraftProviderModel(s, "claude-cli", value),
				});
				return;
			}
		}
	}

	private renderCloudCredentialSettings(
		containerEl: HTMLElement,
		opts: {
			provider: ByokProviderId;
			field: ByokProviderDefinition["credentialField"];
			onSaved: () => void;
		}
	): void {
		const storageStatus = this.plugin.secureCredentialStorageStatus();
		const saved = this.plugin.isProviderCredentialSaved(opts.provider);
		const displayState = cloudCredentialDisplayState({
			fieldDescription: opts.field.description,
			fieldPlaceholder: opts.field.placeholder,
			saved,
			credentialLength: cueCraftProviderCredentialLength(
				this.plugin.settings,
				opts.provider
			),
			storageStatus,
		});
		const savedMask = saved
			? cloudCredentialMask(
				cueCraftProviderCredentialLength(this.plugin.settings, opts.provider)
			)
			: SAVED_CLOUD_CREDENTIAL_MASK;
		let pendingKey = "";
		const setting = new Setting(containerEl)
			.setName(opts.field.label)
			.setDesc(displayState.description)
			.addText((text) => {
				text.inputEl.addClass("cuecraft-api-key-input");
				const updateEyeVisibility = (eye: HTMLButtonElement): void => {
					const hasTypedReplacement =
						text.inputEl.value.trim().length > 0 &&
						(!saved || text.inputEl.value !== savedMask);
					eye.disabled = !hasTypedReplacement;
					eye.style.visibility = hasTypedReplacement ? "visible" : "hidden";
				};
				text
					.setPlaceholder(displayState.placeholder)
					.setValue(displayState.inputValue)
					.setDisabled(!displayState.canEdit)
					.onChange((value) => {
						pendingKey =
							saved && value === savedMask
								? ""
								: value.trim();
						updateEyeVisibility(eye);
					});
				text.inputEl.type = "password";
				this.plugin.registerDomEvent(text.inputEl, "focus", () => {
					if (saved && text.inputEl.value === savedMask) {
						text.inputEl.value = "";
						pendingKey = "";
					}
					updateEyeVisibility(eye);
				});
				this.plugin.registerDomEvent(text.inputEl, "blur", () => {
					if (saved && !text.inputEl.value.trim()) {
						text.inputEl.value = savedMask;
						pendingKey = "";
					}
					updateEyeVisibility(eye);
				});

				const eye = text.inputEl.insertAdjacentElement(
					"afterend",
					createEl("button", {
						cls: "cuecraft-key-eye",
						attr: { type: "button", "aria-label": "Show typed API key" },
					})
				) as HTMLButtonElement;
				setIcon(eye, "eye");
				updateEyeVisibility(eye);
				this.plugin.registerDomEvent(eye, "click", () => {
					if (eye.disabled) return;
					const masked = text.inputEl.type === "password";
					text.inputEl.type = masked ? "text" : "password";
					setIcon(eye, masked ? "eye-off" : "eye");
					eye.setAttr(
						"aria-label",
						masked ? "Hide typed API key" : "Show typed API key"
					);
				});
			});
		setting.addButton((button) =>
			button
				.setButtonText(displayState.saveButtonLabel)
				.setDisabled(!displayState.canEdit)
				.onClick(async () => {
					if (!isCueCraftCloudCredentialProvider(opts.provider)) return;
					if (!pendingKey) {
						new Notice(`CueCraft: enter your ${opts.field.label} first.`);
						return;
					}
					const result = await this.plugin.saveCloudProviderCredential(
						opts.provider,
						pendingKey
					);
					if (!result.ok) {
						new Notice(
							`CueCraft: could not save API key (${result.message ?? "secure storage unavailable"}).`
						);
						return;
					}
					opts.onSaved();
					await this.plugin.saveSettings();
					this.display();
					new Notice("CueCraft: API key saved securely.");
				})
		);
		if (saved) {
			setting.addButton((button) =>
				button
					.setButtonText("Clear key")
					.setDisabled(!displayState.canEdit)
					.onClick(async () => {
						if (!isCueCraftCloudCredentialProvider(opts.provider)) return;
						const result = await this.plugin.clearCloudProviderCredential(
							opts.provider
						);
						if (!result.ok) {
							new Notice(
								`CueCraft: could not clear API key (${result.message ?? "secure storage unavailable"}).`
							);
							return;
						}
						opts.onSaved();
						await this.plugin.saveSettings();
						this.display();
						new Notice("CueCraft: API key cleared.");
					})
			);
		}
		setting.settingEl.addClass("cuecraft-api-key-setting");
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
	): Setting {
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
		modelSetting.settingEl.addClass("cuecraft-model-setting");
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
		return modelSetting;
	}

	private renderCloudModelSettings(
		containerEl: HTMLElement,
		opts: {
			provider: CueCraftFetchedModelProvider;
			definition: ByokProviderDefinition;
			getModel: () => string;
			setModel: (v: string) => void;
			hasApiKey: () => boolean;
			getAvailableModels: () => string[];
			getModelOptions?: () => ModelOption[];
			getHasFetchedModels: () => boolean;
			getRefreshMessage: () => string;
		}
	): void {
		const modelField = opts.definition.modelField;
		const modelSetting = this.renderFetchedModelSelector(containerEl, {
			modelLabel: modelField.label,
			modelDesc: this.resolveModelRefreshDescription(
				opts.getRefreshMessage(),
				modelField.description
			),
			modelPlaceholder: modelField.placeholder,
			availableModels: opts.getAvailableModels(),
			modelOptions: opts.getModelOptions?.(),
			modelOptionSource: modelField.optionSource ?? opts.provider,
			getModel: opts.getModel,
			setModel: opts.setModel,
		});
		this.addModelRefreshButton(modelSetting, {
			definition: opts.definition,
			hasFetchedModels: opts.getHasFetchedModels(),
			disabled: !opts.hasApiKey(),
			onClick: () =>
				void this.refreshProviderModels({
					provider: opts.provider,
					providerName: opts.definition.shortLabel,
					emptyMessage:
						opts.definition.modelField.emptyListMessage ??
						`No ${opts.definition.shortLabel} models were returned for this account.`,
				}),
		});
	}

	private addModelRefreshButton(
		setting: Setting,
		opts: {
			definition: ByokProviderDefinition;
			hasFetchedModels: boolean;
			disabled: boolean;
			onClick: () => void;
		}
	): void {
		setting.addButton((btn) =>
			btn
				.setButtonText(
					opts.hasFetchedModels
						? "Refresh models"
						: `Fetch ${opts.definition.shortLabel} models`
				)
				.setDisabled(opts.disabled)
				.onClick(opts.onClick)
		);
	}

	private resolveModelRefreshDescription(
		refreshMessage: string,
		defaultDescription: string
	): string {
		return resolveModelRefreshDescription(refreshMessage, defaultDescription);
	}

	private async refreshProviderModels(opts: {
		provider: CueCraftFetchedModelProvider;
		providerName: string;
		emptyMessage: string;
	}): Promise<void> {
		if (!this.plugin.isProviderCredentialSaved(opts.provider)) {
			new Notice(`CueCraft: enter your ${opts.providerName} API key first.`);
			return;
		}
		let provider: ByokProviderRuntime;
		try {
			provider = await this.plugin.makeProvider();
		} catch (error) {
			new Notice(formatCueCraftNotice(error instanceof Error ? error.message : String(error)));
			return;
		}
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
				opts.emptyMessage
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
		const successCount = cueCraftFetchedModelCount(
			this.plugin.settings,
			opts.provider
		);
		const refreshMessage = cueCraftModelRefreshMessage(
			this.plugin.settings,
			opts.provider
		);
		new Notice(
			successCount > 0
				? `CueCraft: Fetched ${successCount} ${opts.providerName} model${successCount === 1 ? "" : "s"}.`
				: `CueCraft: ${refreshMessage}`
		);
	}

	/** Verify the selected provider is reachable and reports a readable result. */
	private async testConnection(): Promise<void> {
		const selectedProvider = cueCraftSelectedProvider(this.plugin.settings);
		const definition = byokProviderDefinition(selectedProvider);
		if (definition.credentialKind === "command") {
			await this.testLocalCliProvider();
			return;
		}
		if (definition.credentialKind === "api-key") {
			await this.testCloudProvider();
			return;
		}
		const host = cueCraftProviderCredential(
			this.plugin.settings,
			"ollama"
		).replace(/\/+$/, "");
		const model = cueCraftProviderModel(this.plugin.settings, "ollama");
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
		const command = cueCraftProviderCredential(this.plugin.settings);
		if (!command.trim()) {
			const providerName = cueCraftProviderLabel(
				cueCraftSelectedProvider(this.plugin.settings)
			);
			new Notice(`CueCraft: enter your ${providerName} command first.`);
			return;
		}
		const provider = await this.plugin.makeProvider();
		const status = await provider.testConnection();
		if (status.ok) {
			recordCueCraftProviderConnectionSuccess(this.plugin.settings);
			await this.plugin.saveSettings();
			this.display();
		}
		new Notice(formatCueCraftNotice(status.message));
	}

	private async testCloudProvider(): Promise<void> {
		const selectedProvider = cueCraftSelectedProvider(this.plugin.settings);
		if (!this.plugin.isProviderCredentialSaved(selectedProvider)) {
			const providerName = cueCraftProviderLabel(selectedProvider);
			new Notice(`CueCraft: enter your ${providerName} API key first.`);
			return;
		}
		let provider: ByokProviderRuntime;
		try {
			provider = await this.plugin.makeProvider();
		} catch (error) {
			new Notice(formatCueCraftNotice(error instanceof Error ? error.message : String(error)));
			return;
		}
		const selectedModel = cueCraftProviderModel(
			this.plugin.settings,
			provider.id
		).trim();
		if (!selectedModel && provider.listModels) {
			try {
				const models = await provider.listModels();
				recordCueCraftProviderConnectionSuccess(this.plugin.settings);
				await this.plugin.saveSettings();
				this.display();
				const providerName = byokProviderDefinition(provider.id).shortLabel;
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
			recordCueCraftProviderConnectionSuccess(this.plugin.settings);
			await this.plugin.saveSettings();
			this.display();
		}
		if (status.ok && provider.id === "anthropic") {
			const stored = cueCraftProviderSettings(this.plugin.settings, "anthropic");
			const model = describeAnthropicModel(
				cueCraftProviderModel(this.plugin.settings, "anthropic"),
				stored.modelOptions
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
			const stored = cueCraftProviderSettings(this.plugin.settings, "anthropic");
			new Notice(
				formatCueCraftNotice(
					formatAnthropicUnavailableModelMessage(
						cueCraftProviderModel(this.plugin.settings, "anthropic"),
						stored.modelOptions
					)
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
