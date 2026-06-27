import type { CueOutput, SummaryOutput } from "../../schemas";
import { validateCue, validateSummary } from "../../schemas";
import {
	cueDensityGuidance,
	keywordGuidance,
	questionStyleGuidance,
} from "../../cue-generation";
import {
	AiProvider,
	CueInput,
	HttpClient,
	HttpResponse,
	ProviderError,
	ProviderStatus,
	SummaryInput,
} from "./types";

/** Pull Ollama's `{ "error": "..." }` body out of a failed response. */
function extractServerError(res: HttpResponse): string {
	const fromJson = (res.json as { error?: unknown } | null)?.error;
	if (typeof fromJson === "string" && fromJson.trim()) return fromJson.trim();
	if (res.text && res.text.trim()) return res.text.trim().slice(0, 300);
	return "no error detail returned";
}

/** Add a hint for the common status codes so the Notice is actionable. */
function describeError(status: number): string {
	if (status === 404) return " — model not found; run `ollama pull <model>`";
	if (status === 400) return " — bad request; the model may not support generation";
	if (status === 500) return " — server error; the model may have failed to load (often out of memory)";
	return "";
}

export interface OllamaProviderOptions {
	host: string;
	model: string;
	http: HttpClient;
}

const PRESET_GUIDANCE: Record<string, string> = {
	conceptual: "Favor a single conceptual question that tests understanding, not trivia.",
	"exam-prep": "Write an exam-style question a student is likely to be tested on.",
	vocabulary: "Emphasize key terms and their definitions.",
	minimal: "Keep the question short and direct.",
	simpler: "Use simple, accessible language. Keep the question brief and focused on the single most basic idea.",
};

export class OllamaProvider implements AiProvider {
	readonly id = "ollama";
	readonly label = "Ollama";
	readonly requiresNetwork = false;
	readonly requiresDownload = false;

	private host: string;
	private model: string;
	private http: HttpClient;

	constructor(opts: OllamaProviderOptions) {
		this.host = opts.host.replace(/\/+$/, "");
		this.model = opts.model;
		this.http = opts.http;
	}

	async testConnection(): Promise<ProviderStatus> {
		let models: string[];
		try {
			models = await this.listModels();
		} catch {
			return {
				ok: false,
				message: "Ollama server unreachable. Check the host and that Ollama is running.",
			};
		}
		if (this.model && !models.includes(this.model)) {
			return {
				ok: false,
				message: `Connected, but model "${this.model}" is not installed. Run: ollama pull ${this.model}`,
				models,
			};
		}
		return {
			ok: true,
			message: `Connected to Ollama (${models.length} model(s) available).`,
			models,
		};
	}

	async listModels(): Promise<string[]> {
		const { Ollama } = await import("ollama/browser");
		const client = new Ollama({
			host: this.host,
			fetch: this.fetchViaHttp(),
		});
		const response = await client.list();
		return (response.models ?? [])
			.map((m) => m.name)
			.filter((n): n is string => typeof n === "string");
	}

	async generateCue(input: CueInput, _signal?: AbortSignal): Promise<CueOutput> {
		const preset = PRESET_GUIDANCE[input.preset] ?? PRESET_GUIDANCE.conceptual;
		const contextLine = input.noteContext
			? `\nWhole-note context (for relevance only):\n${input.noteContext}\n`
			: "";
		const basePrompt =
			`You are a study assistant creating Cornell-style active-recall cues.\n` +
			`${preset}\n` +
			`${questionStyleGuidance(input.options?.questionStyle)}\n` +
			`${cueDensityGuidance(input.options?.cueDensity)}\n` +
			`${keywordGuidance(input.options?.generateKeywords ?? true)}\n` +
			`Return ONLY a JSON object with keys: "question" (string), ` +
			`"keywords" (array of 2 to 5 short strings), "confidence" ("high" | "medium" | "low"), ` +
			`and optional "rationale" (short reason, only when confidence is "low").\n` +
			contextLine +
			`\nSection heading: ${input.heading || "(untitled)"}\n` +
			`Section content:\n${input.content}\n`;

		const raw = await this.complete(basePrompt);
		let result = validateCue(raw);
		if (!result.ok) {
			const repairPrompt =
				basePrompt +
				`\nYour previous reply could not be validated (${result.error}).\n` +
				`Previous reply:\n${raw}\n` +
				`Reply again with ONLY the corrected JSON object.`;
			const retry = await this.complete(repairPrompt);
			result = validateCue(retry);
		}
		if (!result.ok) {
			throw new ProviderError(`Model output could not be validated: ${result.error}`);
		}
		return result.value;
	}

	async generateSummary(input: SummaryInput, _signal?: AbortSignal): Promise<SummaryOutput> {
		const questions = input.sectionQuestions.length
			? `\nSection questions to reflect:\n- ${input.sectionQuestions.join("\n- ")}\n`
			: "";
		const basePrompt =
			`Summarize the following note for study review.\n` +
			`Return ONLY a JSON object with keys: "summary" (one concise study takeaway sentence, not a paragraph) ` +
			`and optional "learningObjective" (one short sentence).\n` +
			`\nNote title: ${input.noteTitle}\n` +
			questions +
			`\nNote text:\n${input.fullText}\n`;

		const raw = await this.complete(basePrompt);
		let result = validateSummary(raw);
		if (!result.ok) {
			const repairPrompt =
				basePrompt +
				`\nYour previous reply could not be validated (${result.error}).\n` +
				`Reply again with ONLY the corrected JSON object.`;
			const retry = await this.complete(repairPrompt);
			result = validateSummary(retry);
		}
		if (!result.ok) {
			throw new ProviderError(`Model output could not be validated: ${result.error}`);
		}
		return result.value;
	}

	/** POST /api/generate (non-streaming, JSON format) and return the raw model text. */
	private async complete(prompt: string): Promise<string> {
		let res;
		try {
			res = await this.http({
				url: `${this.host}/api/generate`,
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: this.model,
					prompt,
					stream: false,
					format: "json",
				}),
			});
		} catch {
			throw new ProviderError("Ollama server unreachable. Check the host and that Ollama is running.");
		}
		if (res.status < 200 || res.status >= 300) {
			throw new ProviderError(
				`Ollama request failed (HTTP ${res.status})${describeError(res.status)}: ${extractServerError(res)}`
			);
		}
		const body = res.json as { response?: string } | null;
		if (!body || typeof body.response !== "string") {
			throw new ProviderError("Ollama returned an unexpected response shape.");
		}
		return body.response;
	}

	private fetchViaHttp(): typeof fetch {
		return (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: input.url;
			const headers: Record<string, string> = {};
			new Headers(init?.headers).forEach((value, key) => {
				headers[key] = value;
			});
			const res = await this.http({
				url,
				method: (init?.method as "GET" | "POST" | undefined) ?? "GET",
				body: (init?.body as string | undefined) ?? undefined,
				headers,
			});
			return new Response(res.text, {
				status: res.status,
				headers: res.json && typeof res.json === "object" ? { "content-type": "application/json" } : undefined,
			});
		}) as typeof fetch;
	}
}
