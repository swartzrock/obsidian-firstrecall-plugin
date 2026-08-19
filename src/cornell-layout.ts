/** Typography controls shared by the retained editor cue displays. */
export type CueFontSize = "small" | "medium" | "large";

export interface LayoutOptionInfo<T extends string> {
	id: T;
	label: string;
	description: string;
}

export const CUE_FONT_SIZES: readonly LayoutOptionInfo<CueFontSize>[] = [
	{
		id: "small",
		label: "Small",
		description: "Compact study text to fit more on screen.",
	},
	{
		id: "medium",
		label: "Medium",
		description: "Default study text size.",
	},
	{
		id: "large",
		label: "Large",
		description: "Larger, easier-to-read study text.",
	},
] as const;

export const DEFAULT_CUE_FONT_SIZE: CueFontSize = "medium";

/** Narrow an arbitrary value to a known {@link CueFontSize}. */
export function isCueFontSize(value: unknown): value is CueFontSize {
	return CUE_FONT_SIZES.some((f) => f.id === value);
}

/** The CSS class an editor cue uses for the configured font size. */
export function cueFontSizeClass(value: unknown): string {
	const id = isCueFontSize(value) ? value : DEFAULT_CUE_FONT_SIZE;
	return `firstrecall-cuefont-${id}`;
}
