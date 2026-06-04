import { z } from "zod";
import { confidenceSchema, type ValidationResult } from "./schemas";
import type { Section } from "./parser";
import type { NoteGenerationResult } from "./generator";

/**
 * Persisted per-note study data. Bumping CACHE_SCHEMA_VERSION requires adding a
 * migration step in `migrateCache` so existing caches upgrade rather than break.
 */
export const CACHE_SCHEMA_VERSION = 2;

const cachedSectionSchema = z.object({
	id: z.string(),
	heading: z.string(),
	level: z.number(),
	lineNumber: z.number(),
	contentHash: z.string(),
	keywords: z.array(z.string()).nullable(),
	question: z.string().nullable(),
	confidence: confidenceSchema.nullable(),
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
			error: s.error,
		})),
		summary: params.result.summary,
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
					error: sec.error ?? null,
				};
			}),
			summary: obj.summary ?? null,
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
	if (cache.sections.length !== currentSections.length) return true;
	for (let i = 0; i < currentSections.length; i++) {
		if (cache.sections[i].contentHash !== currentSections[i].contentHash) {
			return true;
		}
	}
	return false;
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
