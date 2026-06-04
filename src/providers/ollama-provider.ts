import type { CueOutput, SummaryOutput } from "../schemas";
import { validateCue, validateSummary } from "../schemas";
import {
	AiProvider,
	CueInput,
	HttpClient,
	ProviderError,
	ProviderStatus,
	SummaryInput,
} from "./types";

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
		const res = await this.http({ url: `${this.host}/api/tags`, method: "GET" });
		const body = res.json as { models?: Array<{ name?: string }> } | null;
		return (body?.models ?? [])
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
			`Return ONLY a JSON object with keys: "question" (string), ` +
			`"keywords" (array of 2 to 5 short strings), "confidence" ("high" | "medium" | "low").\n` +
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
			`Return ONLY a JSON object with keys: "summary" (3 to 5 sentences capturing the most ` +
			`important ideas and relationships) and optional "learningObjective" (one short sentence).\n` +
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
			throw new ProviderError(`Ollama request failed (HTTP ${res.status}).`);
		}
		const body = res.json as { response?: string } | null;
		if (!body || typeof body.response !== "string") {
			throw new ProviderError("Ollama returned an unexpected response shape.");
		}
		return body.response;
	}
}
