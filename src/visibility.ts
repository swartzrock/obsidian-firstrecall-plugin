/**
 * Per-note cue visibility (v1.0 epic G: enable/hide per note).
 *
 * Notes are shown by default; only hidden notes are persisted, so the stored
 * map stays small and an absent entry means "shown". Hiding suppresses the cue
 * layer for a note without deleting its cache, so re-enabling restores the
 * already-generated cues without regenerating.
 */
export type PersistFn = (map: Record<string, true>) => Promise<void>;

/** Coerce arbitrary stored data into a hidden-paths map (defensive on load). */
export function loadHiddenMap(raw: unknown): Record<string, true> {
	if (!raw || typeof raw !== "object") return {};
	const out: Record<string, true> = {};
	for (const [path, value] of Object.entries(raw as Record<string, unknown>)) {
		if (value === true && path) out[path] = true;
	}
	return out;
}

/**
 * Tracks which notes have their cues hidden. Holds an in-memory map and
 * persists via an injected callback, so it's unit-testable without Obsidian.
 */
export class VisibilityStore {
	private hidden: Record<string, true>;
	private persist: PersistFn;

	constructor(initial: Record<string, true> | undefined, persist: PersistFn) {
		this.hidden = initial ?? {};
		this.persist = persist;
	}

	isHidden(path: string): boolean {
		return this.hidden[path] === true;
	}

	/** Hide a note's cues. No-op (and no write) if already hidden. */
	async hide(path: string): Promise<void> {
		if (this.hidden[path]) return;
		this.hidden[path] = true;
		await this.persist(this.hidden);
	}

	/** Show (re-enable) a note's cues. No-op (and no write) if already shown. */
	async show(path: string): Promise<void> {
		if (!this.hidden[path]) return;
		delete this.hidden[path];
		await this.persist(this.hidden);
	}

	/** Move state across a rename so a renamed note keeps its visibility. */
	async rename(from: string, to: string): Promise<void> {
		if (!this.hidden[from]) return;
		delete this.hidden[from];
		this.hidden[to] = true;
		await this.persist(this.hidden);
	}

	snapshot(): Record<string, true> {
		return { ...this.hidden };
	}
}
