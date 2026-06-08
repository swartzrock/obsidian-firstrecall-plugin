/**
 * Typography / layout controls for the Cornell view (V1.2). These are display-only
 * knobs — they change how the cached cues are laid out (cue-column width) and sized
 * (cue font size) without ever touching generation or the cache. Like
 * {@link CornellStyle}, the view tags its root with a CSS class per option and
 * `styles.css` carries the look; this module is the single source of truth so the
 * settings dropdowns, the view, and the tests all agree.
 */

export type CueColumnWidth = "narrow" | "medium" | "wide";
export type CueFontSize = "small" | "medium" | "large";

export interface LayoutOptionInfo<T extends string> {
	id: T;
	label: string;
	description: string;
}

export const CUE_COLUMN_WIDTHS: readonly LayoutOptionInfo<CueColumnWidth>[] = [
	{
		id: "narrow",
		label: "Narrow",
		description: "Slim cue rail that leaves more room for notes.",
	},
	{
		id: "medium",
		label: "Medium",
		description: "Balanced cue rail (the default).",
	},
	{
		id: "wide",
		label: "Wide",
		description: "Roomy cue rail for longer questions and more keywords.",
	},
] as const;

export const CUE_FONT_SIZES: readonly LayoutOptionInfo<CueFontSize>[] = [
	{
		id: "small",
		label: "Small",
		description: "Compact cue text to fit more on screen.",
	},
	{
		id: "medium",
		label: "Medium",
		description: "Default cue text size.",
	},
	{
		id: "large",
		label: "Large",
		description: "Larger, easier-to-read cue text.",
	},
] as const;

export const DEFAULT_CUE_COLUMN_WIDTH: CueColumnWidth = "medium";
export const DEFAULT_CUE_FONT_SIZE: CueFontSize = "medium";

/** Narrow an arbitrary value to a known {@link CueColumnWidth}. */
export function isCueColumnWidth(value: unknown): value is CueColumnWidth {
	return CUE_COLUMN_WIDTHS.some((w) => w.id === value);
}

/** Narrow an arbitrary value to a known {@link CueFontSize}. */
export function isCueFontSize(value: unknown): value is CueFontSize {
	return CUE_FONT_SIZES.some((f) => f.id === value);
}

/**
 * The CSS class the Cornell view applies for a given cue-column width. Unknown or
 * garbage values (e.g. data from a newer version) fall back to the default so the
 * view always renders something sensible.
 */
export function cueColumnWidthClass(value: unknown): string {
	const id = isCueColumnWidth(value) ? value : DEFAULT_CUE_COLUMN_WIDTH;
	return `cuecraft-cuewidth-${id}`;
}

/** The CSS class the Cornell view applies for a given cue font size. */
export function cueFontSizeClass(value: unknown): string {
	const id = isCueFontSize(value) ? value : DEFAULT_CUE_FONT_SIZE;
	return `cuecraft-cuefont-${id}`;
}
