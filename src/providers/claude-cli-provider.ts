import type { CueOutput, SummaryOutput } from "../schemas";
import { validateCue, validateSummary } from "../schemas";
import {
	cueDensityGuidance,
	keywordGuidance,
	questionStyleGuidance,
} from "../cue-generation";
import {
	AiProvider,
	CueInput,
	ProviderError,
	ProviderStatus,
	SummaryInput,
} from "./types";
import {
	LocalCommandRunner,
	type LocalCommandRequest,
	type LocalCommandResult,
} from "./local-command-runner";

const DEFAULT_TIMEOUT_MS = 120_000;
const STATUS_TIMEOUT_MS = 15_000;

const PRESET_GUIDANCE: Record<string, string> = {
	conceptual: "Favor a single conceptual question that tests understanding, not trivia.",
	"exam-prep": "Write an exam-style question a student is likely to be tested on.",
	vocabulary: "Emphasize key terms and their definitions.",
	minimal: "Keep the question short and direct.",
	simpler: "Use simple, accessible language. Keep the question brief and focused on the single most basic idea.",
};

const CUE_JSON_SCHEMA = JSON.stringify({
	type: "object",
	properties: {
		question: { type: "string" },
		keywords: {
			type: "array",
			items: { type: "string" },
			minItems: 2,
			maxItems: 5,
		},
		confidence: { enum: ["high", "medium", "low"] },
		rationale: { type: "string" },
	},
	required: ["question", "keywords", "confidence"],
	additionalProperties: false,
});

const SUMMARY_JSON_SCHEMA = JSON.stringify({
	type: "object",
	properties: {
		summary: { type: "string" },
		learningObjective: { type: "string" },
	},
	required: ["summary"],
	additionalProperties: false,
});

type CommandRunner = Pick<LocalCommandRunner, "run">;

export interface ClaudeCliProviderOptions {
	command: string;
	model?: string;
	cwd?: string;
	timeoutMs?: number;
	runner?: CommandRunner;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: null;
}

function textFromContent(value: unknown): string {
	if (typeof value === "string") return value;
	if (!Array.isArray(value)) return "";
	return value
		.map((item) => {
			if (typeof item === "string") return item;
			const record = asRecord(item);
			const text = record?.text;
			return typeof text === "string" ? text : "";
		})
		.filter(Boolean)
		.join("\n");
}

export function extractClaudeCliOutput(stdout: string): string {
	const trimmed = stdout.trim();
	if (!trimmed) return "";
	try {
		const parsed = JSON.parse(trimmed);
		const record = asRecord(parsed);
		if (!record) return stdout;
		const result = record.result;
		if (typeof result === "string") return result;
		if (result && typeof result === "object") return JSON.stringify(result);
		for (const key of ["output", "response", "text", "message"]) {
			const value = record[key];
			if (typeof value === "string" && value.trim()) return value;
		}
		const content = textFromContent(record.content);
		if (content.trim()) return content;
	} catch {
		// The CLI may already have printed the model's raw final response.
	}
	return stdout;
}

function isAuthMissing(output: string): boolean {
	return /not\s+(logged|authenticated)|unauthenticated|login required|no active account/i.test(
		output
	);
}

function authStatusLooksOk(stdout: string): boolean {
	try {
		const parsed = JSON.parse(stdout);
		const record = asRecord(parsed);
		if (!record) return false;
		if (record.authenticated === false || record.loggedIn === false) return false;
		if (record.authenticated === true || record.loggedIn === true) return true;
		const status = typeof record.status === "string" ? record.status : "";
		if (/not|unauth|logged.?out/i.test(status)) return false;
		if (/auth|login|valid|active/i.test(status)) return true;
		return true;
	} catch {
		return !isAuthMissing(stdout);
	}
}

export class ClaudeCliProvider implements AiProvider {
	readonly id = "claude-cli";
	readonly label = "Claude CLI";
	readonly requiresNetwork = true;
	readonly requiresDownload = false;
	readonly sectionConcurrencyLimit = 1;

	private readonly command: string;
	private readonly model: string;
	private readonly cwd?: string;
	private readonly timeoutMs: number;
	private readonly runner: CommandRunner;

	constructor(opts: ClaudeCliProviderOptions) {
		this.command = opts.command.trim() || "claude";
		this.model = opts.model?.trim() ?? "";
		this.cwd = opts.cwd;
		this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.runner = opts.runner ?? new LocalCommandRunner();
	}

	async testConnection(): Promise<ProviderStatus> {
		try {
			const result = await this.runner.run({
				command: this.command,
				args: ["auth", "status", "--json"],
				cwd: this.cwd,
				timeoutMs: STATUS_TIMEOUT_MS,
			});
			const output = `${result.stdout}\n${result.stderr}`;
			if (!authStatusLooksOk(output)) {
				return {
					ok: false,
					message: "Claude CLI is not logged in. Run `claude login` and try again.",
				};
			}
			return {
				ok: true,
				message: this.model
					? `Connected to Claude CLI (${this.model}).`
					: "Connected to Claude CLI.",
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { ok: false, message };
		}
	}

	async generateCue(input: CueInput, signal?: AbortSignal): Promise<CueOutput> {
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

		const raw = await this.complete(basePrompt, CUE_JSON_SCHEMA, signal);
		let result = validateCue(raw);
		if (!result.ok) {
			const repairPrompt =
				basePrompt +
				`\nYour previous reply could not be validated (${result.error}).\n` +
				`Previous reply:\n${raw}\n` +
				`Reply again with ONLY the corrected JSON object.`;
			result = validateCue(await this.complete(repairPrompt, CUE_JSON_SCHEMA, signal));
		}
		if (!result.ok) {
			throw new ProviderError(`Model output could not be validated: ${result.error}`);
		}
		return result.value;
	}

	async generateSummary(input: SummaryInput, signal?: AbortSignal): Promise<SummaryOutput> {
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

		const raw = await this.complete(basePrompt, SUMMARY_JSON_SCHEMA, signal);
		let result = validateSummary(raw);
		if (!result.ok) {
			const repairPrompt =
				basePrompt +
				`\nYour previous reply could not be validated (${result.error}).\n` +
				`Reply again with ONLY the corrected JSON object.`;
			result = validateSummary(
				await this.complete(repairPrompt, SUMMARY_JSON_SCHEMA, signal)
			);
		}
		if (!result.ok) {
			throw new ProviderError(`Model output could not be validated: ${result.error}`);
		}
		return result.value;
	}

	private commandArgs(schema: string): string[] {
		const args = [
			"-p",
			"--output-format",
			"json",
			"--no-session-persistence",
			"--safe-mode",
			"--permission-mode",
			"dontAsk",
			"--tools",
			"",
			"--json-schema",
			schema,
		];
		if (this.model) args.push("--model", this.model);
		return args;
	}

	private async complete(
		prompt: string,
		schema: string,
		signal?: AbortSignal
	): Promise<string> {
		const request: LocalCommandRequest = {
			command: this.command,
			args: this.commandArgs(schema),
			stdin: prompt,
			cwd: this.cwd,
			timeoutMs: this.timeoutMs,
			signal,
		};
		let result: LocalCommandResult;
		try {
			result = await this.runner.run(request);
		} catch (error) {
			if (error instanceof ProviderError) throw error;
			const message = error instanceof Error ? error.message : String(error);
			throw new ProviderError(`Claude CLI request failed: ${message}`);
		}
		const output = extractClaudeCliOutput(result.stdout);
		if (!output.trim()) {
			throw new ProviderError("Claude CLI returned an empty response.");
		}
		return output;
	}
}
