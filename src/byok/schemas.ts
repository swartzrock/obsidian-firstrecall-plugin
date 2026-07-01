import { z } from "zod";

/**
 * Validation for provider output. BYOK accepts a little model variation at the
 * boundary, then normalizes to the public cue and summary contracts.
 */
export const confidenceSchema = z.enum(["high", "medium", "low"]);

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

export type CueOutput = z.infer<typeof cueOutputSchema>;
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

/**
 * Extract a JSON object from a model response that may be wrapped in prose
 * or fenced code blocks. Returns the parsed value or null if no object found.
 */
export function extractJson(raw: string): unknown {
	const trimmed = raw.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced ? fenced[1].trim() : trimmed;

	try {
		return JSON.parse(candidate);
	} catch {
		// Fall through to brace extraction.
	}

	const start = candidate.indexOf("{");
	const end = candidate.lastIndexOf("}");
	if (start !== -1 && end !== -1 && end > start) {
		try {
			return JSON.parse(candidate.slice(start, end + 1));
		} catch {
			return null;
		}
	}
	return null;
}

function formatZodError(error: z.ZodError): string {
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
