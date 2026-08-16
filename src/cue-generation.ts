/**
 * Cue-generation knobs shared by CueCraft provider prompts and settings UI.
 */
export type QuestionStyle = "recall" | "socratic" | "exam";

export interface QuestionStyleInfo {
	id: QuestionStyle;
	label: string;
	description: string;
}

export const QUESTION_STYLES: readonly QuestionStyleInfo[] = [
	{
		id: "recall",
		label: "Recall",
		description: "Direct active-recall questions (the default).",
	},
	{
		id: "socratic",
		label: "Socratic",
		description: "Open, probing questions that push deeper reasoning.",
	},
	{
		id: "exam",
		label: "Exam-style",
		description: "Test-style questions phrased like an exam prompt.",
	},
] as const;

export const DEFAULT_QUESTION_STYLE: QuestionStyle = "recall";

/** Narrow an arbitrary value to a known {@link QuestionStyle}. */
export function isQuestionStyle(value: unknown): value is QuestionStyle {
	return QUESTION_STYLES.some((q) => q.id === value);
}

/** How detailed each section's single recall cue should be. */
export type CueDensity = 1 | 2 | 3;

export interface CueDensityInfo {
	value: CueDensity;
	label: string;
}

export const CUE_DENSITIES: readonly CueDensityInfo[] = [
	{ value: 1, label: "Minimal" },
	{ value: 2, label: "Balanced" },
	{ value: 3, label: "Thorough" },
] as const;

export const DEFAULT_CUE_DENSITY: CueDensity = 2;

/** Narrow an arbitrary value to a known {@link CueDensity}. */
export function isCueDensity(value: unknown): value is CueDensity {
	return CUE_DENSITIES.some((d) => d.value === value);
}

/** Human-readable label for a density value (falls back to the default). */
export function cueDensityLabel(value: unknown): string {
	const density = isCueDensity(value) ? value : DEFAULT_CUE_DENSITY;
	return CUE_DENSITIES.find((d) => d.value === density)?.label ?? "Balanced";
}

export interface CueGenerationOptions {
	cueDensity: CueDensity;
	questionStyle: QuestionStyle;
	generateKeywords: boolean;
}

export const DEFAULT_CUE_GENERATION_OPTIONS: CueGenerationOptions = {
	cueDensity: DEFAULT_CUE_DENSITY,
	questionStyle: DEFAULT_QUESTION_STYLE,
	generateKeywords: true,
};

export function cueDensityGuidance(value: unknown): string {
	const density = isCueDensity(value) ? value : DEFAULT_CUE_DENSITY;
	switch (density) {
		case 1:
			return "Keep the cue minimal: one short, direct question focused on the single most important idea.";
		case 2:
			return "Use balanced detail: one clear question that tests the section's main idea and one important relationship or implication.";
		case 3:
			return "Make the cue thorough: one rich question that may include a short scenario, comparison, or multi-step recall task while still staying concise.";
	}
}

export function questionStyleGuidance(value: unknown): string {
	const style = isQuestionStyle(value) ? value : DEFAULT_QUESTION_STYLE;
	switch (style) {
		case "recall":
			return "Phrase the cue as a direct active-recall question.";
		case "socratic":
			return "Phrase the cue as an open Socratic question that pushes the learner to explain why or how the idea works.";
		case "exam":
			return "Phrase the cue like an exam prompt, using precise wording a student could be tested on.";
	}
}

export function keywordGuidance(generateKeywords: boolean): string {
	return generateKeywords
		? "Return 2 to 5 compact keyword hints."
		: "Return the minimum 2 very short keyword hints for compatibility; the UI may hide them.";
}
