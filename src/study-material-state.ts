import { z } from "zod/v3";
import type { NoteCache } from "./cache";
import {
	cueEligibleSections,
	lightHash,
	parseSections,
	type Section,
} from "./parser";

export const MAINTENANCE_STATE_SCHEMA_VERSION = 1;

const componentSetSchema = z.object({
	noteBrief: z.boolean(),
	sectionIds: z.array(z.string()),
});

const maintenanceFailureSchema = z.object({
	components: componentSetSchema,
	message: z.string(),
});

export const noteMaintenanceStateSchema = z.object({
	schemaVersion: z.literal(MAINTENANCE_STATE_SCHEMA_VERSION),
	sourceRevision: z.string(),
	noteBriefRevision: z.string().nullable(),
	cacheRevision: z.string().nullable(),
	affected: componentSetSchema,
	updating: componentSetSchema,
	failure: maintenanceFailureSchema.nullable(),
	bannerDismissedRevision: z.string().nullable(),
});

export type ComponentSet = z.infer<typeof componentSetSchema>;
export type NoteMaintenanceState = z.infer<typeof noteMaintenanceStateSchema>;
export type MaintenanceStateMap = Record<string, NoteMaintenanceState>;
export type ComponentFreshness =
	| "missing"
	| "current"
	| "outdated"
	| "updating"
	| "failed";
export type NoteFreshness = Exclude<ComponentFreshness, "missing">;

const EMPTY_COMPONENTS: ComponentSet = {
	noteBrief: false,
	sectionIds: [],
};

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function normalizeComponents(components: ComponentSet): ComponentSet {
	return {
		noteBrief: components.noteBrief,
		sectionIds: unique(components.sectionIds),
	};
}

function unionComponents(a: ComponentSet, b: ComponentSet): ComponentSet {
	const existing = new Set(a.sectionIds);
	if ((!b.noteBrief || a.noteBrief) && b.sectionIds.every((id) => existing.has(id))) {
		return a;
	}
	return {
		noteBrief: a.noteBrief || b.noteBrief,
		sectionIds: unique([...a.sectionIds, ...b.sectionIds]),
	};
}

function subtractComponents(a: ComponentSet, b: ComponentSet): ComponentSet {
	const removed = new Set(b.sectionIds);
	return {
		noteBrief: a.noteBrief && !b.noteBrief,
		sectionIds: a.sectionIds.filter((id) => !removed.has(id)),
	};
}

export function hasMaintenanceComponents(components: ComponentSet): boolean {
	return components.noteBrief || components.sectionIds.length > 0;
}

/** Revision of source inputs only. Provider and generation settings are excluded. */
export function noteSourceRevision(noteTitle: string, markdown: string): string {
	return lightHash(`${noteTitle}\u0000${markdown}`);
}

/** Revision of last-good generated content, excluding generation configuration. */
export function cacheContentRevision(cache: NoteCache): string {
	return lightHash(
		JSON.stringify({
			sections: cache.sections,
			noteBrief: cache.noteBrief,
		})
	);
}

export function createCurrentMaintenanceState(
	noteTitle: string,
	markdown: string,
	cache: NoteCache
): NoteMaintenanceState {
	const sourceRevision = noteSourceRevision(noteTitle, markdown);
	return {
		schemaVersion: MAINTENANCE_STATE_SCHEMA_VERSION,
		sourceRevision,
		noteBriefRevision: cache.noteBrief ? sourceRevision : null,
		cacheRevision: cacheContentRevision(cache),
		affected: { ...EMPTY_COMPONENTS },
		updating: { ...EMPTY_COMPONENTS },
		failure: null,
		bannerDismissedRevision: null,
	};
}

/** Initialize source and affected components before any successful cache exists. */
export function createMissingMaintenanceState(
	noteTitle: string,
	markdown: string
): NoteMaintenanceState {
	return {
		schemaVersion: MAINTENANCE_STATE_SCHEMA_VERSION,
		sourceRevision: noteSourceRevision(noteTitle, markdown),
		noteBriefRevision: null,
		cacheRevision: null,
		affected: {
			noteBrief: true,
			sectionIds: cueEligibleSections(parseSections(markdown)).map(
				(section) => section.id
			),
		},
		updating: { ...EMPTY_COMPONENTS },
		failure: null,
		bannerDismissedRevision: null,
	};
}

export type MaintenanceStateEvent =
	| {
			type: "source-observed";
			revision: string;
			affected: ComponentSet;
			hasEligibleSections: boolean;
	  }
	| {
			type: "update-started";
			revision: string;
			components: ComponentSet;
	  }
	| {
			type: "update-succeeded";
			revision: string;
			components: ComponentSet;
			cacheRevision: string | null;
	  }
	| {
			type: "update-failed";
			revision: string;
			components: ComponentSet;
			message: string;
	  }
	| {
			type: "update-canceled";
			revision: string;
			components: ComponentSet;
	  }
	| { type: "banner-dismissed"; revision: string }
	| { type: "clear" };

/** Pure lifecycle reducer. Stale completions cannot update a newer revision. */
export function reduceMaintenanceState(
	state: NoteMaintenanceState | null,
	event: MaintenanceStateEvent
): NoteMaintenanceState | null {
	if (event.type === "clear") return null;
	if (!state) return null;

	if (event.type === "source-observed") {
		if (!event.hasEligibleSections) return null;
		if (event.revision === state.sourceRevision) {
			const affected = unionComponents(state.affected, event.affected);
			if (affected === state.affected) return state;
			return {
				...state,
				affected,
			};
		}
		return {
			...state,
			sourceRevision: event.revision,
			affected: normalizeComponents(event.affected),
			updating: { ...EMPTY_COMPONENTS },
			failure: null,
			bannerDismissedRevision: null,
		};
	}

	if (event.revision !== state.sourceRevision) return state;
	if (event.type === "banner-dismissed") {
		return { ...state, bannerDismissedRevision: event.revision };
	}
	if (event.type === "update-started") {
		return {
			...state,
			updating: normalizeComponents(event.components),
			failure: null,
		};
	}
	if (event.type === "update-failed") {
		const failed = normalizeComponents(event.components);
		return {
			...state,
			affected: unionComponents(state.affected, failed),
			updating: { ...EMPTY_COMPONENTS },
			failure: { components: failed, message: event.message },
		};
	}
	if (event.type === "update-canceled") {
		return {
			...state,
			updating: subtractComponents(state.updating, event.components),
		};
	}

	const completed = normalizeComponents(event.components);
	const failure = state.failure
		? {
				...state.failure,
				components: subtractComponents(state.failure.components, completed),
			}
		: null;
	const remainingFailure = failure && hasMaintenanceComponents(failure.components)
		? failure
		: null;
	return {
		...state,
		noteBriefRevision: completed.noteBrief
			? event.revision
			: state.noteBriefRevision,
		cacheRevision: event.cacheRevision,
		affected: subtractComponents(state.affected, completed),
		updating: subtractComponents(state.updating, completed),
		failure: remainingFailure,
	};
}

export interface StudyMaterialClassification {
	sourceRevision: string;
	freshness: NoteFreshness;
	noteBrief: ComponentFreshness;
	sections: Array<{ id: string; freshness: ComponentFreshness }>;
	retryable: boolean;
	bannerDismissed: boolean;
	hasGeneratedMaterial: boolean;
}

function componentStatus(
	id: string | null,
	base: "missing" | "current" | "outdated",
	state: NoteMaintenanceState | null,
	stateMatchesSource: boolean,
	stateMatchesCache: boolean
): ComponentFreshness {
	if (!state || !stateMatchesSource) return base;
	const includes = (components: ComponentSet): boolean =>
		id === null
			? components.noteBrief
			: components.sectionIds.includes(id);
	if (state.failure && includes(state.failure.components)) return "failed";
	if (includes(state.updating)) return "updating";
	if (base === "missing") return "missing";
	if (!stateMatchesCache || includes(state.affected)) return "outdated";
	return base;
}

export function classifyStudyMaterial(params: {
	noteTitle: string;
	markdown: string;
	currentSections: readonly Section[];
	cache: NoteCache | null;
	state: NoteMaintenanceState | null;
}): StudyMaterialClassification {
	const sourceRevision = noteSourceRevision(params.noteTitle, params.markdown);
	const sections = cueEligibleSections(params.currentSections);
	const cachedById = new Map(
		(params.cache?.sections ?? []).map((section) => [section.id, section])
	);
	const stateMatchesSource = params.state?.sourceRevision === sourceRevision;
	const stateMatchesCache = Boolean(
		params.state &&
		(params.cache
			? params.state.cacheRevision === cacheContentRevision(params.cache)
			: params.state.cacheRevision === null)
	);
	const noteBriefBase: "missing" | "current" | "outdated" =
		!params.cache?.noteBrief
			? "missing"
			: stateMatchesSource &&
			  stateMatchesCache &&
			  params.state?.noteBriefRevision === sourceRevision
			? "current"
			: "outdated";
	const noteBrief = componentStatus(
		null,
		noteBriefBase,
		params.state,
		stateMatchesSource,
		stateMatchesCache
	);
	const classifiedSections = sections.map((section) => {
		const cached = cachedById.get(section.id);
		const base = !cached
			? "missing" as const
			: cached.contentHash === section.contentHash
			? "current" as const
			: "outdated" as const;
		return {
			id: section.id,
			freshness: componentStatus(
				section.id,
				base,
				params.state,
				stateMatchesSource,
				stateMatchesCache
			),
		};
	});
	const statuses = [
		noteBrief,
		...classifiedSections.map((section) => section.freshness),
	];
	const freshness: NoteFreshness = statuses.includes("failed")
		? "failed"
		: statuses.includes("updating")
		? "updating"
		: statuses.some((status) => status === "missing" || status === "outdated")
		? "outdated"
		: "current";

	return {
		sourceRevision,
		freshness,
		noteBrief,
		sections: classifiedSections,
		retryable: Boolean(stateMatchesSource && params.state?.failure),
		bannerDismissed:
			params.state?.bannerDismissedRevision === sourceRevision,
		hasGeneratedMaterial: Boolean(
			params.cache?.noteBrief || params.cache?.sections.length
		),
	};
}

function conservativeState(
	state: NoteMaintenanceState,
	cache: NoteCache
): NoteMaintenanceState {
	return {
		...state,
		noteBriefRevision: null,
		cacheRevision: cacheContentRevision(cache),
		affected: {
			noteBrief: cache.noteBrief !== null,
			sectionIds: cache.sections.map((section) => section.id),
		},
		updating: { ...EMPTY_COMPONENTS },
		failure: null,
		bannerDismissedRevision: null,
	};
}

function recoverInterruptedUpdate(
	state: NoteMaintenanceState
): NoteMaintenanceState {
	if (!hasMaintenanceComponents(state.updating)) return state;
	return {
		...state,
		affected: unionComponents(state.affected, state.updating),
		updating: { ...EMPTY_COMPONENTS },
	};
}

/** Validate persisted state and downgrade cache/state mismatches to outdated. */
export function normalizeMaintenanceStateMap(
	raw: unknown,
	caches: Record<string, NoteCache>
): { states: MaintenanceStateMap; changed: boolean } {
	if (raw === undefined) return { states: {}, changed: false };
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return { states: {}, changed: true };
	}

	const states: MaintenanceStateMap = {};
	let changed = false;
	for (const [path, value] of Object.entries(raw)) {
		const parsed = noteMaintenanceStateSchema.safeParse(value);
		const cache = caches[path];
		if (!parsed.success) {
			changed = true;
			continue;
		}
		const normalized = {
			...parsed.data,
			affected: normalizeComponents(parsed.data.affected),
			updating: normalizeComponents(parsed.data.updating),
			failure: parsed.data.failure
				? {
						...parsed.data.failure,
						components: normalizeComponents(parsed.data.failure.components),
					}
				: null,
		};
		let reconciled = normalized;
		if (cache) {
			reconciled = normalized.cacheRevision === cacheContentRevision(cache)
				? normalized
				: conservativeState(normalized, cache);
		} else if (normalized.cacheRevision !== null) {
			reconciled = {
				...normalized,
				noteBriefRevision: null,
				cacheRevision: null,
				affected: unionComponents(
					normalized.affected,
					normalized.updating
				),
				updating: { ...EMPTY_COMPONENTS },
				failure: null,
				bannerDismissedRevision: null,
			};
		}
		states[path] = recoverInterruptedUpdate(reconciled);
		if (JSON.stringify(states[path]) !== JSON.stringify(value)) changed = true;
	}
	return { states, changed };
}

export type PersistStudyMaterialFn = (
	caches: Record<string, NoteCache>,
	states: MaintenanceStateMap
) => Promise<void>;

/** Cache and maintenance-state store with one persistence callback per mutation. */
export class StudyMaterialStore {
	private caches: Record<string, NoteCache>;
	private states: MaintenanceStateMap;

	constructor(
		initialCaches: Record<string, NoteCache> | undefined,
		initialStates: MaintenanceStateMap | undefined,
		private readonly persist: PersistStudyMaterialFn
	) {
		this.caches = initialCaches ?? {};
		this.states = initialStates ?? {};
	}

	get(path: string): NoteCache | null {
		return this.caches[path] ?? null;
	}

	getState(path: string): NoteMaintenanceState | null {
		return this.states[path] ?? null;
	}

	has(path: string): boolean {
		return path in this.caches;
	}

	async commit(
		path: string,
		cache: NoteCache | null,
		state: NoteMaintenanceState | null
	): Promise<void> {
		if (
			(this.caches[path] ?? null) === cache &&
			(this.states[path] ?? null) === state
		) {
			return;
		}
		if (cache) this.caches[path] = cache;
		else delete this.caches[path];
		if (state) this.states[path] = state;
		else delete this.states[path];
		await this.persistSnapshots();
	}

	async rename(from: string, to: string): Promise<void> {
		if (from === to || (!(from in this.caches) && !(from in this.states))) return;
		if (from in this.caches) this.caches[to] = this.caches[from];
		if (from in this.states) this.states[to] = this.states[from];
		delete this.caches[from];
		delete this.states[from];
		await this.persistSnapshots();
	}

	async delete(path: string): Promise<void> {
		if (!(path in this.caches) && !(path in this.states)) return;
		delete this.caches[path];
		delete this.states[path];
		await this.persistSnapshots();
	}

	snapshot(): Record<string, NoteCache> {
		return { ...this.caches };
	}

	stateSnapshot(): MaintenanceStateMap {
		return { ...this.states };
	}

	private async persistSnapshots(): Promise<void> {
		await this.persist(this.snapshot(), this.stateSnapshot());
	}
}
