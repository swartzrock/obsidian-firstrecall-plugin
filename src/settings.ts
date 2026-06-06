import { App, Notice, PluginSettingTab, Setting, requestUrl } from "obsidian";
import type CueCraftPlugin from "./main";

/**
 * v1.0 ships a single provider (Ollama). The settings shape intentionally
 * leaves room for the provider abstraction described in the scope doc, but
 * only Ollama fields are surfaced for now.
 */
export type CuePreset = "conceptual" | "exam-prep" | "vocabulary" | "minimal";
export type StudyHideMode = "blur" | "collapse";
export type ProviderId = "ollama" | "anthropic";

export interface CueCraftSettings {
	provider: ProviderId;
	ollamaHost: string;
	ollamaModel: string;
	anthropicApiKey: string;
	anthropicModel: string;
	cuePreset: CuePreset;
	studyHideMode: StudyHideMode;
}

export const DEFAULT_SETTINGS: CueCraftSettings = {
	provider: "ollama",
	ollamaHost: "http://localhost:11434",
	ollamaModel: "llama3.1:8b",
	anthropicApiKey: "",
	anthropicModel: "claude-3-5-sonnet-latest",
	cuePreset: "conceptual",
	studyHideMode: "blur",
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
			text: "CueCraft generates study cues using a local Ollama model or a frontier model (Claude). Your Markdown files are never modified.",
			cls: "cuecraft-settings-intro",
		});

		new Setting(containerEl)
			.setName("AI provider")
			.setDesc("Where cues are generated. Ollama runs locally; Claude calls the Anthropic API.")
			.addDropdown((dd) =>
				dd
					.addOption("ollama", "Ollama (local)")
					.addOption("anthropic", "Anthropic (Claude)")
					.setValue(this.plugin.settings.provider)
					.onChange(async (value) => {
						this.plugin.settings.provider = value as ProviderId;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.provider === "ollama") {
			this.renderOllamaSettings(containerEl);
		} else {
			this.renderAnthropicSettings(containerEl);
		}

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

	private renderAnthropicSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Anthropic API key")
			.setDesc(
				"Your Anthropic API key (from console.anthropic.com). Stored locally in this vault's plugin data."
			)
			.addText((text) => {
				text
					.setPlaceholder("sk-ant-...")
					.setValue(this.plugin.settings.anthropicApiKey)
					.onChange(async (value) => {
						this.plugin.settings.anthropicApiKey = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		new Setting(containerEl)
			.setName("Claude model")
			.setDesc("An Anthropic model id (e.g. claude-3-5-sonnet-latest, claude-3-5-haiku-latest).")
			.addText((text) =>
				text
					.setPlaceholder("claude-3-5-sonnet-latest")
					.setValue(this.plugin.settings.anthropicModel)
					.onChange(async (value) => {
						this.plugin.settings.anthropicModel = value.trim();
						await this.plugin.saveSettings();
					})
			);
	}

	/** Verify the selected provider is reachable and reports a readable result. */
	private async testConnection(): Promise<void> {
		if (this.plugin.settings.provider === "anthropic") {
			await this.testAnthropic();
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

	private async testAnthropic(): Promise<void> {
		if (!this.plugin.settings.anthropicApiKey) {
			new Notice("CueCraft: enter your Anthropic API key first.");
			return;
		}
		new Notice("CueCraft: testing Anthropic\u2026");
		const status = await this.plugin.makeProvider().testConnection();
		new Notice(`CueCraft: ${status.message}`);
	}
}
