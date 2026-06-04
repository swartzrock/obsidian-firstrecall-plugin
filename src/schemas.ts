import { z } from "zod";

/**
 * Validation for AI output. v1.0 acceptance criteria H1.1:
 * - question: non-empty string
 * - keywords: 2-5 non-empty strings
 * - confidence: high | medium | low
 *
 * We coerce where the intent is unambiguous before validating, so a usable cue
 * isn't discarded over benign model quirks: extra keywords are trimmed to 5
 * (rather than failing the whole section), blanks/dupes are dropped, and the
 * confidence casing is normalized (falling back to "medium" when unrecognized).
 */
export const confidenceSchema = z.enum(["high", "medium", "low"]);

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
	rationale: z.string().trim().optional(),
});

export const summaryOutputSchema = z.object({
	summary: z.string().trim().min(1, "summary is required"),
	learningObjective: z.string().trim().optional(),
});

export type CueOutput = z.infer<typeof cueOutputSchema>;
export type SummaryOutput = z.infer<typeof summaryOutputSchema>;

export type ValidationResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: string };

/**
 * Extract a JSON object from a model response that may be wrapped in prose
 * or fenced code blocks. Returns the parsed value or null if no object found.
 */
export function extractJson(raw: string): unknown {
	const trimmed = raw.trim();
	// Strip ```json ... ``` or ``` ... ``` fences if present.
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced ? fenced[1].trim() : trimmed;

	// Fast path: the whole thing is JSON.
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
