import { z } from "zod/v3";

/**
 * Validation for CueCraft provider output. The app accepts a little model
 * variation at the boundary, then normalizes to the cue and summary contracts.
 */
export const confidenceSchema = z.enum(["high", "medium", "low"]);
export const CUE_CATEGORY_VALUES = [
	"sequences",
	"linkedlists",
	"stacks",
	"intervals",
] as const;
export const CUE_CATEGORY_PROMPT_VALUES = CUE_CATEGORY_VALUES.map(
	(value) => `"${value}"`
).join(" | ");
export const cueCategorySchema = z.enum(CUE_CATEGORY_VALUES);

export const sectionLensSchema = z.object({
	takeaway: z.string().trim().min(1, "sectionLens.takeaway is required"),
	keyPhrase: z.string().trim().min(1, "sectionLens.keyPhrase is required"),
	explanation: z.string().trim().min(1, "sectionLens.explanation is required"),
});

/** Drop blanks, trim, dedupe case-insensitively, and cap at 5 keywords. */
function coerceKeywords(value: unknown): unknown {
	if (!Array.isArray(value)) return value;
	const seen = new Set<string>();
	const out: string[] = [];
	for (const item of value) {
		if (typeof item !== "string") continue;
		const trimmed = item.trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(trimmed);
		if (out.length === 5) break;
	}
	return out;
}

/** Normalize confidence casing; fall back to "medium" when unrecognized. */
function coerceConfidence(value: unknown): unknown {
	if (typeof value === "number" && Number.isFinite(value)) {
		if (value >= 0.67) return "high";
		if (value >= 0.34) return "medium";
		return "low";
	}
	if (typeof value !== "string") return value;
	const normalized = value.trim().toLowerCase();
	return confidenceSchema.options.includes(normalized as z.infer<typeof confidenceSchema>)
		? normalized
		: "medium";
}

export const cueOutputSchema = z.object({
	question: z.string().trim().min(1, "question is required"),
	keywords: z.preprocess(coerceKeywords, z.array(z.string().min(1)).min(2).max(5)),
	confidence: z.preprocess(coerceConfidence, confidenceSchema),
	category: cueCategorySchema.optional(),
	rationale: z.preprocess(
		(value) => (value === null ? undefined : value),
		z.string().trim().optional()
	),
	sectionLens: z.preprocess(
		(value) => (value === null ? undefined : value),
		sectionLensSchema.optional()
	),
});

export const summaryOutputSchema = z.object({
	summary: z.string().trim().min(1, "summary is required"),
	learningObjective: z.preprocess(
		(value) => (value === null ? undefined : value),
		z.string().trim().optional()
	),
});

const noteBriefCardSchema = z.object({
	title: z.string().trim().min(1, "title is required"),
	detail: z.string().trim().min(1, "detail is required"),
});

export const noteBriefOutputSchema = z.object({
	overview: z.string().trim().min(1, "overview is required"),
	whatMatters: noteBriefCardSchema,
	reviewFirst: noteBriefCardSchema,
	sayItBack: noteBriefCardSchema,
});

export const cueGenerationSchema = z.object({
	question: z.string().describe("A single active-recall question for the section."),
	keywords: z
		.array(z.string())
		.describe("2 to 5 short keyword hints that help recall the answer."),
	confidence: z
		.enum(["high", "medium", "low"])
		.describe("How confident you are this cue tests the section well."),
	category: cueCategorySchema
		.optional()
		.describe(
			`Optional semantic family: ${CUE_CATEGORY_VALUES.join(", ")}.`
		),
	rationale: z
		.string()
		.nullable()
		.describe("If confidence is low, a short reason why this cue may need review."),
	sectionLens: z
		.object({
			takeaway: z
				.string()
				.describe("One short sentence summarizing the section's most important idea."),
			keyPhrase: z
				.string()
				.describe("The most important phrase or term to notice."),
			explanation: z
				.string()
				.describe("One short sentence explaining why the phrase matters for recall."),
		})
		.describe("A compact AI-native review lens for this section."),
});

export const summaryGenerationSchema = z.object({
	summary: z
		.string()
		.describe("One concise study takeaway sentence capturing the most important idea or relationship."),
	learningObjective: z
		.string()
		.nullable()
		.describe("One short sentence stating what the reader should be able to do."),
});

const noteBriefCardGenerationSchema = z.object({
	title: z.string().describe("Short, specific card title."),
	detail: z.string().describe("One concise sentence explaining the card."),
});

export const noteBriefGenerationSchema = z.object({
	overview: z
		.string()
		.describe("Exactly 2 concise sentences summarizing the note."),
	whatMatters: noteBriefCardGenerationSchema.describe(
		"Central claim card with a content-specific title that does not repeat 'Core idea'."
	),
	reviewFirst: noteBriefCardGenerationSchema.describe(
		"Best first review target with a content-specific title that does not repeat 'Review first'."
	),
	sayItBack: noteBriefCardGenerationSchema.describe(
		"Active recall card whose title is the recall question, not 'Self-test'."
	),
});

export type CueOutput = z.infer<typeof cueOutputSchema>;
export type CueCategory = z.infer<typeof cueCategorySchema>;
export type SectionLens = z.infer<typeof sectionLensSchema>;
export type SummaryOutput = z.infer<typeof summaryOutputSchema>;
export type NoteBriefOutput = z.infer<typeof noteBriefOutputSchema>;

export interface CueBatchValidationItem {
	value: CueOutput | null;
	error: string | null;
}

export type ValidationResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: string };

type JsonParseResult =
	| { ok: true; value: unknown }
	| { ok: false };

function parseJson(candidate: string): JsonParseResult {
	try {
		return { ok: true, value: JSON.parse(candidate) };
	} catch {
		return { ok: false };
	}
}

function extractBalancedJsonObject(candidate: string): unknown {
	let best: { end: number; start: number; value: unknown } | null = null;

	for (let start = 0; start < candidate.length; start++) {
		if (candidate[start] !== "{") continue;

		let depth = 0;
		let inString = false;
		let escaped = false;

		for (let end = start; end < candidate.length; end++) {
			const char = candidate[end];

			if (escaped) {
				escaped = false;
				continue;
			}

			if (char === "\\") {
				escaped = inString;
				continue;
			}

			if (char === '"') {
				inString = !inString;
				continue;
			}

			if (inString) continue;

			if (char === "{") {
				depth += 1;
				continue;
			}

			if (char !== "}") continue;

			depth -= 1;
			if (depth !== 0) continue;

			const parsed = parseJson(candidate.slice(start, end + 1));
			if (
				parsed.ok &&
				(!best || end > best.end || (end === best.end && start < best.start))
			) {
				best = { end, start, value: parsed.value };
			}
			break;
		}
	}

	return best?.value ?? null;
}

/**
 * Extract a JSON object from a model response that may be wrapped in prose
 * or fenced code blocks. Returns the parsed value or null if no object found.
 */
export function extractJson(raw: string): unknown {
	const trimmed = raw.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced ? fenced[1].trim() : trimmed;

	const parsed = parseJson(candidate);
	if (parsed.ok) return parsed.value;

	return extractBalancedJsonObject(candidate);
}

export function formatZodError(error: z.ZodError): string {
	return error.issues
		.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
		.join("; ");
}

export function validateCue(raw: string): ValidationResult<CueOutput> {
	const json = extractJson(raw);
	if (json === null) {
		return { ok: false, error: "response was not valid JSON" };
	}
	const parsed = cueOutputSchema.safeParse(json);
	if (!parsed.success) {
		return { ok: false, error: formatZodError(parsed.error) };
	}
	return { ok: true, value: parsed.data };
}

export function validateCueBatch(
	raw: string,
	expectedCount: number
): ValidationResult<CueBatchValidationItem[]> {
	const json = extractJson(raw);
	if (json === null) {
		return { ok: false, error: "response was not valid JSON" };
	}
	const record = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
	const cues = Array.isArray(json)
		? json
		: Array.isArray(record?.cues)
			? record.cues
			: null;
	if (!cues) {
		return { ok: false, error: "response did not include a cues array" };
	}
	const items: CueBatchValidationItem[] = [];
	for (let i = 0; i < expectedCount; i++) {
		const value = cues[i];
		if (value === undefined) {
			items.push({ value: null, error: `missing cue for section ${i + 1}` });
			continue;
		}
		const parsed = cueOutputSchema.safeParse(value);
		if (parsed.success) {
			items.push({ value: parsed.data, error: null });
		} else {
			items.push({ value: null, error: formatZodError(parsed.error) });
		}
	}
	return { ok: true, value: items };
}

export function validateSummary(raw: string): ValidationResult<SummaryOutput> {
	const json = extractJson(raw);
	if (json === null) {
		return { ok: false, error: "response was not valid JSON" };
	}
	const parsed = summaryOutputSchema.safeParse(json);
	if (!parsed.success) {
		return { ok: false, error: formatZodError(parsed.error) };
	}
	return { ok: true, value: parsed.data };
}

export function validateNoteBrief(raw: string): ValidationResult<NoteBriefOutput> {
	const json = extractJson(raw);
	if (json === null) {
		return { ok: false, error: "response was not valid JSON" };
	}
	const parsed = noteBriefOutputSchema.safeParse(json);
	if (!parsed.success) {
		return { ok: false, error: formatZodError(parsed.error) };
	}
	return { ok: true, value: parsed.data };
}
