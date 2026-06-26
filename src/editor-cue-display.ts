export type EditorCueDisplay = "inline-cues";

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
];

export function isEditorCueDisplay(
	value: unknown
): value is EditorCueDisplay {
	return value === "inline-cues";
}

export function editorCueDisplayOption(
	display: EditorCueDisplay
): EditorCueDisplayOption {
	return (
		EDITOR_CUE_DISPLAY_OPTIONS.find((option) => option.id === display) ??
		EDITOR_CUE_DISPLAY_OPTIONS[0]
	);
}
