import {
	FuzzySuggestModal,
	MarkdownView,
	Menu,
	Modal,
	Notice,
	Plugin,
	TFile,
	requestUrl,
	setIcon,
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
	DEFAULT_EDITOR_CUE_WIDTH_PRESET,
	normalizeEditorCueCustomWidthPx,
} from "./editor-cue-width";
import { EditorCueWidthPreviewScheduler } from "./editor-cue-width-preview";
import {
	normalizeAutoGenerationSettleDelaySeconds,
	scheduleAutoGenerationTimer,
} from "./auto-generation-delay";
import { type ByokHttpClient } from "@swartzrock/byok-runtime";
import { byokProviderDefinition } from "./byok-provider-metadata";
import {
	generateNote,
	generateNoteBriefForSections,
	generateSectionCue,
	type SectionResult,
} from "./generator";
import {
	cueCraftProviderCredential,
	cueCraftProviderCredentialSaved,
	cueCraftProviderModel,
	cueCraftSelectedProvider,
	clearCueCraftStoredCloudCredential,
	markCueCraftCloudCredentialSaved,
	migrateCueCraftCloudCredentials,
	normalizeCueCraftProviderSettings,
	listCueCraftProviderModelsFromStore,
	makeCueCraftByokProviderFromStore,
	type CueCraftByokRuntime,
	type CueCraftFetchedModelProvider,
} from "./byok-cuecraft-adapter";
import {
	createSecureCredentialStore,
	type CueCraftCloudCredentialProvider,
	type SecureCredentialStore,
} from "./secure-credential-store";
import { parseSections, type Section } from "./parser";
import {
	CacheStore,
	buildNoteCache,
	hasUsableCues,
	isStale,
	normalizeCacheMap,
	replaceSection,
	reconcileCacheSections,
	sectionIdsNeedingGeneration,
	type CachedSection,
	type NoteCache,
} from "./cache";
import {
	applyEditorCueWidthPreview,
	appendSectionLens,
	buildCueLineData,
	cueEditorExtension,
	railLayoutAppliesToDisplay,
	renderNoteBriefElement,
	setCuesEffect,
	type EditorCueWidthController,
	type CueLineData,
} from "./cue-extension";
import {
	buildReadingCueMap,
	isReadingModeDisplay,
	readingModeDisplayState,
	readingNoteBriefDisplayState,
} from "./reading-cues";
import {
	DEFAULT_CORNELL_DISPLAY_MODE,
	isCornellDisplayMode,
} from "./cornell-display";
import {
	DEFAULT_EDITOR_CUE_DISPLAY,
	isEditorCueDisplay,
} from "./editor-cue-display";
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
	CueSectionCollapseStore,
	loadCueSectionCollapseMap,
	type CueSectionCollapseMap,
} from "./cue-section-collapse";
import {
	buildCornellModel,
	type CornellModel,
} from "./cornell";
import { CornellView, VIEW_TYPE_CORNELL } from "./cornell-view";
import type { CueGenerationOptions } from "./cue-generation";
import { normalizeSummaryInstructionsOverride } from "./summary-instructions";
import { statusLabel, type CueStatus } from "./status";
import { formatCueCraftNotice } from "./notice";
import {
	EditorHookLayoutController,
	leftDockIsOpen,
} from "./editor-hook-layout";
import {
	findMaintainedStudyAreaForPath,
	isDescendantPath,
	isEntireVaultStudyArea,
	loadStudyAreas,
	normalizeVaultPath,
	planStudyAreaGeneration,
	studyAreaNameForParentPath,
	studyAreaScopeLabel,
	summarizeStudyAreaRun,
	type StudyArea,
	type StudyAreaGenerationPlan,
	type StudyAreaPlanMode,
	type StudyAreaQueueItem,
	type StudyAreaRunSummary,
} from "./study-area";
import { normalizeCueInstructionsOverride } from "./cue-instructions";

interface PluginData {
	settings: CueCraftSettings;
	caches: Record<string, NoteCache>;
	hidden: Record<string, true>;
	cueSectionCollapse: CueSectionCollapseMap;
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
	private studyAreaMaintenanceTimers = new Map<string, number>();
	private editorLayoutFrame: number | null = null;
	private editorCueWidthPreviewScheduler: EditorCueWidthPreviewScheduler | null =
		null;
	private editorHookLayout = new EditorHookLayoutController();
	private cueSettingsChanged = false;
	private data: PluginData = {
		settings: DEFAULT_SETTINGS,
		caches: {},
		hidden: {},
		cueSectionCollapse: {},
	};
	private retainedCaches: Record<string, unknown> = {};
	private pluginDataWrite: Promise<void> = Promise.resolve();
	private settingTab!: CueCraftSettingTab;
	private cacheStore!: CacheStore;
	private visibility!: VisibilityStore;
	private cueSectionCollapse!: CueSectionCollapseStore;
	private credentialStore!: SecureCredentialStore;
	private credentialMigrationWarnings: string[] = [];
	private readonly editorCueWidthController: EditorCueWidthController = {
		getCommittedWidthPx: () => this.settings.editorCueCustomWidthPx,
		previewWidthPx: (widthPx) => this.previewEditorCueWidth(widthPx),
		flushWidthPreview: (widthPx) =>
			this.flushEditorCueWidthPreview(widthPx),
		commitWidthPx: (widthPx) => this.commitEditorCueWidth(widthPx),
	};

	async onload(): Promise<void> {
		this.credentialStore = createSecureCredentialStore({
			secretStorage: this.app.secretStorage,
		});
		await this.loadPluginData();
		this.editorCueWidthPreviewScheduler = new EditorCueWidthPreviewScheduler(
			this.settings.editorCueCustomWidthPx,
			{
				requestAnimationFrame: (callback) =>
					window.requestAnimationFrame(callback),
				cancelAnimationFrame: (id) => window.cancelAnimationFrame(id),
			},
			(widthPx) => this.applyEditorCueWidthNow(widthPx)
		);

		this.cacheStore = new CacheStore(this.data.caches, async (map) => {
			for (const path of Object.keys(map)) {
				delete this.retainedCaches[path];
			}
			this.data.caches = map;
			await this.persistPluginData();
		});
		this.visibility = new VisibilityStore(this.data.hidden, async (map) => {
			this.data.hidden = map;
			await this.persistPluginData();
		});
		this.cueSectionCollapse = new CueSectionCollapseStore(
			this.data.cueSectionCollapse,
			async (map) => {
				this.data.cueSectionCollapse = map;
				await this.persistPluginData();
			}
		);

		this.settingTab = new CueCraftSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

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
			this.app.workspace.on("layout-change", () =>
				this.scheduleEditorLayoutRefresh()
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
		this.flushEditorCueWidthPreview(null);
		this.editorCueWidthPreviewScheduler = null;
		for (const timer of this.autoGenerateTimers.values()) {
			window.clearTimeout(timer);
		}
		this.autoGenerateTimers.clear();
		for (const timer of this.studyAreaMaintenanceTimers.values()) {
			window.clearTimeout(timer);
		}
		this.studyAreaMaintenanceTimers.clear();
		if (this.editorLayoutFrame !== null) {
			window.cancelAnimationFrame(this.editorLayoutFrame);
			this.editorLayoutFrame = null;
		}
		this.currentRun?.abort();
	}

	private async loadPluginData(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<PluginData> | null;
		const rawSettings = loaded?.settings ?? loaded ?? {};
		const settings = Object.assign({}, DEFAULT_SETTINGS, rawSettings);
		normalizeCueCraftProviderSettings(settings, DEFAULT_SETTINGS, rawSettings);
		const credentialMigration = await migrateCueCraftCloudCredentials(
			settings,
			this.credentialStore
		);
		this.credentialMigrationWarnings = credentialMigration.warnings;
		settings.studyAreas = loadStudyAreas(
			(settings as { studyAreas?: unknown }).studyAreas
		);
		settings.autoGenerationSettleDelaySeconds =
			normalizeAutoGenerationSettleDelaySeconds(
				(settings as { autoGenerationSettleDelaySeconds?: unknown })
					.autoGenerationSettleDelaySeconds
			);
		settings.cueInstructionsOverride = normalizeCueInstructionsOverride(
			(settings as { cueInstructionsOverride?: unknown })
				.cueInstructionsOverride
		);
		settings.summaryInstructionsOverride =
			normalizeSummaryInstructionsOverride(
				(settings as { summaryInstructionsOverride?: unknown })
					.summaryInstructionsOverride
			);
		delete (settings as unknown as Record<string, unknown>)
			.editorCueWidthPreset;
		delete (settings as unknown as Record<string, unknown>)
			.editorHookCardStyle;
		settings.editorCueCustomWidthPx = normalizeEditorCueCustomWidthPx(
			(rawSettings as { editorCueCustomWidthPx?: unknown })
				.editorCueCustomWidthPx
		);
		for (const key of [
			"showSectionLens",
			"showNoteBrief",
			"showRailSummary",
			"showRailQuestions",
			"showRailSupportTerms",
		] as const) {
			if (
				typeof (settings as unknown as Record<string, unknown>)[key] !==
				"boolean"
			) {
				settings[key] = DEFAULT_SETTINGS[key];
			}
		}
		if (
			!settings.showRailSummary &&
			!settings.showRailQuestions &&
			!settings.showRailSupportTerms
		) {
			settings.showRailSummary = true;
		}
		if (!isReadingModeDisplay((settings as { readingModeDisplay?: unknown }).readingModeDisplay)) {
			settings.readingModeDisplay = DEFAULT_SETTINGS.readingModeDisplay;
		}
		if (
			!isEditorCueDisplay(
				(settings as { editorCueDisplay?: unknown }).editorCueDisplay
			)
		) {
			settings.editorCueDisplay = DEFAULT_EDITOR_CUE_DISPLAY;
		}
		if (
			!isCornellDisplayMode(
				(settings as { cornellDisplayMode?: unknown }).cornellDisplayMode
			)
		) {
			settings.cornellDisplayMode = DEFAULT_CORNELL_DISPLAY_MODE;
		}
		const rawCaches = (loaded?.caches ?? {}) as Record<string, unknown>;
		const {
			caches,
			retainedCaches,
			changed: cachesChanged,
		} = normalizeCacheMap(rawCaches);
		const hidden = loadHiddenMap(loaded?.hidden);
		const cueSectionCollapse = loadCueSectionCollapseMap(
			loaded?.cueSectionCollapse
		);
		this.retainedCaches = retainedCaches;
		this.data = { settings, caches, hidden, cueSectionCollapse };
		this.settings = this.data.settings;
		if (credentialMigration.settingsChanged || cachesChanged) {
			await this.persistPluginData();
		}
	}

	private async persistPluginData(): Promise<void> {
		const write = this.pluginDataWrite.catch(() => {}).then(async () => {
			await this.saveData({
				...this.data,
				caches: { ...this.retainedCaches, ...this.data.caches },
			});
		});
		this.pluginDataWrite = write;
		await write;
	}

	async saveSettings(): Promise<void> {
		this.data.settings = this.settings;
		await this.persistPluginData();
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
		if (!file) return;
		this.renderCues(file, true);
		this.scheduleEditorLayoutRefresh();
	}

	/** Push the active note's cached cues into its CodeMirror editor (or clear them). */
	private renderCues(file: TFile, forceLayout = false): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.file?.path !== file.path) return;
		this.renderCuesInView(view, forceLayout);
	}

	private renderCuesInView(view: MarkdownView, forceLayout = false): void {
		const file = view.file;
		if (!file) return;
		const cm = (view.editor as unknown as { cm?: EditorView }).cm;
		if (!cm) return;

		const cache = this.cacheStore.get(file.path);
		const cues =
			cache && !this.visibility.isHidden(file.path)
				? buildCueLineData(cache, parseSections(view.editor.getValue()), {
						showKeywords: this.settings.generateKeywords,
					})
				: [];
		cm.dom.dataset.cuecraftEditorDisplay = this.settings.editorCueDisplay;
		applyEditorCueWidthPreview(
			cm.dom,
			railLayoutAppliesToDisplay(this.settings.editorCueDisplay)
				? this.settings.editorCueCustomWidthPx
				: null
		);
		this.updateEditorHookLayout(
			cm,
			cues.length > 0 && this.settings.editorCueDisplay !== "inline-cues",
			forceLayout
		);
		cm.dispatch({
			effects: setCuesEffect.of({
				cues,
				display: this.settings.editorCueDisplay,
				notePath: file.path,
				collapseController: this.cueSectionCollapse,
				showRailSummary: this.settings.showRailSummary,
				showRailQuestions: this.settings.showRailQuestions,
				showRailSupportTerms: this.settings.showRailSupportTerms,
				cueColumnWidth: DEFAULT_EDITOR_CUE_WIDTH_PRESET,
				cueFontSize: this.settings.cueFontSize,
				editorCueWidthController: this.editorCueWidthController,
				noteBrief:
					cache &&
					this.settings.showNoteBrief &&
					!this.visibility.isHidden(file.path)
						? cache.noteBrief
						: null,
			}),
		});
	}

	private previewEditorCueWidth(widthPx: number | null): void {
		if (this.editorCueWidthPreviewScheduler) {
			this.editorCueWidthPreviewScheduler.preview(widthPx);
			return;
		}
		this.applyEditorCueWidthNow(widthPx);
	}

	private flushEditorCueWidthPreview(widthPx: number | null): void {
		if (this.editorCueWidthPreviewScheduler) {
			this.editorCueWidthPreviewScheduler.flush(widthPx);
			return;
		}
		this.applyEditorCueWidthNow(widthPx);
	}

	private applyEditorCueWidthNow(widthPx: number | null): void {
		const seen = new Set<HTMLElement>();
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) return;
			const cm = (view.editor as unknown as { cm?: EditorView }).cm;
			if (!cm || seen.has(cm.dom)) return;
			const display = cm.dom.dataset.cuecraftEditorDisplay;
			if (!isEditorCueDisplay(display)) return;
			seen.add(cm.dom);
			applyEditorCueWidthPreview(
				cm.dom,
				railLayoutAppliesToDisplay(display) ? widthPx : null
			);
		});
	}

	private commitEditorCueWidth(widthPx: number): void {
		const normalized = normalizeEditorCueCustomWidthPx(widthPx);
		if (normalized === null) {
			this.flushEditorCueWidthPreview(this.settings.editorCueCustomWidthPx);
			return;
		}
		if (normalized === this.settings.editorCueCustomWidthPx) {
			this.flushEditorCueWidthPreview(normalized);
			return;
		}
		this.settings.editorCueCustomWidthPx = normalized;
		this.flushEditorCueWidthPreview(normalized);
		void this.saveSettings();
	}

	private scheduleEditorLayoutRefresh(): void {
		if (this.editorLayoutFrame !== null) {
			window.cancelAnimationFrame(this.editorLayoutFrame);
		}
		this.editorLayoutFrame = window.requestAnimationFrame(() => {
			this.editorLayoutFrame = null;
			this.refreshEditorCues(true);
			this.editorCueWidthPreviewScheduler?.flush();
		});
	}

	private updateEditorHookLayout(
		cm: EditorView,
		hasHookRail: boolean,
		forceLayout = false
	): void {
		const leftDockOpen = this.isLeftDockOpen();
		this.editorHookLayout.sync(
			cm.dom,
			hasHookRail,
			leftDockOpen,
			forceLayout
		);
	}

	private isLeftDockOpen(): boolean {
		return leftDockIsOpen(this.app.workspace.leftSplit);
	}

	/** Rerender CueCraft's CodeMirror cue surface in every open Markdown editor. */
	refreshEditorCues(forceLayout = false): void {
		const seen = new Set<EditorView>();
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view.getViewType() !== "markdown") return;
			const view = leaf.view as MarkdownView;
			const cm = (view.editor as unknown as { cm?: EditorView }).cm;
			if (!cm || seen.has(cm)) return;
			seen.add(cm);
			this.renderCuesInView(view, forceLayout);
		});
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
		const definition = byokProviderDefinition(
			cueCraftSelectedProvider(this.settings)
		);
		const hasCredential =
			definition.credentialKind === "api-key"
				? this.credentialStore.availability().ok &&
					cueCraftProviderCredentialSaved(this.settings)
				: cueCraftProviderCredential(this.settings).trim().length > 0;
		const hasModel =
			definition.modelBehavior === "optional" ||
			cueCraftProviderModel(this.settings).trim().length > 0;
		return hasCredential && hasModel;
	}

	/** Public view of {@link isConfigured} for the settings tab. */
	isProviderConfigured(): boolean {
		return this.isConfigured();
	}

	secureCredentialStorageStatus() {
		return this.credentialStore.availability();
	}

	secureCredentialMigrationWarnings(): string[] {
		return [...this.credentialMigrationWarnings];
	}

	isProviderCredentialSaved(provider = cueCraftSelectedProvider(this.settings)): boolean {
		return cueCraftProviderCredentialSaved(this.settings, provider);
	}

	async saveCloudProviderCredential(
		provider: CueCraftCloudCredentialProvider,
		value: string
	): Promise<{ ok: boolean; message?: string }> {
		const result = await this.credentialStore.save(provider, value);
		if (!result.ok || !result.metadata) {
			return { ok: false, message: result.message ?? result.reason };
		}
		markCueCraftCloudCredentialSaved(
			this.settings,
			provider,
			result.metadata.token,
			result.metadata.length
		);
		return { ok: true };
	}

	async clearCloudProviderCredential(
		provider: CueCraftCloudCredentialProvider
	): Promise<{ ok: boolean; message?: string }> {
		const result = await this.credentialStore.clear(provider);
		if (!result.ok) {
			return { ok: false, message: result.message ?? result.reason };
		}
		clearCueCraftStoredCloudCredential(this.settings, provider);
		return { ok: true };
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
				: `CueCraft: ${statusLabel(status)}`;
		this.statusBarEl.setText(label);
		this.statusBarEl.dataset.status = status;
		this.statusBarEl.style.cursor =
			pillAction(status) === "none" ? "default" : "pointer";
	}

	/** Open Settings on the CueCraft tab. */
	private openSettings(subpage?: "study-areas"): void {
		if (subpage === "study-areas") {
			this.settingTab.openStudyAreas();
		}
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
			name: "Generate Study Area Cues...",
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
		showSectionLens: boolean;
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
		const noteBriefState = readingNoteBriefDisplayState({
			renderInReadingMode: this.settings.renderInReadingMode,
			showNoteBrief: this.settings.showNoteBrief,
			hasCache: true,
			hasNoteBrief: Boolean(cache.noteBrief),
			isHidden,
		});
		if (
			!displayState.showInlineCues &&
			!displayState.showReviewButton &&
			!noteBriefState.showNoteBrief
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
			if (noteBriefState.showNoteBrief) {
				this.maybeInsertReadingNoteBriefEl(cache, map, info, heading);
			}
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
			this.readingCueMemo.showKeywords === this.settings.generateKeywords &&
			this.readingCueMemo.showSectionLens === this.settings.showSectionLens
		) {
			return this.readingCueMemo.map;
		}
		const map = buildReadingCueMap(cache, text, {
			showKeywords: this.settings.generateKeywords,
			showSectionLens: this.settings.showSectionLens,
		});
		this.readingCueMemo = {
			path,
			text,
			showKeywords: this.settings.generateKeywords,
			showSectionLens: this.settings.showSectionLens,
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

	private maybeInsertReadingNoteBriefEl(
		cache: NoteCache,
		map: Map<number, CueLineData>,
		info: ReturnType<MarkdownPostProcessorContext["getSectionInfo"]>,
		heading: HTMLElement
	): boolean {
		if (!info || !this.settings.showNoteBrief || !cache.noteBrief) return false;
		const firstCueLine = [...map.keys()].sort((a, b) => a - b)[0];
		if (firstCueLine !== info.lineStart + 1) return false;
		const previous = heading.previousElementSibling;
		if (previous && previous.hasClass("cuecraft-note-brief")) return false;
		const parent = heading.parentElement;
		if (parent?.querySelector(":scope > .cuecraft-note-brief")) return false;
		heading.insertAdjacentElement(
			"beforebegin",
			renderNoteBriefElement(cache.noteBrief, "reading")
		);
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
		appendSectionLens(root, cue.sectionLens);
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
	private makeHttpClient(): ByokHttpClient {
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
	async makeProvider(): Promise<CueCraftByokRuntime> {
		return makeCueCraftByokProviderFromStore(this.settings, {
			fetchImpl: this.makeFetch(),
			http: this.makeHttpClient(),
		}, this.credentialStore);
	}

	async listProviderModels(
		provider: CueCraftFetchedModelProvider
	) {
		return listCueCraftProviderModelsFromStore(this.settings, provider, {
			fetchImpl: this.makeFetch(),
			http: this.makeHttpClient(),
		}, this.credentialStore);
	}

	private async makeProviderForRun(
		opts: { automatic?: boolean } = {}
	): Promise<CueCraftByokRuntime | null> {
		try {
			return await this.makeProvider();
		} catch (error) {
			console.error("CueCraft provider setup failed", error);
			if (!opts.automatic) {
				new Notice(
					formatCueCraftNotice(
						error instanceof Error ? error.message : String(error)
					)
				);
			}
			return null;
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
		const model = cueCraftProviderModel(this.settings).trim();
		return byokProviderDefinition(
			cueCraftSelectedProvider(this.settings)
		).modelBehavior === "optional"
			? model || "CLI default"
			: model;
	}

	private scheduleAutoGenerate(file: TFile): void {
		if (file.extension !== "md") {
			return;
		}
		const hidden = this.visibility.isHidden(file.path);
		if (this.settings.autoGenerateOnSave && !hidden) {
			scheduleAutoGenerationTimer({
				timers: this.autoGenerateTimers,
				key: file.path,
				delaySeconds: this.settings.autoGenerationSettleDelaySeconds,
				timerApi: window,
				shouldRun: () =>
					this.settings.autoGenerateOnSave &&
					!this.visibility.isHidden(file.path),
				onRun: () => {
					if (this.cacheStore.has(file.path)) {
						void this.regenerateStaleSections(file, { automatic: true });
					} else {
						void this.generateCuesForFile(file, { automatic: true });
					}
				},
			});
		}
		this.scheduleStudyAreaMaintenance(file, hidden);
	}

	private scheduleStudyAreaMaintenance(file: TFile, hidden: boolean): void {
		const area = findMaintainedStudyAreaForPath(
			this.settings.studyAreas,
			file.path,
			hidden
		);
		if (!area) return;
		scheduleAutoGenerationTimer({
			timers: this.studyAreaMaintenanceTimers,
			key: file.path,
			delaySeconds: this.settings.autoGenerationSettleDelaySeconds,
			timerApi: window,
			onRun: () => {
				const currentArea = findMaintainedStudyAreaForPath(
					this.settings.studyAreas,
					file.path,
					this.visibility.isHidden(file.path)
				);
				if (!currentArea) return;
				void this.runStudyArea(currentArea.id, "maintain-note", {
					automatic: true,
					targetFile: file,
				});
			},
		});
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

		const provider = await this.makeProviderForRun();
		if (!provider) return;

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

			let updated = replaceSection(cache, toCachedSection(result));
			if (!controller.signal.aborted) {
				updated = await this.refreshNoteBriefForCache(
					file,
					markdown,
					updated,
					provider,
					controller.signal
				);
			}
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
	 * Regenerate only sections that need provider work, then reconcile cached
	 * section order/metadata with the current note. Defaults to the active note.
	 * Public so the Cornell view toolbar can trigger it.
	 */
	async regenerateStaleSections(
		target?: TFile,
		opts: { automatic?: boolean } = {}
	): Promise<void> {
		const file = target ?? this.app.workspace.getActiveFile();
		if (!file) {
			if (!opts.automatic) new Notice("CueCraft: open a note first.");
			return;
		}
		if (this.currentRun) {
			if (opts.automatic) return;
			new Notice("CueCraft: generation already in progress.");
			return;
		}
		if (!this.isConfigured()) {
			if (!opts.automatic) {
				new Notice("CueCraft: set up your AI provider in Settings first.");
			}
			return;
		}
		const cache = this.cacheStore.get(file.path);
		if (!cache) {
			if (!opts.automatic) {
				new Notice("CueCraft: no cache for this note \u2014 run Generate first.");
			}
			return;
		}
		const markdown = await this.app.vault.cachedRead(file);
		const sections = parseSections(markdown);
		const sectionIds = sectionIdsNeedingGeneration(cache, sections);
		if (!sectionIds.length) {
			const updated = reconcileCacheSections(cache, sections, [], {
				noteModifiedAt: file.stat.mtime,
			});
			await this.cacheStore.set(file.path, updated);
			await this.visibility.show(file.path);
			await this.updateStatusForFile(this.app.workspace.getActiveFile());
			this.renderCues(file);
			this.refreshCornellViews();
			if (!opts.automatic) {
				new Notice("CueCraft: no sections need regeneration.");
			}
			return;
		}

		const provider = await this.makeProviderForRun(opts);
		if (!provider) return;
		const byId = new Map(sections.map((s) => [s.id, s]));

		const controller = new AbortController();
		this.currentRun = controller;

		const generated: CachedSection[] = [];
		let done = 0;
		let failed = 0;
		try {
			const concurrency = this.settings.sectionConcurrency;
			for (let start = 0; start < sectionIds.length; start += concurrency) {
				if (controller.signal.aborted) break;
				const batch = sectionIds
					.slice(start, start + concurrency)
					.map((id) => byId.get(id))
					.filter((s): s is Section => Boolean(s));
				this.setStatus("generating", { done, total: sectionIds.length });
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
						this.setStatus("generating", { done, total: sectionIds.length });
						return result;
					})
				);
				for (const result of results) {
					generated.push(toCachedSection(result));
					if (result.error) failed++;
				}
				const working = reconcileCacheSections(cache, sections, generated, {
					noteModifiedAt: file.stat.mtime,
				});
				await this.cacheStore.set(file.path, working);
			}
			if (!controller.signal.aborted) {
				const working = reconcileCacheSections(cache, sections, generated, {
					noteModifiedAt: file.stat.mtime,
				});
				await this.cacheStore.set(
					file.path,
					await this.refreshNoteBriefForCache(
						file,
						markdown,
						working,
						provider,
						controller.signal
					)
				);
			}
			await this.visibility.show(file.path);
			const ok = done - failed;
			if (!opts.automatic || failed) {
				new Notice(
					`CueCraft: refreshed ${ok} section${ok === 1 ? "" : "s"}` +
						(failed ? `, ${failed} failed` : "") +
						"."
				);
			}
		} catch (e) {
			console.error("CueCraft stale refresh failed", e);
			if (!opts.automatic) {
				new Notice("CueCraft: stale refresh failed. See console.");
			}
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

	openStudyAreaManager(_areaId?: string): void {
		this.openSettings("study-areas");
	}

	async createStudyArea(parentPath: string): Promise<StudyArea | null> {
		const normalized = normalizeVaultPath(parentPath);
		if (
			this.settings.studyAreas.some(
				(area) => normalizeVaultPath(area.parentPath) === normalized
			)
		) {
			new Notice("CueCraft: that study area already exists.");
			return null;
		}
		if (!normalized && this.settings.studyAreas.length) {
			new Notice(
				"CueCraft: remove folder study areas before using Entire vault."
			);
			return null;
		}
		if (
			normalized &&
			this.settings.studyAreas.some((area) => isEntireVaultStudyArea(area))
		) {
			new Notice("CueCraft: remove Entire vault before adding folder study areas.");
			return null;
		}
		const area: StudyArea = {
			id: `study-area-${Date.now().toString(36)}`,
			name: studyAreaNameForParentPath(normalized),
			parentPath: normalized,
			excludedPaths: [],
			maintenanceMode: "maintain-on-save",
			createdAt: new Date().toISOString(),
		};
		this.settings.studyAreas = [...this.settings.studyAreas, area];
		await this.saveSettings();
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
		mode: StudyAreaPlanMode = "backfill",
		opts: { automatic?: boolean; targetFile?: TFile } = {}
	): Promise<StudyAreaRunSummary | null> {
		if (this.currentRun) {
			if (opts.automatic) return null;
			this.currentRun.abort();
			new Notice("CueCraft: cancelling generation...");
			return null;
		}
		if (!this.isConfigured()) {
			if (!opts.automatic) {
				new Notice("CueCraft: set up your AI provider in Settings first.");
			}
			return null;
		}
		const area = this.findStudyArea(areaId);
		if (!area) {
			new Notice("CueCraft: study area no longer exists.");
			return null;
		}
		const plan = await this.buildStudyAreaPlan(
			area,
			mode,
			opts.targetFile ? [opts.targetFile] : undefined
		);
		if (!plan.items.length) {
			if (!opts.automatic) {
				new Notice(
					mode === "retry-failed"
						? "CueCraft: no failed study-area work to retry."
						: "CueCraft: this study area is already ready."
				);
			}
			return summarizeStudyAreaRun(plan, {});
		}

		const provider = await this.makeProviderForRun(opts);
		if (!provider) return null;
		const controller = new AbortController();
		this.currentRun = controller;
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
			if (!opts.automatic || summary.failed) {
				new Notice(this.studyAreaSummaryNotice(area, summary));
			}
		}
		return summary;
	}

	private findStudyArea(areaId: string): StudyArea | null {
		return this.settings.studyAreas.find((area) => area.id === areaId) ?? null;
	}

	private async buildStudyAreaPlan(
		area: StudyArea,
		mode: StudyAreaPlanMode,
		targetFiles?: readonly TFile[]
	): Promise<StudyAreaGenerationPlan> {
		const files =
			targetFiles ??
			this.app.vault
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
		provider: CueCraftByokRuntime,
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
		provider: CueCraftByokRuntime,
		controller: AbortController,
		onProgress?: (completedSections: number) => void
	): Promise<"completed" | "failed" | "canceled"> {
		const cache = this.cacheStore.get(file.path);
		if (!cache) return "failed";
		const sections = parseSections(markdown);
		const byId = new Map(sections.map((section) => [section.id, section]));
		const generated: CachedSection[] = [];
		let failed = 0;
		let completed = 0;
		const concurrency = this.settings.sectionConcurrency;
		if (!sectionIds.length) {
			const working = reconcileCacheSections(cache, sections, [], {
				noteModifiedAt: file.stat.mtime,
			});
			await this.cacheStore.set(file.path, working);
			await this.visibility.show(file.path);
			return controller.signal.aborted ? "canceled" : "completed";
		}
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
				generated.push(toCachedSection(result));
				if (result.error) failed++;
				else completed++;
				onProgress?.(1);
			}
			const working = reconcileCacheSections(cache, sections, generated, {
				noteModifiedAt: file.stat.mtime,
			});
			await this.cacheStore.set(file.path, working);
		}
		if (!controller.signal.aborted) {
			const working = reconcileCacheSections(cache, sections, generated, {
				noteModifiedAt: file.stat.mtime,
			});
			await this.cacheStore.set(
				file.path,
				await this.refreshNoteBriefForCache(
					file,
					markdown,
					working,
					provider,
					controller.signal
				)
			);
		}
		await this.visibility.show(file.path);
		if (controller.signal.aborted) return "canceled";
		return failed || completed < sectionIds.length ? "failed" : "completed";
	}

		private async refreshNoteBriefForCache(
			file: TFile,
			markdown: string,
			cache: NoteCache,
			provider: CueCraftByokRuntime,
			signal?: AbortSignal
		): Promise<NoteCache> {
		return {
			...cache,
			noteBrief: await generateNoteBriefForSections({
				noteTitle: file.basename,
				markdown,
				provider,
				sections: cache.sections,
				signal,
			}),
		};
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
		const parts = [`${summary.completed} done`];
		if (summary.failed) parts.push(`${summary.failed} failed`);
		return `CueCraft: ${area.name} run complete - ${parts.join(", ")}.`;
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
		const provider = await this.makeProviderForRun(opts);
		if (!provider) return;

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
		activeDocument.body.toggleClass("cuecraft-study-active", this.studyMode);
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
		sectionLens: result.sectionLens,
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
		return `${item.name} - ${studyAreaScopeLabel(item.parentPath)}`;
	}

	onChooseItem(item: StudyArea): void {
		this.onChoose(item);
	}
}
