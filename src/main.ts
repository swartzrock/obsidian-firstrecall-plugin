import {
	FuzzySuggestModal,
	MarkdownView,
	Menu,
	Notice,
	Plugin,
	TFile,
	requestUrl,
	type MarkdownFileInfo,
	type MarkdownPostProcessorContext,
} from "obsidian";
import type { EditorView } from "@codemirror/view";
import {
	CueCraftSettings,
	CueCraftSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";
import { generateNote, generateSectionCue, type SectionResult } from "./generator";
import { OllamaProvider } from "./providers/ollama-provider";
import { AnthropicProvider } from "./providers/anthropic-provider";
import { OpenAIProvider } from "./providers/openai-provider";
import { GoogleProvider } from "./providers/google-provider";
import { XaiProvider } from "./providers/xai-provider";
import type { AiProvider, HttpClient } from "./providers/types";
import { parseSections, type Section } from "./parser";
import {
	CacheStore,
	buildNoteCache,
	hasUsableCues,
	isStale,
	loadCache,
	replaceSection,
	staleSectionIds,
	type CachedSection,
	type NoteCache,
} from "./cache";
import {
	buildCueLineData,
	cueEditorExtension,
	setCuesEffect,
	type CueLineData,
} from "./cue-extension";
import { buildReadingCueMap } from "./reading-cues";
import {
	VisibilityStore,
	loadHiddenMap,
	pillAction,
	visibilityMenuLabel,
} from "./visibility";
import {
	EDITOR_CUE_PLACEMENTS,
	editorCuePlacementClass,
} from "./editor-layout";
import { buildCornellModel, type CornellModel } from "./cornell";
import { CornellView, VIEW_TYPE_CORNELL } from "./cornell-view";

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
	private ribbonEl: HTMLElement | null = null;
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

		this.registerView(
			VIEW_TYPE_CORNELL,
			(leaf) => new CornellView(leaf, this)
		);

		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("cuecraft-status");
		this.statusBarEl.addEventListener("click", () => this.onPillClick());

		this.ribbonEl = this.addRibbonIcon(RIBBON_ICON, "CueCraft", () =>
			this.onRibbonClick()
		);
		this.updateRibbonLabel();
		this.registerCommands();
		this.registerEditorExtension(cueEditorExtension);
		this.applyEditorCuePlacement();
		this.registerMarkdownPostProcessor((el, ctx) =>
			this.renderReadingCues(el, ctx)
		);

		this.registerEvent(
			this.app.workspace.on("file-open", (file) => this.onActiveFile(file))
		);
		// `file-open` does not fire for a note that Obsidian restores into the
		// active leaf on startup, and switching back to an already-open tab only
		// fires `active-leaf-change`. Without this, a restored editor shows no
		// cues until the user opens a *different* note.
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () =>
				this.onActiveFile(this.app.workspace.getActiveFile())
			)
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
		// Defer the first render until the workspace is restored: during onload
		// the restored editor's CodeMirror instance isn't ready yet, so an early
		// renderCues would no-op and the cues would never appear on startup.
		this.app.workspace.onLayoutReady(() =>
			this.onActiveFile(this.app.workspace.getActiveFile())
		);
	}

	onunload(): void {
		for (const p of EDITOR_CUE_PLACEMENTS)
			document.body.removeClass(editorCuePlacementClass(p.id));
	}

	/**
	 * Reflect the editor cue-placement setting as a body class so `styles.css`
	 * can shift the inline editor cue layer (under-heading vs. left rail). The
	 * cue widgets themselves are unchanged; only their layout differs.
	 */
	applyEditorCuePlacement(): void {
		for (const p of EDITOR_CUE_PLACEMENTS)
			document.body.removeClass(editorCuePlacementClass(p.id));
		document.body.addClass(
			editorCuePlacementClass(this.settings.editorCuePlacement)
		);
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
		this.updateRibbonLabel();
		if (!this.studyMode) {
			void this.updateStatusForFile(this.app.workspace.getActiveFile());
		}
	}

	/** Keep the ribbon tooltip describing what a click will do. */
	private updateRibbonLabel(): void {
		if (!this.ribbonEl) return;
		const label = this.isConfigured()
			? "CueCraft: Generate cues for this note"
			: "CueCraft: Set up \u2014 open settings";
		this.ribbonEl.setAttribute("aria-label", label);
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

	/** True once the selected provider has its required fields set. */
	private isConfigured(): boolean {
		const s = this.settings;
		switch (s.provider) {
			case "anthropic":
				return Boolean(s.anthropicApiKey && s.anthropicModel);
			case "openai":
				return Boolean(s.openaiApiKey && s.openaiModel);
			case "google":
				return Boolean(s.googleApiKey && s.googleModel);
			case "xai":
				return Boolean(s.xaiApiKey && s.xaiModel);
			default:
				return Boolean(s.ollamaHost && s.ollamaModel);
		}
	}

	/** Public view of {@link isConfigured} for the settings tab. */
	isProviderConfigured(): boolean {
		return this.isConfigured();
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
			id: "regenerate-section",
			name: "Regenerate Section\u2026",
			callback: () => this.pickAndRegenerateSection(),
		});
		this.addCommand({
			id: "regenerate-stale-sections",
			name: "Regenerate Stale Sections",
			callback: () => void this.regenerateStaleSections(),
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
		this.addCommand({
			id: "open-cornell-view",
			name: "Open Cornell View",
			callback: () => void this.activateCornellView(),
		});
	}

	/** Open (or focus) the Cornell view in a main-area tab. */
	private async activateCornellView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_CORNELL)[0];
		if (existing) {
			workspace.revealLeaf(existing);
			return;
		}
		const leaf = workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE_CORNELL, active: true });
		workspace.revealLeaf(leaf);
	}

	/** Build the Cornell layout model for a note, or null when it has no cache. */
	async buildCornellFor(
		file: TFile
	): Promise<{ title: string; model: CornellModel } | null> {
		const cache = this.cacheStore.get(file.path);
		if (!cache) return null;
		const markdown = await this.app.vault.cachedRead(file);
		return {
			title: file.basename,
			model: buildCornellModel(cache, parseSections(markdown)),
		};
	}

	/** Whether a note has generated cues cached. */
	hasCueCache(path: string): boolean {
		return this.cacheStore.has(path);
	}

	/** Whether a note has at least one usable (non-errored) cached cue. */
	hasUsableCueCache(path: string): boolean {
		const cache = this.cacheStore.get(path);
		return cache ? hasUsableCues(cache) : false;
	}

	/**
	 * Reading-mode (preview) post-processor: insert cached cues beneath their
	 * headings. Obsidian calls this per rendered block, so we memoize the
	 * resolved line->cue map for the current (path, source-text) to avoid
	 * re-parsing for every heading element.
	 */
	private readingCueMemo: {
		path: string;
		text: string;
		map: Map<number, CueLineData>;
	} | null = null;

	private renderReadingCues(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	): void {
		const path = ctx.sourcePath;
		if (!path) return;
		const cache = this.cacheStore.get(path);
		if (!cache || this.visibility.isHidden(path)) return;

		const headings = Array.from(
			el.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")
		);
		for (const heading of headings) {
			const info = ctx.getSectionInfo(heading);
			if (!info) continue;
			const map = this.readingMapFor(path, info.text, cache);
			const cue = map.get(info.lineStart + 1);
			if (!cue) continue;
			// Guard against the post-processor running twice over the same node.
			const next = heading.nextElementSibling;
			if (next && next.hasClass("cuecraft-cue")) continue;
			heading.insertAdjacentElement(
				"afterend",
				this.buildReadingCueEl(cue)
			);
		}
	}

	private readingMapFor(
		path: string,
		text: string,
		cache: NoteCache
	): Map<number, CueLineData> {
		if (
			this.readingCueMemo &&
			this.readingCueMemo.path === path &&
			this.readingCueMemo.text === text
		) {
			return this.readingCueMemo.map;
		}
		const map = buildReadingCueMap(cache, text);
		this.readingCueMemo = { path, text, map };
		return map;
	}

	/** Build the reading-view cue element (mirrors the editor cue widget DOM). */
	private buildReadingCueEl(cue: CueLineData): HTMLElement {
		const root = createDiv({ cls: "cuecraft-cue cuecraft-cue-reading" });
		if (cue.error) {
			root.addClass("cuecraft-cue-error");
			root.setAttr("title", cue.error);
			root.createDiv({
				cls: "cuecraft-cue-question",
				text: "\u26a0 Generation failed \u2014 regenerate",
			});
			return root;
		}
		if (cue.confidence) root.dataset.confidence = cue.confidence;
		root.createDiv({ cls: "cuecraft-cue-question", text: cue.question });
		if (cue.keywords.length) {
			root.createDiv({
				cls: "cuecraft-cue-keywords",
				text: cue.keywords.join(" \u00b7 "),
			});
		}
		return root;
	}

	/** Re-render any open Cornell views (e.g. after generate/clear/style change). */
	refreshCornellViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CORNELL)) {
			const view = leaf.view;
			if (view instanceof CornellView) void view.render();
		}
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

	/**
	 * Wraps Obsidian's requestUrl as a Web `fetch` so AI SDK providers route
	 * through it (avoids CORS in Electron; no proxy needed).
	 */
	private makeFetch(): typeof fetch {
		return (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: input.url;
			const headers: Record<string, string> = {};
			new Headers(init?.headers).forEach((value, key) => {
				headers[key] = value;
			});
			const res = await requestUrl({
				url,
				method: init?.method ?? "GET",
				body: (init?.body as string | ArrayBuffer | undefined) ?? undefined,
				headers,
				throw: false,
			});
			return new Response(res.arrayBuffer, {
				status: res.status,
				headers: res.headers,
			});
		}) as typeof fetch;
	}

	/** Build the provider for the current settings. Public so Settings can test it. */
	makeProvider(): AiProvider {
		const s = this.settings;
		const fetchImpl = this.makeFetch();
		switch (s.provider) {
			case "anthropic":
				return new AnthropicProvider({
					apiKey: s.anthropicApiKey,
					model: s.anthropicModel,
					fetchImpl,
				});
			case "openai":
				return new OpenAIProvider({
					apiKey: s.openaiApiKey,
					model: s.openaiModel,
					fetchImpl,
				});
			case "google":
				return new GoogleProvider({
					apiKey: s.googleApiKey,
					model: s.googleModel,
					fetchImpl,
				});
			case "xai":
				return new XaiProvider({
					apiKey: s.xaiApiKey,
					model: s.xaiModel,
					fetchImpl,
				});
			default:
				return new OllamaProvider({
					host: s.ollamaHost,
					model: s.ollamaModel,
					http: this.makeHttpClient(),
				});
		}
	}

	/** Open a fuzzy picker listing the active note's sections, then regen. */
	private pickAndRegenerateSection(): void {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("CueCraft: open a note first.");
			return;
		}
		if (!this.isConfigured()) {
			new Notice("CueCraft: set up your AI provider in Settings first.");
			return;
		}
		if (!this.cacheStore.has(file.path)) {
			new Notice("CueCraft: generate cues for this note first.");
			return;
		}
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		const sections = parseSections(view.editor.getValue()).filter((s) => s.heading);
		if (!sections.length) {
			new Notice("CueCraft: no headed sections found.");
			return;
		}
		new SectionSuggestModal(this.app, sections, this.cacheStore.get(file.path), (s) => {
			new ToneSuggestModal(this.app, (tone) =>
				void this.regenerateSection(file, s.id, tone)
			).open();
		}).open();
	}

	/**
	 * Regenerate the cue for a single section (by id) and merge it back into the
	 * cache. Public so the Cornell view can call it directly from per-cue buttons.
	 * When `toneOverride` is supplied it replaces the global cue preset for this
	 * single regeneration, so users can ask for a different question style without
	 * changing their default setting.
	 */
	async regenerateSection(file: TFile, sectionId: string, toneOverride?: string): Promise<void> {
		if (this.currentRun) {
			new Notice("CueCraft: generation already in progress.");
			return;
		}
		if (!this.isConfigured()) {
			new Notice("CueCraft: set up your AI provider in Settings first.");
			return;
		}
		const cache = this.cacheStore.get(file.path);
		if (!cache) {
			new Notice("CueCraft: no cache for this note \u2014 run Generate first.");
			return;
		}
		const markdown = await this.app.vault.cachedRead(file);
		const section = parseSections(markdown).find((s) => s.id === sectionId);
		if (!section) {
			new Notice("CueCraft: section no longer exists in the note.");
			return;
		}

		const provider = this.makeProvider();

		const controller = new AbortController();
		this.currentRun = controller;
		this.setStatus("generating", { done: 0, total: 1 });

		try {
			const result = await generateSectionCue({
				section,
				provider,
				preset: toneOverride ?? this.settings.cuePreset,
				noteContext: markdown,
				signal: controller.signal,
			});

			const updated = replaceSection(cache, toCachedSection(result));
			await this.cacheStore.set(file.path, updated);
			await this.visibility.show(file.path);

			if (result.error) {
				new Notice(`CueCraft: regeneration failed \u2014 ${result.error}`);
			} else {
				new Notice(`CueCraft: regenerated cue for "${section.heading}".`);
			}
		} catch (e) {
			console.error("CueCraft section regen failed", e);
			new Notice("CueCraft: section regeneration failed. See console.");
		} finally {
			this.currentRun = null;
			await this.updateStatusForFile(this.app.workspace.getActiveFile());
			this.renderCues(file);
			this.refreshCornellViews();
		}
	}

	/**
	 * Regenerate only the sections that have gone stale (edited since last
	 * generation) or previously errored. Defaults to the active note. Public so
	 * the Cornell view toolbar can trigger it.
	 */
	async regenerateStaleSections(target?: TFile): Promise<void> {
		const file = target ?? this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("CueCraft: open a note first.");
			return;
		}
		if (this.currentRun) {
			new Notice("CueCraft: generation already in progress.");
			return;
		}
		if (!this.isConfigured()) {
			new Notice("CueCraft: set up your AI provider in Settings first.");
			return;
		}
		const cache = this.cacheStore.get(file.path);
		if (!cache) {
			new Notice("CueCraft: no cache for this note \u2014 run Generate first.");
			return;
		}
		const markdown = await this.app.vault.cachedRead(file);
		const sections = parseSections(markdown);
		const staleIds = staleSectionIds(cache, sections);
		if (!staleIds.length) {
			new Notice("CueCraft: no stale sections \u2014 everything is up to date.");
			return;
		}

		const provider = this.makeProvider();
		const byId = new Map(sections.map((s) => [s.id, s]));

		const controller = new AbortController();
		this.currentRun = controller;

		let working = cache;
		let done = 0;
		let failed = 0;
		try {
			for (const id of staleIds) {
				if (controller.signal.aborted) break;
				const section = byId.get(id);
				if (!section) continue;
				this.setStatus("generating", { done, total: staleIds.length });
				const result = await generateSectionCue({
					section,
					provider,
					preset: this.settings.cuePreset,
					noteContext: markdown,
					signal: controller.signal,
				});
				working = replaceSection(working, toCachedSection(result));
				await this.cacheStore.set(file.path, working);
				if (result.error) failed++;
				done++;
			}
			await this.visibility.show(file.path);
			const ok = done - failed;
			new Notice(
				`CueCraft: refreshed ${ok} stale section${ok === 1 ? "" : "s"}` +
					(failed ? `, ${failed} failed` : "") +
					"."
			);
		} catch (e) {
			console.error("CueCraft stale refresh failed", e);
			new Notice("CueCraft: stale refresh failed. See console.");
		} finally {
			this.currentRun = null;
			await this.updateStatusForFile(this.app.workspace.getActiveFile());
			this.renderCues(file);
			this.refreshCornellViews();
		}
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
			new Notice("CueCraft: set up your AI provider in Settings first.");
			return;
		}

		const markdown = await this.app.vault.cachedRead(file);
		const provider = this.makeProvider();

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
			this.refreshCornellViews();
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
		this.refreshCornellViews();
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

/** Map a generation result into the cache's persisted section shape. */
function toCachedSection(result: SectionResult): CachedSection {
	return {
		id: result.id,
		heading: result.heading,
		level: result.level,
		lineNumber: result.lineNumber,
		contentHash: result.contentHash,
		keywords: result.keywords,
		question: result.question,
		confidence: result.confidence,
		error: result.error,
	};
}

/** Tone variant options shown when regenerating a single section's cue. */
export const TONE_OPTIONS: Array<{ id: string; label: string }> = [
	{ id: "conceptual", label: "More conceptual" },
	{ id: "exam-prep", label: "Exam prep" },
	{ id: "simpler", label: "Simpler" },
	{ id: "vocabulary", label: "Vocabulary" },
];

/** Fuzzy picker that presents the four tone variants for per-section regeneration. */
class ToneSuggestModal extends FuzzySuggestModal<{ id: string; label: string }> {
	constructor(
		app: InstanceType<typeof Plugin>["app"],
		private readonly onChoose: (toneId: string) => void
	) {
		super(app);
		this.setPlaceholder("Choose a tone for this cue…");
	}

	getItems(): Array<{ id: string; label: string }> {
		return TONE_OPTIONS;
	}

	getItemText(item: { id: string; label: string }): string {
		return item.label;
	}

	onChooseItem(item: { id: string; label: string }): void {
		this.onChoose(item.id);
	}
}

/**
 * Fuzzy picker that lists the active note's sections. Each item shows the
 * heading + the current cached question (if any) for context.
 */
class SectionSuggestModal extends FuzzySuggestModal<Section> {
	constructor(
		app: InstanceType<typeof Plugin>["app"],
		private readonly sections: Section[],
		private readonly cache: NoteCache | null,
		private readonly onChoose: (section: Section) => void
	) {
		super(app);
		this.setPlaceholder("Pick a section to regenerate\u2026");
	}

	getItems(): Section[] {
		return this.sections;
	}

	getItemText(item: Section): string {
		const cached = this.cache?.sections.find((s) => s.id === item.id);
		const q = cached?.question ? ` \u2014 ${cached.question}` : "";
		return `${item.heading}${q}`;
	}

	onChooseItem(item: Section): void {
		this.onChoose(item);
	}
}
