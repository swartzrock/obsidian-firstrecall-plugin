export type EditorCueDisplay =
	| "cornell"
	| "inline-cues"
	| "anchored-card-rail"
	| "collapsed-tabs"
	| "threaded-margin-notes"
	| "active-section-composer"
	| "hook-minimap";

export interface EditorCueDisplayOption {
	id: EditorCueDisplay;
	label: string;
	description: string;
}

export const DEFAULT_EDITOR_CUE_DISPLAY: EditorCueDisplay = "inline-cues";

export const EDITOR_CUE_DISPLAY_OPTIONS: readonly EditorCueDisplayOption[] = [
	{
		id: "cornell",
		label: "Cornell",
		description: "Show Cornell-style cue cards beneath their headings in the editor.",
	},
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
	{
		id: "threaded-margin-notes",
		label: "Threaded margin notes",
		description: "Show calmer hook notes connected by a margin thread.",
	},
	{
		id: "active-section-composer",
		label: "Active-section composer",
		description: "Emphasize the current section's hook while keeping others nearby.",
	},
	{
		id: "hook-minimap",
		label: "Hook minimap",
		description: "Show a compact section overview with a focused hook popout.",
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
