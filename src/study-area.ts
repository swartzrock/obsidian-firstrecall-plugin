import {
	isStale,
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
