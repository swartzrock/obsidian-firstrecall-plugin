import { z } from "zod";
import {
	confidenceSchema,
	noteBriefOutputSchema,
	sectionLensSchema,
	type ValidationResult,
} from "./schemas";
import { cueEligibleSections, type Section } from "./parser";
import type { NoteGenerationResult } from "./generator";

/**
 * Persisted per-note study data. Bumping CACHE_SCHEMA_VERSION requires adding a
 * migration step in `migrateCache` so existing caches upgrade rather than break.
 */
export const CACHE_SCHEMA_VERSION = 4;

const cachedSectionSchema = z.object({
	id: z.string(),
	heading: z.string(),
	level: z.number(),
	lineNumber: z.number(),
	contentHash: z.string(),
	keywords: z.array(z.string()).nullable(),
	question: z.string().nullable(),
	confidence: confidenceSchema.nullable(),
	rationale: z.string().nullable(),
	sectionLens: sectionLensSchema.nullable(),
	error: z.string().nullable(),
});

export const noteCacheSchema = z.object({
	schemaVersion: z.literal(CACHE_SCHEMA_VERSION),
	generatedAt: z.string(),
	noteModifiedAt: z.number(),
	provider: z.string(),
	model: z.string(),
	generationMode: z.string(),
	preset: z.string(),
	outline: z.object({
		learningObjective: z.string().nullable(),
		keyThemes: z.array(z.string()).optional(),
	}),
	sections: z.array(cachedSectionSchema),
	summary: z.string().nullable(),
	noteBrief: noteBriefOutputSchema.nullable(),
});

export type CachedSection = z.infer<typeof cachedSectionSchema>;
export type NoteCache = z.infer<typeof noteCacheSchema>;

export interface BuildCacheParams {
	result: NoteGenerationResult;
	provider: string;
	model: string;
	preset: string;
	generationMode: string;
	noteModifiedAt: number;
	generatedAt?: string;
}

export function buildNoteCache(params: BuildCacheParams): NoteCache {
	return {
		schemaVersion: CACHE_SCHEMA_VERSION,
		generatedAt: params.generatedAt ?? new Date().toISOString(),
		noteModifiedAt: params.noteModifiedAt,
		provider: params.provider,
		model: params.model,
		generationMode: params.generationMode,
		preset: params.preset,
		outline: { learningObjective: params.result.learningObjective },
		sections: params.result.sections.map((s) => ({
			id: s.id,
			heading: s.heading,
			level: s.level,
			lineNumber: s.lineNumber,
			contentHash: s.contentHash,
			keywords: s.keywords,
			question: s.question,
			confidence: s.confidence,
			rationale: s.rationale ?? null,
			sectionLens: s.sectionLens ?? null,
			error: s.error,
		})),
		summary: params.result.summary,
		noteBrief: params.result.noteBrief,
	};
}

export function validateCache(raw: unknown): ValidationResult<NoteCache> {
	const parsed = noteCacheSchema.safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues
				.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
				.join("; "),
		};
	}
	return { ok: true, value: parsed.data };
}

/**
 * Upgrade an older cache object to the current schema. Returns the validated
 * NoteCache or null if the input is unrecognizable / unmigratable.
 *
 * v1 -> v2: v1 lacked `level`, `outline`, `generationMode`, and `preset`.
 * v2 -> v3: v2 lacked per-cue `rationale`.
 * v3 -> v4: v3 lacked generated Section Lens and Note Brief artifacts.
 */
export function migrateCache(raw: unknown): NoteCache | null {
	if (!raw || typeof raw !== "object") return null;
	const obj = raw as Record<string, unknown>;
	const version = typeof obj.schemaVersion === "number" ? obj.schemaVersion : 1;

	let candidate: Record<string, unknown> = obj;
	if (version === 1) {
		const sections = Array.isArray(obj.sections) ? obj.sections : [];
		candidate = {
			...obj,
			schemaVersion: CACHE_SCHEMA_VERSION,
			generationMode: obj.generationMode ?? "whole-note-context",
			preset: obj.preset ?? "conceptual",
			outline:
				obj.outline ?? { learningObjective: null },
			sections: sections.map((s) => {
				const sec = (s ?? {}) as Record<string, unknown>;
				return {
					id: sec.id ?? "section",
					heading: sec.heading ?? "",
					level: typeof sec.level === "number" ? sec.level : 0,
					lineNumber: typeof sec.lineNumber === "number" ? sec.lineNumber : 1,
					contentHash: sec.contentHash ?? "",
					keywords: sec.keywords ?? null,
					question: sec.question ?? null,
					confidence: sec.confidence ?? null,
					rationale: null,
					sectionLens: null,
					error: sec.error ?? null,
				};
			}),
			summary: obj.summary ?? null,
			noteBrief: null,
		};
	}
	if (version === 2) {
		const sections = Array.isArray(obj.sections) ? obj.sections : [];
		candidate = {
			...obj,
			schemaVersion: CACHE_SCHEMA_VERSION,
			sections: sections.map((s) => {
				const sec = (s ?? {}) as Record<string, unknown>;
				return {
					...sec,
					rationale:
						typeof sec.rationale === "string" && sec.rationale.trim()
							? sec.rationale.trim()
							: null,
					sectionLens: null,
				};
			}),
			noteBrief: null,
		};
	}
	if (version === 3) {
		const sections = Array.isArray(obj.sections) ? obj.sections : [];
		candidate = {
			...obj,
			schemaVersion: CACHE_SCHEMA_VERSION,
			sections: sections.map((s) => {
				const sec = (s ?? {}) as Record<string, unknown>;
				return {
					...sec,
					sectionLens: null,
				};
			}),
			noteBrief: null,
		};
	}

	const validated = validateCache(candidate);
	return validated.ok ? validated.value : null;
}

/** Load a cache from arbitrary stored data: validate, else migrate, else null. */
export function loadCache(raw: unknown): NoteCache | null {
	const direct = validateCache(raw);
	if (direct.ok) return direct.value;
	return migrateCache(raw);
}

/**
 * Stale when the set/order of section content hashes differs from the cache —
 * i.e. a section was added, removed, reordered, or edited (AC G2.1).
 */
export function isStale(cache: NoteCache, currentSections: Section[]): boolean {
	const eligibleSections = cueEligibleSections(currentSections);
	if (cache.sections.length !== eligibleSections.length) return true;
	for (let i = 0; i < eligibleSections.length; i++) {
		if (cache.sections[i].contentHash !== eligibleSections[i].contentHash) {
			return true;
		}
	}
	return false;
}

/**
 * Ids of cached sections that need regenerating: their content changed since the
 * cache was built (hash mismatch against the current parse) or they previously
 * errored. Matched by stable section id, so reordering alone doesn't count.
 * Newly added sections are intentionally not included here; use
 * `sectionIdsNeedingGeneration` for incremental generation paths that should
 * handle additions without a full-note run.
 */
export function staleSectionIds(
	cache: NoteCache,
	currentSections: Section[]
): string[] {
	const current = new Map(cueEligibleSections(currentSections).map((s) => [s.id, s]));
	const ids: string[] = [];
	for (const cached of cache.sections) {
		const live = current.get(cached.id);
		if (!live) continue;
		if (cached.error || cached.contentHash !== live.contentHash) {
			ids.push(cached.id);
		}
	}
	return ids;
}

/**
 * Ids that need a provider call in an incremental generation pass: new sections
 * missing from the cache, changed sections, or previous failures. Removed and
 * reordered sections are handled by cache reconciliation without provider work.
 */
export function sectionIdsNeedingGeneration(
	cache: NoteCache,
	currentSections: Section[]
): string[] {
	const cached = new Map(cache.sections.map((s) => [s.id, s]));
	const ids: string[] = [];
	for (const live of cueEligibleSections(currentSections)) {
		const existing = cached.get(live.id);
		if (!existing || existing.error || existing.contentHash !== live.contentHash) {
			ids.push(live.id);
		}
	}
	return ids;
}

export interface ReconcileCacheSectionsOptions {
	generatedAt?: string;
	noteModifiedAt?: number;
}

/**
 * Align cached sections with the current document order while preserving cues
 * for unchanged sections. Newly generated sections replace/add by id; removed
 * document sections disappear from the cache.
 */
export function reconcileCacheSections(
	cache: NoteCache,
	currentSections: Section[],
	generatedSections: readonly CachedSection[] = [],
	opts: ReconcileCacheSectionsOptions = {}
): NoteCache {
	const cached = new Map(cache.sections.map((s) => [s.id, s]));
	const generated = new Map(generatedSections.map((s) => [s.id, s]));
	const sections = cueEligibleSections(currentSections).flatMap((live) => {
		const updated = generated.get(live.id);
		if (updated) return [updated];
		const existing = cached.get(live.id);
		if (!existing) return [];
		return [{
			...existing,
			heading: live.heading,
			level: live.level,
			lineNumber: live.lineNumber,
			contentHash: live.contentHash,
		}];
	});

	return {
		...cache,
		generatedAt: opts.generatedAt ?? new Date().toISOString(),
		noteModifiedAt: opts.noteModifiedAt ?? cache.noteModifiedAt,
		sections,
	};
}

/**
 * Return a new cache with the section matching `updated.id` replaced.
 * Other sections, summary, and outline stay untouched. Bumps `generatedAt`
 * so the cache reflects its most recent change. Returns the cache unchanged
 * when the id is not found.
 */
export function replaceSection(
	cache: NoteCache,
	updated: CachedSection,
	generatedAt?: string
): NoteCache {
	const idx = cache.sections.findIndex((s) => s.id === updated.id);
	if (idx === -1) return cache;
	const sections = cache.sections.slice();
	sections[idx] = updated;
	return { ...cache, sections, generatedAt: generatedAt ?? new Date().toISOString() };
}

/** True when at least one cached section has a usable (non-errored) question. */
export function hasUsableCues(cache: NoteCache): boolean {
	return cache.sections.some((s) => !s.error && Boolean(s.question));
}

export type PersistFn = (map: Record<string, NoteCache>) => Promise<void>;

/**
 * Per-note cache store. Holds an in-memory map and persists via an injected
 * callback, so it can be unit-tested without Obsidian's plugin data APIs.
 */
export class CacheStore {
	private map: Record<string, NoteCache>;
	private persist: PersistFn;

	constructor(initial: Record<string, NoteCache> | undefined, persist: PersistFn) {
		this.map = initial ?? {};
		this.persist = persist;
	}

	get(path: string): NoteCache | null {
		return this.map[path] ?? null;
	}

	has(path: string): boolean {
		return path in this.map;
	}

	async set(path: string, cache: NoteCache): Promise<void> {
		this.map[path] = cache;
		await this.persist(this.map);
	}

	async delete(path: string): Promise<void> {
		if (path in this.map) {
			delete this.map[path];
			await this.persist(this.map);
		}
	}

	snapshot(): Record<string, NoteCache> {
		return { ...this.map };
	}
}
