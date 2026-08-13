import {
	DEFAULT_CUE_COLUMN_WIDTH,
	isCueColumnWidth,
	type CueColumnWidth,
} from "./cornell-layout";

export type EditorCueWidthPreset = CueColumnWidth;

export const DEFAULT_EDITOR_CUE_WIDTH_PRESET: EditorCueWidthPreset =
	DEFAULT_CUE_COLUMN_WIDTH;
export const EDITOR_CUE_WIDTH_MIN_PX = 96;
export const EDITOR_CUE_WIDTH_MAX_PX = 512;
export const EDITOR_CUE_WIDTH_KEYBOARD_STEP_PX = 8;
export const EDITOR_CUE_WIDTH_WORKSPACE_INSET_PX = 12;

export function normalizeEditorCueWidthPreset(
	value: unknown,
	legacyCueColumnWidth?: unknown
): EditorCueWidthPreset {
	if (isCueColumnWidth(value)) return value;
	if (value === undefined && isCueColumnWidth(legacyCueColumnWidth)) {
		return legacyCueColumnWidth;
	}
	return DEFAULT_EDITOR_CUE_WIDTH_PRESET;
}

export function normalizeEditorCueCustomWidthPx(value: unknown): number | null {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		!Number.isInteger(value) ||
		value < EDITOR_CUE_WIDTH_MIN_PX ||
		value > EDITOR_CUE_WIDTH_MAX_PX
	) {
		return null;
	}
	return value;
}

export function clampEditorCueWidthPx(
	widthPx: number,
	dynamicMaxWidthPx: number
): number {
	const boundedMaximum = Number.isFinite(dynamicMaxWidthPx)
		? Math.min(
				EDITOR_CUE_WIDTH_MAX_PX,
				Math.max(EDITOR_CUE_WIDTH_MIN_PX, Math.floor(dynamicMaxWidthPx))
			)
		: EDITOR_CUE_WIDTH_MAX_PX;
	return Math.min(
		boundedMaximum,
		Math.max(EDITOR_CUE_WIDTH_MIN_PX, Math.round(widthPx))
	);
}

export function editorCueWidthFromLeftEdgeDrag(
	startWidthPx: number,
	startPointerX: number,
	currentPointerX: number,
	dynamicMaxWidthPx: number
): number {
	return clampEditorCueWidthPx(
		startWidthPx + startPointerX - currentPointerX,
		dynamicMaxWidthPx
	);
}

export function editorCueDynamicMaxWidthPx(
	cardRightPx: number,
	workspaceLeftPx: number
): number {
	return clampEditorCueWidthPx(
		EDITOR_CUE_WIDTH_MAX_PX,
		cardRightPx - workspaceLeftPx - EDITOR_CUE_WIDTH_WORKSPACE_INSET_PX
	);
}

export function editorCueWidthFromKeyboard(
	key: string,
	currentWidthPx: number,
	dynamicMaxWidthPx: number
): number | null {
	switch (key) {
		case "ArrowLeft":
			return clampEditorCueWidthPx(
				currentWidthPx + EDITOR_CUE_WIDTH_KEYBOARD_STEP_PX,
				dynamicMaxWidthPx
			);
		case "ArrowRight":
			return clampEditorCueWidthPx(
				currentWidthPx - EDITOR_CUE_WIDTH_KEYBOARD_STEP_PX,
				dynamicMaxWidthPx
			);
		case "Home":
			return EDITOR_CUE_WIDTH_MIN_PX;
		case "End":
			return clampEditorCueWidthPx(
				dynamicMaxWidthPx,
				dynamicMaxWidthPx
			);
		default:
			return null;
	}
}
