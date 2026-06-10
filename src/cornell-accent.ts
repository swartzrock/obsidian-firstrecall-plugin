/**
 * Cue accent color (Appearance). Display-only: it tints the cue questions and
 * keyword chips. As with {@link CornellStyle}, the chosen option maps to a CSS
 * class and `styles.css` carries the actual color (including the settings
 * swatch), so this module stays the single source of truth for the option list
 * while the look lives in CSS.
 */
export type CueAccent = "violet" | "teal" | "amber" | "rose";

export interface CueAccentInfo {
	id: CueAccent;
	label: string;
}

export const CUE_ACCENTS: readonly CueAccentInfo[] = [
	{ id: "violet", label: "Violet" },
	{ id: "teal", label: "Teal" },
	{ id: "amber", label: "Amber" },
	{ id: "rose", label: "Rose" },
] as const;

export const DEFAULT_CUE_ACCENT: CueAccent = "violet";

/** Narrow an arbitrary value to a known {@link CueAccent}. */
export function isCueAccent(value: unknown): value is CueAccent {
	return CUE_ACCENTS.some((a) => a.id === value);
}

/**
 * The CSS class that paints a given accent. Unknown/garbage values (e.g. data
 * from a newer version) fall back to the default so something sensible renders.
 */
export function cueAccentClass(value: unknown): string {
	const id = isCueAccent(value) ? value : DEFAULT_CUE_ACCENT;
	return `cuecraft-accent-${id}`;
}
