import {
	MarkdownView,
	Menu,
	Notice,
	Plugin,
	TFile,
	requestUrl,
	type MarkdownFileInfo,
} from "obsidian";
import type { EditorView } from "@codemirror/view";
import {
	CueCraftSettings,
	CueCraftSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";
import { generateNote } from "./generator";
import { OllamaProvider } from "./providers/ollama-provider";
import type { HttpClient } from "./providers/types";
import { parseSections } from "./parser";
import {
	CacheStore,
	buildNoteCache,
	isStale,
	loadCache,
	type NoteCache,
} from "./cache";
import {
	buildCueLineData,
	cueEditorExtension,
	setCuesEffect,
} from "./cue-extension";
import {
	VisibilityStore,
	loadHiddenMap,
	pillAction,
	visibilityMenuLabel,
} from "./visibility";

/** Status-bar states from the v1.0 scope. `generating` carries N/M progress. */
type CueStatus = "setup" | "ready" | "generating" | "stale" | "study" | "hidden";

interface PluginData {
	settings: CueCraftSettings;
	caches: Record<string, NoteCache>;
	hidden: Record<string, true>;
}

const RIBBON_ICON = "graduation-cap";

export default class CueCraftPlugin extends Plugin {
	settings: CueCraftSettings = DEFAULT_SETTINGS;

	private statusBarEl: HTMLElement | null = null;
	private studyMode = false;
	private currentRun: AbortController | null = null;
	private data: PluginData = { settings: DEFAULT_SETTINGS, caches: {}, hidden: {} };
	private cacheStore!: CacheStore;
	private visibility!: VisibilityStore;

	async onload(): Promise<void> {
		await this.loadPluginData();

		this.cacheStore = new CacheStore(this.data.caches, async (map) => {
			this.data.caches = map;
			await this.saveData(this.data);
		});
		this.visibility = new VisibilityStore(this.data.hidden, async (map) => {
			this.data.hidden = map;
			await this.saveData(this.data);
		});

		this.addSettingTab(new CueCraftSettingTab(this.app, this));

		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("cuecraft-status");
		this.statusBarEl.addEventListener("click", () => this.onPillClick());

		this.addRibbonIcon(RIBBON_ICON, "CueCraft", () => this.onRibbonClick());
		this.registerCommands();
		this.registerEditorExtension(cueEditorExtension);

		this.registerEvent(
			this.app.workspace.on("file-open", (file) => this.onActiveFile(file))
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile) void this.visibility.rename(oldPath, file.path);
			})
		);
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.addVisibilityMenuItem(menu, file);
				}
			})
		);
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, _editor, info: MarkdownFileInfo) => {
				if (info.file) this.addVisibilityMenuItem(menu, info.file);
			})
		);
		this.onActiveFile(this.app.workspace.getActiveFile());
	}

	onunload(): void {
		// Nothing persistent to tear down in the scaffold.
	}

	private async loadPluginData(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<PluginData> | null;
		const rawSettings = loaded?.settings ?? loaded ?? {};
		const settings = Object.assign({}, DEFAULT_SETTINGS, rawSettings);
		const rawCaches = (loaded?.caches ?? {}) as Record<string, unknown>;
		const caches: Record<string, NoteCache> = {};
		for (const [path, value] of Object.entries(rawCaches)) {
			const cache = loadCache(value);
			if (cache) caches[path] = cache;
		}
		const hidden = loadHiddenMap(loaded?.hidden);
		this.data = { settings, caches, hidden };
		this.settings = this.data.settings;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.data);
		if (!this.studyMode) {
			void this.updateStatusForFile(this.app.workspace.getActiveFile());
		}
	}

	/** Sets the idle status pill based on the active note's cache (ready/stale/setup). */
	private async updateStatusForFile(file: TFile | null): Promise<void> {
		if (this.studyMode) return;
		if (!this.isConfigured()) {
			this.setStatus("setup");
			return;
		}
		if (!file) {
			this.setStatus("ready");
			return;
		}
		if (this.visibility.isHidden(file.path)) {
			this.setStatus("hidden");
			return;
		}
		const cache = this.cacheStore.get(file.path);
		if (!cache) {
			this.setStatus("ready");
			return;
		}
		const markdown = await this.app.vault.cachedRead(file);
		this.setStatus(isStale(cache, parseSections(markdown)) ? "stale" : "ready");
	}

	/** Refresh both the status pill and the rendered cues for a note. */
	private onActiveFile(file: TFile | null): void {
		void this.updateStatusForFile(file);
		if (file) this.renderCues(file);
	}

	/** Push the active note's cached cues into its CodeMirror editor (or clear them). */
	private renderCues(file: TFile): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.file?.path !== file.path) return;
		const cm = (view.editor as unknown as { cm?: EditorView }).cm;
		if (!cm) return;

		const cache = this.cacheStore.get(file.path);
		const cues =
			cache && !this.visibility.isHidden(file.path)
				? buildCueLineData(cache, parseSections(view.editor.getValue()))
				: [];
		cm.dispatch({ effects: setCuesEffect.of(cues) });
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
		this.statusBarEl.style.cursor =
			pillAction(status) === "none" ? "default" : "pointer";
	}

	/** Open Settings on the CueCraft tab. */
	private openSettings(): void {
		// @ts-expect-error - setting is available on the desktop app.
		this.app.setting?.open?.();
		// @ts-expect-error - openTabById is available on the desktop app.
		this.app.setting?.openTabById?.(this.manifest.id);
	}

	private onRibbonClick(): void {
		if (!this.isConfigured()) {
			new Notice("CueCraft: choose your AI provider in Settings to get started.");
			this.openSettings();
			return;
		}
		this.generateCues();
	}

	/** Status-pill click: open settings when unconfigured, else toggle visibility. */
	private onPillClick(): void {
		const status = this.statusBarEl?.dataset.status ?? "";
		const action = pillAction(status);
		if (action === "open-settings") {
			this.openSettings();
			return;
		}
		if (action === "none") return;
		const file = this.app.workspace.getActiveFile();
		if (!file) return;
		void this.setNoteVisibility(this.visibility.isHidden(file.path), file);
	}

	/** Add the enable/hide toggle to a file or editor context menu. */
	private addVisibilityMenuItem(menu: Menu, file: TFile): void {
		const hidden = this.visibility.isHidden(file.path);
		menu.addItem((item) =>
			item
				.setTitle(visibilityMenuLabel(hidden))
				.setIcon(RIBBON_ICON)
				.onClick(() => void this.setNoteVisibility(hidden, file))
		);
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
			callback: () => this.setNoteVisibility(true),
		});
		this.addCommand({
			id: "hide-for-note",
			name: "Hide for This Note",
			callback: () => this.setNoteVisibility(false),
		});
		this.addCommand({
			id: "clear-cues",
			name: "Clear Generated Cues",
			callback: () => this.clearCues(),
		});
	}

	/** Wraps Obsidian's requestUrl as the provider HTTP client (avoids CORS). */
	private makeHttpClient(): HttpClient {
		return async (req) => {
			const res = await requestUrl({
				url: req.url,
				method: req.method,
				body: req.body,
				headers: req.headers,
				throw: false,
			});
			let json: unknown = null;
			try {
				json = res.json;
			} catch {
				json = null;
			}
			return { status: res.status, text: res.text, json };
		};
	}

	private async generateCues(): Promise<void> {
		// A second invocation while running acts as cancel (AC C3.2).
		if (this.currentRun) {
			this.currentRun.abort();
			new Notice("CueCraft: cancelling generation…");
			return;
		}
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("CueCraft: open a note first.");
			return;
		}
		if (!this.isConfigured()) {
			new Notice("CueCraft: set your Ollama host and model in Settings first.");
			return;
		}

		const markdown = await this.app.vault.cachedRead(file);
		const provider = new OllamaProvider({
			host: this.settings.ollamaHost,
			model: this.settings.ollamaModel,
			http: this.makeHttpClient(),
		});

		const controller = new AbortController();
		this.currentRun = controller;
		this.setStatus("generating", { done: 0, total: 0 });

		try {
			const result = await generateNote({
				noteTitle: file.basename,
				markdown,
				provider,
				preset: this.settings.cuePreset,
				useWholeNoteContext: true,
				signal: controller.signal,
				onProgress: (done, total) =>
					this.setStatus("generating", { done, total }),
			});

			const cache = buildNoteCache({
				result,
				provider: provider.id,
				model: this.settings.ollamaModel,
				preset: this.settings.cuePreset,
				generationMode: "whole-note-context",
				noteModifiedAt: file.stat.mtime,
			});
			await this.cacheStore.set(file.path, cache);
			// Generating for a note implies you want to see its cues.
			await this.visibility.show(file.path);

			const ok = result.sections.filter((s) => !s.error).length;
			const failed = result.sections.length - ok;
			if (result.canceled) {
				new Notice(`CueCraft: cancelled — kept ${ok} section(s).`);
			} else {
				new Notice(
					`CueCraft: generated ${ok} cue(s)` +
						(failed ? `, ${failed} failed` : "") +
						(result.summary ? " + summary." : ".")
				);
			}
			// Rendering/caching of `result` lands with the cue-extension + cache modules.
			console.debug("CueCraft generation result", result);
		} catch (e) {
			console.error("CueCraft generation failed", e);
			new Notice("CueCraft: generation failed. See console for details.");
		} finally {
			this.currentRun = null;
			await this.updateStatusForFile(this.app.workspace.getActiveFile());
			this.renderCues(file);
		}
	}

	private async clearCues(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("CueCraft: open a note first.");
			return;
		}
		if (!this.cacheStore.has(file.path)) {
			new Notice("CueCraft: no generated cues to clear for this note.");
			return;
		}
		await this.cacheStore.delete(file.path);
		new Notice("CueCraft: cleared generated cues for this note.");
		await this.updateStatusForFile(file);
		this.renderCues(file);
	}

	/**
	 * Enable (show) or hide the cue layer for a note (epic G). Defaults to the
	 * active note; a `target` lets context menus act on a non-active note.
	 */
	private async setNoteVisibility(visible: boolean, target?: TFile): Promise<void> {
		const file = target ?? this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("CueCraft: open a note first.");
			return;
		}
		if (visible) {
			await this.visibility.show(file.path);
			new Notice("CueCraft: cues enabled for this note.");
		} else {
			await this.visibility.hide(file.path);
			new Notice("CueCraft: cues hidden for this note.");
		}
		const active = this.app.workspace.getActiveFile();
		await this.updateStatusForFile(active);
		if (active) this.renderCues(active);
	}

	private toggleStudyMode(): void {
		this.studyMode = !this.studyMode;
		document.body.toggleClass("cuecraft-study-active", this.studyMode);
		if (this.studyMode) {
			this.setStatus("study");
		} else {
			void this.updateStatusForFile(this.app.workspace.getActiveFile());
		}
		new Notice(`CueCraft: Study Mode ${this.studyMode ? "on" : "off"}.`);
	}
}
