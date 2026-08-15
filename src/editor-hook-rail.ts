import {
	buildShortFormHookTitle,
	shortFormHookTitleDensity,
} from "./short-form-hook";
import type { CueLineData, Confidence } from "./cue-extension";
import type { EditorCueDisplay } from "./editor-cue-display";
import type { SectionLens } from "./schemas";

export type EditorHookCardKind = "hook" | "failed";
export type EditorHookCardState = "current" | "upcoming";
export type EditorHookTone = "warm" | "cool";

export interface EditorHookCardOptions {
	showSummary?: boolean;
	showQuestion?: boolean;
	showSupportTerms?: boolean;
}

export interface EditorHookCard {
	kind: EditorHookCardKind;
	display: EditorCueDisplay;
	line: number;
	heading: string;
	hookTitle: string;
	originalQuestion: string;
	keywords: string[];
	confidence: Confidence | null;
	sectionLens: SectionLens | null;
	error: string | null;
	titleDensity: "standard" | "long" | "dense";
	state: EditorHookCardState;
	tone: EditorHookTone;
	gradientIndex: number;
	showSummary: boolean;
	showQuestion: boolean;
	showSupportTerms: boolean;
}

export function buildEditorHookCard(
	cue: CueLineData,
	display: EditorCueDisplay,
	index = 0,
	state: EditorHookCardState = "upcoming",
	options: EditorHookCardOptions = {}
): EditorHookCard {
	const failed = Boolean(cue.error);
	const hookTitle = editorHookTitle(cue);
	const showSummary = options.showSummary ?? true;
	const showQuestion = options.showQuestion ?? true;
	const showSupportTerms = options.showSupportTerms ?? true;
	return {
		kind: failed ? "failed" : "hook",
		display,
		line: cue.line,
		heading: cue.heading,
		hookTitle,
		originalQuestion: cue.question,
		keywords: cue.keywords,
		confidence: cue.confidence,
		sectionLens: cue.sectionLens,
		error: cue.error,
		titleDensity: shortFormHookTitleDensity(hookTitle),
		state,
		tone: index % 2 === 0 ? "warm" : "cool",
		gradientIndex: index % 3,
		showSummary,
		showQuestion,
		showSupportTerms,
	};
}

function editorHookTitle(cue: CueLineData): string {
	return cue.error
		? "Cue unavailable"
		: buildShortFormHookTitle(cue.question) ?? cue.heading;
}
