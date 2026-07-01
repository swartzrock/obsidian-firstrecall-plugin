export type EditorHookCardStyle = "classic" | "gradient";

export interface EditorHookCardStyleOption {
	id: EditorHookCardStyle;
	label: string;
	description: string;
}

export const DEFAULT_EDITOR_HOOK_CARD_STYLE: EditorHookCardStyle = "classic";

export const EDITOR_HOOK_CARD_STYLE_OPTIONS: EditorHookCardStyleOption[] = [
	{
		id: "classic",
		label: "Classic warm/cool",
		description: "Use the original orange and blue hook rail cards.",
	},
	{
		id: "gradient",
		label: "Soft gradients",
		description: "Repeat teal, amber, and violet review cards in the hook rail.",
	},
];

export function isEditorHookCardStyle(
	value: unknown
): value is EditorHookCardStyle {
	return EDITOR_HOOK_CARD_STYLE_OPTIONS.some((option) => option.id === value);
}

export function editorHookCardStyleOption(
	style: EditorHookCardStyle
): EditorHookCardStyleOption {
	return (
		EDITOR_HOOK_CARD_STYLE_OPTIONS.find((option) => option.id === style) ??
		EDITOR_HOOK_CARD_STYLE_OPTIONS[0]
	);
}
