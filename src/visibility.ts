/**
 * Per-note generated-study-material visibility (v1.0 epic G: enable/hide per note).
 *
 * Notes are shown by default; only hidden notes are persisted, so the stored
 * map stays small and an absent entry means "shown". Hiding suppresses generated
 * study material for a note without deleting its cache, so re-enabling restores
 * that material without regenerating.
 */
export type PersistFn = (map: Record<string, true>) => Promise<void>;

/** What clicking the status pill should do for a given status. */
export type PillAction = "open-settings" | "toggle-visibility" | "none";

/**
 * Decide the click behavior of the status pill from its current status:
 * unconfigured opens settings; mid-generation / study mode is inert; an idle
 * note (ready/stale/hidden) toggles its generated study material.
 */
export function pillAction(status: string): PillAction {
	if (status === "setup") return "open-settings";
	if (status === "generating" || status === "study") return "none";
	return "toggle-visibility";
}

/** Context-menu label reflecting the note's current visibility. */
export function visibilityMenuLabel(isHidden: boolean): string {
	return isHidden
		? "FirstRecall: Show generated content for this note"
		: "FirstRecall: Hide generated content for this note";
}

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
 * Tracks which notes have their generated study material hidden. Holds an in-memory map and
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

	/** Hide a note's generated study material. No-op (and no write) if already hidden. */
	async hide(path: string): Promise<void> {
		if (this.hidden[path]) return;
		this.hidden[path] = true;
		await this.persist(this.hidden);
	}

	/** Show a note's generated study material. No-op (and no write) if already shown. */
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
