import type { CueLineData } from "./cue-extension";
import type { EditorCueDisplay } from "./editor-cue-display";
import type { SectionLens } from "./schemas";

export type EditorHookCardKind = "hook" | "failed";
export type EditorHookCardState = "current" | "upcoming";
export type EditorHookTone = "warm" | "cool";

export interface EditorHookCardOptions {
	showSummary?: boolean;
	showQuestion?: boolean;
	showTerms?: boolean;
}

export interface EditorHookCard {
	kind: EditorHookCardKind;
	display: EditorCueDisplay;
	line: number;
	heading: string;
	hookTitle: string;
	originalQuestion: string;
	keywords: string[];
	sectionLens: SectionLens | null;
	error: string | null;
	titleDensity: "standard" | "long" | "dense";
	state: EditorHookCardState;
	tone: EditorHookTone;
	gradientIndex: number;
	showSummary: boolean;
	showQuestion: boolean;
	showTerms: boolean;
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
	const showTerms = options.showTerms ?? true;
	return {
		kind: failed ? "failed" : "hook",
		display,
		line: cue.line,
		heading: cue.heading,
		hookTitle,
		originalQuestion: cue.question,
		keywords: cue.keywords,
		sectionLens: cue.sectionLens,
		error: cue.error,
		titleDensity: editorHookTitleDensity(hookTitle),
		state,
		tone: index % 2 === 0 ? "warm" : "cool",
		gradientIndex: index % 3,
		showSummary,
		showQuestion,
		showTerms,
	};
}

function editorHookTitle(cue: CueLineData): string {
	return cue.error
		? "Section cue unavailable"
		: buildEditorHookTitle(cue.question) ?? cue.heading;
}

export function buildEditorHookTitle(question: string | null): string | null {
	const normalized = question
		?.replace(/\s+/g, " ")
		.replace(/\s+([,.;:!?])/g, "$1")
		.trim();
	if (!normalized) return null;
	const withoutTerminalQuestion = normalized.replace(/[?\s]+$/g, "").trim();
	return withoutTerminalQuestion || normalized;
}

export function editorHookTitleDensity(
	title: string
): "standard" | "long" | "dense" {
	const normalized = title.replace(/\s+/g, " ").trim();
	const wordCount = normalized ? normalized.split(" ").length : 0;
	if (normalized.length > 88 || wordCount > 13) return "dense";
	if (normalized.length > 66 || wordCount > 10) return "long";
	return "standard";
}
