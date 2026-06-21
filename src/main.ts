import {
	FuzzySuggestModal,
	MarkdownView,
	Menu,
	Modal,
	Notice,
	Plugin,
	Setting,
	TFile,
	requestUrl,
	setIcon,
	type App,
	type MarkdownFileInfo,
	type MarkdownPostProcessorContext,
} from "obsidian";
import type { EditorView } from "@codemirror/view";
import {
	CueCraftSettings,
	CueCraftSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";
import {
	normalizeAnthropicModelSelection,
} from "./anthropic-models";
import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";
import { generateNote, generateSectionCue, type SectionResult } from "./generator";
import { OllamaProvider } from "./providers/ollama-provider";
import { AnthropicProvider } from "./providers/anthropic-provider";
import { OpenAIProvider } from "./providers/openai-provider";
import { GoogleProvider } from "./providers/google-provider";
import { XaiProvider } from "./providers/xai-provider";
import { OpenRouterProvider } from "./providers/openrouter-provider";
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
import {
	buildReadingCueMap,
	isReadingModeDisplay,
	readingModeDisplayState,
} from "./reading-cues";
import {
	selectExportableCues,
	cuesToMarkdown,
	cuesToAnki,
} from "./export";
import {
	VisibilityStore,
	loadHiddenMap,
	pillAction,
	visibilityMenuLabel,
} from "./visibility";
import {
	buildCornellModel,
	type CornellModel,
} from "./cornell";
import { CornellView, VIEW_TYPE_CORNELL } from "./cornell-view";
import type { CueGenerationOptions } from "./cue-generation";
import {
	isDescendantPath,
	loadStudyAreas,
	normalizeVaultPath,
	planStudyAreaGeneration,
	summarizeStudyAreaRun,
	type StudyArea,
	type StudyAreaGenerationPlan,
	type StudyAreaPlanMode,
	type StudyAreaQueueItem,
	type StudyAreaRunSummary,
} from "./study-area";

/** Status-bar states from the v1.0 scope. `generating` carries N/M progress. */
type CueStatus = "setup" | "ready" | "generating" | "stale" | "study" | "hidden";

interface PluginData {
	settings: CueCraftSettings;
	caches: Record<string, NoteCache>;
	hidden: Record<string, true>;
}

const RIBBON_ICON = "graduation-cap";
const CORNELL_RIBBON_ICON = "columns-2";

export default class CueCraftPlugin extends Plugin {
	settings: CueCraftSettings = DEFAULT_SETTINGS;

	private statusBarEl: HTMLElement | null = null;
	private ribbonEl: HTMLElement | null = null;
	private cornellRibbonEl: HTMLElement | null = null;
	private studyMode = false;
	private currentRun: AbortController | null = null;
	private autoGenerateTimers = new Map<string, number>();
	private cueSettingsChanged = false;
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
		this.cornellRibbonEl = this.addRibbonIcon(
			CORNELL_RIBBON_ICON,
			"CueCraft: Open Cornell view",
			() => void this.openActiveNoteInCornellView()
		);
		this.updateRibbonLabel();
		this.registerCommands();
		this.registerEditorExtension(cueEditorExtension);
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
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile) this.scheduleAutoGenerate(file);
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
		for (const timer of this.autoGenerateTimers.values()) {
			window.clearTimeout(timer);
		}
		this.autoGenerateTimers.clear();
		this.currentRun?.abort();
	}

	private async loadPluginData(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<PluginData> | null;
		const rawSettings = loaded?.settings ?? loaded ?? {};
		const settings = Object.assign({}, DEFAULT_SETTINGS, rawSettings);
		settings.studyAreas = loadStudyAreas(
			(settings as { studyAreas?: unknown }).studyAreas
		);
		settings.studyAreaAutomationEnabled =
			typeof (settings as { studyAreaAutomationEnabled?: unknown })
				.studyAreaAutomationEnabled === "boolean"
				? settings.studyAreaAutomationEnabled
				: DEFAULT_SETTINGS.studyAreaAutomationEnabled;
		if (!isReadingModeDisplay((settings as { readingModeDisplay?: unknown }).readingModeDisplay)) {
			settings.readingModeDisplay = DEFAULT_SETTINGS.readingModeDisplay;
		}
		const legacyAvailableModelIds = (settings as unknown as {
			anthropicAvailableModelIds?: string[];
		}).anthropicAvailableModelIds;
		const hasAvailableModels = Boolean(
			(settings as { anthropicAvailableModels?: ModelInfo[] }).anthropicAvailableModels
		);
		if (Array.isArray(legacyAvailableModelIds) && !hasAvailableModels) {
			(settings as { anthropicAvailableModels?: ModelInfo[] }).anthropicAvailableModels =
				legacyAvailableModelIds.map((id) => ({
					id,
					display_name: id,
					type: "model",
					created_at: new Date(0).toISOString(),
					max_input_tokens: null,
					max_tokens: null,
					capabilities: null,
				} as ModelInfo));
		}
		if (
			!("anthropicHasFetchedModels" in settings) &&
			Array.isArray(
				(settings as { anthropicAvailableModels?: ModelInfo[] }).anthropicAvailableModels
			)
		) {
			(settings as { anthropicHasFetchedModels?: boolean }).anthropicHasFetchedModels =
				((settings as { anthropicAvailableModels?: ModelInfo[] }).anthropicAvailableModels
					?.length ?? 0) > 0;
		}
		normalizeAnthropicModelSelection(settings as {
			anthropicModel: string;
			anthropicModelSelection?: string;
			anthropicAvailableModels?: ModelInfo[];
		});
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
		const generateLabel = this.isConfigured()
			? "CueCraft: Generate cues for this note"
			: "CueCraft: Set up \u2014 open settings";
		this.ribbonEl?.setAttribute("aria-label", generateLabel);
		this.cornellRibbonEl?.setAttribute(
			"aria-label",
			"CueCraft: Open active note in Cornell view"
		);
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
				? buildCueLineData(cache, parseSections(view.editor.getValue()), {
						showKeywords: this.settings.generateKeywords,
					})
				: [];
		cm.dispatch({ effects: setCuesEffect.of(cues) });
	}

	/** Force the active Reading view to rerender its post-processed cue surface. */
	refreshReadingModeSurface(): void {
		this.readingCueMemo = null;
		const active = this.app.workspace.getActiveFile();
		if (active) this.refreshActiveReadingView(active);
	}

	private refreshActiveReadingView(file: TFile): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.file?.path !== file.path) return;
		if (view.getMode() !== "preview") return;
		view.previewMode.rerender(true);
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
			case "openrouter":
				return Boolean(s.openrouterApiKey && s.openrouterModel);
			default:
				return Boolean(s.ollamaHost && s.ollamaModel);
		}
	}

	/** Public view of {@link isConfigured} for the settings tab. */
	isProviderConfigured(): boolean {
		return this.isConfigured();
	}

	private setStatus(
		status: CueStatus,
		progress?: { done: number; total: number; unit?: string }
	): void {
		if (!this.statusBarEl) return;
		const unit =
			progress?.unit ? ` ${progress.unit}${progress.total === 1 ? "" : "s"}` : "";
		const label =
			status === "generating" && progress
				? `CueCraft: generating ${progress.done}/${progress.total}${unit}`
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
		// "Review" is only meaningful once a note has usable cues to study.
		if (this.hasUsableCueCache(file.path)) {
			menu.addItem((item) =>
				item
					.setTitle("CueCraft: Review (Study Mode)")
					.setIcon(RIBBON_ICON)
					.onClick(() => void this.reviewThisNote(file))
			);
		}
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
			id: "run-study-area-backfill",
			name: "Run Study Area Backfill...",
			callback: () => this.pickStudyAreaAndRun("backfill"),
		});
		this.addCommand({
			id: "retry-study-area-failures",
			name: "Retry Study Area Failures...",
			callback: () => this.pickStudyAreaAndRun("retry-failed"),
		});
		this.addCommand({
			id: "manage-study-areas",
			name: "Manage Study Areas",
			callback: () => this.openStudyAreaManager(),
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
			name: "Open Active Note in Cornell View",
			callback: () => void this.openActiveNoteInCornellView(),
		});
		this.addCommand({
			id: "review-this-note",
			name: "Review This Note (Study Mode)",
			callback: () => void this.reviewThisNote(),
		});
		this.addCommand({
			id: "export-cues-markdown",
			name: "Export Cues to Markdown",
			callback: () => void this.exportCues("markdown"),
		});
		this.addCommand({
			id: "export-cues-anki",
			name: "Export Cues to Anki (TSV)",
			callback: () => void this.exportCues("anki"),
		});
	}

	/**
	 * Export the active note's usable cues to a sibling file: a Markdown study
	 * sheet or Anki-importable TSV. Never touches the source note.
	 */
	private async exportCues(format: "markdown" | "anki"): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("CueCraft: open a note to export its cues.");
			return;
		}
		const cache = this.cacheStore.get(file.path);
		const cues = cache ? selectExportableCues(cache) : [];
		if (cues.length === 0) {
			new Notice("CueCraft: no usable cues to export \u2014 generate first.");
			return;
		}
		const dir =
			file.parent && file.parent.path !== "/" ? `${file.parent.path}/` : "";
		const ext = format === "markdown" ? "md" : "txt";
		const tag = format === "markdown" ? "cues" : "cues.anki";
		const outPath = `${dir}${file.basename} (${tag}).${ext}`;
		const content =
			format === "markdown"
				? cuesToMarkdown(file.basename, cues)
				: cuesToAnki(cues);
		const existing = this.app.vault.getAbstractFileByPath(outPath);
		let out: TFile;
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
			out = existing;
		} else {
			out = await this.app.vault.create(outPath, content);
		}
		new Notice(`CueCraft: exported ${cues.length} cue(s) to ${outPath}`);
		if (format === "markdown") {
			await this.app.workspace.getLeaf(true).openFile(out);
		}
	}

	/** Open the current Markdown note in the dedicated Cornell view without entering Study Mode. */
	private async openActiveNoteInCornellView(target?: TFile): Promise<void> {
		const file = target ?? this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("CueCraft: open a note to view in Cornell.");
			return;
		}
		await this.app.workspace.getLeaf(false).openFile(file);
		const view = await this.activateCornellView();
		await view?.render();
	}

	/**
	 * "Review this note": ensure the note has usable cues and is visible, then
	 * open it in the Cornell view and enter that view's Study Mode (questions
	 * shown, keyword hints blurred for active recall). The Cornell view is the
	 * only surface where Study Mode is actually visible, so Review always lands
	 * the user somewhere studying can happen — not a silent global toggle.
	 */
	private async reviewThisNote(target?: TFile): Promise<void> {
		const file = target ?? this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("CueCraft: open a note to review.");
			return;
		}
		if (!this.hasUsableCueCache(file.path)) {
			new Notice(
				"CueCraft: no usable cues for this note \u2014 generate first."
			);
			return;
		}
		if (this.visibility.isHidden(file.path)) {
			await this.setNoteVisibility(true, file);
		}
		// Make the target the active note so the Cornell view resolves to it,
		// then open the Cornell view and switch it into Study Mode.
		await this.app.workspace.getLeaf(false).openFile(file);
		const view = await this.activateCornellView();
		await view?.enterStudyMode();
	}

	/** Open (or focus) the Cornell view in a main-area tab; returns the view. */
	private async activateCornellView(): Promise<CornellView | null> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_CORNELL)[0];
		if (existing) {
			workspace.revealLeaf(existing);
			return existing.view instanceof CornellView ? existing.view : null;
		}
		const leaf = workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE_CORNELL, active: true });
		workspace.revealLeaf(leaf);
		return leaf.view instanceof CornellView ? leaf.view : null;
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
		showKeywords: boolean;
		map: Map<number, CueLineData>;
	} | null = null;

	private renderReadingCues(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	): void {
		const path = ctx.sourcePath;
		if (!path) return;
		const cache = this.cacheStore.get(path);
		const isHidden = this.visibility.isHidden(path);
		if (!this.settings.renderInReadingMode || !cache || isHidden) return;
		const displayState = readingModeDisplayState({
			display: this.settings.readingModeDisplay,
			renderInReadingMode: this.settings.renderInReadingMode,
			hasCache: true,
			hasUsableCues: hasUsableCues(cache),
			isHidden,
		});
		if (
			!displayState.showInlineCues &&
			!displayState.showReviewButton
		) {
			return;
		}

		const headings = Array.from(
			el.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")
		);
		for (const heading of headings) {
			const info = ctx.getSectionInfo(heading);
			if (!info) continue;
			const map = this.readingMapFor(path, info.text, cache);
			if (displayState.showReviewButton) {
				this.maybeInsertReadingReviewEl(path, map, info, heading);
			}
			if (!displayState.showInlineCues) {
				continue;
			}
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
			this.readingCueMemo.text === text &&
			this.readingCueMemo.showKeywords === this.settings.generateKeywords
		) {
			return this.readingCueMemo.map;
		}
		const map = buildReadingCueMap(cache, text, {
			showKeywords: this.settings.generateKeywords,
		});
		this.readingCueMemo = {
			path,
			text,
			showKeywords: this.settings.generateKeywords,
			map,
		};
		return map;
	}

	private maybeInsertReadingReviewEl(
		path: string,
		map: Map<number, CueLineData>,
		info: ReturnType<MarkdownPostProcessorContext["getSectionInfo"]>,
		heading: HTMLElement
	): boolean {
		if (!info) return false;
		const firstCueLine = [...map.keys()].sort((a, b) => a - b)[0];
		if (firstCueLine !== info.lineStart + 1) return false;
		const previous = heading.previousElementSibling;
		if (previous && previous.hasClass("cuecraft-reading-review")) return false;
		const reviewEl = this.buildReadingReviewEl(path);
		heading.insertAdjacentElement("beforebegin", reviewEl);
		return true;
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

	private buildReadingReviewEl(path: string): HTMLElement {
		const root = createDiv({ cls: "cuecraft-reading-review" });
		const button = root.createEl("button", {
			cls: "cuecraft-reading-review-btn",
			attr: { type: "button" },
		});
		const iconEl = button.createSpan({ cls: "cuecraft-reading-review-icon" });
		setIcon(iconEl, "graduation-cap");
		button.createSpan({
			cls: "cuecraft-reading-review-label",
			text: "Review in Cornell",
		});
		const file = this.app.vault.getAbstractFileByPath(path);
		this.registerDomEvent(button, "click", () => {
			if (file instanceof TFile) {
				void this.reviewThisNote(file);
			} else {
				new Notice("CueCraft: open a note to review.");
			}
		});
		return root;
	}

	/** Re-render any open Cornell views (e.g. after generate/clear/style change). */
	refreshCornellViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CORNELL)) {
			const view = leaf.view;
			if (view instanceof CornellView) void view.render();
		}
	}

	/** Mark cue content settings dirty; the settings tab asks on close. */
	noteCueSettingsChanged(): void {
		this.cueSettingsChanged = true;
	}

	/** Ask whether to regenerate after the user leaves CueCraft settings. */
	promptForCueSettingsRegeneration(): void {
		if (!this.cueSettingsChanged) return;
		this.cueSettingsChanged = false;
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md" || !this.cacheStore.has(file.path)) {
			return;
		}
		new RegenerateSettingsModal(this.app, file.basename, () => {
			void this.generateCuesForFile(file, { automatic: true });
		}).open();
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
			case "openrouter":
				return new OpenRouterProvider({
					apiKey: s.openrouterApiKey,
					model: s.openrouterModel,
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

	private generationOptions(): CueGenerationOptions {
		const s = this.settings;
		return {
			cueDensity: s.cueDensity,
			questionStyle: s.questionStyle,
			generateKeywords: s.generateKeywords,
			autoSummary: s.autoSummary,
		};
	}

	private selectedModelName(): string {
		const s = this.settings;
		switch (s.provider) {
			case "anthropic":
				return s.anthropicModel;
			case "openai":
				return s.openaiModel;
			case "google":
				return s.googleModel;
			case "xai":
				return s.xaiModel;
			case "openrouter":
				return s.openrouterModel;
			default:
				return s.ollamaModel;
		}
	}

	private scheduleAutoGenerate(file: TFile): void {
		if (
			!this.settings.autoGenerateOnSave ||
			file.extension !== "md" ||
			this.visibility.isHidden(file.path)
		) {
			return;
		}
		const existing = this.autoGenerateTimers.get(file.path);
		if (existing) window.clearTimeout(existing);
		const timer = window.setTimeout(() => {
			this.autoGenerateTimers.delete(file.path);
			void this.generateCuesForFile(file, { automatic: true });
		}, 1200);
		this.autoGenerateTimers.set(file.path, timer);
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
				options: this.generationOptions(),
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
			const concurrency = this.settings.sectionConcurrency;
			for (let start = 0; start < staleIds.length; start += concurrency) {
				if (controller.signal.aborted) break;
				const batch = staleIds
					.slice(start, start + concurrency)
					.map((id) => byId.get(id))
					.filter((s): s is Section => Boolean(s));
				this.setStatus("generating", { done, total: staleIds.length });
				const results = await Promise.all(
					batch.map(async (section) => {
						const result = await generateSectionCue({
							section,
							provider,
							preset: this.settings.cuePreset,
							options: this.generationOptions(),
							noteContext: markdown,
							signal: controller.signal,
						});
						done++;
						this.setStatus("generating", { done, total: staleIds.length });
						return result;
					})
				);
				for (const result of results) {
					working = replaceSection(working, toCachedSection(result));
					if (result.error) failed++;
				}
				await this.cacheStore.set(file.path, working);
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
		await this.generateCuesForFile(this.app.workspace.getActiveFile());
	}

	private pickStudyAreaAndRun(mode: StudyAreaPlanMode): void {
		const areas = this.settings.studyAreas;
		if (!areas.length) {
			new Notice("CueCraft: create a study area in Settings first.");
			this.openSettings();
			return;
		}
		const run = (area: StudyArea): void => {
			void this.runStudyArea(area.id, mode);
		};
		if (areas.length === 1) {
			run(areas[0]);
			return;
		}
		new StudyAreaSuggestModal(this.app, areas, run).open();
	}

	async previewStudyArea(
		areaId: string,
		mode: StudyAreaPlanMode = "backfill"
	): Promise<StudyAreaGenerationPlan | null> {
		const area = this.findStudyArea(areaId);
		if (!area) return null;
		return this.buildStudyAreaPlan(area, mode);
	}

	openStudyAreaManager(areaId?: string): void {
		new StudyAreaManagementModal(this.app, this, areaId).open();
	}

	async createStudyArea(parentPath: string): Promise<StudyArea | null> {
		const normalized = normalizeVaultPath(parentPath);
		if (!normalized) {
			new Notice("CueCraft: enter a parent folder path first.");
			return null;
		}
		if (this.settings.studyAreas.some((area) => area.parentPath === normalized)) {
			new Notice("CueCraft: that study area already exists.");
			return null;
		}
		const area: StudyArea = {
			id: `study-area-${Date.now().toString(36)}`,
			name: normalized.split("/").slice(-1)[0] ?? normalized,
			parentPath: normalized,
			excludedPaths: [],
			maintenanceMode: "paused",
			createdAt: new Date().toISOString(),
		};
		this.settings.studyAreas = [...this.settings.studyAreas, area];
		await this.saveSettings();
		new Notice(`CueCraft: created study area "${area.name}".`);
		return area;
	}

	async updateStudyArea(updated: StudyArea): Promise<void> {
		this.settings.studyAreas = this.settings.studyAreas.map((area) =>
			area.id === updated.id ? updated : area
		);
		await this.saveSettings();
	}

	async removeStudyArea(areaId: string): Promise<void> {
		this.settings.studyAreas = this.settings.studyAreas.filter(
			(area) => area.id !== areaId
		);
		await this.saveSettings();
	}

	async runStudyArea(
		areaId: string,
		mode: StudyAreaPlanMode = "backfill"
	): Promise<StudyAreaRunSummary | null> {
		if (this.currentRun) {
			this.currentRun.abort();
			new Notice("CueCraft: cancelling generation...");
			return null;
		}
		if (!this.isConfigured()) {
			new Notice("CueCraft: set up your AI provider in Settings first.");
			return null;
		}
		const area = this.findStudyArea(areaId);
		if (!area) {
			new Notice("CueCraft: study area no longer exists.");
			return null;
		}
		const plan = await this.buildStudyAreaPlan(area, mode);
		if (!plan.items.length) {
			new Notice(
				mode === "retry-failed"
					? "CueCraft: no failed study-area work to retry."
					: "CueCraft: this study area is already ready."
			);
			return summarizeStudyAreaRun(plan, {});
		}

		const controller = new AbortController();
		this.currentRun = controller;
		const provider = this.makeProvider();
		const completed: string[] = [];
		const failed: string[] = [];
		const totalSections = plan.items.reduce(
			(total, item) => total + item.sectionCount,
			0
		);
		let completedSections = 0;
		const advanceSections = (count: number): void => {
			if (count <= 0) return;
			completedSections = Math.min(totalSections, completedSections + count);
			this.setStatus("generating", {
				done: completedSections,
				total: totalSections,
				unit: "section",
			});
		};
		this.setStatus("generating", {
			done: 0,
			total: totalSections,
			unit: "section",
		});
		let summary: StudyAreaRunSummary | null = null;

		try {
			for (const item of plan.items) {
				if (controller.signal.aborted) break;
				const file = this.app.vault.getAbstractFileByPath(item.path);
				if (!(file instanceof TFile)) {
					failed.push(item.path);
					advanceSections(item.sectionCount);
					continue;
				}
				let itemSectionsDone = 0;
				const result = await this.runStudyAreaQueueItem(
					file,
					item,
					provider,
					controller,
					(count) => {
						itemSectionsDone += count;
						advanceSections(count);
					}
				);
				if (result === "completed") completed.push(item.path);
				if (result === "failed") failed.push(item.path);
				if (result !== "canceled" && itemSectionsDone < item.sectionCount) {
					advanceSections(item.sectionCount - itemSectionsDone);
				}
			}
		} catch (e) {
			console.error("CueCraft study area run failed", e);
			new Notice("CueCraft: study area run failed. See console.");
		} finally {
			summary = summarizeStudyAreaRun(plan, {
				completedPaths: completed,
				failedPaths: failed,
				canceled: controller.signal.aborted,
			});
			this.currentRun = null;
			await this.updateStatusForFile(this.app.workspace.getActiveFile());
			this.refreshCornellViews();
			new Notice(this.studyAreaSummaryNotice(area, summary));
		}
		return summary;
	}

	private findStudyArea(areaId: string): StudyArea | null {
		return this.settings.studyAreas.find((area) => area.id === areaId) ?? null;
	}

	private async buildStudyAreaPlan(
		area: StudyArea,
		mode: StudyAreaPlanMode
	): Promise<StudyAreaGenerationPlan> {
		const files = this.app.vault
			.getMarkdownFiles()
			.filter((file) => isDescendantPath(file.path, area.parentPath));
		const snapshots = await Promise.all(
			files.map(async (file) => {
				const markdown = await this.app.vault.cachedRead(file);
				return {
					path: file.path,
					cache: this.cacheStore.get(file.path),
					currentSections: parseSections(markdown),
					hidden: this.visibility.isHidden(file.path),
				};
			})
		);
		return planStudyAreaGeneration(area, snapshots, mode);
	}

	private async runStudyAreaQueueItem(
		file: TFile,
		item: StudyAreaQueueItem,
		provider: AiProvider,
		controller: AbortController,
		onProgress?: (completedSections: number) => void
	): Promise<"completed" | "failed" | "canceled"> {
		const markdown = await this.app.vault.cachedRead(file);
		if (item.action === "generate-note") {
			let previousDone = 0;
			const result = await generateNote({
				noteTitle: file.basename,
				markdown,
				provider,
				preset: this.settings.cuePreset,
				options: this.generationOptions(),
				sectionConcurrency: this.settings.sectionConcurrency,
				useWholeNoteContext: true,
				signal: controller.signal,
				onProgress: (done) => {
					onProgress?.(done - previousDone);
					previousDone = done;
				},
			});
			if (result.sections.length) {
				await this.cacheStore.set(
					file.path,
					buildNoteCache({
						result,
						provider: provider.id,
						model: this.selectedModelName(),
						preset: this.settings.cuePreset,
						generationMode: "whole-note-context",
						noteModifiedAt: file.stat.mtime,
					})
				);
				await this.visibility.show(file.path);
				this.refreshGeneratedSurfaces(file);
			}
			if (result.canceled || controller.signal.aborted) return "canceled";
			return result.sections.some((section) => section.error)
				? "failed"
				: "completed";
		}

		const status = await this.regenerateQueuedSections(
			file,
			markdown,
			item.sectionIds,
			provider,
			controller,
			onProgress
		);
		if (status !== "canceled") this.refreshGeneratedSurfaces(file);
		return status;
	}

	private async regenerateQueuedSections(
		file: TFile,
		markdown: string,
		sectionIds: readonly string[],
		provider: AiProvider,
		controller: AbortController,
		onProgress?: (completedSections: number) => void
	): Promise<"completed" | "failed" | "canceled"> {
		const cache = this.cacheStore.get(file.path);
		if (!cache) return "failed";
		const sections = parseSections(markdown);
		const byId = new Map(sections.map((section) => [section.id, section]));
		let working = cache;
		let failed = 0;
		let completed = 0;
		const concurrency = this.settings.sectionConcurrency;
		for (let start = 0; start < sectionIds.length; start += concurrency) {
			if (controller.signal.aborted) break;
			const batch = sectionIds
				.slice(start, start + concurrency)
				.map((id) => byId.get(id))
				.filter((section): section is Section => Boolean(section));
			const results = await Promise.all(
				batch.map((section) =>
					generateSectionCue({
						section,
						provider,
						preset: this.settings.cuePreset,
						options: this.generationOptions(),
						noteContext: markdown,
						signal: controller.signal,
					})
				)
			);
			for (const result of results) {
				working = replaceSection(working, toCachedSection(result));
				if (result.error) failed++;
				else completed++;
				onProgress?.(1);
			}
			await this.cacheStore.set(file.path, working);
		}
		await this.visibility.show(file.path);
		if (controller.signal.aborted) return "canceled";
		return failed || completed < sectionIds.length ? "failed" : "completed";
	}

	private refreshGeneratedSurfaces(file: TFile): void {
		this.renderCues(file);
		this.refreshActiveReadingView(file);
	}

	private studyAreaSummaryNotice(
		area: StudyArea,
		summary: StudyAreaRunSummary
	): string {
		if (summary.canceled) {
			return `CueCraft: cancelled ${area.name} - kept ${summary.completed}, ${summary.remaining} remaining.`;
		}
		return `CueCraft: ${area.name} run complete - ${summary.completed} done, ${summary.failed} failed, ${summary.skipped} skipped.`;
	}

	private async generateCuesForFile(
		file: TFile | null,
		opts: { automatic?: boolean } = {}
	): Promise<void> {
		// A second invocation while running acts as cancel (AC C3.2).
		if (this.currentRun) {
			if (opts.automatic) return;
			this.currentRun.abort();
			new Notice("CueCraft: cancelling generation...");
			return;
		}
		if (!file) {
			if (!opts.automatic) new Notice("CueCraft: open a note first.");
			return;
		}
		if (!this.isConfigured()) {
			if (!opts.automatic) {
				new Notice("CueCraft: set up your AI provider in Settings first.");
			}
			return;
		}

		const markdown = await this.app.vault.cachedRead(file);
		const provider = this.makeProvider();

		const controller = new AbortController();
		this.currentRun = controller;
		this.setStatus("generating", { done: 0, total: 0 });

		const startTime = Date.now();
		try {
			const result = await generateNote({
				noteTitle: file.basename,
				markdown,
				provider,
				preset: this.settings.cuePreset,
				options: this.generationOptions(),
				sectionConcurrency: this.settings.sectionConcurrency,
				useWholeNoteContext: true,
				signal: controller.signal,
				onProgress: (done, total) =>
					this.setStatus("generating", { done, total }),
			});

			const cache = buildNoteCache({
				result,
				provider: provider.id,
				model: this.selectedModelName(),
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
				new Notice(`CueCraft: cancelled - kept ${ok} section(s).`);
			} else if (!opts.automatic) {
				new Notice(
					`CueCraft: generated ${ok} cue(s)` +
						(failed ? `, ${failed} failed` : "") +
						(result.summary ? " + summary." : ".")
				);
			} else if (failed) {
				new Notice(`CueCraft: auto-generation finished with ${failed} failed section(s).`);
			}
			// Rendering/caching of `result` lands with the cue-extension + cache modules.
			const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
			console.debug(`CueCraft generation result (${elapsed}s)`, result);
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
		if (active) {
			this.renderCues(active);
			this.refreshActiveReadingView(active);
		}
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
		rationale: result.rationale,
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

class RegenerateSettingsModal extends Modal {
	constructor(
		app: InstanceType<typeof Plugin>["app"],
		private readonly noteName: string,
		private readonly onConfirm: () => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Regenerate cues with new settings?" });
		contentEl.createEl("p", {
			text: `CueCraft settings that affect generated cue content changed. Regenerate cached cues for "${this.noteName}" now?`,
		});
		const actions = contentEl.createEl("div", {
			cls: "cuecraft-modal-actions",
		});
		const cancel = actions.createEl("button", { text: "Not now" });
		cancel.addEventListener("click", () => this.close());
		const regenerate = actions.createEl("button", {
			cls: "mod-cta",
			text: "Regenerate",
		});
		regenerate.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
	}

	onClose(): void {
		this.contentEl.empty();
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

class StudyAreaSuggestModal extends FuzzySuggestModal<StudyArea> {
	constructor(
		app: InstanceType<typeof Plugin>["app"],
		private readonly areas: StudyArea[],
		private readonly onChoose: (area: StudyArea) => void
	) {
		super(app);
		this.setPlaceholder("Pick a study area...");
	}

	getItems(): StudyArea[] {
		return this.areas;
	}

	getItemText(item: StudyArea): string {
		return `${item.name} - ${item.parentPath}`;
	}

	onChooseItem(item: StudyArea): void {
		this.onChoose(item);
	}
}

class StudyAreaManagementModal extends Modal {
	private selectedAreaId?: string;

	constructor(
		app: InstanceType<typeof Plugin>["app"],
		private readonly plugin: CueCraftPlugin,
		selectedAreaId?: string
	) {
		super(app);
		this.selectedAreaId = selectedAreaId;
	}

	onOpen(): void {
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("cuecraft-study-area-modal");
		contentEl.createEl("h2", { text: "Study Areas" });
		contentEl.createEl("p", {
			cls: "cuecraft-study-area-copy",
			text: "Preview broad generation before any provider calls, then run or retry work for managed folders.",
		});
		if (!this.plugin.settings.studyAreas.length) {
			contentEl.createEl("p", {
				cls: "cuecraft-study-area-empty",
				text: "No study areas yet. Add one from CueCraft settings.",
			});
			return;
		}
		const listEl = contentEl.createDiv({ cls: "cuecraft-study-area-list" });
		for (const area of this.sortedAreas()) {
			this.renderArea(listEl, area);
		}
	}

	private sortedAreas(): StudyArea[] {
		const areas = this.plugin.settings.studyAreas.slice();
		if (!this.selectedAreaId) return areas;
		return areas.sort((a, b) =>
			a.id === this.selectedAreaId ? -1 : b.id === this.selectedAreaId ? 1 : 0
		);
	}

	private renderArea(containerEl: HTMLElement, area: StudyArea): void {
		const cardEl = containerEl.createDiv({ cls: "cuecraft-study-area-card" });
		cardEl.createEl("h3", { text: area.name });
		cardEl.createDiv({
			cls: "cuecraft-study-area-path",
			text: area.parentPath,
		});
		const countsEl = cardEl.createDiv({
			cls: "cuecraft-study-area-counts",
			text: "Previewing notes...",
		});
		void this.plugin.previewStudyArea(area.id).then((plan) => {
			if (!plan) {
				countsEl.setText("Study area no longer exists.");
				return;
			}
			countsEl.setText(
				`${plan.counts.ready} ready · ${plan.counts.uncued} uncued · ${plan.counts.stale} stale · ${plan.counts.failed} failed · ${plan.counts.skipped} skipped`
			);
		});

		new Setting(cardEl)
			.setName("Maintenance")
			.setDesc("Keep background maintenance paused, or refresh edited notes on save.")
			.addDropdown((dd) =>
				dd
					.addOption("paused", "Paused")
					.addOption("maintain-on-save", "Maintain on save")
					.setValue(area.maintenanceMode)
					.onChange(async (value) => {
						await this.plugin.updateStudyArea({
							...area,
							maintenanceMode:
								value === "maintain-on-save" ? "maintain-on-save" : "paused",
						});
						this.render();
					})
			);

		const exclusionSetting = new Setting(cardEl)
			.setName("Exclude path")
			.setDesc("Add a note or subfolder under this study area to skip.");
		let exclusionPath = "";
		exclusionSetting
			.addText((text) =>
				text
					.setPlaceholder(`${area.parentPath}/Drafts`)
					.onChange((value) => {
						exclusionPath = value;
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Add")
					.onClick(async () => {
						const normalized = normalizeVaultPath(exclusionPath);
						if (!normalized) return;
						await this.plugin.updateStudyArea({
							...area,
							excludedPaths: Array.from(
								new Set([...area.excludedPaths, normalized])
							),
						});
						this.render();
					})
			);

		for (const excludedPath of area.excludedPaths) {
			new Setting(cardEl)
				.setName(excludedPath)
				.setDesc("Excluded from this study area.")
				.addButton((btn) =>
					btn
						.setButtonText("Remove")
						.onClick(async () => {
							await this.plugin.updateStudyArea({
								...area,
								excludedPaths: area.excludedPaths.filter(
									(path) => path !== excludedPath
								),
							});
							this.render();
						})
				);
		}

		const actionsEl = cardEl.createDiv({ cls: "cuecraft-modal-actions" });
		const backfillBtn = actionsEl.createEl("button", {
			text: "Run backfill",
			attr: { type: "button" },
		});
		backfillBtn.addClass("mod-cta");
		this.plugin.registerDomEvent(backfillBtn, "click", async () => {
			const plan = await this.plugin.previewStudyArea(area.id);
			const count = plan?.items.length ?? 0;
			new StudyAreaConfirmModal(this.app, {
				title: "Run study area backfill?",
				message: `Generate or refresh ${count} note(s) in ${area.name}?`,
				confirmText: "Run backfill",
				onConfirm: () => {
					void this.plugin.runStudyArea(area.id, "backfill");
					this.close();
				},
			}).open();
		});
		const retryBtn = actionsEl.createEl("button", {
			text: "Retry failed",
			attr: { type: "button" },
		});
		this.plugin.registerDomEvent(retryBtn, "click", () => {
			void this.plugin.runStudyArea(area.id, "retry-failed");
			this.close();
		});
		const removeBtn = actionsEl.createEl("button", {
			text: "Remove",
			attr: { type: "button" },
		});
		this.plugin.registerDomEvent(removeBtn, "click", async () => {
			new StudyAreaConfirmModal(this.app, {
				title: "Remove study area?",
				message: `Remove study area "${area.name}"? Generated cues stay cached.`,
				confirmText: "Remove",
				onConfirm: async () => {
					await this.plugin.removeStudyArea(area.id);
					this.render();
				},
			}).open();
		});
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
