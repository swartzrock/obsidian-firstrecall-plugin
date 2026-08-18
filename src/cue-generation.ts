/**
 * The single recall-question style shared by persistence, prompts, and UI.
 */
export const QUESTION_TYPES = [
	{
		id: "conceptual",
		label: "Conceptual question",
		description: "Tests the section's main idea and an important relationship.",
		guidance:
			"Ask one clear question that tests the section's main idea and one important relationship or implication.",
	},
	{
		id: "direct-recall",
		label: "Direct recall",
		description: "Asks for the single most important fact or idea.",
		guidance:
			"Ask one short, direct recall question focused on the single most important fact or idea.",
	},
	{
		id: "exam-practice",
		label: "Exam practice",
		description: "Uses precise wording similar to an exam prompt.",
		guidance:
			"Ask one precise exam-style question that a student could reasonably be tested on.",
	},
	{
		id: "vocabulary-check",
		label: "Vocabulary check",
		description: "Checks understanding of a key term in context.",
		guidance:
			"Ask one question that checks the meaning or use of the section's most important term in context.",
	},
	{
		id: "socratic-reasoning",
		label: "Socratic reasoning",
		description: "Prompts an explanation of why or how the idea works.",
		guidance:
			"Ask one open Socratic question that prompts the learner to explain why or how the idea works.",
	},
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number]["id"];
export type QuestionTypeInfo = (typeof QUESTION_TYPES)[number];

export const DEFAULT_QUESTION_TYPE: QuestionType = "exam-practice";

/** Narrow an arbitrary value to a supported recall-question style. */
export function isQuestionType(value: unknown): value is QuestionType {
	return QUESTION_TYPES.some((type) => type.id === value);
}

/** Resolve display and prompt copy, falling back to the product default. */
export function questionTypeInfo(value: unknown): QuestionTypeInfo {
	const type = isQuestionType(value) ? value : DEFAULT_QUESTION_TYPE;
	return (
		QUESTION_TYPES.find((candidate) => candidate.id === type) ??
		QUESTION_TYPES[0]
	);
}

export interface CueGenerationOptions {
	questionType: QuestionType;
}
