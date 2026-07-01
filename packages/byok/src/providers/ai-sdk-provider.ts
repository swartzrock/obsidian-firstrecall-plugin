import { z } from "zod/v3";
import { generateObject, zodSchema } from "ai";
import type { LanguageModel, Schema } from "ai";
import {
	cueOutputSchema,
	summaryOutputSchema,
	type CueOutput,
	type SummaryOutput,
} from "../schemas";
import {
	cueDensityGuidance,
	keywordGuidance,
	questionStyleGuidance,
} from "../cue-generation";
import {
	AiProvider,
	CueInput,
	ProviderError,
	ProviderRateLimitError,
	ProviderStatus,
	SummaryInput,
} from "./types";

const PRESET_GUIDANCE: Record<string, string> = {
	conceptual: "Favor a single conceptual question that tests understanding, not trivia.",
	"exam-prep": "Write an exam-style question a student is likely to be tested on.",
	vocabulary: "Emphasize key terms and their definitions.",
	minimal: "Keep the question short and direct.",
	simpler: "Use simple, accessible language. Keep the question brief and focused on the single most basic idea.",
};

/**
 * Loose generation schemas handed to the model. They mirror the strict
 * {@link cueOutputSchema}/{@link summaryOutputSchema} but without the coercion
 * `preprocess` wrappers (which don't translate to a clean JSON schema). The
 * model's structured output is run back through the strict schemas so the same
 * coercion (keyword trimming, confidence casing) applies regardless of provider.
 */
const cueGenSchema = z.object({
	question: z.string().describe("A single active-recall question for the section."),
	keywords: z
		.array(z.string())
		.describe("2 to 5 short keyword hints that help recall the answer."),
	confidence: z
		.enum(["high", "medium", "low"])
		.describe("How confident you are this cue tests the section well."),
	rationale: z
		.string()
		.nullable()
		.describe("If confidence is low, a short reason why this cue may need review."),
});

const summaryGenSchema = z.object({
	summary: z
		.string()
		.describe("One concise study takeaway sentence capturing the most important idea or relationship."),
	learningObjective: z
		.string()
		.nullable()
		.describe("One short sentence stating what the reader should be able to do."),
});

/** Injectable structured-output call so the provider can be unit-tested. */
export type ObjectGenerator = <T>(opts: {
	schema: z.ZodType<T, z.ZodTypeDef, unknown>;
	prompt: string;
	signal?: AbortSignal;
}) => Promise<T>;

export const DEFAULT_RATE_LIMIT_RETRIES = 2;
const DEFAULT_RATE_LIMIT_RETRY_MS = 1000;
const MAX_RATE_LIMIT_RETRY_MS = 10_000;

export interface AiSdkProviderConfig {
	/** Stable provider id (e.g. "openai"). */
	id: string;
	/** Human label shown in settings (e.g. "OpenAI (ChatGPT)"). */
	label: string;
	/** Vendor name used in user-facing error/status messages (e.g. "OpenAI"). */
	vendor: string;
	model: string;
	/** Structured-output call; the real one wraps the AI SDK, tests inject a mock. */
	generate: ObjectGenerator;
	/** Optional model-list call for providers that expose discoverable models. */
	listModels?: () => Promise<unknown[]>;
}

function formatZodError(error: z.ZodError): string {
	return error.issues
		.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
		.join("; ");
}

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

function readErrorNumber(e: unknown, keys: string[]): number | null {
	if (!e || typeof e !== "object") return null;
	const record = e as Record<string, unknown>;
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string") {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
	}
	return null;
}

function retryAfterMs(e: unknown): number | null {
	if (!e || typeof e !== "object") return null;
	const record = e as Record<string, unknown>;
	const direct = readErrorNumber(e, ["retryAfterMs", "retry_after_ms"]);
	if (direct !== null) return Math.max(0, direct);
	const seconds = readErrorNumber(e, ["retryAfter", "retry_after"]);
	if (seconds !== null) return Math.max(0, seconds * 1000);
	const headers = record.headers;
	if (headers && typeof (headers as Headers).get === "function") {
		const raw = (headers as Headers).get("retry-after");
		if (raw) {
			const numeric = Number(raw);
			if (Number.isFinite(numeric)) return Math.max(0, numeric * 1000);
			const dateMs = Date.parse(raw);
			if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
		}
	}
	return null;
}

function isRateLimitError(e: unknown): boolean {
	const status = readErrorNumber(e, ["status", "statusCode", "code"]);
	return status === 429 || /429|rate.?limit|quota/i.test(errorMessage(e));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException("Aborted", "AbortError"));
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(new DOMException("Aborted", "AbortError"));
			},
			{ once: true }
		);
	});
}

/**
 * One provider implementation shared by every Vercel AI SDK vendor (Anthropic,
 * OpenAI, Google, xAI). They differ only in which model factory builds the
 * structured-output call, so the prompts, validation and error mapping live
 * here and each vendor subclass just supplies its `generate`.
 */
export class AiSdkProvider implements AiProvider {
	readonly id: string;
	readonly label: string;
	readonly requiresNetwork = true;
	readonly requiresDownload = false;

	protected readonly vendor: string;
	protected readonly model: string;
	private readonly generate: ObjectGenerator;
	private readonly listModelsImpl?: () => Promise<unknown[]>;

	constructor(config: AiSdkProviderConfig) {
		this.id = config.id;
		this.label = config.label;
		this.vendor = config.vendor;
		this.model = config.model;
		this.generate = config.generate;
		this.listModelsImpl = config.listModels;
	}

	/** Map AI SDK / network errors to user-readable provider errors. */
	protected describeError(e: unknown): string {
		const msg = errorMessage(e);
		if (/api[\s_-]?key|authenticat|401|403/i.test(msg)) {
			return `${this.vendor} rejected the API key. Check the API key supplied by the host app.`;
		}
		if (/429|rate.?limit|quota/i.test(msg)) {
			return `${this.vendor} rate limit hit. Wait a moment and try again.`;
		}
		if (/network|fetch|ENOTFOUND|ECONN|timeout/i.test(msg)) {
			return `Could not reach ${this.vendor}. Check your connection.`;
		}
		return `${this.vendor} request failed: ${msg}`;
	}

	private async generateWithRetry<T>(opts: {
		schema: z.ZodType<T, z.ZodTypeDef, unknown>;
		prompt: string;
		signal?: AbortSignal;
	}): Promise<T> {
		let lastRateLimit: unknown = null;
		for (let attempt = 0; attempt <= DEFAULT_RATE_LIMIT_RETRIES; attempt++) {
			try {
				return await this.generate(opts);
			} catch (e) {
				if (!isRateLimitError(e) || attempt === DEFAULT_RATE_LIMIT_RETRIES) {
					if (isRateLimitError(e)) {
						throw new ProviderRateLimitError(
							this.describeError(e),
							retryAfterMs(e)
						);
					}
					throw e;
				}
				lastRateLimit = e;
				const waitMs = Math.min(
					retryAfterMs(e) ?? DEFAULT_RATE_LIMIT_RETRY_MS * 2 ** attempt,
					MAX_RATE_LIMIT_RETRY_MS
				);
				await sleep(waitMs, opts.signal);
			}
		}
		throw new ProviderRateLimitError(
			this.describeError(lastRateLimit),
			retryAfterMs(lastRateLimit)
		);
	}

	async testConnection(): Promise<ProviderStatus> {
		if (!this.model) {
			return { ok: false, message: `Choose a ${this.vendor} model.` };
		}
		try {
			await this.generate({
				schema: z.object({ ok: z.boolean() }),
				prompt: 'Reply with a JSON object {"ok": true}.',
			});
			return { ok: true, message: `Connected to ${this.vendor} (${this.model}).` };
		} catch (e) {
			return { ok: false, message: this.describeError(e) };
		}
	}

	async listModels(): Promise<unknown[]> {
		if (!this.listModelsImpl) return [];
		return this.listModelsImpl();
	}

	async generateCue(input: CueInput, signal?: AbortSignal): Promise<CueOutput> {
		const preset = PRESET_GUIDANCE[input.preset] ?? PRESET_GUIDANCE.conceptual;
		const contextLine = input.noteContext
			? `\nWhole-note context (for relevance only):\n${input.noteContext}\n`
			: "";
		const prompt =
			`You are a study assistant creating Cornell-style active-recall cues.\n` +
			`${preset}\n` +
			`${questionStyleGuidance(input.options?.questionStyle)}\n` +
			`${cueDensityGuidance(input.options?.cueDensity)}\n` +
			`${keywordGuidance(input.options?.generateKeywords ?? true)}\n` +
			contextLine +
			`\nSection heading: ${input.heading || "(untitled)"}\n` +
			`Section content:\n${input.content}\n`;

		let raw;
		try {
			raw = await this.generateWithRetry({ schema: cueGenSchema, prompt, signal });
		} catch (e) {
			if (e instanceof ProviderRateLimitError) throw e;
			throw new ProviderError(this.describeError(e));
		}
		const parsed = cueOutputSchema.safeParse(raw);
		if (!parsed.success) {
			throw new ProviderError(
				`Model output could not be validated: ${formatZodError(parsed.error)}`
			);
		}
		return parsed.data;
	}

	async generateSummary(input: SummaryInput, signal?: AbortSignal): Promise<SummaryOutput> {
		const questions = input.sectionQuestions.length
			? `\nSection questions to reflect:\n- ${input.sectionQuestions.join("\n- ")}\n`
			: "";
		const prompt =
			`Summarize the following note for study review.\n` +
			`Write "summary" as one concise study takeaway sentence, not a paragraph.\n` +
			`If you include "learningObjective", keep it to one short sentence.\n` +
			`\nNote title: ${input.noteTitle}\n` +
			questions +
			`\nNote text:\n${input.fullText}\n`;

		let raw;
		try {
			raw = await this.generateWithRetry({ schema: summaryGenSchema, prompt, signal });
		} catch (e) {
			if (e instanceof ProviderRateLimitError) throw e;
			throw new ProviderError(this.describeError(e));
		}
		const parsed = summaryOutputSchema.safeParse(raw);
		if (!parsed.success) {
			throw new ProviderError(
				`Model output could not be validated: ${formatZodError(parsed.error)}`
			);
		}
		return parsed.data;
	}
}

/** Build the real AI SDK structured-output caller for a resolved model. */
export function modelGenerator(model: LanguageModel): ObjectGenerator {
	return async function generate<T>({ schema, prompt, signal }: {
		schema: z.ZodType<T, z.ZodTypeDef, unknown>;
		prompt: string;
		signal?: AbortSignal;
	}): Promise<T> {
		const sdkSchema: Schema<T> = zodSchema<T>(schema);
		const { object } = await generateObject<Schema<T>, "object", T>({
			model,
			schema: sdkSchema,
			prompt,
			output: "object",
			abortSignal: signal,
		});
		return object;
	};
}
