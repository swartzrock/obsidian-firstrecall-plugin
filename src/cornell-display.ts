export type CornellDisplayMode = "classic" | "hook";

export interface CornellDisplayModeOption {
	id: CornellDisplayMode;
	label: string;
	description: string;
}

export const DEFAULT_CORNELL_DISPLAY_MODE: CornellDisplayMode = "classic";

export const CORNELL_DISPLAY_MODES: readonly CornellDisplayModeOption[] = [
	{
		id: "classic",
		label: "Cornell",
		description: "Show the full Cornell cue column beside the note.",
	},
	{
		id: "hook",
		label: "Hook rail",
		description: "Show compact hook cards that focus matching note sections.",
	},
];

export function isCornellDisplayMode(
	value: unknown
): value is CornellDisplayMode {
	return value === "classic" || value === "hook";
}

export function cornellDisplayModeOption(
	mode: CornellDisplayMode
): CornellDisplayModeOption {
	return (
		CORNELL_DISPLAY_MODES.find((option) => option.id === mode) ??
		CORNELL_DISPLAY_MODES[0]
	);
}
