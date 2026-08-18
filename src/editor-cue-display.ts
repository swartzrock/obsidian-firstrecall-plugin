export type EditorCueDisplay = "cornell" | "inline-cues";

export interface EditorCueDisplayOption {
	id: EditorCueDisplay;
	label: string;
	description: string;
}

export const DEFAULT_EDITOR_CUE_DISPLAY: EditorCueDisplay = "cornell";

export const EDITOR_CUE_DISPLAY_OPTIONS: readonly EditorCueDisplayOption[] = [
	{
		id: "cornell",
		label: "Cornell",
		description: "Show Cornell-style section cards beside their editor sections.",
	},
	{
		id: "inline-cues",
		label: "Inline section cards",
		description: "Show section cards beneath their headings in the editor.",
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
