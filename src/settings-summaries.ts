import type { CueFontSize } from "./cornell-layout";
import {
	editorCueDisplayOption,
	type EditorCueDisplay,
} from "./editor-cue-display";

export interface EditingViewSettingsSummaryInput {
	editorCueDisplay: EditorCueDisplay;
	cueFontSize: CueFontSize;
	showRailSummary: boolean;
	showRailQuestions: boolean;
	showRailSupportTerms: boolean;
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
