import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
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
	ANTHROPIC_CUSTOM_MODEL_ID,
	ANTHROPIC_DEFAULT_MODEL_ID,
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
import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";
import type { AnthropicProvider } from "./providers/anthropic-provider";

/**
 * CueCraft supports a local provider (Ollama) and several cloud providers via
 * the Vercel AI SDK (Anthropic, OpenAI, Google, xAI). Each cloud provider keeps
 * its own API key + model id; only the selected provider's fields are surfaced.
 */
export type CuePreset = "conceptual" | "exam-prep" | "vocabulary" | "minimal";
export type StudyHideMode = "blur" | "collapse";
export type ProviderId = "ollama" | "anthropic" | "openai" | "google" | "xai";

export interface CueCraftSettings {
	provider: ProviderId;
	ollamaHost: string;
	ollamaModel: string;
	anthropicApiKey: string;
	anthropicModel: string;
	anthropicModelSelection: string;
	anthropicAvailableModels: ModelInfo[];
	anthropicModelRefreshMessage: string;
	openaiApiKey: string;
	openaiModel: string;
	googleApiKey: string;
	googleModel: string;
	xaiApiKey: string;
	xaiModel: string;
	providerConnectionStatus: ProviderConnectionStatusMap;
	cuePreset: CuePreset;
	studyHideMode: StudyHideMode;
	cornellStyle: CornellStyle;
	cueColumnWidth: CueColumnWidth;
	cueFontSize: CueFontSize;
	autoGenerateOnSave: boolean;
	sectionConcurrency: number;
	cueDensity: CueDensity;
	questionStyle: QuestionStyle;
	generateKeywords: boolean;
	autoSummary: boolean;
	renderInReadingMode: boolean;
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
	anthropicModel: ANTHROPIC_DEFAULT_MODEL_ID,
	anthropicModelSelection: ANTHROPIC_DEFAULT_MODEL_ID,
	anthropicAvailableModels: [],
	anthropicModelRefreshMessage: "",
	openaiApiKey: "",
	openaiModel: "gpt-4o-mini",
	googleApiKey: "",
	googleModel: "gemini-1.5-flash",
	xaiApiKey: "",
	xaiModel: "grok-2-latest",
	providerConnectionStatus: {},
	cuePreset: "conceptual",
	studyHideMode: "blur",
	cornellStyle: DEFAULT_CORNELL_STYLE,
	cueColumnWidth: DEFAULT_CUE_COLUMN_WIDTH,
	cueFontSize: DEFAULT_CUE_FONT_SIZE,
	autoGenerateOnSave: false,
	sectionConcurrency: 5,
	cueDensity: DEFAULT_CUE_DENSITY,
	questionStyle: DEFAULT_QUESTION_STYLE,
	generateKeywords: true,
	autoSummary: true,
	renderInReadingMode: true,
	foldCueColumnOnMobile: true,
	cueAccent: DEFAULT_CUE_ACCENT,
	showCueBorder: true,
	compactChips: false,
};

export class CueCraftSettingTab extends PluginSettingTab {
	private plugin: CueCraftPlugin;

	constructor(app: App, plugin: CueCraftPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("p", {
			text: "CueCraft generates study cues using a local Ollama model or a frontier model (Claude, ChatGPT, Gemini, Grok). Your Markdown files are never modified.",
			cls: "cuecraft-settings-intro",
		});

		this.renderAiModelSection(containerEl);
		this.renderCueGenerationSection(containerEl);
		this.renderNoteFormatSection(containerEl);
		this.renderAppearanceSection(containerEl);
		this.renderStudySection(containerEl);
	}

	hide(): void {
		super.hide();
		this.plugin.promptForCueSettingsRegeneration();
	}

	// ── AI model ──────────────────────────────────────────────────────────
	private renderAiModelSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("AI model").setHeading();

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
					? `Last verified ${new Date(status.testedAt).toLocaleString()}.`
					: status.connection === "stale"
						? "The saved connection check no longer matches the current key or model."
						: "Save the key/host and model, then run Test connection to verify this setup."
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
	private renderCueGenerationSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Cue generation").setHeading();

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
			.setName("Generate keyword chips")
			.setDesc("Add short keyword/phrase tags to the cue column for each section.")
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

	// ── Note format ───────────────────────────────────────────────────────
	private renderNoteFormatSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Note format").setHeading();

		new Setting(containerEl)
			.setName("Render in Reading mode")
			.setDesc("Show cached CueCraft cues beneath headings in Reading view.")
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.renderInReadingMode)
					.onChange(async (value) => {
						this.plugin.settings.renderInReadingMode = value;
						await this.plugin.saveSettings();
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

	// ── Appearance ────────────────────────────────────────────────────────
	private renderAppearanceSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Appearance").setHeading();

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
			.setName("Compact chips")
			.setDesc("Use smaller keyword chips with tighter spacing.")
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
	private renderStudySection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Study Mode").setHeading();

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
			.setDesc("Accent used for the cue rail and keyword chips.")
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
						await this.plugin.saveSettings();
					})
			);

	}

	private renderOllamaModelSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Ollama model")
			.setDesc("Name of an installed Ollama model (e.g. llama3.1:8b).")
			.addText((text) =>
				text
					.setPlaceholder("llama3.1:8b")
					.setValue(this.plugin.settings.ollamaModel)
					.onChange(async (value) => {
						this.plugin.settings.ollamaModel = value.trim();
						await this.plugin.saveSettings();
					})
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
						s.anthropicModelRefreshMessage =
							"Enter your Anthropic API key, then refresh models to load account-specific Claude options.";
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

		new Setting(containerEl)
			.setName("Claude model")
			.setDesc(modelHint)
			.addDropdown((dd) => {
				dd.addOption(ANTHROPIC_CUSTOM_MODEL_ID, "Custom model ID...");
				for (const model of modelOptions) {
					const label = model.recommended
						? `${model.label} (Recommended)`
						: model.legacy
							? `${model.label} (Legacy)`
							: model.label;
					dd.addOption(model.id, label);
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

		new Setting(containerEl)
			.setName("Refresh models")
			.setDesc(
				s.anthropicModelRefreshMessage ||
				(hasApiKey
					? "Refresh Anthropic's account-specific model list. CueCraft keeps the curated fallback models even if refresh fails."
					: "Enter your Anthropic API key first to refresh account-specific models.")
			)
			.addButton((btn) =>
				btn
					.setButtonText("Refresh models")
					.setDisabled(!hasApiKey)
					.onClick(() => void this.refreshAnthropicModels())
			);

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
		if (provider.id !== "anthropic" || !provider.listModels) {
			s.anthropicAvailableModels = [];
			s.anthropicModelRefreshMessage =
				"CueCraft: Anthropic model refresh is unavailable; showing the curated fallback list.";
			this.syncAnthropicModelSelection();
			await this.plugin.saveSettings();
			this.display();
			return;
		}
		// new Notice("CueCraft: refreshing Anthropic models…");
		const anthropicProvider = provider as AnthropicProvider & {
			listModels(): Promise<ModelInfo[]>;
		};
		const result = await refreshAnthropicModelOptions({
			listModels: () => anthropicProvider.listModels(),
		});
		s.anthropicAvailableModels = result.availableModels;
		s.anthropicModelRefreshMessage = result.message;
		if (result.usedFallback) {
			s.anthropicAvailableModels = [];
		}
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
					setKey: (v) => (s.openaiApiKey = v),
				});
				return;
			case "google":
				this.renderCloudCredentialSettings(containerEl, {
					vendor: "Google",
					keyDesc: "Your Google AI (Gemini) API key (from aistudio.google.com). Stored locally in this vault's plugin data.",
					keyPlaceholder: "AIza...",
					getKey: () => s.googleApiKey,
					setKey: (v) => (s.googleApiKey = v),
				});
				return;
			case "xai":
				this.renderCloudCredentialSettings(containerEl, {
					vendor: "xAI",
					keyDesc: "Your xAI API key (from console.x.ai). Stored locally in this vault's plugin data.",
					keyPlaceholder: "xai-...",
					getKey: () => s.xaiApiKey,
					setKey: (v) => (s.xaiApiKey = v),
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
					modelLabel: "OpenAI model",
					modelDesc: "An OpenAI model id (e.g. gpt-4o-mini, gpt-4o).",
					modelPlaceholder: "gpt-4o-mini",
					getModel: () => s.openaiModel,
					setModel: (v) => (s.openaiModel = v),
				});
				return;
			case "google":
				this.renderCloudModelSettings(containerEl, {
					modelLabel: "Gemini model",
					modelDesc: "A Gemini model id (e.g. gemini-1.5-flash, gemini-1.5-pro).",
					modelPlaceholder: "gemini-1.5-flash",
					getModel: () => s.googleModel,
					setModel: (v) => (s.googleModel = v),
				});
				return;
			case "xai":
				this.renderCloudModelSettings(containerEl, {
					modelLabel: "Grok model",
					modelDesc: "An xAI model id (e.g. grok-2-latest, grok-beta).",
					modelPlaceholder: "grok-2-latest",
					getModel: () => s.xaiModel,
					setModel: (v) => (s.xaiModel = v),
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

	private renderCloudModelSettings(
		containerEl: HTMLElement,
		opts: {
			modelLabel: string;
			modelDesc: string;
			modelPlaceholder: string;
			getModel: () => string;
			setModel: (v: string) => void;
		}
	): void {
		new Setting(containerEl)
			.setName(opts.modelLabel)
			.setDesc(opts.modelDesc)
			.addText((text) =>
				text
					.setPlaceholder(opts.modelPlaceholder)
					.setValue(opts.getModel())
					.onChange(async (value) => {
						opts.setModel(value.trim());
						await this.plugin.saveSettings();
					})
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
		if (!this.plugin.isProviderConfigured()) {
			new Notice(`CueCraft: enter your ${provider.label} API key first.`);
			return;
		}
		// new Notice(`CueCraft: testing ${provider.label}\u2026`);
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
