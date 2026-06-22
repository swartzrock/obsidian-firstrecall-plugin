import {
	isStale,
	staleSectionIds,
	type NoteCache,
} from "./cache";
import type { Section } from "./parser";

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

export interface StudyAreaNoteSnapshot {
	path: string;
	cache: NoteCache | null;
	currentSections: Section[];
	hidden?: boolean;
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

export const DEFAULT_STUDY_AREA_AUTOMATION_ENABLED = false;

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

export function isDescendantPath(path: string, parentPath: string): boolean {
	const normalizedPath = normalizeVaultPath(path);
	const normalizedParent = normalizeVaultPath(parentPath);
	if (!normalizedParent) return Boolean(normalizedPath);
	return normalizedPath.startsWith(`${normalizedParent}/`);
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

export function eligibleStudyAreaPaths(
	area: Pick<StudyArea, "parentPath" | "excludedPaths">,
	paths: readonly string[]
): string[] {
	return paths.filter((path) => isStudyAreaPath(area, path));
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
	if (note.hidden) {
		return { path: note.path, readiness: "skipped", reason: "hidden" };
	}
	if (!note.cache) {
		return { path: note.path, readiness: "uncued", reason: null };
	}
	if (note.cache.sections.some((section) => section.error)) {
		return { path: note.path, readiness: "failed", reason: null };
	}
	if (isStale(note.cache, note.currentSections)) {
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
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((item): StudyArea[] => {
		if (!item || typeof item !== "object") return [];
		const candidate = item as Record<string, unknown>;
		const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
		const parentPath =
			typeof candidate.parentPath === "string"
				? normalizeVaultPath(candidate.parentPath)
				: "";
		if (!id || !parentPath) return [];
		const name =
			typeof candidate.name === "string" && candidate.name.trim()
				? candidate.name.trim()
				: parentPath.split("/").slice(-1)[0] ?? parentPath;
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
		return [{ id, name, parentPath, excludedPaths, maintenanceMode, createdAt }];
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
	if (readiness === "uncued" && mode === "backfill") {
		return {
			path: note.path,
			action: "generate-note",
			sectionIds: [],
			readiness,
			sectionCount: note.currentSections.length,
		};
	}
	if (readiness === "stale" && mode !== "retry-failed" && note.cache) {
		const sectionIds = staleSectionIds(note.cache, note.currentSections);
		const action = canRefreshStaleSections(note.cache, note.currentSections)
			? "refresh-stale-sections"
			: "generate-note";
		return {
			path: note.path,
			action,
			sectionIds,
			readiness,
			sectionCount:
				action === "generate-note" ? note.currentSections.length : sectionIds.length,
		};
	}
	if (readiness === "failed" && note.cache) {
		const sectionIds = failedSectionIds(note.cache, note.currentSections);
		if (!sectionIds.length) return null;
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

function canRefreshStaleSections(
	cache: NoteCache,
	currentSections: readonly Section[]
): boolean {
	if (cache.sections.length !== currentSections.length) return false;
	return cache.sections.every((cached, index) => {
		const current = currentSections[index];
		return current && current.id === cached.id;
	});
}

function failedSectionIds(
	cache: NoteCache,
	currentSections: readonly Section[]
): string[] {
	const currentIds = new Set(currentSections.map((section) => section.id));
	return cache.sections
		.filter((section) => section.error && currentIds.has(section.id))
		.map((section) => section.id);
}
