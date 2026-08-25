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
	FirstRecallSettings,
	FirstRecallSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";
import { normalizeEditorCueCustomWidthPx } from "./editor-cue-width";
import { EditorCueWidthPreviewScheduler } from "./editor-cue-width-preview";
import {
	type ByokProviderId,
	type ByokTransport,
	isByokProviderId,
} from "@swartzrock/byok-runtime";
import { byokProviderDefinition } from "./byok-provider-metadata";
import {
	firstRecallProviderCredential,
	firstRecallProviderCredentialSaved,
	firstRecallProviderModel,
	firstRecallSelectedProvider,
	clearFirstRecallStoredCloudCredential,
	markFirstRecallCloudCredentialSaved,
	secureFirstRecallCloudCredentials,
	listFirstRecallProviderModelsFromStore,
	makeFirstRecallByokProviderFromStore,
	makeFirstRecallHostedDemoProvider,
	type FirstRecallFetchedModelProvider,
} from "./byok-firstrecall-adapter";
import type { FirstRecallCueProviderRuntime } from "./cue-provider";
import {
	createSecureCredentialStore,
	type FirstRecallCloudCredentialProvider,
	type SecureCredentialStore,
} from "./secure-credential-store";
import { parseSections, type Section } from "./parser";
import {
	hasUsableCues,
	normalizeCacheMap,
	type NoteCache,
} from "./cache";
import {
	StudyMaterialStore,
	classifyStudyMaterial,
	normalizeMaintenanceStateMap,
	reduceMaintenanceState,
	type MaintenanceStateMap,
	type StudyMaterialClassification,
} from "./study-material-state";
import {
	StudyMaterialMaintenance,
	type MaintenanceOperationKind,
	type MaintenanceOutcome,
} from "./study-material-maintenance";
import {
	applyEditorCueWidthPreview,
	buildCueLineData,
	cueSectionCollapsedState,
	cueEditorExtension,
	railLayoutAppliesToDisplay,
	renderCueElement,
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
	exportFilePath,
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
import {
	asUpdatingProjection,
	projectStudyMaterialStatus,
	statusLabel,
	type CueStatus,
	type StudyMaterialStatusProjection,
} from "./status";
import {
	removeStudyMaterialBanner,
	syncStudyMaterialBanner,
} from "./study-material-banner";
import { formatFirstRecallNotice } from "./notice";
import { parsePersistedFirstRecallSettings } from "./persisted-settings";
import {
	EditorHookLayoutController,
	leftDockIsOpen,
} from "./editor-hook-layout";
import {
	findMaintainedStudyAreaForPath,
	isDescendantPath,
	normalizeVaultPath,
	planStudyAreaGeneration,
	studyAreaNameForParentPath,
	summarizeStudyAreaRun,
	validateStudyAreaScope,
	type StudyArea,
	type StudyAreaGenerationPlan,
	type StudyAreaPlanMode,
	type StudyAreaRunSummary,
} from "./study-area";

interface PluginData {
	settings: FirstRecallSettings;
	caches: Record<string, NoteCache>;
	maintenanceStates: MaintenanceStateMap;
	hidden: Record<string, true>;
	cueSectionCollapse: CueSectionCollapseMap;
	installationId?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
	return typeof value === "string" &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			value
		);
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

const MENU_NOTE_ICON = "graduation-cap";
const STUDY_RIBBON_ICON = "book-open-check";
const FIRSTRECALL_HEADER_ICON = "brain";
const STUDY_GENERATE_FIRST = "FirstRecall: generate study material for this note first.";
const STUDY_MENU_HINT = "Generate study material for this note.";
type StudyProjectionMode = "source" | "preview";

export default class FirstRecallPlugin extends Plugin {
	override settings: FirstRecallSettings = DEFAULT_SETTINGS;

	private statusBarEl: HTMLElement | null = null;
	private readonly studySession = new StudySessionController();
	private readonly studyHeaderMenuActions = new WeakMap<MarkdownView, HTMLElement>();
	private readonly studyHeaderActionElements = new Set<HTMLElement>();
	private readonly studyMaterialBannerContainers = new Set<HTMLElement>();
	private readonly studyMaterialBannerContainerByView = new WeakMap<
		MarkdownView,
		HTMLElement
	>();
	private projectedStudySurface: {
		view: MarkdownView;
		mode: StudyProjectionMode;
	} | null = null;
	private maintenance!: StudyMaterialMaintenance;
	private editorLayoutFrame: number | null = null;
	private editorCueWidthPreviewScheduler: EditorCueWidthPreviewScheduler | null =
		null;
	private editorHookLayout = new EditorHookLayoutController();
	private cueSettingsChanged = false;
	private data: PluginData = {
		settings: DEFAULT_SETTINGS,
		caches: {},
		maintenanceStates: {},
		hidden: {},
		cueSectionCollapse: {},
	};
	private retainedCaches: Record<string, unknown> = {};
	private pluginDataWrite: Promise<void> = Promise.resolve();
	private settingTab!: FirstRecallSettingTab;
	private cacheStore!: StudyMaterialStore;
	private visibility!: VisibilityStore;
	private cueSectionCollapse!: CueSectionCollapseStore;
	private credentialStore!: SecureCredentialStore;
	private credentialStorageWarnings: string[] = [];
	private readonly hostedDemoSessionId = crypto.randomUUID();
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

		this.cacheStore = new StudyMaterialStore(
			this.data.caches,
			this.data.maintenanceStates,
			async (caches, maintenanceStates) => {
			for (const path of Object.keys(caches)) {
				delete this.retainedCaches[path];
			}
			this.data.caches = caches;
			this.data.maintenanceStates = maintenanceStates;
			await this.persistPluginData();
			}
		);
		this.maintenance = new StudyMaterialMaintenance({
			readSource: async (path) => {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile) || file.extension !== "md") return null;
				return {
					path: file.path,
					noteTitle: file.basename,
					markdown: await this.app.vault.cachedRead(file),
					modifiedAt: file.stat.mtime,
				};
			},
			isAutomaticAllowed: (path) => Boolean(
				findMaintainedStudyAreaForPath(this.settings.studyAreas, path)
			),
			getCache: (path) => this.cacheStore.get(path),
			getState: (path) => this.cacheStore.getState(path),
			commit: (path, cache, state) => this.cacheStore.commit(path, cache, state),
			renamePath: (from, to) => this.cacheStore.rename(from, to),
			deletePath: (path) => this.cacheStore.delete(path),
			makeProvider: (automatic) => this.makeProviderForRun({ automatic }),
			providerMetadata: () => ({
				provider: firstRecallSelectedProvider(this.settings) ?? "",
				model: this.selectedModelName(),
				preset: this.settings.questionType,
				generationMode: "whole-note-context",
			}),
			generationOptions: () => this.generationOptions(),
			sectionConcurrency: () => this.settings.sectionConcurrency,
			timerApi: window,
			onCommitted: (path) => {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) this.refreshGeneratedSurfaces(file);
			},
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

		this.settingTab = new FirstRecallSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("firstrecall-status");
		this.statusBarEl.addEventListener("click", () => this.onPillClick());
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
				this.pruneStudyMaterialBannerContainers();
				this.scheduleEditorLayoutRefresh();
				this.refreshStudyEntryStates();
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.endStudyForPath(oldPath);
				if (file instanceof TFile) {
					void (async () => {
						await this.maintenance.rename(oldPath, file.path);
						await this.visibility.rename(oldPath, file.path);
						await this.maintenance.observe(file.path);
						this.scheduleStudyAreaMaintenance(file);
					})();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.endStudyForPath(file.path);
				void this.maintenance.delete(file.path);
			})
		);
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile) this.scheduleAutoGenerate(file);
			})
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
			this.onActiveFile(this.app.workspace.getActiveFile());
		});
	}

	override onunload(): void {
		this.endStudySession({ refresh: false, updateIdleStatus: false });
		for (const action of this.studyHeaderActionElements) action.remove();
		this.studyHeaderActionElements.clear();
		for (const container of this.studyMaterialBannerContainers) {
			removeStudyMaterialBanner(container);
		}
		this.studyMaterialBannerContainers.clear();
		this.flushEditorCueWidthPreview(null);
		this.editorCueWidthPreviewScheduler = null;
		this.maintenance?.dispose();
		if (this.editorLayoutFrame !== null) {
			window.cancelAnimationFrame(this.editorLayoutFrame);
			this.editorLayoutFrame = null;
		}
	}

	private async loadPluginData(): Promise<void> {
		const loaded: unknown = await this.loadData();
		const loadedRecord = isRecord(loaded) ? loaded : {};
		const rawSettings = loadedRecord.settings;
		const parsedSettings = parsePersistedFirstRecallSettings(rawSettings);
		const settings = parsedSettings.settings;
		const credentialStorage = await secureFirstRecallCloudCredentials(
			settings,
			this.credentialStore
		);
		this.credentialStorageWarnings = credentialStorage.warnings;
		const settingsChanged = parsedSettings.changed;
		const rawCaches = isRecord(loadedRecord.caches)
			? loadedRecord.caches
			: {};
		const {
			caches,
			retainedCaches,
			changed: cachesChanged,
		} = normalizeCacheMap(rawCaches);
		const {
			states: maintenanceStates,
			changed: maintenanceStatesChanged,
		} = normalizeMaintenanceStateMap(loadedRecord.maintenanceStates, caches);
		const hidden = loadHiddenMap(loadedRecord.hidden);
		const cueSectionCollapse = loadCueSectionCollapseMap(
			loadedRecord.cueSectionCollapse
		);
		this.retainedCaches = retainedCaches;
		this.data = {
			settings,
			caches,
			maintenanceStates,
			hidden,
			cueSectionCollapse,
			...(Object.prototype.hasOwnProperty.call(loadedRecord, "installationId")
				? { installationId: loadedRecord.installationId }
				: {}),
		};
		this.settings = this.data.settings;
		if (
			credentialStorage.settingsChanged ||
			cachesChanged ||
			maintenanceStatesChanged ||
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
		if (options.refreshReviewSurfaces !== false) this.refreshStudyProjections();
		void this.updateStatusForFile(this.app.workspace.getActiveFile());
	}

	private studyMaterialProjection(
		file: TFile,
		markdown: string
	): {
		classification: StudyMaterialClassification;
		projection: StudyMaterialStatusProjection;
	} {
		const classification = classifyStudyMaterial({
			noteTitle: file.basename,
			markdown,
			currentSections: parseSections(markdown),
			cache: this.cacheStore.get(file.path),
			state: this.cacheStore.getState(file.path),
		});
		return {
			classification,
			projection: projectStudyMaterialStatus({
				coverage: findMaintainedStudyAreaForPath(
					this.settings.studyAreas,
					file.path
				)
					? "automatic"
					: "manual",
				classification,
				providerConfigured: this.isConfigured(),
			}),
		};
	}

	private async setUpdatingStatusForFile(file: TFile): Promise<void> {
		if (this.app.workspace.getActiveFile()?.path !== file.path) return;
		const markdown = await this.app.vault.cachedRead(file);
		if (this.app.workspace.getActiveFile()?.path !== file.path) return;
		const projection = this.studyMaterialProjection(file, markdown).projection;
		this.setStudyMaterialStatus(asUpdatingProjection(projection));
	}

	/** Sets the primary status from note coverage and generated-material freshness. */
	private async updateStatusForFile(file: TFile | null): Promise<void> {
		if (!file) {
			this.setStatus(this.isConfigured() ? "ready" : "setup");
			return;
		}
		const markdown = await this.app.vault.cachedRead(file);
		if (
			this.app.workspace.getActiveFile()?.path !== file.path
		) {
			return;
		}
		this.setStudyMaterialStatus(
			this.studyMaterialProjection(file, markdown).projection
		);
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
		if (!file) {
			const container = this.studyControlsContainer(view);
			removeStudyMaterialBanner(container);
			this.studyMaterialBannerContainers.delete(container);
			return;
		}
		const cm = (view.editor as unknown as { cm?: EditorView }).cm;
		if (!cm) return;

		const cache = this.cacheStore.get(file.path);
		const markdown = view.editor.getValue();
		const material = this.studyMaterialProjection(file, markdown);
		this.syncStudyMaterialBannerForView(
			this.studyControlsContainer(view),
			file,
			material.projection,
			view
		);
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
				? buildCueLineData(cache, parseSections(markdown), {
						showSummary: this.settings.showSummary,
						showQuestion: this.settings.showQuestion || Boolean(study),
						showTerms: this.settings.showTerms,
						sectionFreshness: new Map(
							material.classification.sections.map((section) => [
								section.id,
								section.freshness,
							])
						),
					})
				: [];
		cm.dom.dataset.firstrecallEditorDisplay = this.settings.editorCueDisplay;
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
				noteBriefFreshness: material.classification.noteBrief,
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

	private syncStudyMaterialBannerForView(
		container: HTMLElement,
		file: TFile,
		projection: StudyMaterialStatusProjection,
		view?: MarkdownView
	): void {
		const previous = view
			? this.studyMaterialBannerContainerByView.get(view)
			: undefined;
		if (previous && previous !== container) {
			removeStudyMaterialBanner(previous);
			this.studyMaterialBannerContainers.delete(previous);
		}
		if (view) this.studyMaterialBannerContainerByView.set(view, container);
		const host = syncStudyMaterialBanner(container, projection.banner, {
			onUpdate: () => this.runBannerMaintenance(file, "update", projection),
			onRetry: () => this.runBannerMaintenance(file, "retry", projection),
			onDismiss: (revision) => this.dismissStudyMaterialBanner(file, revision),
		});
		if (host) this.studyMaterialBannerContainers.add(container);
		else this.studyMaterialBannerContainers.delete(container);
	}

	private pruneStudyMaterialBannerContainers(): void {
		for (const container of this.studyMaterialBannerContainers) {
			if (container.isConnected) continue;
			removeStudyMaterialBanner(container);
			this.studyMaterialBannerContainers.delete(container);
		}
	}

	private async runBannerMaintenance(
		file: TFile,
		kind: "update" | "retry",
		projection: StudyMaterialStatusProjection
	): Promise<void> {
		if (!this.isConfigured()) {
			new Notice("FirstRecall: set up your AI provider in Settings first.");
			this.openSettings();
			return;
		}
		this.setStudyMaterialStatus(asUpdatingProjection(projection));
		const outcome = await this.maintenance.request({ path: file.path, kind });
		this.noticeForMaintenanceOutcome(outcome);
		this.refreshGeneratedSurfaces(file);
		await this.updateStatusForFile(this.app.workspace.getActiveFile());
	}

	private async dismissStudyMaterialBanner(
		file: TFile,
		revision: string
	): Promise<void> {
		let state = this.cacheStore.getState(file.path);
		if (!state || state.sourceRevision !== revision) {
			await this.maintenance.observe(file.path);
			state = this.cacheStore.getState(file.path);
		}
		if (!state || state.sourceRevision !== revision) return;
		const dismissed = reduceMaintenanceState(state, {
			type: "banner-dismissed",
			revision,
		});
		await this.cacheStore.commit(file.path, this.cacheStore.get(file.path), dismissed);
		this.refreshGeneratedSurfaces(file);
		await this.updateStatusForFile(this.app.workspace.getActiveFile());
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
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile?.path === path) {
			this.setStudyMaterialStatus(
				this.studyMaterialProjection(activeFile, markdown).projection
			);
		}
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

	private ensureFirstRecallHeaderMenuAction(view: MarkdownView): HTMLElement {
		const existing = this.studyHeaderMenuActions.get(view);
		if (existing) return existing;
		const action = view.addAction(FIRSTRECALL_HEADER_ICON, "FirstRecall", (event) =>
			this.openFirstRecallMenu(view, action, event)
		);
		action.classList.add("firstrecall-study-header-action");
		action.classList.add("firstrecall-study-header-menu-action");
		const label = action.ownerDocument.createElement("span");
		label.className = "firstrecall-study-header-label";
		label.textContent = "FirstRecall";
		action.appendChild(label);
		action.tabIndex = 0;
		action.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			this.openFirstRecallMenu(view, action, event);
		});
		this.studyHeaderMenuActions.set(view, action);
		this.studyHeaderActionElements.add(action);
		return action;
	}

	private openFirstRecallMenu(
		view: MarkdownView,
		anchor: HTMLElement,
		event?: Event
	): void {
		const file = view.file;
		if (!file) return;
		const canStudy = this.strictStudySections(view).length > 0;
		const hasUsableCueCache = this.hasUsableCueCache(file.path);
		const current = this.studySession.snapshot();
		const isStudying = current.active && current.path === file.path;
		const hidden = this.visibility.isHidden(file.path);
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("Generate study material for this note")
				.setIcon(MENU_NOTE_ICON)
				.onClick(() => this.generateCuesForFile(file))
		);
		menu.addItem((item) =>
			item
				.setTitle(isStudying ? "Exit Study" : "Study this note")
				.setIcon(STUDY_RIBBON_ICON)
				.setDisabled(!canStudy)
				.onClick(this.toggleStudyForActiveView)
		);
		menu.addItem((item) =>
			item
				.setTitle(visibilityMenuLabel(hidden))
				.setDisabled(!this.cacheStore.has(file.path))
				.setIcon(MENU_NOTE_ICON)
				.onClick(() => void this.setNoteVisibility(hidden, file))
		);
		menu.addItem((item) =>
			item
				.setTitle("Export Recall Questions and Key Terms to Markdown")
				.setDisabled(!hasUsableCueCache)
				.onClick(() => void this.exportCues("markdown"))
		);
		menu.addItem((item) =>
			item
				.setTitle(
					"Export Recall Questions and Key Terms to Anki (TSV)"
				)
				.setDisabled(!hasUsableCueCache)
				.onClick(() => void this.exportCues("anki"))
		);
		const openEvent =
			event instanceof MouseEvent
				? event
				: new MouseEvent("contextmenu", this.menuMouseEventInit(anchor));
		menu.showAtMouseEvent(openEvent);
	}

	private menuMouseEventInit(anchor: HTMLElement): {
		bubbles: boolean;
		clientX: number;
		clientY: number;
		view: Window;
	} {
		const rect = anchor.getBoundingClientRect();
		return {
			bubbles: true,
			clientX: rect.left + 2,
			clientY: rect.bottom + 2,
			view: window,
		};
	}

	private updateStudyHeaderAction(view: MarkdownView): void {
		if (
			typeof (view as MarkdownView & { addAction?: unknown }).addAction !==
			"function"
		) {
			return;
		}
		this.ensureFirstRecallHeaderMenuAction(view);
		const menuAction = this.studyHeaderMenuActions.get(view);
		const file = view.file;
		const active =
			this.studySession.snapshot().active &&
			this.studySession.snapshot().path === view.file?.path;
		const needsMaterial =
			!file || !this.hasUsableCueCache(file.path);
		if (!menuAction) return;
		menuAction.classList.toggle("firstrecall-has-no-material", needsMaterial);
		menuAction.setAttribute(
			"aria-label",
			needsMaterial ? STUDY_MENU_HINT : "FirstRecall"
		);
		menuAction.title = needsMaterial ? STUDY_MENU_HINT : "FirstRecall";
		menuAction.setAttribute("aria-pressed", String(active));
		menuAction.classList.toggle("is-active", active);
		menuAction.removeAttribute("aria-disabled");
	}

	private refreshStudyEntryStates(): void {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view.getViewType() !== "markdown") return;
			this.updateStudyHeaderAction(leaf.view as MarkdownView);
		});
	}

	private toggleStudyForActiveView = (): void => {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice("FirstRecall: open a Markdown note to study.");
			return;
		}
		this.toggleStudyForView(view);
	};

	private toggleStudyForView(view: MarkdownView): void {
		if (this.app.workspace.getActiveViewOfType(MarkdownView) !== view) {
			this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
		}
		const file = view.file;
		if (!file) {
			new Notice("FirstRecall: open a Markdown note to study.");
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
		this.setStudyMaterialStatus(
			this.studyMaterialProjection(file, view.editor.getValue()).projection
		);
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
			const display = cm.dom.dataset.firstrecallEditorDisplay;
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

	/** Rerender FirstRecall's CodeMirror cue surface in every open Markdown editor. */
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
			if (typeof view.getMode !== "function" || view.getMode() !== "preview") {
				continue;
			}
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
		const provider = firstRecallSelectedProvider(this.settings);
		if (!provider) return false;
		if (provider === "hosted-demo") return true;
		const definition = byokProviderDefinition(provider);
		const hasCredential =
			definition.credentialKind === "api-key"
				? this.credentialStore.availability().ok &&
					firstRecallProviderCredentialSaved(this.settings)
				: firstRecallProviderCredential(this.settings).trim().length > 0;
		const hasModel =
			definition.modelBehavior === "optional" ||
			firstRecallProviderModel(this.settings).trim().length > 0;
		return hasCredential && hasModel;
	}

	/** Public view of {@link isConfigured} for the settings tab. */
	isProviderConfigured(): boolean {
		return this.isConfigured();
	}

	secureCredentialStorageStatus() {
		return this.credentialStore.availability();
	}

	secureCredentialWarnings(): string[] {
		return [...this.credentialStorageWarnings];
	}

	isProviderCredentialSaved(provider?: ByokProviderId): boolean {
		const selectedProvider = firstRecallSelectedProvider(this.settings);
		provider ??= selectedProvider && isByokProviderId(selectedProvider)
			? selectedProvider
			: undefined;
		if (!provider) return false;
		return firstRecallProviderCredentialSaved(this.settings, provider);
	}

	async saveCloudProviderCredential(
		provider: FirstRecallCloudCredentialProvider,
		value: string
	): Promise<{ ok: boolean; message?: string }> {
		const result = await this.credentialStore.save(provider, value);
		if (!result.ok || !result.metadata) {
			return { ok: false, message: result.message ?? result.reason };
		}
		markFirstRecallCloudCredentialSaved(
			this.settings,
			provider,
			result.metadata.token,
			result.metadata.length
		);
		return { ok: true };
	}

	async clearCloudProviderCredential(
		provider: FirstRecallCloudCredentialProvider
	): Promise<{ ok: boolean; message?: string }> {
		const result = await this.credentialStore.clear(provider);
		if (!result.ok) {
			return { ok: false, message: result.message ?? result.reason };
		}
		clearFirstRecallStoredCloudCredential(this.settings, provider);
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
				? `FirstRecall: generating ${progress.done}/${progress.total}${unit}`
				: `FirstRecall: ${statusLabel(status)}`;
		this.statusBarEl.setText(label);
		this.statusBarEl.dataset.status = status;
		delete this.statusBarEl.dataset.coverage;
		delete this.statusBarEl.dataset.freshness;
		delete this.statusBarEl.dataset.providerSetupRequired;
		this.statusBarEl.setAttribute("role", status === "generating" ? "status" : "button");
		this.statusBarEl.setAttribute("aria-live", "polite");
		this.statusBarEl.style.cursor =
			pillAction(status) === "none" ? "default" : "pointer";
	}

	private setStudyMaterialStatus(
		projection: StudyMaterialStatusProjection
	): void {
		if (!this.statusBarEl) return;
		const setup = projection.providerSetupRequired ? " · AI setup needed" : "";
		this.statusBarEl.setText(`FirstRecall: ${projection.statusLabel}${setup}`);
		this.statusBarEl.dataset.status = projection.freshness ?? "manual";
		this.statusBarEl.dataset.coverage = projection.coverage;
		this.statusBarEl.dataset.freshness = projection.freshness ?? "none";
		this.statusBarEl.dataset.providerSetupRequired = String(
			projection.providerSetupRequired
		);
		this.statusBarEl.setAttribute("role", "status");
		this.statusBarEl.setAttribute("aria-live", "polite");
		this.statusBarEl.setAttribute("aria-atomic", "true");
		this.statusBarEl.style.cursor = projection.providerSetupRequired
			? "pointer"
			: "default";
	}

	/** Open Settings on the FirstRecall tab. */
	private openSettings(subpage?: "study-areas"): void {
		if (subpage === "study-areas") {
			this.settingTab.openStudyAreas();
		}
		// @ts-expect-error - setting is available on the desktop app.
		this.app.setting?.open?.();
		// @ts-expect-error - openTabById is available on the desktop app.
		this.app.setting?.openTabById?.(this.manifest.id);
	}

	/** Status-pill click: open settings when unconfigured, else toggle visibility. */
	private onPillClick(): void {
		const status = this.statusBarEl?.dataset.status ?? "";
		if (this.statusBarEl?.dataset.providerSetupRequired === "true") {
			this.openSettings();
			return;
		}
		if (this.statusBarEl?.dataset.coverage) return;
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
				.setIcon(MENU_NOTE_ICON)
				.onClick(() => void this.setNoteVisibility(hidden, file))
		);
		// "Review" is only meaningful once a note has usable section cards to study.
		if (this.hasUsableCueCache(file.path)) {
			menu.addItem((item) =>
				item
					.setTitle("FirstRecall: Start Study Mode")
					.setIcon(STUDY_RIBBON_ICON)
					.onClick(() => void this.reviewThisNote(file))
			);
		}
	}

	private registerCommands(): void {
		this.addCommand({
			id: "generate-cues",
			name: "Generate study material for this note",
			callback: () => this.generateCues(),
		});
		this.addCommand({
			id: "regenerate-section",
			name: "Update a section card and Note Brief\u2026",
			callback: () => this.pickAndRegenerateSection(),
		});
		this.addCommand({
			id: "clear-cues",
			name: "Clear Generated Study Material",
			callback: () => this.clearCues(),
		});
		this.addCommand({
			id: "export-cues-markdown",
			name: "Export Recall Questions and Key Terms to Markdown",
			callback: () => void this.exportCues("markdown"),
		});
		this.addCommand({
			id: "export-cues-anki",
			name: "Export Recall Questions and Key Terms to Anki (TSV)",
			callback: () => void this.exportCues("anki"),
		});
	}

	/**
	 * Export the active note's usable recall questions and key terms to a sibling file: a Markdown study
	 * sheet or Anki-importable TSV. Never touches the source note.
	 */
	private async exportCues(format: "markdown" | "anki"): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("FirstRecall: open a note to export its recall questions and key terms.");
			return;
		}
		const cache = this.cacheStore.get(file.path);
		const questions = cache ? selectExportableQuestions(cache) : [];
		if (questions.length === 0) {
			new Notice("FirstRecall: no usable recall questions and key terms to export \u2014 generate first.");
			return;
		}
		const dir =
			file.parent && file.parent.path !== "/" ? `${file.parent.path}/` : "";
		const outPath = exportFilePath(
			dir,
			file.basename,
			format
		);
		const content =
			format === "markdown"
				? questionsAndTermsToMarkdown(file.basename, questions)
				: questionsAndTermsToAnki(questions);
		const existing = this.app.vault.getAbstractFileByPath(outPath);
		let out: TFile;
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
			out = existing;
		} else {
			out = await this.app.vault.create(outPath, content);
		}
		const questionCount = `${questions.length} recall ${
			questions.length === 1 ? "question" : "questions"
		}`;
		new Notice(`FirstRecall: exported ${questionCount} and key terms to ${outPath}`);
		if (format === "markdown") {
			await this.app.workspace.getLeaf(true).openFile(out);
		}
	}

	/** Start an idempotent in-note Study session, activating only a requested note. */
	private async reviewThisNote(target?: TFile): Promise<void> {
		const file = target ?? this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("FirstRecall: open a note to review.");
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
			new Notice("FirstRecall: open the note in Markdown view to study.");
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
		this.setStudyMaterialStatus(
			this.studyMaterialProjection(file, view.editor.getValue()).projection
		);
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
		freshnessKey: string;
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
		const sourceFile = activeView?.file?.path === path ? activeView.file : null;
		const sourceMarkdown =
			firstInfo?.text ??
			(activeView?.file?.path === path ? activeView.editor?.getValue() : undefined);
		const material = sourceFile && sourceMarkdown !== undefined
			? this.studyMaterialProjection(sourceFile, sourceMarkdown)
			: null;
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
			for (const cue of el.querySelectorAll(".firstrecall-cue-reading")) {
				cue.remove();
			}
		}
		if (!noteBriefState.showNoteBrief) {
			for (const noteBrief of el.querySelectorAll(".firstrecall-note-brief")) {
				noteBrief.remove();
			}
		}
		const readingContainer = this.activeReadingContainer(path, el);
		if (readingContainer) {
			if (material && sourceFile) {
				this.syncStudyMaterialBannerForView(
					readingContainer,
					sourceFile,
					material.projection,
					activeView ?? undefined
				);
			} else {
				removeStudyMaterialBanner(readingContainer);
				this.studyMaterialBannerContainers.delete(readingContainer);
			}
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
			const map = this.readingMapFor(
				path,
				info.text,
				cache,
				cueVisibility,
				material?.classification.sections ?? []
			);
			if (noteBriefState.showNoteBrief) {
				this.maybeInsertReadingNoteBriefEl(
					cache,
					noteBriefAnchorLine,
					info,
					heading,
					material?.classification.noteBrief ?? "current"
				);
			}
			if (!displayState.showInlineCues) {
				continue;
			}
			const cue = map.get(info.lineStart + 1);
			const next = heading.nextElementSibling;
			if (!cue) {
				if (next?.hasClass("firstrecall-cue-reading")) next.remove();
				continue;
			}
			if (
				next?.hasClass("firstrecall-cue-reading") &&
				(next as HTMLElement).dataset.firstrecallSectionId === cue.sectionId
			) {
				next.replaceWith(this.buildReadingCueEl(path, cue, cueVisibility));
				continue;
			}
			heading.insertAdjacentElement(
				"afterend",
				this.buildReadingCueEl(path, cue, cueVisibility)
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
		visibility: ReadingCueVisibility,
		sectionFreshness: StudyMaterialClassification["sections"]
	): Map<number, CueLineData> {
		const freshnessKey = sectionFreshness
			.map((section) => `${section.id}:${section.freshness}`)
			.join("\u0001");
		if (
			this.readingCueMemo &&
			this.readingCueMemo.path === path &&
			this.readingCueMemo.text === text &&
			this.readingCueMemo.freshnessKey === freshnessKey &&
			this.readingCueMemo.showSummary === visibility.showSummary &&
			this.readingCueMemo.showQuestion === visibility.showQuestion &&
			this.readingCueMemo.showTerms === visibility.showTerms
		) {
			return this.readingCueMemo.map;
		}
		const map = buildReadingCueMap(cache, text, {
			...visibility,
			sectionFreshness: new Map(
				sectionFreshness.map((section) => [section.id, section.freshness])
			),
		});
		this.readingCueMemo = {
			path,
			text,
			freshnessKey,
			...visibility,
			map,
		};
		return map;
	}

	private maybeInsertReadingNoteBriefEl(
		cache: NoteCache,
		firstCueLine: number | undefined,
		info: ReturnType<MarkdownPostProcessorContext["getSectionInfo"]>,
		heading: HTMLElement,
		freshness: StudyMaterialClassification["noteBrief"]
	): boolean {
		if (!info || !this.settings.showNoteBrief || !cache.noteBrief) return false;
		if (firstCueLine !== info.lineStart + 1) return false;
		const rendered = renderNoteBriefElement(cache.noteBrief, "reading", freshness);
		const previous = heading.previousElementSibling;
		if (previous && previous.hasClass("firstrecall-note-brief")) {
			previous.replaceWith(rendered);
			return true;
		}
		const parent = heading.parentElement;
		const existing = parent?.querySelector<HTMLElement>(
			":scope > .firstrecall-note-brief"
		);
		if (existing) {
			existing.replaceWith(rendered);
			return true;
		}
		heading.insertAdjacentElement("beforebegin", rendered);
		return true;
	}

	/** Build a Reading View cue with the shared section disclosure state. */
	private buildReadingCueEl(
		notePath: string,
		cue: CueLineData,
		visibility: ReadingCueVisibility
	): HTMLElement {
		const root = renderCueElement(cue, "inline-cues", {
			...visibility,
			cueFontSize: this.settings.cueFontSize,
			collapse: {
				notePath,
				sectionId: cue.sectionId,
				controller: this.cueSectionCollapse,
				collapsed: cueSectionCollapsedState(
					this.cueSectionCollapse,
					notePath,
					cue.sectionId
				),
			},
		});
		root.addClass("firstrecall-cue-reading");
		root.dataset.firstrecallSectionId = cue.sectionId;
		return root;
	}

	/** Mark cue content settings dirty; the settings tab asks on close. */
	noteCueSettingsChanged(): void {
		this.cueSettingsChanged = true;
	}

	/** Ask whether to regenerate after the user leaves FirstRecall settings. */
	promptForCueSettingsRegeneration(): void {
		if (!this.cueSettingsChanged) return;
		this.cueSettingsChanged = false;
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md" || !this.cacheStore.has(file.path)) {
			return;
		}
		new RegenerateSettingsModal(this.app, file.basename, () => {
			void this.generateCuesForFile(file);
		}).open();
	}

	/**
	 * Routes all provider requests through Obsidian's HTTP client to avoid CORS
	 * in Electron. Obsidian buffers responses, so this transport is non-streaming.
	 */
	private makeTransport(): ByokTransport {
		return async (request) => {
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
	}

	/** Build the provider for the current settings. Public so Settings can test it. */
	async makeProvider(): Promise<FirstRecallCueProviderRuntime> {
		if (firstRecallSelectedProvider(this.settings) === "hosted-demo") {
			const installationId = await this.hostedDemoInstallationId();
			return makeFirstRecallHostedDemoProvider({
				transport: this.makeTransport(),
				clientVersion: this.manifest.version,
				installationId,
				sessionId: this.hostedDemoSessionId,
				createOperationId: () => crypto.randomUUID(),
			});
		}
		return makeFirstRecallByokProviderFromStore(this.settings, {
			transport: this.makeTransport(),
		}, this.credentialStore);
	}

	private async hostedDemoInstallationId(): Promise<string> {
		if (isUuid(this.data.installationId)) return this.data.installationId;
		const installationId = crypto.randomUUID();
		this.data.installationId = installationId;
		await this.persistPluginData();
		return installationId;
	}

	async listProviderModels(
		provider: FirstRecallFetchedModelProvider
	) {
		return listFirstRecallProviderModelsFromStore(this.settings, provider, {
			transport: this.makeTransport(),
		}, this.credentialStore);
	}

	private async makeProviderForRun(
		opts: { automatic?: boolean } = {}
	): Promise<FirstRecallCueProviderRuntime | null> {
		try {
			return await this.makeProvider();
		} catch (error) {
			console.error("FirstRecall provider setup failed", error);
			if (!opts.automatic) {
				new Notice(
					formatFirstRecallNotice(
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
		const provider = firstRecallSelectedProvider(this.settings);
		if (!provider) return "";
		if (provider === "hosted-demo") return "Included trial model";
		const model = firstRecallProviderModel(this.settings, provider).trim();
		return byokProviderDefinition(provider).modelBehavior === "optional"
			? model || "CLI default"
			: model;
	}

	private scheduleAutoGenerate(file: TFile): void {
		if (file.extension !== "md") return;
		void this.maintenance.observe(file.path);
		this.scheduleStudyAreaMaintenance(file);
	}

	private scheduleStudyAreaMaintenance(file: TFile): void {
		const area = findMaintainedStudyAreaForPath(
			this.settings.studyAreas,
			file.path
		);
		if (!area) return;
		this.maintenance.scheduleAutomatic(
			file.path,
			this.settings.autoGenerationSettleDelaySeconds
		);
	}

	/** Open a fuzzy picker listing the active note's sections, then regen. */
	private pickAndRegenerateSection(): void {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("FirstRecall: open a note first.");
			return;
		}
		if (!this.isConfigured()) {
			new Notice("FirstRecall: set up your AI provider in Settings first.");
			return;
		}
		if (!this.cacheStore.has(file.path)) {
			new Notice("FirstRecall: generate study material for this note first.");
			return;
		}
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		const sections = parseSections(view.editor.getValue()).filter((s) => s.heading);
		if (!sections.length) {
			new Notice("FirstRecall: no headed sections found.");
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
		if (!this.isConfigured()) {
			new Notice("FirstRecall: set up your AI provider in Settings first.");
			return;
		}
		const cache = this.cacheStore.get(file.path);
		if (!cache) {
			new Notice("FirstRecall: no cache for this note \u2014 run Generate first.");
			return;
		}
		const section = parseSections(await this.app.vault.cachedRead(file)).find(
			(s) => s.id === sectionId
		);
		if (!section) {
			new Notice("FirstRecall: section no longer exists in the note.");
			return;
		}

		await this.setUpdatingStatusForFile(file);
		const outcome = await this.maintenance.request({
			path: file.path,
			kind: "command",
			sectionIds: [sectionId],
		});
		if (outcome.status === "failed") {
			new Notice(`FirstRecall: regeneration failed \u2014 ${outcome.errors.join("; ")}`);
		} else if (outcome.status === "completed") {
			new Notice(`FirstRecall: updated the section card for "${section.heading}".`);
		}
		await this.updateStatusForFile(this.app.workspace.getActiveFile());
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
			if (!opts.automatic) new Notice("FirstRecall: open a note first.");
			return;
		}
		if (!this.isConfigured()) {
			if (!opts.automatic) {
				new Notice("FirstRecall: set up your AI provider in Settings first.");
			}
			return;
		}
		await this.setUpdatingStatusForFile(file);
		const outcome = await this.maintenance.request({
			path: file.path,
			kind: opts.automatic ? "automatic" : "update",
		});
		if (!opts.automatic) this.noticeForMaintenanceOutcome(outcome);
		await this.updateStatusForFile(this.app.workspace.getActiveFile());
	}

	private noticeForMaintenanceOutcome(outcome: MaintenanceOutcome): void {
		if (outcome.status === "failed") {
			new Notice(`FirstRecall: update failed \u2014 ${outcome.errors.join("; ")}`);
		} else if (outcome.status === "completed") {
			new Notice("FirstRecall: study material is up to date.");
		} else if (outcome.status === "skipped" && outcome.reason === "no-work") {
			new Notice("FirstRecall: study material is already up to date.");
		}
	}

	private async generateCues(): Promise<void> {
		await this.generateCuesForFile(this.app.workspace.getActiveFile());
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
		const validation = validateStudyAreaScope(
			this.settings.studyAreas,
			normalized
		);
		if (!validation.valid) {
			new Notice(this.studyAreaScopeConflictNotice(validation.reason));
			return null;
		}
		const area: StudyArea = {
			id: `study-area-${Date.now().toString(36)}`,
			name: studyAreaNameForParentPath(normalized),
			parentPath: normalized,
			excludedPaths: [],
			maintenanceMode: "paused",
			createdAt: new Date().toISOString(),
		};
		this.settings.studyAreas = [...this.settings.studyAreas, area];
		await this.saveSettings();
		return area;
	}

	async updateStudyArea(updated: StudyArea): Promise<void> {
		const validation = validateStudyAreaScope(
			this.settings.studyAreas.filter((area) => area.id !== updated.id),
			updated.parentPath
		);
		if (!validation.valid) {
			new Notice(this.studyAreaScopeConflictNotice(validation.reason));
			return;
		}
		this.settings.studyAreas = this.settings.studyAreas.map((area) =>
			area.id === updated.id ? updated : area
		);
		await this.saveSettings();
	}

	private studyAreaScopeConflictNotice(
		reason: ReturnType<typeof validateStudyAreaScope>["reason"]
	): string {
		if (reason === "duplicate-path") {
			return "FirstRecall: that managed folder coverage already exists.";
		}
		if (reason === "entire-vault-conflict") {
			return "FirstRecall: remove the conflicting Entire vault or folder coverage first.";
		}
		return "FirstRecall: parent and descendant managed folders cannot overlap.";
	}

	async removeStudyArea(areaId: string): Promise<void> {
		this.settings.studyAreas = this.settings.studyAreas.filter(
			(area) => area.id !== areaId
		);
		await this.saveSettings();
	}

	async recoverDisabledStudyArea(
		disabledAreaId: string,
		conflictingAreaId?: string
	): Promise<void> {
		const disabled = this.settings.disabledStudyAreas.find(
			(area) => area.id === disabledAreaId
		);
		if (!disabled) return;
		const remaining = conflictingAreaId
			? this.settings.studyAreas.filter((area) => area.id !== conflictingAreaId)
			: this.settings.studyAreas;
		if (
			conflictingAreaId &&
			remaining.length === this.settings.studyAreas.length
		) return;
		const validation = validateStudyAreaScope(remaining, disabled.parentPath);
		this.settings.studyAreas = remaining;
		if (validation.valid) {
			const recovered: StudyArea = {
				id: disabled.id,
				name: disabled.name,
				parentPath: disabled.parentPath,
				excludedPaths: disabled.excludedPaths,
				maintenanceMode: "paused",
				createdAt: disabled.createdAt,
			};
			this.settings.studyAreas = [...remaining, recovered];
			this.settings.disabledStudyAreas =
				this.settings.disabledStudyAreas.filter(
					(area) => area.id !== disabledAreaId
				);
		} else {
			this.settings.disabledStudyAreas =
				this.settings.disabledStudyAreas.map((area) =>
					area.id === disabledAreaId
						? { ...area, disabledReason: validation.reason }
						: area
				);
		}
		await this.saveSettings();
	}

	async runStudyArea(
		areaId: string,
		mode: StudyAreaPlanMode = "backfill",
		opts: { automatic?: boolean; targetFile?: TFile } = {}
	): Promise<StudyAreaRunSummary | null> {
		if (!this.isConfigured()) {
			if (!opts.automatic) {
				new Notice("FirstRecall: set up your AI provider in Settings first.");
			}
			return null;
		}
		const area = this.findStudyArea(areaId);
		if (!area) {
			new Notice("FirstRecall: that managed folder no longer exists.");
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
						? "FirstRecall: no failed updates to retry in this managed folder."
						: "FirstRecall: study material in this managed folder is already up to date."
				);
			}
			return summarizeStudyAreaRun(plan, {});
		}
		const completed: string[] = [];
		const failed: string[] = [];
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile && plan.items.some((item) => item.path === activeFile.path)) {
			await this.setUpdatingStatusForFile(activeFile);
		} else {
			this.setStatus("generating", {
				done: 0,
				total: plan.items.reduce((total, item) => total + item.sectionCount, 0),
				unit: "section",
			});
		}
		const kind: MaintenanceOperationKind = opts.automatic
			? "automatic"
			: mode === "retry-failed"
				? "retry"
				: "catch-up";
		for (const item of plan.items) {
			const outcome = await this.maintenance.request({
				path: item.path,
				kind,
				...(item.action === "generate-note"
					? {}
					: { sectionIds: item.sectionIds }),
			});
			if (outcome.status === "completed" ||
				(outcome.status === "skipped" && outcome.reason === "no-work")) {
				completed.push(item.path);
			} else if (outcome.status === "failed") {
				failed.push(item.path);
			}
		}
		const summary = summarizeStudyAreaRun(plan, {
			completedPaths: completed,
			failedPaths: failed,
		});
		await this.updateStatusForFile(this.app.workspace.getActiveFile());
		if (!opts.automatic || summary.failed) {
			new Notice(this.studyAreaSummaryNotice(area, summary));
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
				const cache = this.cacheStore.get(file.path);
				const state = this.cacheStore.getState(file.path);
				const currentSections = parseSections(markdown);
				const classification = classifyStudyMaterial({
					noteTitle: file.basename,
					markdown,
					currentSections,
					cache,
					state,
				});
				return {
					path: file.path,
					cache,
					currentSections,
					noteBriefNeedsRefresh: classification.noteBrief !== "current",
					failedComponents: state?.failure?.components,
				};
			})
		);
		return planStudyAreaGeneration(area, snapshots, mode);
	}

	private refreshGeneratedSurfaces(file: TFile): void {
		this.renderCues(file);
		this.refreshActiveReadingView(file);
		this.refreshStudyEntryStates();
		if (this.app.workspace.getActiveFile()?.path === file.path) {
			void this.updateStatusForFile(file);
		}
	}

	private studyAreaSummaryNotice(
		area: StudyArea,
		summary: StudyAreaRunSummary
	): string {
		if (summary.canceled) {
			return `FirstRecall: cancelled ${area.name} - kept ${summary.completed}, ${summary.remaining} remaining.`;
		}
		const parts = [`${summary.completed} done`];
		if (summary.failed) parts.push(`${summary.failed} failed`);
		return `FirstRecall: ${area.name} run complete - ${parts.join(", ")}.`;
	}

	private async generateCuesForFile(
		file: TFile | null,
		opts: { automatic?: boolean } = {}
	): Promise<void> {
		if (!file) {
			if (!opts.automatic) new Notice("FirstRecall: open a note first.");
			return;
		}
		if (!this.isConfigured()) {
			if (!opts.automatic) {
				new Notice("FirstRecall: set up your AI provider in Settings first.");
			}
			return;
		}
		await this.setUpdatingStatusForFile(file);
		const outcome = await this.maintenance.request({
			path: file.path,
			kind: opts.automatic ? "automatic" : "command",
		});
		if (!opts.automatic) this.noticeForMaintenanceOutcome(outcome);
		await this.updateStatusForFile(this.app.workspace.getActiveFile());
	}

	private async clearCues(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("FirstRecall: open a note first.");
			return;
		}
		if (!this.cacheStore.has(file.path)) {
			new Notice("FirstRecall: no generated study material to clear for this note.");
			return;
		}
		this.endStudyForPath(file.path);
		await this.maintenance.delete(file.path);
		new Notice("FirstRecall: cleared generated study material for this note.");
		this.refreshGeneratedSurfaces(file);
	}

	/**
	 * Enable (show) or hide the cue layer for a note (epic G). Defaults to the
	 * active note; a `target` lets context menus act on a non-active note.
	 */
	private async setNoteVisibility(visible: boolean, target?: TFile): Promise<void> {
		const file = target ?? this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("FirstRecall: open a note first.");
			return;
		}
		if (visible) {
			await this.visibility.show(file.path);
			new Notice("FirstRecall: generated study material enabled for this note.");
		} else {
			await this.visibility.hide(file.path);
			new Notice("FirstRecall: generated study material hidden for this note.");
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
		contentEl.createEl("h2", { text: "Regenerate section cards with new settings?" });
		contentEl.createEl("p", {
			text: `FirstRecall settings that affect recall questions changed. Regenerate cached section cards for "${this.noteName}" now?`,
		});
		const actions = contentEl.createEl("div", {
			cls: "firstrecall-modal-actions",
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
