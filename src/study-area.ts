import {
	isStale,
	sectionIdsNeedingGeneration,
	type NoteCache,
} from "./cache";
import { cueEligibleSections, type Section } from "./parser";

export type StudyAreaMaintenanceMode = "paused" | "maintain-on-save";
export type StudyAreaReadiness =
	| "ready"
	| "uncued"
	| "stale"
	| "failed"
	| "skipped";

export interface StudyArea {
	id: string;
	name: string;
	parentPath: string;
	excludedPaths: string[];
	maintenanceMode: StudyAreaMaintenanceMode;
	createdAt: string;
}

export type StudyAreaScopeConflictReason =
	| "duplicate-path"
	| "entire-vault-conflict"
	| "overlapping-path";

export type StudyAreaScopeValidation =
	| { valid: true; reason: null }
	| { valid: false; reason: StudyAreaScopeConflictReason };

export type StudyAreaExclusionConflictReason =
	| "empty-path"
	| "outside-scope"
	| "duplicate-path";

export type StudyAreaExclusionValidation =
	| { valid: true; reason: null }
	| { valid: false; reason: StudyAreaExclusionConflictReason };

export interface DisabledStudyArea extends StudyArea {
	maintenanceMode: "paused";
	disabledReason: StudyAreaScopeConflictReason;
}

export interface LoadedStudyAreaSettings {
	studyAreas: StudyArea[];
	disabledStudyAreas: DisabledStudyArea[];
}

export interface StudyAreaNoteSnapshot {
	path: string;
	cache: NoteCache | null;
	currentSections: Section[];
	noteBriefNeedsRefresh?: boolean;
	failedComponents?: {
		noteBrief: boolean;
		sectionIds: string[];
	};
}

export interface StudyAreaReadinessResult {
	path: string;
	readiness: StudyAreaReadiness;
	reason: string | null;
}

export type StudyAreaPlanMode = "backfill" | "retry-failed" | "maintain-note";
export type StudyAreaQueueAction =
	| "generate-note"
	| "refresh-stale-sections"
	| "retry-failed-sections";

export interface StudyAreaQueueItem {
	path: string;
	action: StudyAreaQueueAction;
	sectionIds: string[];
	readiness: StudyAreaReadiness;
	sectionCount: number;
}

export type StudyAreaReadinessCounts = Record<StudyAreaReadiness, number>;

export interface StudyAreaGenerationPlan {
	mode: StudyAreaPlanMode;
	readiness: StudyAreaReadinessResult[];
	counts: StudyAreaReadinessCounts;
	items: StudyAreaQueueItem[];
}

export interface StudyAreaRunSummary {
	total: number;
	completed: number;
	failed: number;
	skipped: number;
	remaining: number;
	canceled: boolean;
}

export const DEFAULT_STUDY_AREAS: StudyArea[] = [];
export const ENTIRE_VAULT_STUDY_AREA_LABEL = "Entire vault";

const MAINTENANCE_MODES = new Set<StudyAreaMaintenanceMode>([
	"paused",
	"maintain-on-save",
]);

export function normalizeVaultPath(path: string): string {
	return path.trim().replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

export function isMarkdownPath(path: string): boolean {
	return normalizeVaultPath(path).toLowerCase().endsWith(".md");
}

export function isEntireVaultStudyArea(
	area: Pick<StudyArea, "parentPath">
): boolean {
	return normalizeVaultPath(area.parentPath) === "";
}

export function studyAreaScopeLabel(parentPath: string): string {
	return normalizeVaultPath(parentPath) || ENTIRE_VAULT_STUDY_AREA_LABEL;
}

export function studyAreaNameForParentPath(parentPath: string): string {
	const normalized = normalizeVaultPath(parentPath);
	return normalized
		? normalized.split("/").slice(-1)[0] ?? normalized
		: ENTIRE_VAULT_STUDY_AREA_LABEL;
}

export function formatStudyAreaReadinessCounts(
	counts: StudyAreaReadinessCounts,
	opts: { cueSectionCount?: number; excludedCount?: number } = {}
): string {
	const noteLabel = (count: number): string =>
		`${count} note${count === 1 ? "" : "s"}`;
	const sectionLabel = (count: number): string =>
		`${count} section${count === 1 ? "" : "s"}`;
	const parts: string[] = [];
	if (counts.ready) parts.push(`${noteLabel(counts.ready)} ready`);
	const notesNeedingCues = counts.uncued + counts.stale;
	if (notesNeedingCues) {
		const sectionCount =
			opts.cueSectionCount && opts.cueSectionCount > 0
				? ` (${sectionLabel(opts.cueSectionCount)})`
				: "";
		parts.push(
			`${noteLabel(notesNeedingCues)}${sectionCount} ${
				notesNeedingCues === 1 ? "needs" : "need"
			} Section cues`
		);
	}
	if (counts.failed) parts.push(`${noteLabel(counts.failed)} failed`);
	if (opts.excludedCount) {
		parts.push(`${noteLabel(opts.excludedCount)} excluded`);
	}
	return parts.length
		? parts.join(" · ")
		: counts.skipped
			? "No eligible notes"
			: "No notes found";
}

export function isDescendantPath(path: string, parentPath: string): boolean {
	const normalizedPath = normalizeVaultPath(path);
	const normalizedParent = normalizeVaultPath(parentPath);
	if (!normalizedParent) return Boolean(normalizedPath);
	return normalizedPath.startsWith(`${normalizedParent}/`);
}

export function validateStudyAreaScope(
	areas: readonly Pick<StudyArea, "parentPath">[],
	parentPath: string
): StudyAreaScopeValidation {
	const normalized = normalizeVaultPath(parentPath);
	for (const area of areas) {
		const existing = normalizeVaultPath(area.parentPath);
		if (existing === normalized) {
			return { valid: false, reason: "duplicate-path" };
		}
		if (!existing || !normalized) {
			return { valid: false, reason: "entire-vault-conflict" };
		}
		if (
			isDescendantPath(normalized, existing) ||
			isDescendantPath(existing, normalized)
		) {
			return { valid: false, reason: "overlapping-path" };
		}
	}
	return { valid: true, reason: null };
}

export function findConflictingStudyArea(
	areas: readonly StudyArea[],
	parentPath: string
): StudyArea | null {
	const normalized = normalizeVaultPath(parentPath);
	return (
		areas.find((area) => {
			const existing = normalizeVaultPath(area.parentPath);
			return (
				existing === normalized ||
				!existing ||
				!normalized ||
				isDescendantPath(normalized, existing) ||
				isDescendantPath(existing, normalized)
			);
		}) ?? null
	);
}

export function validateStudyAreaExclusion(
	area: Pick<StudyArea, "parentPath" | "excludedPaths">,
	path: string
): StudyAreaExclusionValidation {
	const normalized = normalizeVaultPath(path);
	if (!normalized) return { valid: false, reason: "empty-path" };
	if (area.excludedPaths.some((entry) => normalizeVaultPath(entry) === normalized)) {
		return { valid: false, reason: "duplicate-path" };
	}
	if (!isDescendantPath(normalized, area.parentPath)) {
		return { valid: false, reason: "outside-scope" };
	}
	return { valid: true, reason: null };
}

export function isExcludedPath(path: string, excludedPaths: readonly string[]): boolean {
	const normalizedPath = normalizeVaultPath(path);
	return excludedPaths.some((excludedPath) => {
		const normalizedExcluded = normalizeVaultPath(excludedPath);
		return (
			normalizedPath === normalizedExcluded ||
			normalizedPath.startsWith(`${normalizedExcluded}/`)
		);
	});
}

export function isStudyAreaPath(
	area: Pick<StudyArea, "parentPath" | "excludedPaths">,
	path: string
): boolean {
	return (
		isMarkdownPath(path) &&
		isDescendantPath(path, area.parentPath) &&
		!isExcludedPath(path, area.excludedPaths)
	);
}

export function findMaintainedStudyAreaForPath(
	areas: readonly StudyArea[],
	path: string
): StudyArea | null {
	if (!isMarkdownPath(path)) return null;
	return (
		areas.find(
			(area) =>
				area.maintenanceMode === "maintain-on-save" &&
				isStudyAreaPath(area, path)
		) ?? null
	);
}

export function classifyStudyAreaNote(
	area: Pick<StudyArea, "parentPath" | "excludedPaths">,
	note: StudyAreaNoteSnapshot
): StudyAreaReadinessResult {
	if (!isMarkdownPath(note.path)) {
		return { path: note.path, readiness: "skipped", reason: "not-markdown" };
	}
	if (!isDescendantPath(note.path, area.parentPath)) {
		return { path: note.path, readiness: "skipped", reason: "outside-area" };
	}
	if (isExcludedPath(note.path, area.excludedPaths)) {
		return { path: note.path, readiness: "skipped", reason: "excluded" };
	}
	if (!cueEligibleSections(note.currentSections).length) {
		return { path: note.path, readiness: "skipped", reason: "empty" };
	}
	if (!note.cache) {
		return { path: note.path, readiness: "uncued", reason: null };
	}
	if (
		note.cache.sections.some((section) => section.error) ||
		note.failedComponents?.noteBrief ||
		note.failedComponents?.sectionIds.length
	) {
		return { path: note.path, readiness: "failed", reason: null };
	}
	if (
		!note.cache.noteBrief ||
		note.noteBriefNeedsRefresh ||
		isStale(note.cache, note.currentSections)
	) {
		return { path: note.path, readiness: "stale", reason: null };
	}
	return { path: note.path, readiness: "ready", reason: null };
}

export function planStudyAreaGeneration(
	area: Pick<StudyArea, "parentPath" | "excludedPaths">,
	notes: readonly StudyAreaNoteSnapshot[],
	mode: StudyAreaPlanMode = "backfill"
): StudyAreaGenerationPlan {
	const readiness = notes.map((note) => classifyStudyAreaNote(area, note));
	const byPath = new Map(notes.map((note) => [note.path, note]));
	const counts = emptyReadinessCounts();
	const items: StudyAreaQueueItem[] = [];

	for (const result of readiness) {
		counts[result.readiness]++;
		const note = byPath.get(result.path);
		if (!note) continue;
		const item = planQueueItem(note, result.readiness, mode);
		if (item) items.push(item);
	}

	return { mode, readiness, counts, items };
}

export function summarizeStudyAreaRun(
	plan: Pick<StudyAreaGenerationPlan, "items" | "counts">,
	progress: {
		completedPaths?: readonly string[];
		failedPaths?: readonly string[];
		canceled?: boolean;
	}
): StudyAreaRunSummary {
	const completed = new Set(progress.completedPaths ?? []);
	const failed = new Set(progress.failedPaths ?? []);
	const queued = new Set(plan.items.map((item) => item.path));
	const remaining = [...queued].filter(
		(path) => !completed.has(path) && !failed.has(path)
	).length;
	return {
		total: plan.items.length,
		completed: completed.size,
		failed: failed.size,
		skipped: plan.counts.skipped,
		remaining,
		canceled: progress.canceled ?? false,
	};
}

export function loadStudyAreas(raw: unknown): StudyArea[] {
	return loadStudyAreaSettings(raw).studyAreas;
}

export function loadStudyAreaSettings(
	raw: unknown,
	rawDisabled: unknown = []
): LoadedStudyAreaSettings {
	const studyAreas: StudyArea[] = [];
	const disabledStudyAreas = loadDisabledStudyAreas(rawDisabled);
	for (const area of parseStudyAreas(raw)) {
		const validation = validateStudyAreaScope(studyAreas, area.parentPath);
		if (validation.valid) {
			studyAreas.push(area);
			continue;
		}
		disabledStudyAreas.push({
			...area,
			maintenanceMode: "paused",
			disabledReason: validation.reason,
		});
	}
	return { studyAreas, disabledStudyAreas };
}

function parseStudyAreas(raw: unknown): StudyArea[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((item): StudyArea[] => {
		const area = parseStudyArea(item);
		return area ? [area] : [];
	});
}

function parseStudyArea(raw: unknown): StudyArea | null {
	if (!raw || typeof raw !== "object") return null;
	const candidate = raw as Record<string, unknown>;
	const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
	if (!id || typeof candidate.parentPath !== "string") return null;
	const parentPath = normalizeVaultPath(candidate.parentPath);
	const name =
		typeof candidate.name === "string" && candidate.name.trim()
			? candidate.name.trim()
			: studyAreaNameForParentPath(parentPath);
	const rawExcluded = Array.isArray(candidate.excludedPaths)
		? candidate.excludedPaths
		: [];
	const excludedPaths = rawExcluded
		.filter((path): path is string => typeof path === "string")
		.map(normalizeVaultPath)
		.filter(Boolean);
	const maintenanceMode = MAINTENANCE_MODES.has(
		candidate.maintenanceMode as StudyAreaMaintenanceMode
	)
		? (candidate.maintenanceMode as StudyAreaMaintenanceMode)
		: "paused";
	const createdAt =
		typeof candidate.createdAt === "string" && candidate.createdAt.trim()
			? candidate.createdAt
			: new Date(0).toISOString();
	return { id, name, parentPath, excludedPaths, maintenanceMode, createdAt };
}

function loadDisabledStudyAreas(raw: unknown): DisabledStudyArea[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((item): DisabledStudyArea[] => {
		const area = parseStudyArea(item);
		if (!area || !item || typeof item !== "object") return [];
		const reason = (item as Record<string, unknown>).disabledReason;
		if (
			reason !== "duplicate-path" &&
			reason !== "entire-vault-conflict" &&
			reason !== "overlapping-path"
		) {
			return [];
		}
		return [{ ...area, maintenanceMode: "paused", disabledReason: reason }];
	});
}

function emptyReadinessCounts(): StudyAreaReadinessCounts {
	return {
		ready: 0,
		uncued: 0,
		stale: 0,
		failed: 0,
		skipped: 0,
	};
}

function planQueueItem(
	note: StudyAreaNoteSnapshot,
	readiness: StudyAreaReadiness,
	mode: StudyAreaPlanMode
): StudyAreaQueueItem | null {
	const eligibleSections = cueEligibleSections(note.currentSections);
	if (readiness === "uncued" && mode !== "retry-failed") {
		return {
			path: note.path,
			action: "generate-note",
			sectionIds: [],
			readiness,
			sectionCount: eligibleSections.length,
		};
	}
	if (readiness === "stale" && mode !== "retry-failed" && note.cache) {
		const sectionIds = sectionIdsNeedingGeneration(
			note.cache,
			note.currentSections
		);
		return {
			path: note.path,
			action: "refresh-stale-sections",
			sectionIds,
			readiness,
			sectionCount: sectionIds.length,
		};
	}
	if (readiness === "failed" && note.cache) {
		const sectionIds = uniqueSectionIds([
			...failedSectionIds(note.cache, note.currentSections),
			...(note.failedComponents?.sectionIds ?? []),
		]);
		if (!sectionIds.length && !note.failedComponents?.noteBrief) return null;
		return {
			path: note.path,
			action: "retry-failed-sections",
			sectionIds,
			readiness,
			sectionCount: sectionIds.length,
		};
	}
	return null;
}

function uniqueSectionIds(ids: readonly string[]): string[] {
	return [...new Set(ids)];
}

function failedSectionIds(
	cache: NoteCache,
	currentSections: readonly Section[]
): string[] {
	const currentIds = new Set(
		cueEligibleSections(currentSections).map((section) => section.id)
	);
	return cache.sections
		.filter((section) => section.error && currentIds.has(section.id))
		.map((section) => section.id);
}
