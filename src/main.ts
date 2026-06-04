import { Notice, Plugin } from "obsidian";
import {
	CueCraftSettings,
	CueCraftSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";

/** Status-bar states from the v1.0 scope. `generating` carries N/M progress. */
type CueStatus = "setup" | "ready" | "generating" | "stale" | "study";

const RIBBON_ICON = "graduation-cap";

export default class CueCraftPlugin extends Plugin {
	settings: CueCraftSettings = DEFAULT_SETTINGS;

	private statusBarEl: HTMLElement | null = null;
	private studyMode = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addSettingTab(new CueCraftSettingTab(this.app, this));

		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("cuecraft-status");
		this.setStatus(this.isConfigured() ? "ready" : "setup");

		this.addRibbonIcon(RIBBON_ICON, "CueCraft", () => this.onRibbonClick());

		this.registerCommands();
	}

	onunload(): void {
		// Nothing persistent to tear down in the scaffold.
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Configuration may have changed; refresh the idle status pill.
		if (!this.studyMode) {
			this.setStatus(this.isConfigured() ? "ready" : "setup");
		}
	}

	/** True once a provider host + model are set. */
	private isConfigured(): boolean {
		return Boolean(this.settings.ollamaHost && this.settings.ollamaModel);
	}

	private setStatus(status: CueStatus, progress?: { done: number; total: number }): void {
		if (!this.statusBarEl) return;
		const label =
			status === "generating" && progress
				? `CueCraft: generating ${progress.done}/${progress.total}`
				: `CueCraft: ${status}`;
		this.statusBarEl.setText(label);
		this.statusBarEl.dataset.status = status;
	}

	private onRibbonClick(): void {
		if (!this.isConfigured()) {
			new Notice("CueCraft: choose your AI provider in Settings to get started.");
			// Open settings → CueCraft tab.
			// @ts-expect-error - setting is available on the desktop app.
			this.app.setting?.open?.();
			// @ts-expect-error - openTabById is available on the desktop app.
			this.app.setting?.openTabById?.(this.manifest.id);
			return;
		}
		this.generateCues();
	}

	private registerCommands(): void {
		this.addCommand({
			id: "generate-cues",
			name: "Generate Cues for This Note",
			callback: () => this.generateCues(),
		});
		this.addCommand({
			id: "toggle-study-mode",
			name: "Toggle Study Mode",
			callback: () => this.toggleStudyMode(),
		});
		this.addCommand({
			id: "enable-for-note",
			name: "Enable for This Note",
			callback: () => new Notice("CueCraft: enable-for-note not implemented yet."),
		});
		this.addCommand({
			id: "hide-for-note",
			name: "Hide for This Note",
			callback: () => new Notice("CueCraft: hide-for-note not implemented yet."),
		});
		this.addCommand({
			id: "clear-cues",
			name: "Clear Generated Cues",
			callback: () => new Notice("CueCraft: clear-cues not implemented yet."),
		});
	}

	private generateCues(): void {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("CueCraft: open a note first.");
			return;
		}
		// Scaffold placeholder — real parsing/generation lands with the parser
		// and generator modules. This proves the command + status wiring.
		new Notice(`CueCraft: would generate cues for "${file.basename}".`);
		this.setStatus("ready");
	}

	private toggleStudyMode(): void {
		this.studyMode = !this.studyMode;
		document.body.toggleClass("cuecraft-study-active", this.studyMode);
		this.setStatus(this.studyMode ? "study" : this.isConfigured() ? "ready" : "setup");
		new Notice(`CueCraft: Study Mode ${this.studyMode ? "on" : "off"}.`);
	}
}
