import { z } from "zod";
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import {
	cueOutputSchema,
	summaryOutputSchema,
	type CueOutput,
	type SummaryOutput,
} from "../schemas";
import {
	AiProvider,
	CueInput,
	ProviderError,
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
});

const summaryGenSchema = z.object({
	summary: z
		.string()
		.describe("3 to 5 sentences capturing the most important ideas and relationships."),
	learningObjective: z
		.string()
		.optional()
		.describe("One short sentence stating what the reader should be able to do."),
});

/** Injectable structured-output call so the provider can be unit-tested. */
export type ObjectGenerator = <T>(opts: {
	schema: z.ZodType<T>;
	prompt: string;
	signal?: AbortSignal;
}) => Promise<T>;

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
}

function formatZodError(error: z.ZodError): string {
	return error.issues
		.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
		.join("; ");
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

	constructor(config: AiSdkProviderConfig) {
		this.id = config.id;
		this.label = config.label;
		this.vendor = config.vendor;
		this.model = config.model;
		this.generate = config.generate;
	}

	/** Map AI SDK / network errors to user-readable provider errors. */
	protected describeError(e: unknown): string {
		const msg = e instanceof Error ? e.message : String(e);
		if (/api[\s_-]?key|authenticat|401|403/i.test(msg)) {
			return `${this.vendor} rejected the API key. Check it in CueCraft settings.`;
		}
		if (/429|rate.?limit|quota/i.test(msg)) {
			return `${this.vendor} rate limit hit. Wait a moment and try again.`;
		}
		if (/network|fetch|ENOTFOUND|ECONN|timeout/i.test(msg)) {
			return `Could not reach ${this.vendor}. Check your connection.`;
		}
		return `${this.vendor} request failed: ${msg}`;
	}

	async testConnection(): Promise<ProviderStatus> {
		if (!this.model) {
			return { ok: false, message: `Choose a ${this.vendor} model in settings.` };
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

	async generateCue(input: CueInput, signal?: AbortSignal): Promise<CueOutput> {
		const preset = PRESET_GUIDANCE[input.preset] ?? PRESET_GUIDANCE.conceptual;
		const contextLine = input.noteContext
			? `\nWhole-note context (for relevance only):\n${input.noteContext}\n`
			: "";
		const prompt =
			`You are a study assistant creating Cornell-style active-recall cues.\n` +
			`${preset}\n` +
			contextLine +
			`\nSection heading: ${input.heading || "(untitled)"}\n` +
			`Section content:\n${input.content}\n`;

		let raw;
		try {
			raw = await this.generate({ schema: cueGenSchema, prompt, signal });
		} catch (e) {
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
			`\nNote title: ${input.noteTitle}\n` +
			questions +
			`\nNote text:\n${input.fullText}\n`;

		let raw;
		try {
			raw = await this.generate({ schema: summaryGenSchema, prompt, signal });
		} catch (e) {
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
	return async ({ schema, prompt, signal }) => {
		const { object } = await generateObject({
			model,
			schema,
			prompt,
			abortSignal: signal,
		});
		return object;
	};
}
