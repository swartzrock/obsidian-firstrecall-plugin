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

export interface CornellViewSettingsSummaryInput {
	cornellDisplayMode: CornellDisplayMode;
	cornellStyle: CornellStyle;
	cueColumnWidth: CueColumnWidth;
	cueFontSize: CueFontSize;
}

export interface EditingViewSettingsSummaryInput {
	editorCueDisplay: EditorCueDisplay;
	cueFontSize: CueFontSize;
	showRailSummary: boolean;
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
	const visibleSections = [
		settings.showRailSummary ? "Summary" : null,
		settings.showRailQuestions ? "Question" : null,
		settings.showRailSupportTerms ? "Terms" : null,
	].filter((section): section is string => section !== null);
	return `${editorDisplay} · ${settings.cueFontSize} text · ${visibleSections.join(", ")}`;
}
