/**
 * Cue-generation knobs surfaced in settings (question style + cue density).
 *
 * Like {@link CornellStyle} and the layout module, this is the single source of
 * truth for the option lists so the settings controls, the (future) generation
 * prompt, and the tests all agree. These are currently settings-only; wiring
 * them into the prompt lands with the generation work.
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

/** How many recall questions to draft per section. */
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
	return (
		CUE_DENSITIES.find((d) => d.value === density)?.label ?? "Balanced"
	);
}
