import { App, Notice, PluginSettingTab, Setting, requestUrl } from "obsidian";
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
	EDITOR_CUE_PLACEMENTS,
	DEFAULT_EDITOR_CUE_PLACEMENT,
	type EditorCuePlacement,
} from "./editor-layout";

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
	editorCuePlacement: EditorCuePlacement;
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
	editorCuePlacement: DEFAULT_EDITOR_CUE_PLACEMENT,
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

		containerEl.createEl("h2", { text: "CueCraft" });
		containerEl.createEl("p", {
			text: "CueCraft generates study cues using a local Ollama model or a frontier model (Claude, ChatGPT, Gemini, Grok). Your Markdown files are never modified.",
			cls: "cuecraft-settings-intro",
		});

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

		const placementSetting = new Setting(containerEl)
			.setName("Editor cue placement")
			.addDropdown((dd) => {
				for (const p of EDITOR_CUE_PLACEMENTS) dd.addOption(p.id, p.label);
				dd.setValue(this.plugin.settings.editorCuePlacement).onChange(
					async (value) => {
						this.plugin.settings.editorCuePlacement =
							value as EditorCuePlacement;
						await this.plugin.saveSettings();
						this.plugin.applyEditorCuePlacement();
						placementSetting.setDesc(placementDesc());
					}
				);
			});
		const placementDesc = (): string =>
			EDITOR_CUE_PLACEMENTS.find(
				(p) => p.id === this.plugin.settings.editorCuePlacement
			)?.description ?? "Where inline editor cues sit relative to the heading.";
		placementSetting.setDesc(placementDesc());

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
					});
				text.inputEl.type = "password";
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
