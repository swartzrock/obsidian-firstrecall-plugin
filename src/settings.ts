import {
	App,
	Modal,
	Notice,
	PluginSettingTab,
	Setting,
	TFolder,
	setIcon,
} from "obsidian";
import type CueCraftPlugin from "./main";
import {
	CUE_FONT_SIZES,
	DEFAULT_CUE_FONT_SIZE,
	type CueFontSize,
} from "./cornell-layout";
import {
	DEFAULT_QUESTION_TYPE,
	QUESTION_TYPES,
	questionTypeInfo,
	type QuestionType,
} from "./cue-generation";
import {
	cueFontSizeThumbnailOptions,
	editorCueDisplayThumbnailOptions,
	renderAppearanceThumbnailGroup,
	type AppearanceThumbnailGroup,
	type AppearanceThumbnailOption,
} from "./appearance-thumbnail-controls";
import {
	DEFAULT_EDITOR_CUE_DISPLAY,
	editorCueDisplayOption,
	type EditorCueDisplay,
} from "./editor-cue-display";
import {
	ByokProvider,
	isByokProviderId,
	type ByokProviderId,
	type ByokStoredSettings,
} from "@swartzrock/byok-runtime";
import {
	byokProviderDefinition,
	byokProviderDefinitions,
	type CueCraftProviderDefinition,
} from "./byok-provider-metadata";
import {
	ANTHROPIC_CUSTOM_MODEL_ID,
	buildAnthropicModelOptions,
	describeAnthropicModel,
	formatAnthropicModelHint,
	formatAnthropicUnavailableModelMessage,
	isAnthropicCustomModelSelection,
} from "./anthropic-model-options";
import {
	normalizeModelIds,
	normalizeStringId,
	type ModelOption,
} from "./byok-model-options";
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
	type CueCraftByokRuntime,
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
	renderModelCombobox,
} from "./model-combobox";
import {
	DEFAULT_STUDY_AREAS,
	ENTIRE_VAULT_STUDY_AREA_LABEL,
	formatStudyAreaReadinessCounts,
	findConflictingStudyArea,
	isEntireVaultStudyArea,
	normalizeVaultPath,
	studyAreaScopeLabel,
	validateStudyAreaExclusion,
	validateStudyAreaScope,
	type DisabledStudyArea,
	type StudyArea,
	type StudyAreaGenerationPlan,
	type StudyAreaRunSummary,
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
import { DEFAULT_SHOW_NOTE_BRIEF } from "./review-surfaces";
import {
	buildSectionCueInstructionsTemplate,
} from "./cue-instructions";
import { buildNoteBriefInstructionsTemplate } from "./study-material-instructions";

/**
 * CueCraft supports a local provider (Ollama), local CLI providers, and several
 * cloud providers via the Vercel AI SDK (Anthropic, OpenAI, Google, xAI). Each
 * cloud provider keeps its own API key + model id; only the selected provider's
 * fields are surfaced.
 */
export type StudyHideMode = "blur" | "collapse";
type SettingsSubpage =
	| "home"
	| "ai-model"
	| "cue-generation";
type CueCraftSettingsSubpage =
	| SettingsSubpage
	| "study-areas";
const CLI_DEFAULT_MODEL_OPTION: ModelOption = {
	id: "",
	label: "CLI Default",
};
const SHOW_STUDY_AREA_EXCLUSIONS = false;
const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_PATH_ATTRIBUTE_ALLOWLIST = new Set([
	"clip-rule",
	"d",
	"fill",
	"fill-rule",
	"stroke",
	"stroke-width",
]);

type StudyAreaUiPhase =
	| "initial"
	| "scanning"
	| "ready"
	| "running"
	| "success"
	| "partial-failure"
	| "failure";

interface StudyAreaUiState {
	phase: StudyAreaUiPhase;
	plan: StudyAreaGenerationPlan | null;
	scanToken: number;
	hasScanned: boolean;
	message: string | null;
}

export interface CueCraftSettings {
	byok: Omit<ByokStoredSettings, "selectedProvider"> & {
		selectedProvider: ByokProviderId | null;
	};
	questionType: QuestionType;
	studyHideMode: StudyHideMode;
	editorCueDisplay: EditorCueDisplay;
	editorCueCustomWidthPx: number | null;
	cueFontSize: CueFontSize;
	autoGenerationSettleDelaySeconds: AutoGenerationSettleDelaySeconds;
	studyAreas: StudyArea[];
	disabledStudyAreas: DisabledStudyArea[];
	sectionConcurrency: number;
	showNoteBrief: boolean;
	showSummary: boolean;
	showQuestion: boolean;
	showTerms: boolean;
}

export const DEFAULT_SETTINGS: CueCraftSettings = {
	byok: {
		selectedProvider: null,
		providers: {
			ollama: {
				credential: "http://localhost:11434",
				model: "",
				modelSelection: "",
				availableModels: [],
				modelOptions: [],
				hasFetchedModels: false,
				modelRefreshMessage: "",
			},
			"lm-studio": {
				credential: "http://localhost:1234/v1",
				model: "",
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
	questionType: DEFAULT_QUESTION_TYPE,
	studyHideMode: "blur",
	editorCueDisplay: DEFAULT_EDITOR_CUE_DISPLAY,
	editorCueCustomWidthPx: null,
	cueFontSize: DEFAULT_CUE_FONT_SIZE,
	autoGenerationSettleDelaySeconds:
		DEFAULT_AUTO_GENERATION_SETTLE_DELAY_SECONDS,
	studyAreas: DEFAULT_STUDY_AREAS,
	disabledStudyAreas: [],
	sectionConcurrency: 5,
	showNoteBrief: DEFAULT_SHOW_NOTE_BRIEF,
	showSummary: true,
	showQuestion: true,
	showTerms: true,
};

export class CueCraftSettingTab extends PluginSettingTab {
	private plugin: CueCraftPlugin;
	private currentSubpage: CueCraftSettingsSubpage = "home";
	private readonly studyAreaUi = new Map<string, StudyAreaUiState>();

	constructor(app: App, plugin: CueCraftPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();

		switch (this.currentSubpage) {
			case "ai-model":
				this.renderSubpageHeader(
					containerEl,
					"AI model",
					cueCraftSelectedProvider(this.plugin.settings)
						? "Provider setup, connection checks, model selection, and speed tuning."
						: "Select an AI provider to generate study material"
				);
				this.renderAiModelSection(containerEl, false);
				break;
			case "cue-generation":
				this.renderSubpageHeader(
					containerEl,
					"Generation",
					"Choose how recall questions are written and review the instructions used to create study material."
				);
				this.renderCueGenerationSection(containerEl, false);
				break;
			case "study-areas":
				this.renderSubpageHeader(
					containerEl,
					"Managed folders",
					"Add a folder—or your entire vault—to generate and refresh study material in bulk. Turn on automatic updates when you want CueCraft to keep future changes current."
				);
				this.renderStudyAreasSection(containerEl, false);
				break;
			default:
				containerEl.createEl("p", {
					text: "CueCraft turns your notes into active-recall study material: a Note Brief for the whole note and a study card for each section. Choose an AI provider and model to get started. Your Markdown files are never modified.",
					cls: "cuecraft-settings-intro",
				});
				this.renderSettingsHome(containerEl);
				break;
		}
	}

	override hide(): void {
		super.hide();
		this.currentSubpage = "home";
		this.studyAreaUi.clear();
		this.plugin.promptForCueSettingsRegeneration();
	}

	private renderSettingsHome(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Settings").setHeading();

		const navEl = containerEl.createDiv({ cls: "cuecraft-settings-nav" });
		this.renderSettingsNavCard(navEl, {
			title: "AI model",
			description: "Choose a provider and model, check the connection, and tune request speed.",
			summary: this.aiModelSummary(),
			onOpen: () => this.openSubpage("ai-model"),
		});
		this.renderSettingsNavCard(navEl, {
			title: "Generation",
			description: "Choose the recall-question style and review generation instructions.",
			summary: this.cueGenerationSummary(),
			onOpen: () => this.openSubpage("cue-generation"),
		});
		this.renderSettingsNavCard(navEl, {
			title: "Managed folders",
			description: "Generate and refresh study material in bulk, with optional automatic updates.",
			summary: this.studyAreasSummary(),
			onOpen: () => this.openSubpage("study-areas"),
		});

		this.renderArtifactVisibilitySection(containerEl);
		this.renderAppearanceSection(containerEl);
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
		const provider = cueCraftSelectedProvider(this.plugin.settings);
		if (!provider) return "Select an AI provider to generate study material";
		const setup = deriveCueCraftProviderSetupStatus(this.plugin.settings);
		const providerLabel = this.providerDisplayName(provider);
		const modelLabel = this.selectedModelLabel() || "No model selected";
		const connectionLabel =
			setup.connection === "verified"
				? "Connection verified"
				: setup.connection === "stale"
					? "Connection check outdated"
					: "Connection untested";
		return `${providerLabel} · ${modelLabel} · ${connectionLabel}`;
	}

	private cueGenerationSummary(): string {
		return questionTypeInfo(this.plugin.settings.questionType).label;
	}

	private studyAreasSummary(): string {
		const count = this.plugin.settings.studyAreas.length;
		const enabled = this.plugin.settings.studyAreas.filter(
			(area) => area.maintenanceMode === "maintain-on-save"
		).length;
		if (!count) return "No folders or vault scope";
		const entireVaultArea = this.plugin.settings.studyAreas.find((area) =>
			isEntireVaultStudyArea(area)
		);
		if (entireVaultArea) {
			return `${ENTIRE_VAULT_STUDY_AREA_LABEL} · ${entireVaultArea.maintenanceMode === "maintain-on-save"
				? "updates automatically"
				: "automatic updates off"
				}`;
		}
		return `${count} folder${count === 1 ? "" : "s"} · ${enabled} update automatically`;
	}

	private providerDisplayName(provider: ByokProviderId): string {
		return byokProviderDefinition(provider).shortLabel;
	}

	private selectedModelLabel(): string {
		const settings = this.plugin.settings;
		const provider = cueCraftSelectedProvider(settings);
		if (!provider) return "";
		const modelId = cueCraftProviderModel(settings, provider).trim();
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
			"Pick where CueCraft should generate section study cards and Note Briefs."
		);

		this.renderProviderPicker(providerFlowEl);

		if (!cueCraftSelectedProvider(this.plugin.settings)) return;

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
			"Tune how quickly CueCraft generates section cards."
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
		const provider = cueCraftSelectedProvider(this.plugin.settings);
		if (!provider) return;
		const definition = byokProviderDefinition(provider);
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
		definition: CueCraftProviderDefinition
	): void {
		const iconEl = containerEl.createSpan({
			cls: "cuecraft-provider-icon",
			attr: { "aria-hidden": "true" },
		});
		if (typeof definition.icon === "string") {
			setIcon(iconEl, definition.icon);
			return;
		}
		const svgEl = activeDocument.createElementNS(SVG_NS, "svg");
		svgEl.setAttribute("viewBox", definition.icon.viewBox);
		svgEl.setAttribute("fill", "currentColor");
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
		const provider = cueCraftSelectedProvider(this.plugin.settings);
		if (!provider) return;
		const status = deriveCueCraftProviderSetupStatus(this.plugin.settings);
		const isCli = isCueCraftLocalCliProvider(provider);
		const cliModelLabel = this.selectedModelLabel() === "CLI default"
			? "CLI default"
			: "Model override";
		const description =
			status.connection === "verified" && status.testedAt
				? `Last checked ${new Date(status.testedAt).toLocaleString()}.`
				: status.connection === "stale"
					? "Saved check no longer matches these settings."
					: "Run a quick provider check before generating section cards.";
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
					? "Connection check outdated"
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

	// ── Generation ────────────────────────────────────────────────────────
	private renderCueGenerationSection(
		containerEl: HTMLElement,
		showHeading: boolean
	): void {
		if (showHeading) {
			new Setting(containerEl).setName("Generation").setHeading();
		}

		const questionTypeDescription = (): string => {
			const selected = questionTypeInfo(this.plugin.settings.questionType);
			return `${selected.description} Recall questions will change after regeneration.`;
		};
		const questionTypeSetting = new Setting(containerEl)
			.setName("Recall question style")
			.setDesc(questionTypeDescription());
		let sectionInstructions: HTMLTextAreaElement | undefined;
		questionTypeSetting.addDropdown((dropdown) => {
			for (const option of QUESTION_TYPES) {
				dropdown.addOption(option.id, option.label);
			}
			dropdown
				.setValue(this.plugin.settings.questionType)
				.onChange(async (value) => {
					this.plugin.settings.questionType = value as QuestionType;
					questionTypeSetting.setDesc(questionTypeDescription());
					if (sectionInstructions) {
						sectionInstructions.value = this.sectionCueInstructionsTemplate();
					}
					this.plugin.noteCueSettingsChanged();
					await this.plugin.saveSettings();
				});
		});

		const advanced = containerEl.createEl("details", {
			cls: "cuecraft-generation-advanced",
		});
		const summary = advanced.createEl("summary", { text: "Advanced" });
		summary.setAttr("aria-controls", "cuecraft-generation-instructions");
		summary.setAttr("aria-expanded", "false");
		const content = advanced.createDiv({
			cls: "cuecraft-generation-instructions",
			attr: { id: "cuecraft-generation-instructions" },
		});
		this.plugin.registerDomEvent(advanced, "toggle", () => {
			summary.setAttr("aria-expanded", String(advanced.open));
		});

		sectionInstructions = this.renderInstructionTemplate(
			content,
			"Section study card instructions",
			this.sectionCueInstructionsTemplate()
		);
		this.renderInstructionTemplate(
			content,
			"Note Brief instructions",
			buildNoteBriefInstructionsTemplate()
		);
	}

	private sectionCueInstructionsTemplate(): string {
		const provider = cueCraftSelectedProvider(this.plugin.settings);
		return buildSectionCueInstructionsTemplate(
			this.plugin.settings.questionType,
			provider && isCueCraftLocalCliProvider(provider) ? "batch" : "single"
		);
	}

	private renderInstructionTemplate(
		containerEl: HTMLElement,
		title: string,
		value: string
	): HTMLTextAreaElement {
		const setting = new Setting(containerEl).setName(title);
		setting.settingEl.addClass("cuecraft-instructions-setting");
		let input!: HTMLTextAreaElement;
		setting.addTextArea((textArea) => {
			textArea.setValue(value);
			input = textArea.inputEl;
			input.readOnly = true;
			input.rows = 12;
			input.addClass("cuecraft-instructions-input");
			input.setAttr("aria-label", title);
		});
		return input;
	}

	// ── Folders and automatic updates ─────────────────────────────────────
	private studyAreaFolderPaths(): string[] {
		return this.app.vault
			.getAllLoadedFiles()
			.filter(
				(file): file is TFolder =>
					file instanceof TFolder || "children" in file
			)
			.map((folder) => normalizeVaultPath(folder.path))
			.filter(Boolean)
			.sort((a, b) => a.localeCompare(b));
	}

	private studyAreaExclusionPaths(area: StudyArea): string[] {
		return this.app.vault
			.getAllLoadedFiles()
			.filter(
				(file) =>
					file instanceof TFolder ||
					"children" in file ||
					("extension" in file &&
						typeof file.extension === "string" &&
						file.extension.toLowerCase() === "md")
			)
			.map((file) => normalizeVaultPath(file.path))
			.filter((path) => validateStudyAreaExclusion(area, path).valid)
			.sort((a, b) => a.localeCompare(b));
	}

	private studyAreaState(areaId: string): StudyAreaUiState {
		let state = this.studyAreaUi.get(areaId);
		if (!state) {
			state = {
				phase: "initial",
				plan: null,
				scanToken: 0,
				hasScanned: false,
				message: null,
			};
			this.studyAreaUi.set(areaId, state);
		}
		return state;
	}

	private renderStudyAreasSection(
		containerEl: HTMLElement,
		showHeading: boolean
	): void {
		if (showHeading) {
			new Setting(containerEl)
				.setName("Managed folders")
				.setHeading();
		}
		const folderPaths = this.studyAreaFolderPaths();
		const assignedFolderPaths = new Set(
			this.plugin.settings.studyAreas.map((area) =>
				normalizeVaultPath(area.parentPath)
			)
		);
		const availableFolderPaths = folderPaths.filter(
			(path) =>
				!assignedFolderPaths.has(path) &&
				validateStudyAreaScope(this.plugin.settings.studyAreas, path).valid
		);
		const hasStudyAreas = this.plugin.settings.studyAreas.length > 0;
		const hasEntireVaultArea = this.plugin.settings.studyAreas.some((area) =>
			isEntireVaultStudyArea(area)
		);
		const vaultScopeLabel = ENTIRE_VAULT_STUDY_AREA_LABEL;
		const canChooseEntireVault = !hasStudyAreas;
		const hasAvailableScope =
			canChooseEntireVault || availableFolderPaths.length > 0;

		const parentFolderSetting = new Setting(containerEl);
		parentFolderSetting.settingEl.addClass("cuecraft-study-area-create-row");
		parentFolderSetting
			.setName(
				hasEntireVaultArea
					? `${vaultScopeLabel} is already covered`
					: "Add folder or vault"
			)
			.setDesc(
				hasEntireVaultArea
					? "Remove Entire vault above before adding a folder instead."
					: hasStudyAreas
						? `Choose another folder. Remove folder coverage before switching to ${vaultScopeLabel}.`
						: `Choose ${vaultScopeLabel} or a folder. You can exclude individual notes or nested folders afterward.`
			);
		if (hasEntireVaultArea) {
			parentFolderSetting.controlEl.empty();
		} else {
			renderModelCombobox({
				containerEl: parentFolderSetting.controlEl,
				value: "",
				options: normalizeModelIds(availableFolderPaths),
				placeholder: hasAvailableScope
					? "Choose a folder or Entire vault..."
					: "No unassigned folders",
				emptyMessage: hasAvailableScope
					? "No matching folders."
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
							`CueCraft: remove folder scopes before using ${vaultScopeLabel}.`
						);
						this.display();
						return;
					}
					if (assignedFolderPaths.has(normalized)) {
						new Notice("CueCraft: that scope already exists.");
						this.display();
						return;
					}
					if (!isEntireVaultSelection && !folderPaths.includes(normalized)) {
						new Notice(`CueCraft: "${normalized}" is not an existing folder.`);
						this.display();
						return;
					}
					const area = await this.plugin.createStudyArea(normalized);
					if (area) {
						this.studyAreaUi.delete(area.id);
						this.display();
					}
				},
				renderToggleIcon: (iconEl) => setIcon(iconEl, "chevron-down"),
				leadingOption: canChooseEntireVault
					? normalizeStringId(vaultScopeLabel)
					: undefined,
				suggestionsLabel: "scope suggestions",
			});
		}

		new Setting(containerEl)
			.setName("Wait after typing")
			.setDesc(
				"After you stop typing in an automatically maintained note, wait this long before updating it. Longer waits reduce repeated AI requests."
			)
			.addDropdown((dropdown) => {
				for (const seconds of AUTO_GENERATION_SETTLE_DELAY_SECONDS_OPTIONS) {
					dropdown.addOption(
						String(seconds),
						formatAutoGenerationSettleDelayLabel(seconds)
					);
				}
				dropdown
					.setValue(String(this.plugin.settings.autoGenerationSettleDelaySeconds))
					.onChange(async (value) => {
						this.plugin.settings.autoGenerationSettleDelaySeconds =
							normalizeAutoGenerationSettleDelaySeconds(Number(value));
						await this.plugin.saveSettings();
					});
			});

		if (hasStudyAreas) {
			const manageEl = containerEl.createDiv({
				cls: "cuecraft-settings-flow",
			});
			for (const area of this.plugin.settings.studyAreas) {
				this.renderStudyAreaRow(manageEl, area);
			}
		}
		if (this.plugin.settings.disabledStudyAreas.length) {
			new Setting(containerEl).setName("Scopes needing attention").setHeading();
			const recoveryEl = containerEl.createDiv({ cls: "cuecraft-settings-flow" });
			for (const area of this.plugin.settings.disabledStudyAreas) {
				this.renderDisabledStudyAreaRow(recoveryEl, area);
			}
		}
	}

	private renderStudyAreaRow(containerEl: HTMLElement, area: StudyArea): void {
		const state = this.studyAreaState(area.id);
		const providerReady = this.plugin.isProviderConfigured();
		const busy = state.phase === "scanning" || state.phase === "running";
		const entireVault = isEntireVaultStudyArea(area);
		const scopeLabel = studyAreaScopeLabel(area.parentPath);
		const setting = new Setting(containerEl).setName(
			entireVault ? ENTIRE_VAULT_STUDY_AREA_LABEL : area.name
		);
		setting.settingEl.addClass("cuecraft-study-area-row");
		setting.descEl.empty();
		if (!entireVault && scopeLabel !== area.name) {
			setting.descEl.createDiv({
				cls: "cuecraft-study-area-path",
				text: scopeLabel,
			});
		}
		setting.descEl.createDiv({
			cls: "cuecraft-study-area-counts",
			text: this.studyAreaCountsText(state),
			attr: { role: "status", "aria-live": "polite" },
		});
		const statusText = state.message ?? this.studyAreaStatusText(state);
		if (statusText) {
			setting.descEl.createDiv({
				cls: "cuecraft-study-area-status",
				text: statusText,
				attr: { role: "status", "aria-live": "polite" },
			});
		}
		if (area.maintenanceMode === "maintain-on-save") {
			setting.descEl.createDiv({
				cls: "cuecraft-study-area-help",
				text: "New and changed study material updates automatically after the wait above.",
			});
		}

		setting.controlEl.addClass("cuecraft-study-area-controls");
		setting.controlEl.createSpan({
			cls: "cuecraft-study-area-toggle-label",
			text: "Update automatically",
		});
		setting.addToggle((tg) => {
			tg.toggleEl.setAttribute(
				"aria-label",
				`Update automatically for ${studyAreaScopeLabel(area.parentPath)}`
			);
			(tg.toggleEl as HTMLInputElement).disabled = busy || !providerReady;
			return tg
				.setValue(area.maintenanceMode === "maintain-on-save")
				.onChange(async (value) => {
					if (this.studyAreaState(area.id).phase === "running") return;
					await this.plugin.updateStudyArea({
						...area,
						maintenanceMode: value ? "maintain-on-save" : "paused",
					});
					this.display();
				});
		});

		const backfillBtn = setting.controlEl.createEl("button", {
			text: state.phase === "running" ? "Updating..." : "Bring study material up to date",
			attr: { type: "button" },
		});
		backfillBtn.addClass("mod-cta");
		backfillBtn.disabled =
			busy || !providerReady || (state.plan?.items.length ?? 0) === 0;
		const retryBtn = setting.controlEl.createEl("button", {
			text: "Retry update",
			attr: { type: "button" },
		});
		retryBtn.addClass("cuecraft-study-area-retry");
		const hasFailed = Boolean(state.plan?.counts.failed);
		retryBtn.disabled = busy || !providerReady || !hasFailed;
		retryBtn.hidden = !hasFailed;
		retryBtn.classList.toggle("cuecraft-study-area-hidden", !hasFailed);
		const scanBtn = setting.controlEl.createEl("button", {
			text: state.phase === "scanning" ? "Cancel scan" : "Scan again",
			attr: {
				type: "button",
				"aria-label": state.phase === "scanning"
					? `Cancel scan for ${studyAreaScopeLabel(area.parentPath)}`
					: `Scan ${studyAreaScopeLabel(area.parentPath)} again`,
			},
		});
		scanBtn.disabled = state.phase === "running";
		const removeBtn = setting.controlEl.createEl("button", {
			cls: "clickable-icon cuecraft-study-area-remove",
			attr: { type: "button", "aria-label": `Remove ${area.name}` },
		});
		setIcon(removeBtn, "trash-2");

		this.plugin.registerDomEvent(backfillBtn, "click", async () => {
			await this.runStudyAreaAction(area.id, "backfill");
		});
		this.plugin.registerDomEvent(retryBtn, "click", async () => {
			await this.runStudyAreaAction(area.id, "retry-failed");
		});
		this.plugin.registerDomEvent(scanBtn, "click", () => {
			if (this.studyAreaState(area.id).phase === "scanning") {
				this.cancelStudyAreaScan(area.id);
			} else {
				void this.scanStudyArea(area.id);
			}
		});
		this.plugin.registerDomEvent(removeBtn, "click", () => {
			const scopeLabel = studyAreaScopeLabel(area.parentPath);
			new StudyAreaConfirmModal(this.app, {
				title: area.parentPath
					? "Remove managed folder?"
					: "Remove managed vault?",
				message: `Remove "${scopeLabel}" from Managed folders? Existing study material will remain available.`,
				confirmText: "Remove",
				onConfirm: async () => {
					await this.plugin.removeStudyArea(area.id);
					this.display();
				},
			}).open();
		});

		if (!providerReady) this.renderProviderSetupAction(containerEl);
		if (SHOW_STUDY_AREA_EXCLUSIONS) {
			this.renderStudyAreaExclusions(containerEl, area);
		}
		if (!state.hasScanned && state.phase === "initial") {
			void this.scanStudyArea(area.id);
		}
	}

	private studyAreaCountsText(state: StudyAreaUiState): string {
		if (state.phase === "scanning") return "Scanning notes...";
		if (state.phase === "running") return "Updating study material...";
		const plan = state.plan;
		if (!plan) return state.hasScanned ? "No scan results" : "Not scanned yet";
		const excludedCount = plan.readiness.filter(
			(item) => item.reason === "excluded"
		).length;
		return formatStudyAreaReadinessCounts(plan.counts, {
			excludedCount,
		});
	}

	private studyAreaStatusText(state: StudyAreaUiState): string | null {
		if (state.phase === "scanning") return "Scanning without using your AI provider.";
		if (state.phase === "running") return "Update in progress.";
		if (state.phase === "success") return "Study material is up to date.";
		if (state.phase === "partial-failure") return "Update finished with some failures.";
		if (state.phase === "failure") return "Scan or update failed. Try again.";
		if (state.plan && !state.plan.items.length) return "Study material is up to date.";
		return null;
	}

	private async scanStudyArea(areaId: string): Promise<void> {
		const state = this.studyAreaState(areaId);
		if (state.phase === "scanning" || state.phase === "running") return;
		const token = state.scanToken + 1;
		state.phase = "scanning";
		state.plan = null;
		state.scanToken = token;
		state.hasScanned = true;
		state.message = null;
		this.display();
		try {
			const plan = await this.plugin.previewStudyArea(areaId);
			if (state.scanToken !== token || state.phase !== "scanning") return;
			state.plan = plan;
			state.phase = plan ? "ready" : "failure";
			state.message = plan ? null : "This scope no longer exists.";
		} catch {
			if (state.scanToken !== token || state.phase !== "scanning") return;
			state.phase = "failure";
			state.message = "Scan failed. No partial results were kept.";
		}
		this.display();
	}

	private cancelStudyAreaScan(areaId: string): void {
		const state = this.studyAreaState(areaId);
		if (state.phase !== "scanning") return;
		state.scanToken += 1;
		state.phase = "initial";
		state.plan = null;
		state.hasScanned = true;
		state.message = "Scan canceled. Automatic updates remain off until you enable them.";
		this.display();
	}

	private async runStudyAreaAction(
		areaId: string,
		mode: "backfill" | "retry-failed"
	): Promise<void> {
		const state = this.studyAreaState(areaId);
		if (state.phase === "running" || state.phase === "scanning") return;
		if (!this.plugin.isProviderConfigured()) return;
		state.phase = "running";
		state.message = mode === "retry-failed" ? "Retrying update..." : "Updating study material...";
		this.display();
		let summary: StudyAreaRunSummary | null = null;
		try {
			summary = await this.plugin.runStudyArea(areaId, mode);
			state.phase = this.studyAreaCompletionPhase(summary);
			state.message = this.studyAreaCompletionMessage(summary);
			state.plan = await this.plugin.previewStudyArea(areaId);
		} catch {
			state.phase = "failure";
			state.message = "Update failed. Your last good study material was kept.";
		}
		this.display();
	}

	private studyAreaCompletionPhase(
		summary: StudyAreaRunSummary | null
	): StudyAreaUiPhase {
		if (!summary) return "failure";
		if (summary.failed && summary.completed) return "partial-failure";
		if (summary.failed) return "failure";
		return "success";
	}

	private studyAreaCompletionMessage(summary: StudyAreaRunSummary | null): string {
		if (!summary) return "Update could not start.";
		if (summary.failed) {
			return `${summary.completed} updated · ${summary.failed} failed. Last good material was kept.`;
		}
		return summary.completed
			? `${summary.completed} note${summary.completed === 1 ? "" : "s"} updated.`
			: "Study material is already up to date.";
	}

	private renderProviderSetupAction(containerEl: HTMLElement): void {
		const setup = new Setting(containerEl)
			.setName("AI model required")
			.setDesc("Scanning is available now. Configure a provider and model before generating or automatically updating study material.");
		setup.settingEl.addClass("cuecraft-study-area-provider-setup");
		setup.addButton((button) =>
			button.setButtonText("Configure AI model").onClick(() => {
				this.openSubpage("ai-model");
			})
		);
	}

	private renderStudyAreaExclusions(
		containerEl: HTMLElement,
		area: StudyArea
	): void {
		const exclusions = containerEl.createDiv({
			cls: "cuecraft-study-area-exclusions",
			attr: { role: "group", "aria-label": `Exclusions for ${studyAreaScopeLabel(area.parentPath)}` },
		});
		exclusions.createDiv({
			cls: "cuecraft-study-area-exclusions-title",
			text: "Exclusions",
		});
		exclusions.createDiv({
			cls: "cuecraft-study-area-help",
			text: "Notes inherit coverage from this scope. Excluding a note or nested folder is the only per-note opt-out.",
		});
		for (const path of area.excludedPaths) {
			const row = exclusions.createDiv({ cls: "cuecraft-study-area-exclusion-row" });
			row.createSpan({ text: path });
			const remove = row.createEl("button", {
				cls: "clickable-icon",
				attr: { type: "button", "aria-label": `Remove exclusion ${path}` },
			});
			setIcon(remove, "x");
			this.plugin.registerDomEvent(remove, "click", async () => {
				await this.plugin.updateStudyArea({
					...area,
					excludedPaths: area.excludedPaths.filter(
						(entry) => normalizeVaultPath(entry) !== normalizeVaultPath(path)
					),
				});
				this.studyAreaUi.delete(area.id);
				this.display();
			});
		}
		const options = this.studyAreaExclusionPaths(area);
		const picker = new Setting(exclusions)
			.setName("Exclude a note or nested folder")
			.setDesc("Type to search paths inside this scope.");
		renderModelCombobox({
			containerEl: picker.controlEl,
			value: "",
			options: normalizeModelIds(options),
			placeholder: options.length ? "Search notes and folders..." : "No paths available",
			emptyMessage: "No matching note or nested folder.",
			onCommit: async (value) => {
				const normalized = normalizeVaultPath(value);
				const validation = validateStudyAreaExclusion(area, normalized);
				if (!options.includes(normalized) || !validation.valid) {
					const reason = validation.valid ? "outside-scope" : validation.reason;
					new Notice(
						reason === "duplicate-path"
							? "CueCraft: that path is already excluded."
							: "CueCraft: choose an existing note or nested folder inside this scope."
					);
					return;
				}
				await this.plugin.updateStudyArea({
					...area,
					excludedPaths: [...area.excludedPaths, normalized],
				});
				this.studyAreaUi.delete(area.id);
				this.display();
			},
			renderToggleIcon: (iconEl) => setIcon(iconEl, "chevron-down"),
			suggestionsLabel: "exclusion suggestions",
		});
	}

	private renderDisabledStudyAreaRow(
		containerEl: HTMLElement,
		area: DisabledStudyArea
	): void {
		const conflict = findConflictingStudyArea(
			this.plugin.settings.studyAreas,
			area.parentPath
		);
		const scope = studyAreaScopeLabel(area.parentPath);
		const conflictLabel = conflict
			? studyAreaScopeLabel(conflict.parentPath)
			: null;
		const setting = new Setting(containerEl)
			.setName(scope)
			.setDesc(
				conflictLabel
					? `${scope} is disabled because it conflicts with ${conflictLabel}. It does not cover or update notes.`
					: `${scope} is disabled and does not cover notes. Its previous conflict is gone.`
			);
		setting.settingEl.addClass("cuecraft-study-area-row", "is-disabled");
		setting.settingEl.setAttr("aria-disabled", "true");
		setting.addButton((button) =>
			button
				.setButtonText(conflictLabel ? `Remove ${conflictLabel} and recover` : "Recover scope")
				.onClick(async () => {
					await this.plugin.recoverDisabledStudyArea(area.id, conflict?.id);
					this.studyAreaUi.delete(area.id);
					this.display();
				})
		);
	}

	// ── Content shown in notes ────────────────────────────────────────────
	private renderArtifactVisibilitySection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Content shown in notes").setHeading();
		containerEl.createEl("p", {
			cls: "cuecraft-settings-visibility-note",
			text: "These controls only change what appears in Editing and Reading. Hiding generated material never disables automatic maintenance.",
		});
		const noteBriefCard = this.createArtifactCard(
			containerEl,
			"Note Brief",
			"A whole-note overview with fixed Core idea, Review first, and Self-test cards."
		);

		new Setting(noteBriefCard)
			.setName("Show Note Brief")
			.setDesc("Show the whole-note Note Brief in Editing and Reading.")
			.addToggle((tg) => {
				tg.toggleEl.setAttribute("aria-label", "Show Note Brief");
				return tg
					.setValue(this.plugin.settings.showNoteBrief)
					.onChange(async (value) => {
						this.plugin.settings.showNoteBrief = value;
						await this.plugin.saveSettings({ refreshReviewSurfaces: false });
						this.refreshReviewSurfaces();
					});
			});
		const cueCard = this.createArtifactCard(
			containerEl,
			"Section study card",
			"Choose which parts of each section card appear in Editing and Reading."
		);

		new Setting(cueCard)
			.setName("Show summary")
			.addToggle((tg) => {
				tg.toggleEl.setAttribute("aria-label", "Show summary");
				return tg
					.setValue(this.plugin.settings.showSummary)
					.onChange(async (value) => {
						this.plugin.settings.showSummary = value;
						await this.plugin.saveSettings({ refreshReviewSurfaces: false });
						this.refreshReviewSurfaces();
					});
			});

		new Setting(cueCard)
			.setName("Show recall question")
			.addToggle((tg) => {
				tg.toggleEl.setAttribute("aria-label", "Show recall question");
				return tg
					.setValue(this.plugin.settings.showQuestion)
					.onChange(async (value) => {
						this.plugin.settings.showQuestion = value;
						await this.plugin.saveSettings({ refreshReviewSurfaces: false });
						this.refreshReviewSurfaces();
					});
			});
		new Setting(cueCard)
			.setName("Show key terms")
			.addToggle((tg) => {
				tg.toggleEl.setAttribute("aria-label", "Show key terms");
				return tg
					.setValue(this.plugin.settings.showTerms)
					.onChange(async (value) => {
						this.plugin.settings.showTerms = value;
						await this.plugin.saveSettings({ refreshReviewSurfaces: false });
						this.refreshReviewSurfaces();
					});
			});
	}

	private createArtifactCard(
		containerEl: HTMLElement,
		title: string,
		description: string
	): HTMLElement {
		const card = containerEl.createDiv({
			cls: "cuecraft-settings-artifact-card",
			attr: { role: "group", "aria-label": title },
		});
		card.createDiv({ cls: "cuecraft-settings-artifact-title", text: title });
		card.createDiv({ cls: "cuecraft-settings-artifact-preview", text: description });
		return card;
	}

	private refreshReviewSurfaces(): void {
		this.plugin.refreshEditorCues();
		this.plugin.refreshReadingModeSurface();
	}

	// ── Appearance ──────────────────────────────────────────────────────
	private renderAppearanceSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Appearance").setHeading();

		const editorDisplayDesc = (): string =>
			editorCueDisplayOption(this.plugin.settings.editorCueDisplay).description;
		this.renderAppearanceThumbnailSetting<EditorCueDisplay>(containerEl, {
			name: "Section card layout",
			description: () => `${editorDisplayDesc()} Changes section card layout in Editing only; Reading remains inline.`,
			options: editorCueDisplayThumbnailOptions(),
			value: () => this.plugin.settings.editorCueDisplay,
			setValue: (value) => {
				this.plugin.settings.editorCueDisplay = value;
			},
			afterSave: () => this.display(),
			className: "cuecraft-thumbnail-group-editor-display",
			refreshReading: false,
		});

		const editorFontDesc = (): string =>
			CUE_FONT_SIZES.find((f) => f.id === this.plugin.settings.cueFontSize)
				?.description ?? "Font size of study text.";
		this.renderAppearanceThumbnailSetting<CueFontSize>(containerEl, {
			name: "Study text size",
			description: () => `${editorFontDesc()} Applies in Editing and Reading.`,
			options: cueFontSizeThumbnailOptions(),
			value: () => this.plugin.settings.cueFontSize,
			setValue: (value) => {
				this.plugin.settings.cueFontSize = value;
			},
			className: "cuecraft-thumbnail-group-cue-font",
			refreshReading: true,
		});
	}

	private renderAppearanceThumbnailSetting<T extends string>(
		containerEl: HTMLElement,
		config: {
			name: string;
			description: () => string;
			options: readonly AppearanceThumbnailOption<T>[];
			value: () => T;
			setValue: (value: T) => void;
			afterSave?: () => void;
			className?: string;
			refreshReading: boolean;
		}
	): void {
		this.renderCueThumbnailSetting(containerEl, config, async (afterSave) => {
			await this.plugin.saveSettings({ refreshReviewSurfaces: false });
			this.plugin.refreshEditorCues();
			if (config.refreshReading) this.plugin.refreshReadingModeSurface();
			afterSave?.();
		});
	}

	private renderCueThumbnailSetting<T extends string>(
		containerEl: HTMLElement,
		config: {
			name: string;
			description: () => string;
			options: readonly AppearanceThumbnailOption<T>[];
			value: () => T;
			setValue: (value: T) => void;
			afterSave?: () => void;
			className?: string;
		},
		saveChange: (afterSave?: () => void) => Promise<void>
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
					await saveChange(() => {
						setting.setDesc(config.description());
						group.setValue(config.value());
						config.afterSave?.();
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

	private renderUrlCredentialSettings(
		containerEl: HTMLElement,
		provider: ByokProviderId
	): void {
		const field = byokProviderDefinition(provider).credentialField;
		const s = this.plugin.settings;
		new Setting(containerEl)
			.setName(field.label)
			.setDesc(field.description)
			.addText((text) =>
				text
					.setPlaceholder(field.placeholder)
					.setValue(cueCraftProviderCredential(s, provider))
					.onChange(async (value) => {
						setCueCraftProviderCredential(s, provider, value.trim());
						resetCueCraftFetchedModels(
							s,
							provider,
							field.resetModelsMessage ?? field.missingMessage
						);
						await this.plugin.saveSettings();
					})
			);

	}

	private renderDefaultProviderModelSettings(
		containerEl: HTMLElement,
		provider: ByokProviderId
	): void {
		const s = this.plugin.settings;
		const stored = cueCraftProviderSettings(s, provider);
		const definition = byokProviderDefinition(provider);
		this.renderCloudModelSettings(containerEl, {
			provider,
			definition,
			getModel: () => cueCraftProviderModel(s, provider),
			setModel: (value) => setCueCraftProviderModel(s, provider, value),
			hasCredential: () => this.plugin.isProviderCredentialSaved(provider),
			getAvailableModels: () => stored.availableModels,
			getModelOptions: () => stored.modelOptions,
			leadingOption:
				definition.modelBehavior === "optional"
					? CLI_DEFAULT_MODEL_OPTION
					: undefined,
			getHasFetchedModels: () => stored.hasFetchedModels,
			getRefreshMessage: () => stored.modelRefreshMessage,
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

	private renderAnthropicCredentialSettings(containerEl: HTMLElement): void {
		const field = byokProviderDefinition(ByokProvider.Anthropic).credentialField;
		this.renderCloudCredentialSettings(containerEl, {
			provider: ByokProvider.Anthropic,
			field,
			onSaved: () => this.syncAnthropicModelSelection(),
		});
	}

	private renderAnthropicModelSettings(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		const stored = cueCraftProviderSettings(s, ByokProvider.Anthropic);
		const definition = byokProviderDefinition(ByokProvider.Anthropic);
		const field = definition.modelField;
		const model = cueCraftProviderModel(s, ByokProvider.Anthropic);
		const storedModels =
			stored.modelOptions.length > 0
				? stored.modelOptions
				: normalizeModelIds(stored.availableModels);
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
		const hasApiKey = this.plugin.isProviderCredentialSaved(ByokProvider.Anthropic);

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
						: cueCraftProviderModel(s, ByokProvider.Anthropic)
				)
				.onChange(async (value) => {
					if (value === ANTHROPIC_CUSTOM_MODEL_ID) {
						stored.modelSelection = ANTHROPIC_CUSTOM_MODEL_ID;
						await this.plugin.saveSettings();
						this.display();
						return;
					}
					stored.modelSelection = value;
					setCueCraftProviderModel(s, ByokProvider.Anthropic, value);
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
						.setValue(cueCraftProviderModel(s, ByokProvider.Anthropic))
						.onChange(async (value) => {
							setCueCraftProviderModel(s, ByokProvider.Anthropic, value.trim());
							stored.modelSelection = ANTHROPIC_CUSTOM_MODEL_ID;
							await this.plugin.saveSettings();
						})
				);
		}

	}

	private syncAnthropicModelSelection(): void {
		const s = this.plugin.settings;
		const stored = cueCraftProviderSettings(s, ByokProvider.Anthropic);
		const knownIds = new Set(
			buildAnthropicModelOptions(stored.modelOptions).map(
				(model) => model.id
			)
		);
		const model = cueCraftProviderModel(s, ByokProvider.Anthropic);
		stored.modelSelection = knownIds.has(model)
			? model
			: ANTHROPIC_CUSTOM_MODEL_ID;
	}

	private async refreshAnthropicModels(): Promise<void> {
		const s = this.plugin.settings;
		if (!this.plugin.isProviderCredentialSaved(ByokProvider.Anthropic)) {
			new Notice("CueCraft: enter your Anthropic API key first.");
			return;
		}
		let message: string;
		try {
			const modelOptions = await this.plugin.listProviderModels(
				ByokProvider.Anthropic
			);
			message =
				modelOptions.length > 0
					? `Fetched ${modelOptions.length} Anthropic model${modelOptions.length === 1 ? "" : "s"} from your account.`
					: "No Anthropic models were returned for this account. You can still enter a custom model ID.";
			applyCueCraftListedModels(s, ByokProvider.Anthropic, modelOptions, message);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			message = detail
				? `Could not fetch Anthropic models (${detail}). You can still enter a custom model ID.`
				: "Could not fetch Anthropic models. You can still enter a custom model ID.";
			applyCueCraftModelRefreshFailure(s, ByokProvider.Anthropic, message);
		}
		this.syncAnthropicModelSelection();
		await this.plugin.saveSettings();
		this.display();
		new Notice(`CueCraft: ${message}`);
	}

	private renderProviderCredentialSettings(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		const provider = cueCraftSelectedProvider(s);
		if (!provider) return;
		const definition = byokProviderDefinition(provider);
		if (provider === "anthropic") {
			this.renderAnthropicCredentialSettings(containerEl);
			return;
		}
		if (definition.credentialKind === "api-key") {
			this.renderCloudCredentialSettings(containerEl, {
				provider,
				field: definition.credentialField,
				onSaved: () => {
					resetCueCraftFetchedModels(
						s,
						provider,
						definition.credentialField.resetModelsMessage ??
							definition.credentialField.missingMessage
					);
				},
			});
			return;
		}
		if (definition.credentialKind === "command") {
			this.renderCliCredentialSettings(containerEl, {
				label: definition.credentialField.label,
				description: definition.credentialField.description,
				commandPlaceholder: definition.credentialField.placeholder,
				getCommand: () => cueCraftProviderCredential(s, provider),
				setCommand: (value) => {
					setCueCraftProviderCredential(s, provider, value);
					resetCueCraftFetchedModels(
						s,
						provider,
						definition.credentialField.resetModelsMessage ??
							definition.credentialField.missingMessage
					);
				},
			});
			return;
		}
		this.renderUrlCredentialSettings(containerEl, provider);
	}

	private renderProviderModelSettings(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		const provider = cueCraftSelectedProvider(s);
		if (!provider) return;
		if (provider === "anthropic") {
			this.renderAnthropicModelSettings(containerEl);
			return;
		}
		this.renderDefaultProviderModelSettings(containerEl, provider);
	}

	private renderCloudCredentialSettings(
		containerEl: HTMLElement,
		opts: {
			provider: ByokProviderId;
			field: CueCraftProviderDefinition["credentialField"];
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
			leadingOption?: ModelOption;
			getModel: () => string;
			setModel: (v: string) => void;
		}
	): Setting {
		const currentModel = opts.getModel();
		const modelOptions =
			opts.modelOptions && opts.modelOptions.length > 0
				? opts.modelOptions
				: normalizeModelIds(opts.availableModels);
		const modelSetting = new Setting(containerEl)
			.setName(opts.modelLabel)
			.setDesc(opts.modelDesc);
		modelSetting.settingEl.addClass("cuecraft-model-setting");
		renderModelCombobox({
			containerEl: modelSetting.controlEl,
			value: currentModel,
			options: modelOptions,
			placeholder: opts.modelPlaceholder,
			emptyMessage: "No fetched models match. Press Enter or leave the field to keep a custom model ID.",
			leadingOption: opts.leadingOption,
			onCommit: async (value) => {
				const previousValue = opts.getModel().trim();
				opts.setModel(value);
				await this.plugin.saveSettings();
				if (value !== previousValue) this.display();
			},
			renderToggleIcon: (iconEl) => setIcon(iconEl, "chevron-down"),
		});
		return modelSetting;
	}

	private renderCloudModelSettings(
		containerEl: HTMLElement,
		opts: {
			provider: CueCraftFetchedModelProvider;
			definition: CueCraftProviderDefinition;
			getModel: () => string;
			setModel: (v: string) => void;
			hasCredential: () => boolean;
			getAvailableModels: () => string[];
			getModelOptions?: () => ModelOption[];
			leadingOption?: ModelOption;
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
			leadingOption: opts.leadingOption,
			getModel: opts.getModel,
			setModel: opts.setModel,
		});
		if (!opts.definition.supportsModelListing) return;
		this.addModelRefreshButton(modelSetting, {
			definition: opts.definition,
			hasFetchedModels: opts.getHasFetchedModels(),
			disabled: !opts.hasCredential(),
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
			definition: CueCraftProviderDefinition;
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
			const missingMessage =
				byokProviderDefinition(opts.provider).credentialField.missingMessage;
			new Notice(`CueCraft: ${missingMessage}`);
			return;
		}
		try {
			const raw = await this.plugin.listProviderModels(opts.provider);
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
		if (!selectedProvider) return;
		const definition = byokProviderDefinition(selectedProvider);
		if (definition.credentialKind === "command") {
			await this.testLocalCliProvider();
			return;
		}
		if (definition.credentialKind === "api-key") {
			await this.testCloudProvider();
			return;
		}
		await this.testUrlProvider();
	}

	private async testLocalCliProvider(): Promise<void> {
		const selectedProvider = cueCraftSelectedProvider(this.plugin.settings);
		if (!selectedProvider) return;
		const command = cueCraftProviderCredential(
			this.plugin.settings,
			selectedProvider
		);
		if (!command.trim()) {
			const providerName = cueCraftProviderLabel(selectedProvider);
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

	private async testUrlProvider(): Promise<void> {
		const selectedProvider = cueCraftSelectedProvider(this.plugin.settings);
		if (!selectedProvider) return;
		const definition = byokProviderDefinition(selectedProvider);
		const url = cueCraftProviderCredential(this.plugin.settings, selectedProvider);
		if (!url.trim()) {
			new Notice(`CueCraft: ${definition.credentialField.missingMessage}`);
			return;
		}
		let provider: CueCraftByokRuntime;
		try {
			provider = await this.plugin.makeProvider();
		} catch (error) {
			new Notice(formatCueCraftNotice(error instanceof Error ? error.message : String(error)));
			return;
		}
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
		if (!selectedProvider) return;
		if (!this.plugin.isProviderCredentialSaved(selectedProvider)) {
			const providerName = cueCraftProviderLabel(selectedProvider);
			new Notice(`CueCraft: enter your ${providerName} API key first.`);
			return;
		}
		const selectedModel = cueCraftProviderModel(
			this.plugin.settings,
			selectedProvider
		).trim();
		if (!selectedModel) {
			try {
				const models = await this.plugin.listProviderModels(
					selectedProvider as CueCraftFetchedModelProvider
				);
				recordCueCraftProviderConnectionSuccess(this.plugin.settings);
				await this.plugin.saveSettings();
				this.display();
				const providerName = byokProviderDefinition(selectedProvider).shortLabel;
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
		let provider: CueCraftByokRuntime;
		try {
			provider = await this.plugin.makeProvider();
		} catch (error) {
			new Notice(formatCueCraftNotice(error instanceof Error ? error.message : String(error)));
			return;
		}
		const status = await provider.testConnection();
		if (status.ok) {
			recordCueCraftProviderConnectionSuccess(this.plugin.settings);
			await this.plugin.saveSettings();
			this.display();
		}
		if (status.ok && provider.id === "anthropic") {
			const stored = cueCraftProviderSettings(this.plugin.settings, ByokProvider.Anthropic);
			const model = describeAnthropicModel(
				cueCraftProviderModel(this.plugin.settings, ByokProvider.Anthropic),
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
			const stored = cueCraftProviderSettings(this.plugin.settings, ByokProvider.Anthropic);
			new Notice(
				formatCueCraftNotice(
					formatAnthropicUnavailableModelMessage(
						cueCraftProviderModel(this.plugin.settings, ByokProvider.Anthropic),
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

	override onOpen(): void {
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
