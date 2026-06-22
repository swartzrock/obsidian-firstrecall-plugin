import type { CueOutput, SummaryOutput } from "../schemas";
import type { CueGenerationOptions } from "../cue-generation";

/** Minimal HTTP abstraction so providers can be unit-tested without a live server. */
export interface HttpRequest {
	url: string;
	method: "GET" | "POST";
	body?: string;
	headers?: Record<string, string>;
}

export interface HttpResponse {
	status: number;
	text: string;
	json: unknown;
}

export type HttpClient = (req: HttpRequest) => Promise<HttpResponse>;

export interface ProviderStatus {
	ok: boolean;
	message: string;
	models?: string[];
}

export interface CueInput {
	heading: string;
	content: string;
	/** Optional whole-note context for better questions. */
	noteContext?: string;
	preset: string;
	options?: CueGenerationOptions;
}

export interface CueBatchResult {
	cue?: CueOutput;
	error?: string;
}

export interface SummaryInput {
	noteTitle: string;
	fullText: string;
	sectionQuestions: string[];
}

/**
 * Shared provider interface. v1.0 implements only Ollama, but the full shape
 * ships now so adding OpenAI / Claude Code / Local VM later is additive.
 */
export interface AiProvider {
	id: string;
	label: string;
	requiresNetwork: boolean;
	requiresDownload: boolean;
	sectionConcurrencyLimit?: number;
	testConnection(): Promise<ProviderStatus>;
	listModels?(): Promise<unknown[]>;
	generateCue(input: CueInput, signal?: AbortSignal): Promise<CueOutput>;
	generateCues?(
		inputs: CueInput[],
		signal?: AbortSignal
	): Promise<CueBatchResult[]>;
	generateSummary(input: SummaryInput, signal?: AbortSignal): Promise<SummaryOutput>;
}

/** Thrown for user-readable provider/transport failures. */
export class ProviderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProviderError";
	}
}

/** Thrown when a provider says the caller should wait before retrying. */
export class ProviderRateLimitError extends ProviderError {
	readonly retryAfterMs: number | null;

	constructor(message: string, retryAfterMs: number | null = null) {
		super(message);
		this.name = "ProviderRateLimitError";
		this.retryAfterMs = retryAfterMs;
	}
}
