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
	openaiApiKey: string;
	openaiModel: string;
	googleApiKey: string;
	googleModel: string;
	xaiApiKey: string;
	xaiModel: string;
	cuePreset: CuePreset;
	studyHideMode: StudyHideMode;
	cornellStyle: CornellStyle;
	cueColumnWidth: CueColumnWidth;
	cueFontSize: CueFontSize;
	// v0 settings redesign. Persisted now; some are not yet wired into
	// generation/rendering (the inline `cornell` block work lands later).
	autoGenerateOnSave: boolean;
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
	anthropicModel: "claude-3-5-sonnet-latest",
	openaiApiKey: "",
	openaiModel: "gpt-4o-mini",
	googleApiKey: "",
	googleModel: "gemini-1.5-flash",
	xaiApiKey: "",
	xaiModel: "grok-2-latest",
	cuePreset: "conceptual",
	studyHideMode: "blur",
	cornellStyle: DEFAULT_CORNELL_STYLE,
	cueColumnWidth: DEFAULT_CUE_COLUMN_WIDTH,
	cueFontSize: DEFAULT_CUE_FONT_SIZE,
	// Off by default so an unwired auto-generate can't trigger API calls.
	autoGenerateOnSave: false,
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

	// ── AI model ──────────────────────────────────────────────────────────
	private renderAiModelSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("AI model").setHeading();

		new Setting(containerEl)
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

		this.renderProviderSettings(containerEl);

		new Setting(containerEl)
			.setName("Test connection")
			.setDesc("Verify CueCraft can reach the selected provider.")
			.addButton((btn) =>
				btn
					.setButtonText("Test connection")
					.setCta()
					.onClick(() => this.testConnection())
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
					})
			);

		const densityDesc = (): string =>
			`How many recall questions to generate per section \u2014 ${cueDensityLabel(
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
					})
			);

		new Setting(containerEl)
			.setName("Auto-write section summary")
			.setDesc("Draft a short summary callout beneath each note's cues.")
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.autoSummary)
					.onChange(async (value) => {
						this.plugin.settings.autoSummary = value;
						await this.plugin.saveSettings();
					})
			);
	}

	// ── Note format ───────────────────────────────────────────────────────
	private renderNoteFormatSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Note format").setHeading();

		new Setting(containerEl)
			.setName("Render in Reading mode")
			.setDesc("Process the cornell block in both Live Preview and Reading view.")
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

	private renderOllamaSettings(containerEl: HTMLElement): void {
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

	/** Render the field set for whichever provider is selected. */
	private renderProviderSettings(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		switch (s.provider) {
			case "ollama":
				this.renderOllamaSettings(containerEl);
				return;
			case "anthropic":
				this.renderCloudSettings(containerEl, {
					vendor: "Anthropic",
					keyDesc: "Your Anthropic API key (from console.anthropic.com). Stored locally in this vault's plugin data.",
					keyPlaceholder: "sk-ant-...",
					getKey: () => s.anthropicApiKey,
					setKey: (v) => (s.anthropicApiKey = v),
					modelLabel: "Claude model",
					modelDesc: "An Anthropic model id (e.g. claude-3-5-sonnet-latest, claude-3-5-haiku-latest).",
					modelPlaceholder: "claude-3-5-sonnet-latest",
					getModel: () => s.anthropicModel,
					setModel: (v) => (s.anthropicModel = v),
				});
				return;
			case "openai":
				this.renderCloudSettings(containerEl, {
					vendor: "OpenAI",
					keyDesc: "Your OpenAI API key (from platform.openai.com). Stored locally in this vault's plugin data.",
					keyPlaceholder: "sk-...",
					getKey: () => s.openaiApiKey,
					setKey: (v) => (s.openaiApiKey = v),
					modelLabel: "OpenAI model",
					modelDesc: "An OpenAI model id (e.g. gpt-4o-mini, gpt-4o).",
					modelPlaceholder: "gpt-4o-mini",
					getModel: () => s.openaiModel,
					setModel: (v) => (s.openaiModel = v),
				});
				return;
			case "google":
				this.renderCloudSettings(containerEl, {
					vendor: "Google",
					keyDesc: "Your Google AI (Gemini) API key (from aistudio.google.com). Stored locally in this vault's plugin data.",
					keyPlaceholder: "AIza...",
					getKey: () => s.googleApiKey,
					setKey: (v) => (s.googleApiKey = v),
					modelLabel: "Gemini model",
					modelDesc: "A Gemini model id (e.g. gemini-1.5-flash, gemini-1.5-pro).",
					modelPlaceholder: "gemini-1.5-flash",
					getModel: () => s.googleModel,
					setModel: (v) => (s.googleModel = v),
				});
				return;
			case "xai":
				this.renderCloudSettings(containerEl, {
					vendor: "xAI",
					keyDesc: "Your xAI API key (from console.x.ai). Stored locally in this vault's plugin data.",
					keyPlaceholder: "xai-...",
					getKey: () => s.xaiApiKey,
					setKey: (v) => (s.xaiApiKey = v),
					modelLabel: "Grok model",
					modelDesc: "An xAI model id (e.g. grok-2-latest, grok-beta).",
					modelPlaceholder: "grok-2-latest",
					getModel: () => s.xaiModel,
					setModel: (v) => (s.xaiModel = v),
				});
				return;
		}
	}

	/** Shared API-key + model field set for the cloud (AI SDK) providers. */
	private renderCloudSettings(
		containerEl: HTMLElement,
		opts: {
			vendor: string;
			keyDesc: string;
			keyPlaceholder: string;
			getKey: () => string;
			setKey: (v: string) => void;
			modelLabel: string;
			modelDesc: string;
			modelPlaceholder: string;
			getModel: () => string;
			setModel: (v: string) => void;
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
						updateBadge();
					});
				text.inputEl.type = "password";

				// Show/hide toggle for the otherwise-masked key.
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

				// Presence badge mirroring the v0 "Valid" pill. This reflects
				// that a key is set, not a verified key -- use Test connection
				// for a real round-trip check.
				const badge = eye.insertAdjacentElement(
					"afterend",
					createEl("span", { cls: "cuecraft-key-badge" })
				) as HTMLSpanElement;
				const updateBadge = (): void => {
					const set = opts.getKey().trim().length > 0;
					badge.setText(set ? "Set" : "Empty");
					badge.toggleClass("is-set", set);
					badge.toggleClass("is-empty", !set);
				};
				updateBadge();
			});

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
		new Notice(`CueCraft: testing ${provider.label}\u2026`);
		const status = await provider.testConnection();
		new Notice(`CueCraft: ${status.message}`);
	}
}
