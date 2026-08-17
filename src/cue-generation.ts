/**
 * The single Question-generation choice shared by persistence, prompts, and UI.
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

export const DEFAULT_QUESTION_TYPE: QuestionType = QUESTION_TYPES[0].id;

/** Narrow an arbitrary value to a supported Question type. */
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

export const DEFAULT_CUE_GENERATION_OPTIONS: CueGenerationOptions = {
	questionType: DEFAULT_QUESTION_TYPE,
};

interface LegacyQuestionSettings {
	cuePreset?: unknown;
	cueDensity?: unknown;
	questionStyle?: unknown;
}

const RETIRED_QUESTION_TYPE_PROFILES: ReadonlySet<unknown> = new Set([
	"conceptual",
	"exam-prep",
	"vocabulary",
	"minimal",
]);
const RETIRED_QUESTION_TYPE_LEVELS: ReadonlySet<unknown> = new Set([1, 2, 3]);
const RETIRED_QUESTION_TYPE_MODES: ReadonlySet<unknown> = new Set([
	"recall",
	"socratic",
	"exam",
]);

/**
 * Collapse the retired preset, density, and style knobs into one Question type.
 * Invalid values and combinations that nominate different types intentionally
 * return the neutral Conceptual question default.
 */
export function resolveLegacyQuestionType(
	legacy: LegacyQuestionSettings
): QuestionType {
	const candidates = new Set<QuestionType>();

	if (Object.prototype.hasOwnProperty.call(legacy, "cuePreset")) {
		if (!RETIRED_QUESTION_TYPE_PROFILES.has(legacy.cuePreset)) {
			return DEFAULT_QUESTION_TYPE;
		}
		switch (legacy.cuePreset) {
			case "exam-prep":
				candidates.add("exam-practice");
				break;
			case "vocabulary":
				candidates.add("vocabulary-check");
				break;
			case "minimal":
				candidates.add("direct-recall");
		}
	}

	if (Object.prototype.hasOwnProperty.call(legacy, "cueDensity")) {
		if (!RETIRED_QUESTION_TYPE_LEVELS.has(legacy.cueDensity)) {
			return DEFAULT_QUESTION_TYPE;
		}
		if (legacy.cueDensity === 1) candidates.add("direct-recall");
	}

	if (Object.prototype.hasOwnProperty.call(legacy, "questionStyle")) {
		if (!RETIRED_QUESTION_TYPE_MODES.has(legacy.questionStyle)) {
			return DEFAULT_QUESTION_TYPE;
		}
		if (legacy.questionStyle === "exam") candidates.add("exam-practice");
		if (legacy.questionStyle === "socratic") {
			candidates.add("socratic-reasoning");
		}
	}

	const [candidate] = candidates;
	return candidates.size === 1 && candidate
		? candidate
		: DEFAULT_QUESTION_TYPE;
}
