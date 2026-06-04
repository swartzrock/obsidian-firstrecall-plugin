import type { CueOutput, SummaryOutput } from "../schemas";

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
	testConnection(): Promise<ProviderStatus>;
	listModels?(): Promise<string[]>;
	generateCue(input: CueInput, signal?: AbortSignal): Promise<CueOutput>;
	generateSummary(input: SummaryInput, signal?: AbortSignal): Promise<SummaryOutput>;
}

/** Thrown for user-readable provider/transport failures. */
export class ProviderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProviderError";
	}
}
