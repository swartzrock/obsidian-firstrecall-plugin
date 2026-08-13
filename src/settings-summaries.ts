import { CORNELL_STYLES, type CornellStyle } from "./cornell-style";
import {
	type CueColumnWidth,
	type CueFontSize,
} from "./cornell-layout";
import {
	cornellDisplayModeOption,
	type CornellDisplayMode,
} from "./cornell-display";
import {
	editorCueDisplayOption,
	type EditorCueDisplay,
} from "./editor-cue-display";
import {
	editorHookCardStyleOption,
	type EditorHookCardStyle,
} from "./editor-hook-card-style";

export interface CornellViewSettingsSummaryInput {
	cornellDisplayMode: CornellDisplayMode;
	cornellStyle: CornellStyle;
	cueColumnWidth: CueColumnWidth;
	cueFontSize: CueFontSize;
}

export interface EditingViewSettingsSummaryInput {
	editorCueDisplay: EditorCueDisplay;
	editorHookCardStyle: EditorHookCardStyle;
	editorCueWidthPreset: CueColumnWidth;
	editorCueCustomWidthPx: number | null;
	cueFontSize: CueFontSize;
	showRailQuestions: boolean;
	showRailSupportTerms: boolean;
}

export function cornellViewSettingsSummary(
	settings: CornellViewSettingsSummaryInput
): string {
	const mode = cornellDisplayModeOption(settings.cornellDisplayMode).label;
	const style =
		CORNELL_STYLES.find((item) => item.id === settings.cornellStyle)?.label ??
		"Custom";
	return `${mode} · ${style} · ${settings.cueColumnWidth} width · ${settings.cueFontSize} text`;
}

export function editingViewSettingsSummary(
	settings: EditingViewSettingsSummaryInput
): string {
	const editorDisplay = editorCueDisplayOption(settings.editorCueDisplay).label;
	const hookCardStyle = editorHookCardStyleOption(
		settings.editorHookCardStyle
	).label;
	const questionState = settings.showRailQuestions
		? "questions shown"
		: "questions hidden";
	const supportState = settings.showRailSupportTerms
		? "supports shown"
		: "supports hidden";
	const width =
		settings.editorCueCustomWidthPx === null
			? `${settings.editorCueWidthPreset} width`
			: "Custom width";
	return `${editorDisplay} · ${hookCardStyle} · ${width} · ${settings.cueFontSize} text · ${questionState} · ${supportState}`;
}
