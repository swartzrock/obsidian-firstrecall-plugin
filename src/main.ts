import {
	FuzzySuggestModal,
	MarkdownView,
	Menu,
	Modal,
	Notice,
	Plugin,
	TFile,
	requestUrl,
	type MarkdownFileInfo,
	type MarkdownPostProcessorContext,
	type RequestUrlParam,
} from "obsidian";
import type { EditorView } from "@codemirror/view";
import {
	CueCraftSettings,
	CueCraftSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";
import { normalizeEditorCueCustomWidthPx } from "./editor-cue-width";
import { cueFontSizeClass } from "./cornell-layout";
import { EditorCueWidthPreviewScheduler } from "./editor-cue-width-preview";
import { scheduleAutoGenerationTimer } from "./auto-generation-delay";
import { type ByokHttpClient } from "@swartzrock/byok-runtime";
import { byokProviderDefinition } from "./byok-provider-metadata";
import {
	generateNote,
	generateNoteBriefForSections,
	generateSectionCueBatch,
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
	appendSummary,
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
	projectReadingStudyBlock,
	readingCueDisplayState,
	readingNoteBriefDisplayState,
	removeReadingStudyControls,
	restoreReadingStudyBlock,
	syncReadingStudyControls,
	type ReadingCueVisibility,
} from "./reading-cues";
import {
	resolveStudySections,
	StudySessionController,
	type StudyProjection,
	type StudySectionDescriptor,
	type StudySessionSnapshot,
} from "./study-session";
import { isEditorCueDisplay } from "./editor-cue-display";
import {
	exportFilePaths,
	resolveExportTarget,
	selectExportableQuestions,
	questionsAndTermsToAnki,
	questionsAndTermsToMarkdown,
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
import { type CueGenerationOptions } from "./cue-generation";
import { statusLabel, type CueStatus } from "./status";
import { formatCueCraftNotice } from "./notice";
import { parsePersistedCueCraftSettings } from "./persisted-settings";
import {
	EditorHookLayoutController,
	leftDockIsOpen,
} from "./editor-hook-layout";
import {
	findMaintainedStudyAreaForPath,
	isDescendantPath,
	isEntireVaultStudyArea,
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

interface PluginData {
	settings: CueCraftSettings;
	caches: Record<string, NoteCache>;
	hidden: Record<string, true>;
	cueSectionCollapse: CueSectionCollapseMap;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function abortReason(signal: AbortSignal): Error {
	if (signal.reason instanceof Error) return signal.reason;
	const message =
		signal.reason === undefined
			? "The operation was aborted."
			: String(signal.reason);
	return new DOMException(message, "AbortError");
}

async function withAbortSignal<T>(
	operation: () => Promise<T>,
	signal: AbortSignal
): Promise<T> {
	if (signal.aborted) throw abortReason(signal);
	const promise = operation();
	let removeAbortListener = (): void => {};
	const aborted = new Promise<never>((_resolve, reject) => {
		const onAbort = (): void => reject(abortReason(signal));
		signal.addEventListener("abort", onAbort, { once: true });
		removeAbortListener = () => signal.removeEventListener("abort", onAbort);
	});
	try {
		return await Promise.race([promise, aborted]);
	} finally {
		removeAbortListener();
	}
}

const RIBBON_ICON = "graduation-cap";
const STUDY_RIBBON_ICON = "book-open-check";
const STUDY_READY_LABEL = "CueCraft: Study this note";
const STUDY_ACTIVE_LABEL = "CueCraft: Exit Study";
const STUDY_GENERATE_FIRST = "CueCraft: generate Section cues for this note first.";
const RETIRED_DEDICATED_VIEW_TYPE = "cuecraft-cornell";

type StudyProjectionMode = "source" | "preview";

export default class CueCraftPlugin extends Plugin {
	override settings: CueCraftSettings = DEFAULT_SETTINGS;

	private statusBarEl: HTMLElement | null = null;
	private ribbonEl: HTMLElement | null = null;
	private studyRibbonEl: HTMLElement | null = null;
	private readonly studySession = new StudySessionController();
	private readonly studyHeaderActions = new WeakMap<MarkdownView, HTMLElement>();
	private readonly studyHeaderActionElements = new Set<HTMLElement>();
	private projectedStudySurface: {
		view: MarkdownView;
		mode: StudyProjectionMode;
	} | null = null;
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

	override async onload(): Promise<void> {
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

		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("cuecraft-status");
		this.statusBarEl.addEventListener("click", () => this.onPillClick());

		this.ribbonEl = this.addRibbonIcon(RIBBON_ICON, "CueCraft", () =>
			this.onRibbonClick()
		);
		this.studyRibbonEl = this.addRibbonIcon(
			STUDY_RIBBON_ICON,
			STUDY_READY_LABEL,
			() => this.toggleStudyForActiveView()
		);
		this.studyRibbonEl.classList.add("cuecraft-study-ribbon");
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
				this.onActiveLeafChange()
			)
		);
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.scheduleEditorLayoutRefresh();
				this.refreshStudyEntryStates();
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.endStudyForPath(oldPath);
				if (file instanceof TFile) void this.visibility.rename(oldPath, file.path);
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => this.endStudyForPath(file.path))
		);
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile) {
					this.scheduleAutoGenerate(file);
					if (this.studySession.snapshot().path === file.path) {
						this.refreshStudyProjections();
					}
				}
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
		this.app.workspace.onLayoutReady(() => {
			this.app.workspace.detachLeavesOfType(RETIRED_DEDICATED_VIEW_TYPE);
			this.onActiveFile(this.app.workspace.getActiveFile());
		});
	}

	override onunload(): void {
		this.endStudySession({ refresh: false, updateIdleStatus: false });
		for (const action of this.studyHeaderActionElements) action.remove();
		this.studyHeaderActionElements.clear();
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
		const loaded: unknown = await this.loadData();
		const loadedRecord = isRecord(loaded) ? loaded : {};
		const rawSettings = loadedRecord.settings ?? loadedRecord;
		const rawSettingsRecord = isRecord(rawSettings) ? rawSettings : {};
		const parsedSettings = parsePersistedCueCraftSettings(rawSettings);
		const settings = parsedSettings.settings;
		let settingsChanged = parsedSettings.changed;
		const credentialMigration = await migrateCueCraftCloudCredentials(
			settings,
			this.credentialStore,
			rawSettings
		);
		this.credentialMigrationWarnings = credentialMigration.warnings;
		for (const key of [
			"cuePreset",
			"cueDensity",
			"questionStyle",
			"generateKeywords",
			"cueInstructionsOverride",
			"noteBriefInstructionsOverride",
			"summaryInstructionsOverride",
			"showSectionLens",
			"showRailSummary",
			"showRailQuestions",
			"showRailSupportTerms",
			"renderInReadingMode",
			"autoSummary",
			"cornellDisplayMode",
			"cornellStyle",
			"cueColumnWidth",
			"cueAccent",
			"showCueBorder",
			"compactChips",
			"foldCueColumnOnMobile",
			"editorCueWidthPreset",
			"editorHookCardStyle",
			"readingModeDisplay",
		] as const) {
			if (Object.prototype.hasOwnProperty.call(rawSettingsRecord, key)) {
				settingsChanged = true;
			}
		}
		const rawCaches = isRecord(loadedRecord.caches)
			? loadedRecord.caches
			: {};
		const {
			caches,
			retainedCaches,
			changed: cachesChanged,
		} = normalizeCacheMap(rawCaches);
		const hidden = loadHiddenMap(loadedRecord.hidden);
		const cueSectionCollapse = loadCueSectionCollapseMap(
			loadedRecord.cueSectionCollapse
		);
		this.retainedCaches = retainedCaches;
		this.data = { settings, caches, hidden, cueSectionCollapse };
		this.settings = this.data.settings;
		if (
			credentialMigration.settingsChanged ||
			cachesChanged ||
			settingsChanged
		) {
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

	async saveSettings(options: { refreshReviewSurfaces?: boolean } = {}): Promise<void> {
		this.data.settings = this.settings;
		await this.persistPluginData();
		this.updateRibbonLabel();
		if (options.refreshReviewSurfaces !== false) this.refreshStudyProjections();
		void this.updateStatusForFile(this.app.workspace.getActiveFile());
	}

	/** Keep the ribbon tooltip describing what a click will do. */
	private updateRibbonLabel(): void {
		const generateLabel = this.isConfigured()
			? "CueCraft: Generate study material for this note"
			: "CueCraft: Set up \u2014 open settings";
		this.ribbonEl?.setAttribute("aria-label", generateLabel);
		this.refreshStudyEntryStates();
	}

	/** Sets the idle status pill based on the active note's cache (ready/stale/setup). */
	private async updateStatusForFile(file: TFile | null): Promise<void> {
		if (this.studySession.snapshot().active) {
			this.setStatus("study");
			return;
		}
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
		if (
			this.studySession.snapshot().active ||
			this.app.workspace.getActiveFile()?.path !== file.path
		) {
			return;
		}
		this.setStatus(isStale(cache, parseSections(markdown)) ? "stale" : "ready");
	}

	/** Refresh both the status pill and the rendered cues for a note. */
	private onActiveFile(file: TFile | null): void {
		const session = this.studySession.snapshot();
		if (session.active && session.path !== file?.path) {
			this.endStudySession({ refresh: false, updateIdleStatus: false });
		}
		void this.updateStatusForFile(file);
		this.refreshStudyEntryStates();
		if (!file) {
			this.refreshEditorCues();
			return;
		}
		this.renderCues(file, true);
		this.scheduleEditorLayoutRefresh();
	}

	private onActiveLeafChange(): void {
		this.restoreProjectedStudySurface();
		this.onActiveFile(this.app.workspace.getActiveFile());
	}

	/** Push the active note's cached cues into its CodeMirror editor (or clear them). */
	private renderCues(file: TFile, forceLayout = false): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.file?.path !== file.path) return;
		this.renderCuesInView(view, forceLayout);
	}

	private renderCuesInView(
		view: MarkdownView,
		forceLayout = false,
		allowStudyProjection = true
	): void {
		const file = view.file;
		if (!file) return;
		const cm = (view.editor as unknown as { cm?: EditorView }).cm;
		if (!cm) return;

		const cache = this.cacheStore.get(file.path);
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (
			allowStudyProjection &&
			!cache &&
			activeView === view &&
			this.studySession.snapshot().path === file.path
		) {
			this.endStudySession({ refresh: false });
		}
		const study =
			allowStudyProjection && cache
				? this.editorStudyProjection(view, cache)
				: null;
		const cues =
			cache && (!this.visibility.isHidden(file.path) || Boolean(study))
				? buildCueLineData(cache, parseSections(view.editor.getValue()), {
						showSummary: this.settings.showSummary,
						showQuestion: this.settings.showQuestion || Boolean(study),
						showTerms: this.settings.showTerms,
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
		if (study) this.moveStudyProjectionTo(view, "source");
		cm.dispatch({
			effects: setCuesEffect.of({
				cues,
				display: this.settings.editorCueDisplay,
				...(study ? { study } : {}),
				notePath: file.path,
				collapseController: this.cueSectionCollapse,
				showSummary: this.settings.showSummary,
				showQuestion: this.settings.showQuestion,
				showTerms: this.settings.showTerms,
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
		if (!study &&
			this.projectedStudySurface?.view === view &&
			this.projectedStudySurface.mode === "source"
		) {
			this.projectedStudySurface = null;
		}
		this.updateStudyHeaderAction(view);
	}

	private editorStudyProjection(
		view: MarkdownView,
		cache: NoteCache
	): StudyProjection | null {
		const file = view.file;
		if (
			!file ||
			view.getMode() === "preview" ||
			this.app.workspace.getActiveViewOfType(MarkdownView) !== view
		) {
			return null;
		}
		const snapshot = this.reconcileStudyForSource(
			file.path,
			view.editor.getValue(),
			cache
		);
		return snapshot ? this.studyProjection(snapshot, file.path, view) : null;
	}

	private studyProjection(
		snapshot: StudySessionSnapshot,
		path: string,
		view: MarkdownView
	): StudyProjection {
		return {
			snapshot,
			controlsContainer: this.studyControlsContainer(view),
			toggleSection: (sectionId) => {
				this.studySession.toggleReveal(path, sectionId);
				this.refreshStudyProjections();
			},
			showAll: () => {
				const current = this.studySession.snapshot();
				if (current.revealedCount === current.total) return;
				this.studySession.showAll(path);
				this.refreshStudyProjections();
			},
			hideAll: () => {
				if (this.studySession.snapshot().revealedCount === 0) return;
				this.studySession.hideAll(path);
				this.refreshStudyProjections();
			},
			exit: () => this.endStudySession(),
			documentChanged: (markdown) => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView?.file?.path !== path || activeView.getMode() === "preview") {
					return;
				}
				const cache = this.cacheStore.get(path);
				if (!cache) {
					this.endStudySession({ refresh: false });
					return;
				}
				if (this.reconcileStudyForSource(path, markdown, cache)) {
					this.refreshStudyProjections();
				}
			},
		};
	}

	private studyControlsContainer(view: MarkdownView): HTMLElement {
		const contentEl = (view as MarkdownView & { contentEl?: HTMLElement })
			.contentEl;
		const containerEl = (
			view as MarkdownView & { containerEl?: HTMLElement }
		).containerEl;
		return (
			contentEl ??
			containerEl?.closest<HTMLElement>(".view-content") ??
			containerEl?.querySelector<HTMLElement>(".view-content") ??
			containerEl ??
			(view.editor as unknown as { cm: EditorView }).cm.dom
		);
	}

	private reconcileStudyForSource(
		path: string,
		markdown: string,
		cache: NoteCache
	): StudySessionSnapshot | null {
		const current = this.studySession.snapshot();
		if (!current.active || current.path !== path) return null;
		const descriptors = resolveStudySections(
			markdown,
			cache.sections,
			parseSections(markdown)
		);
		if (descriptors.length === 0) {
			this.endStudySession({ refresh: false });
			return null;
		}
		const snapshot = this.studySession.reconcile(path, descriptors);
		this.setStatus("study");
		return snapshot.active ? snapshot : null;
	}

	private moveStudyProjectionTo(
		view: MarkdownView,
		mode: StudyProjectionMode
	): void {
		const projected = this.projectedStudySurface;
		if (projected && (projected.view !== view || projected.mode !== mode)) {
			this.restoreProjectedStudySurface();
		}
		this.projectedStudySurface = { view, mode };
	}

	private restoreProjectedStudySurface(): void {
		const projected = this.projectedStudySurface;
		if (!projected) return;
		this.projectedStudySurface = null;
		if (projected.mode === "preview") {
			restoreReadingStudyBlock(projected.view.containerEl);
			removeReadingStudyControls(this.studyControlsContainer(projected.view));
			return;
		}
		this.renderCuesInView(projected.view, false, false);
	}

	private endStudySession(
		{
			refresh = true,
			updateIdleStatus = true,
		}: { refresh?: boolean; updateIdleStatus?: boolean } = {}
	): void {
		if (!this.studySession.snapshot().active) return;
		this.restoreProjectedStudySurface();
		this.studySession.exit();
		this.refreshStudyEntryStates();
		if (updateIdleStatus) {
			void this.updateStatusForFile(this.app.workspace.getActiveFile());
		}
		if (refresh) this.refreshStudyProjections();
	}

	private endStudyForPath(path: string): void {
		if (this.studySession.snapshot().path === path) {
			this.endStudySession();
		}
	}

	private strictStudySections(view: MarkdownView): StudySectionDescriptor[] {
		const file = view.file;
		if (!file) return [];
		const cache = this.cacheStore.get(file.path);
		if (!cache) return [];
		const markdown = view.editor.getValue();
		return resolveStudySections(markdown, cache.sections, parseSections(markdown));
	}

	private ensureStudyHeaderAction(view: MarkdownView): HTMLElement {
		const existing = this.studyHeaderActions.get(view);
		if (existing) return existing;
		const action = view.addAction(STUDY_RIBBON_ICON, STUDY_READY_LABEL, () =>
			this.toggleStudyForView(view)
		);
		action.classList.add("cuecraft-study-header-action");
		const label = action.ownerDocument.createElement("span");
		label.className = "cuecraft-study-header-label";
		label.textContent = "Study";
		action.appendChild(label);
		action.tabIndex = 0;
		action.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			this.toggleStudyForView(view);
		});
		this.studyHeaderActions.set(view, action);
		this.studyHeaderActionElements.add(action);
		return action;
	}

	private updateStudyHeaderAction(view: MarkdownView): void {
		if (
			typeof (view as MarkdownView & { addAction?: unknown }).addAction !==
			"function"
		) {
			return;
		}
		const action = this.ensureStudyHeaderAction(view);
		const enabled = this.strictStudySections(view).length > 0;
		const active =
			this.studySession.snapshot().active &&
			this.studySession.snapshot().path === view.file?.path;
		this.setStudyEntryState(action, enabled, active);
	}

	private refreshStudyEntryStates(): void {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view.getViewType() !== "markdown") return;
			this.updateStudyHeaderAction(leaf.view as MarkdownView);
		});
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const enabled = activeView
			? this.strictStudySections(activeView).length > 0
			: false;
		const snapshot = this.studySession.snapshot();
		this.setStudyEntryState(
			this.studyRibbonEl,
			enabled,
			Boolean(
				activeView && snapshot.active && snapshot.path === activeView.file?.path
			)
		);
	}

	private setStudyEntryState(
		entry: HTMLElement | null,
		enabled: boolean,
		active: boolean
	): void {
		if (!entry) return;
		const label = enabled
			? active
				? STUDY_ACTIVE_LABEL
				: STUDY_READY_LABEL
			: STUDY_GENERATE_FIRST;
		entry.title = label;
		entry.setAttribute("aria-label", label);
		entry.setAttribute("aria-pressed", String(active));
		entry.classList.toggle("is-active", active);
		if (enabled) entry.removeAttribute("aria-disabled");
		else entry.setAttribute("aria-disabled", "true");
	}

	private toggleStudyForActiveView(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice("CueCraft: open a Markdown note to study.");
			return;
		}
		this.toggleStudyForView(view);
	}

	private toggleStudyForView(view: MarkdownView): void {
		if (this.app.workspace.getActiveViewOfType(MarkdownView) !== view) {
			this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
		}
		const file = view.file;
		if (!file) {
			new Notice("CueCraft: open a Markdown note to study.");
			return;
		}
		const descriptors = this.strictStudySections(view);
		if (descriptors.length === 0) {
			this.endStudyForPath(file.path);
			new Notice(STUDY_GENERATE_FIRST);
			return;
		}
		const current = this.studySession.snapshot();
		if (current.active && current.path === file.path) {
			this.endStudySession();
			return;
		}
		if (current.active) {
			this.endStudySession({ refresh: false, updateIdleStatus: false });
		}
		this.studySession.start(file.path, descriptors);
		this.setStatus("study");
		this.refreshStudyEntryStates();
		this.refreshStudyProjections();
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
			const cm = (
				view.editor as unknown as { cm?: EditorView } | undefined
			)?.cm;
			if (!cm || seen.has(cm)) return;
			seen.add(cm);
			this.renderCuesInView(view, forceLayout);
		});
	}

	/** Force every open Reading view to rerender its post-processed cue surface. */
	refreshReadingModeSurface(): void {
		this.readingCueMemo = null;
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view as MarkdownView;
			if (view.getMode() !== "preview") continue;
			view.previewMode.rerender(true);
		}
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
		// "Review" is only meaningful once a note has usable Section cues to study.
		if (this.hasUsableCueCache(file.path)) {
			menu.addItem((item) =>
				item
					.setTitle("CueCraft: Review (Study Mode)")
					.setIcon(STUDY_RIBBON_ICON)
					.onClick(() => void this.reviewThisNote(file))
			);
		}
	}

	private registerCommands(): void {
		this.addCommand({
			id: "generate-cues",
			name: "Generate Study Material for This Note",
			callback: () => this.generateCues(),
		});
		this.addCommand({
			id: "regenerate-section",
			name: "Regenerate Section cue and Note Brief\u2026",
			callback: () => this.pickAndRegenerateSection(),
		});
		this.addCommand({
			id: "regenerate-stale-sections",
			name: "Regenerate Stale Study Material",
			callback: () => void this.regenerateStaleSections(),
		});
		this.addCommand({
			id: "run-study-area-backfill",
			name: "Generate Study Material for Study Area...",
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
			callback: () => this.toggleStudyForActiveView(),
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
			name: "Clear Generated Study Material",
			callback: () => this.clearCues(),
		});
		this.addCommand({
			id: "review-this-note",
			name: "Review This Note (Study Mode)",
			callback: () => void this.reviewThisNote(),
		});
		this.addCommand({
			id: "export-cues-markdown",
			name: "Export Questions and Terms to Markdown",
			callback: () => void this.exportCues("markdown"),
		});
		this.addCommand({
			id: "export-cues-anki",
			name: "Export Questions and Terms to Anki (TSV)",
			callback: () => void this.exportCues("anki"),
		});
	}

	/**
	 * Export the active note's usable Questions and Terms to a sibling file: a Markdown study
	 * sheet or Anki-importable TSV. Never touches the source note.
	 */
	private async exportCues(format: "markdown" | "anki"): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("CueCraft: open a note to export its Questions and Terms.");
			return;
		}
		const cache = this.cacheStore.get(file.path);
		const questions = cache ? selectExportableQuestions(cache) : [];
		if (questions.length === 0) {
			new Notice("CueCraft: no usable Questions and Terms to export \u2014 generate first.");
			return;
		}
		const dir =
			file.parent && file.parent.path !== "/" ? `${file.parent.path}/` : "";
		const { preferred: outPath, legacy: legacyPath } = exportFilePaths(
			dir,
			file.basename,
			format
		);
		const content =
			format === "markdown"
				? questionsAndTermsToMarkdown(file.basename, questions)
				: questionsAndTermsToAnki(questions);
		const preferred = this.app.vault.getAbstractFileByPath(outPath);
		const legacy = this.app.vault.getAbstractFileByPath(legacyPath);
		const target = resolveExportTarget(
			preferred instanceof TFile,
			legacy instanceof TFile
		);
		let existing = preferred;
		if (target === "migrate-legacy" && legacy instanceof TFile) {
			await this.app.vault.rename(legacy, outPath);
			existing = legacy;
		}
		let out: TFile;
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
			out = existing;
		} else {
			out = await this.app.vault.create(outPath, content);
		}
		const questionCount = `${questions.length} ${
			questions.length === 1 ? "Question" : "Questions"
		}`;
		new Notice(`CueCraft: exported ${questionCount} and Terms to ${outPath}`);
		if (format === "markdown") {
			await this.app.workspace.getLeaf(true).openFile(out);
		}
	}

	/** Start an idempotent in-note Study session, activating only a requested note. */
	private async reviewThisNote(target?: TFile): Promise<void> {
		const file = target ?? this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("CueCraft: open a note to review.");
			return;
		}
		let view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view?.file?.path !== file.path) {
			if (this.studySession.snapshot().active) {
				this.endStudySession({ refresh: false, updateIdleStatus: false });
			}
			await this.app.workspace.getLeaf(false).openFile(file);
			view = this.app.workspace.getActiveViewOfType(MarkdownView);
		}
		if (!view || view.file?.path !== file.path) {
			new Notice("CueCraft: open the note in Markdown view to study.");
			return;
		}
		const descriptors = this.strictStudySections(view);
		if (descriptors.length === 0) {
			this.endStudyForPath(file.path);
			new Notice(STUDY_GENERATE_FIRST);
			return;
		}
		const current = this.studySession.snapshot();
		if (current.active && current.path === file.path) {
			this.refreshStudyProjections();
			return;
		}
		if (current.active) {
			this.endStudySession({ refresh: false, updateIdleStatus: false });
		}
		this.studySession.start(file.path, descriptors);
		this.setStatus("study");
		this.refreshStudyEntryStates();
		this.refreshStudyProjections();
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
	private readingCueMemo: ReadingCueVisibility & {
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
		restoreReadingStudyBlock(el);
		const cache = this.cacheStore.get(path);
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView?.file?.path === path) {
			this.updateStudyHeaderAction(activeView);
		}
		if (
			!cache &&
			activeView?.file?.path === path &&
			activeView.getMode() === "preview" &&
			this.studySession.snapshot().path === path
		) {
			this.endStudySession({ refresh: false });
		}
		const isHidden = this.visibility.isHidden(path);
		const headings = Array.from(
			el.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")
		);
		const firstInfo = headings
			.map((heading) => ctx.getSectionInfo(heading))
			.find((info) => info !== null);
		const study = cache
			? this.readingStudyProjection(path, firstInfo?.text, cache)
			: null;
		const cueVisibility = {
			showSummary: this.settings.showSummary,
			showQuestion: this.settings.showQuestion || Boolean(study?.snapshot.active),
			showTerms: this.settings.showTerms,
		};
		const displayState = readingCueDisplayState({
			hasCache: Boolean(cache),
			isHidden,
			studyActive: Boolean(study?.snapshot.active),
			hasErrors: Boolean(cache?.sections.some((section) => section.error)),
			visibility: cueVisibility,
		});
		const noteBriefState = readingNoteBriefDisplayState({
			showNoteBrief: this.settings.showNoteBrief,
			hasCache: Boolean(cache),
			hasNoteBrief: Boolean(cache?.noteBrief),
			isHidden,
		});
		if (!displayState.showInlineCues) {
			for (const cue of el.querySelectorAll(".cuecraft-cue-reading")) {
				cue.remove();
			}
		}
		if (!noteBriefState.showNoteBrief) {
			for (const noteBrief of el.querySelectorAll(".cuecraft-note-brief")) {
				noteBrief.remove();
			}
		}
		const readingContainer = this.activeReadingContainer(path, el);
		if (readingContainer) {
			syncReadingStudyControls(
				readingContainer,
				study,
				activeView
					? this.studyControlsContainer(activeView)
					: readingContainer
			);
		}
		if (!cache || (!displayState.showInlineCues && !noteBriefState.showNoteBrief)) {
			return;
		}
		const noteBriefAnchorLine = noteBriefState.showNoteBrief
			? buildReadingCueMap(cache, firstInfo?.text ?? "").keys().next().value
			: undefined;

		for (const heading of headings) {
			const info = ctx.getSectionInfo(heading);
			if (!info) continue;
			const map = this.readingMapFor(path, info.text, cache, cueVisibility);
			if (noteBriefState.showNoteBrief) {
				this.maybeInsertReadingNoteBriefEl(
					cache,
					noteBriefAnchorLine,
					info,
					heading
				);
			}
			if (!displayState.showInlineCues) {
				continue;
			}
			const cue = map.get(info.lineStart + 1);
			const next = heading.nextElementSibling;
			if (!cue) {
				if (next?.hasClass("cuecraft-cue-reading")) next.remove();
				continue;
			}
			if (
				next?.hasClass("cuecraft-cue-reading") &&
				(next as HTMLElement).dataset.cuecraftSectionId === cue.sectionId
			) {
				next.replaceWith(this.buildReadingCueEl(cue, cueVisibility));
				continue;
			}
			heading.insertAdjacentElement(
				"afterend",
				this.buildReadingCueEl(cue, cueVisibility)
			);
		}

		projectReadingStudyBlock(
			el,
			(element) => {
				const info = ctx.getSectionInfo(element);
				return info
					? { lineStart: info.lineStart, lineEnd: info.lineEnd }
					: null;
			},
			study
		);
	}

	private readingStudyProjection(
		path: string,
		markdown: string | undefined,
		cache: NoteCache
	): StudyProjection | null {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (
			!activeView ||
			activeView.file?.path !== path ||
			activeView.getMode() !== "preview"
		) {
			return null;
		}
		const source =
			activeView.editor
				? activeView.editor.getValue()
				: markdown;
		if (source === undefined) return null;
		const snapshot = this.reconcileStudyForSource(path, source, cache);
		if (!snapshot) return null;
		this.moveStudyProjectionTo(activeView, "preview");
		return this.studyProjection(snapshot, path, activeView);
	}

	private activeReadingContainer(
		path: string,
		block: HTMLElement
	): HTMLElement | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.file?.path !== path || view.getMode() !== "preview") {
			return null;
		}
		return (
			block.closest<HTMLElement>(".markdown-preview-view") ??
			view.containerEl.querySelector<HTMLElement>(".markdown-preview-view") ??
			view.containerEl
		);
	}

	private refreshStudyProjections(): void {
		this.refreshEditorCues();
		this.refreshReadingModeSurface();
	}

	private readingMapFor(
		path: string,
		text: string,
		cache: NoteCache,
		visibility: ReadingCueVisibility
	): Map<number, CueLineData> {
		if (
			this.readingCueMemo &&
			this.readingCueMemo.path === path &&
			this.readingCueMemo.text === text &&
			this.readingCueMemo.showSummary === visibility.showSummary &&
			this.readingCueMemo.showQuestion === visibility.showQuestion &&
			this.readingCueMemo.showTerms === visibility.showTerms
		) {
			return this.readingCueMemo.map;
		}
		const map = buildReadingCueMap(cache, text, {
			...visibility,
		});
		this.readingCueMemo = {
			path,
			text,
			...visibility,
			map,
		};
		return map;
	}

	private maybeInsertReadingNoteBriefEl(
		cache: NoteCache,
		firstCueLine: number | undefined,
		info: ReturnType<MarkdownPostProcessorContext["getSectionInfo"]>,
		heading: HTMLElement
	): boolean {
		if (!info || !this.settings.showNoteBrief || !cache.noteBrief) return false;
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
	private buildReadingCueEl(
		cue: CueLineData,
		visibility: ReadingCueVisibility
	): HTMLElement {
		const root = createDiv({ cls: "cuecraft-cue cuecraft-cue-reading" });
		root.addClass(cueFontSizeClass(this.settings.cueFontSize));
		root.dataset.cuecraftSectionId = cue.sectionId;
		root.setAttr("role", "note");
		if (cue.error) {
			root.addClass("cuecraft-cue-error");
			root.setAttr("title", cue.error);
			root.createDiv({
				cls: "cuecraft-cue-question",
				text: "\u26a0 Generation failed \u2014 regenerate",
			});
			return root;
		}
		appendSummary(root, cue.summary);
		if (visibility.showQuestion) {
			root.createDiv({ cls: "cuecraft-cue-question", text: cue.question });
		}
		if (cue.keywords.length) {
			root.createDiv({
				cls: "cuecraft-cue-keywords",
				text: cue.keywords.join(" \u00b7 "),
			});
		}
		return root;
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
		const fetchImpl: typeof fetch = async (input, init) => {
			const request = new Request(input, init);
			const headers: Record<string, string> = {};
			request.headers.forEach((value, key) => {
				headers[key] = value;
			});
			// Request has already serialized every standard BodyInit. Obsidian accepts
			// the resulting bytes, including empty bodies, but not a live stream.
			const body =
				request.body === null
					? undefined
					: await withAbortSignal(
							() => request.arrayBuffer(),
							request.signal
						);
			const requestParams: RequestUrlParam = {
				url: request.url,
				method: request.method,
				body,
				headers,
				throw: false,
			};
			const res = await withAbortSignal(
				() => requestUrl(requestParams),
				request.signal
			);
			return new Response(res.arrayBuffer, {
				status: res.status,
				headers: res.headers,
			});
		};
		return fetchImpl;
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
		return {
			questionType: this.settings.questionType,
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
			new Notice("CueCraft: generate Section cues for this note first.");
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
			void this.regenerateSection(file, s.id);
		}).open();
	}

	/**
	 * Regenerate the cue for a single section (by id) and merge it back into the
	 * cache. Public so callers can target an explicit note and section.
	 */
	async regenerateSection(file: TFile, sectionId: string): Promise<void> {
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
			const [result] = await generateSectionCueBatch({
				sections: [section],
				provider,
				options: this.generationOptions(),
				noteContext: markdown,
				signal: controller.signal,
			});
			if (!result) throw new Error("Provider returned no Section cue for this section.");
			if (controller.signal.aborted && result.error) return;

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
				new Notice(`CueCraft: regenerated Section cue for "${section.heading}".`);
			}
		} catch (e) {
			console.error("CueCraft section regen failed", e);
			new Notice("CueCraft: section regeneration failed. See console.");
		} finally {
			this.currentRun = null;
			await this.updateStatusForFile(this.app.workspace.getActiveFile());
			this.renderCues(file);
		}
	}

	/**
	 * Regenerate only sections that need provider work, then reconcile cached
	 * section order/metadata with the current note. Defaults to the active note.
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
				const results = await generateSectionCueBatch({
					sections: batch,
					provider,
					options: this.generationOptions(),
					noteContext: markdown,
					signal: controller.signal,
				});
				for (const result of results) {
					if (controller.signal.aborted && result.error) continue;
					generated.push(toCachedSection(result));
					if (result.error) failed++;
					done++;
					this.setStatus("generating", { done, total: sectionIds.length });
				}
				const working = reconcileCacheSections(cache, sections, generated, {
					noteModifiedAt: file.stat.mtime,
				});
				await this.cacheStore.set(file.path, working);
				if (controller.signal.aborted) break;
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
						preset: this.settings.questionType,
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
			const results = await generateSectionCueBatch({
				sections: batch,
				provider,
				options: this.generationOptions(),
				noteContext: markdown,
				signal: controller.signal,
			});
			for (const result of results) {
				if (controller.signal.aborted && result.error) continue;
				generated.push(toCachedSection(result));
				if (result.error) failed++;
				else completed++;
				onProgress?.(1);
			}
			const working = reconcileCacheSections(cache, sections, generated, {
				noteModifiedAt: file.stat.mtime,
			});
			await this.cacheStore.set(file.path, working);
			if (controller.signal.aborted) break;
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
		this.refreshStudyEntryStates();
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
				preset: this.settings.questionType,
				generationMode: "whole-note-context",
				noteModifiedAt: file.stat.mtime,
			});
			await this.cacheStore.set(file.path, cache);
			// Generating for a note implies you want to see its Section cues.
			await this.visibility.show(file.path);

			const ok = result.sections.filter((s) => !s.error).length;
			const failed = result.sections.length - ok;
			if (result.canceled) {
				new Notice(`CueCraft: cancelled - kept ${ok} section(s).`);
			} else if (!opts.automatic) {
				const sectionCueCount = `${ok} Section ${ok === 1 ? "cue" : "cues"}`;
				new Notice(
					`CueCraft: generated ${sectionCueCount}` +
						(failed ? `, ${failed} failed` : "") +
						(result.noteBrief ? " + Note Brief." : ".")
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
		}
	}

	private async clearCues(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("CueCraft: open a note first.");
			return;
		}
		if (!this.cacheStore.has(file.path)) {
			new Notice("CueCraft: no generated study material to clear for this note.");
			return;
		}
		this.endStudyForPath(file.path);
		await this.cacheStore.delete(file.path);
		new Notice("CueCraft: cleared generated study material for this note.");
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
			new Notice("CueCraft: generated study material enabled for this note.");
		} else {
			await this.visibility.hide(file.path);
			new Notice("CueCraft: generated study material hidden for this note.");
		}
		const active = this.app.workspace.getActiveFile();
		await this.updateStatusForFile(active);
		if (active) {
			this.renderCues(active);
			this.refreshActiveReadingView(active);
		}
		this.refreshStudyEntryStates();
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
		summary: result.summary,
		error: result.error,
	};
}

class RegenerateSettingsModal extends Modal {
	constructor(
		app: InstanceType<typeof Plugin>["app"],
		private readonly noteName: string,
		private readonly onConfirm: () => void
	) {
		super(app);
	}

	override onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Regenerate Section cues with new settings?" });
		contentEl.createEl("p", {
			text: `CueCraft settings that affect generated Questions changed. Regenerate cached Section cues for "${this.noteName}" now?`,
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

	override onClose(): void {
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
