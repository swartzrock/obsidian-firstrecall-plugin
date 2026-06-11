/**
 * Visual style presets for the Cornell view (V1.2). Each preset only changes how
 * the cached cues/notes are *displayed* — it never affects generation. The Cornell
 * view tags its root element with the preset's CSS class and `styles.css` carries
 * the per-preset look; this module is the single source of truth for the list so
 * the settings dropdown, the view, and the tests all agree.
 */
export type CornellStyle =
	| "classic"
	| "exam-prep"
	| "legal-pad"
	| "minimal"
	| "handwritten";

export interface CornellStyleInfo {
	id: CornellStyle;
	label: string;
	description: string;
}

export const CORNELL_STYLES: readonly CornellStyleInfo[] = [
	{
		id: "classic",
		label: "Cornell Classic",
		description: "Theme-aware cue rail with a divider (the default).",
	},
		{
			id: "exam-prep",
			label: "Exam Prep",
			description: "Boxed cues tuned for review.",
		},
	{
		id: "legal-pad",
		label: "Legal Pad",
		description: "Yellow ruled paper with a red margin rule and serif type.",
	},
	{
		id: "minimal",
		label: "Minimal",
		description: "Quiet, borderless cues that stay out of the way.",
	},
	{
		id: "handwritten",
		label: "Handwritten",
		description: "Casual handwriting font with a dashed, slightly tilted card.",
	},
] as const;

export const DEFAULT_CORNELL_STYLE: CornellStyle = "classic";

/** Narrow an arbitrary string to a known {@link CornellStyle}. */
export function isCornellStyle(value: unknown): value is CornellStyle {
	return CORNELL_STYLES.some((s) => s.id === value);
}

/**
 * The CSS class the Cornell view applies for a given preset. Unknown/garbage
 * values (e.g. data from a newer version) fall back to the default so the view
 * always renders something sensible.
 */
export function cornellStyleClass(value: unknown): string {
	const id = isCornellStyle(value) ? value : DEFAULT_CORNELL_STYLE;
	return `cuecraft-style-${id}`;
}
