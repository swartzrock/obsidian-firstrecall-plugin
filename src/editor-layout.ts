/**
 * Editor cue-placement control (V1.2). A display-only knob for where the inline
 * editor cue layer sits relative to its heading:
 *   - "under" — a full-width block directly beneath the heading (the default).
 *   - "rail"  — a compact card pulled to the left margin, so the note text keeps
 *               its width and cues read like margin annotations.
 *
 * Like the Cornell layout controls, this never touches generation or the cache;
 * the plugin tags `document.body` with a CSS class per option and `styles.css`
 * carries the look. This module is the single source of truth so settings and
 * tests agree.
 */

export type EditorCuePlacement = "under" | "rail";

export interface EditorLayoutOptionInfo<T extends string> {
	id: T;
	label: string;
	description: string;
}

export const EDITOR_CUE_PLACEMENTS: readonly EditorLayoutOptionInfo<EditorCuePlacement>[] =
	[
		{
			id: "under",
			label: "Under heading",
			description:
				"Cue block sits on its own line directly beneath the heading (the default).",
		},
		{
			id: "rail",
			label: "Left rail",
			description:
				"Cue is pulled into the left margin as a compact card, keeping note text full-width.",
		},
	] as const;

export const DEFAULT_EDITOR_CUE_PLACEMENT: EditorCuePlacement = "under";

/** Narrow an arbitrary value to a known {@link EditorCuePlacement}. */
export function isEditorCuePlacement(
	value: unknown
): value is EditorCuePlacement {
	return EDITOR_CUE_PLACEMENTS.some((p) => p.id === value);
}

/**
 * The CSS class the plugin applies to `document.body` for a given placement.
 * Unknown/garbage values (e.g. data from a newer version) fall back to the
 * default so the editor always renders something sensible.
 */
export function editorCuePlacementClass(value: unknown): string {
	const id = isEditorCuePlacement(value)
		? value
		: DEFAULT_EDITOR_CUE_PLACEMENT;
	return `cuecraft-editorcue-${id}`;
}
