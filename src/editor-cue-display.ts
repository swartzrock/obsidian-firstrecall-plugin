export type EditorCueDisplay =
	| "inline-cues"
	| "anchored-card-rail"
	| "collapsed-tabs";

export interface EditorCueDisplayOption {
	id: EditorCueDisplay;
	label: string;
	description: string;
}

export const DEFAULT_EDITOR_CUE_DISPLAY: EditorCueDisplay = "inline-cues";

export const EDITOR_CUE_DISPLAY_OPTIONS: readonly EditorCueDisplayOption[] = [
	{
		id: "inline-cues",
		label: "Inline cues",
		description: "Show cached cues beneath their headings in the editor.",
	},
	{
		id: "anchored-card-rail",
		label: "Anchored card rail",
		description: "Show colorful hook cards beside their editor sections.",
	},
	{
		id: "collapsed-tabs",
		label: "Collapsed color tabs",
		description: "Show compact cue tabs with one expanded hook peek.",
	},
];

export function isEditorCueDisplay(
	value: unknown
): value is EditorCueDisplay {
	return EDITOR_CUE_DISPLAY_OPTIONS.some((option) => option.id === value);
}

export function editorCueDisplayOption(
	display: EditorCueDisplay
): EditorCueDisplayOption {
	return (
		EDITOR_CUE_DISPLAY_OPTIONS.find((option) => option.id === display) ??
		EDITOR_CUE_DISPLAY_OPTIONS[0]
	);
}
