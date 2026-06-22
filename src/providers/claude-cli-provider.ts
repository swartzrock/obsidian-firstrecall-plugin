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
	defaultLocalCliCwd,
	LocalCommandRunner,
	type LocalCommandRequest,
	type LocalCommandResult,
} from "./local-command-runner";

const DEFAULT_TIMEOUT_MS = 120_000;
const STATUS_TIMEOUT_MS = 15_000;
const CLAUDE_CLI_ENV: NodeJS.ProcessEnv = {
	CLAUDE_CODE_DISABLE_AGENT_VIEW: "1",
	CLAUDE_CODE_DISABLE_ARTIFACT: "1",
	CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
	CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: "1",
	CLAUDE_CODE_DISABLE_WORKFLOWS: "1",
	CLAUDE_CODE_SAFE_MODE: "1",
	CLAUDE_CODE_SKIP_PROMPT_HISTORY: "1",
	DISABLE_AUTOUPDATER: "1",
};
const CLAUDE_CLI_AUTH_MESSAGE =
	"Claude CLI is not authenticated. Run `claude auth login` in your terminal, then try again.";

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

const CONNECTION_JSON_SCHEMA = JSON.stringify({
	type: "object",
	properties: {
		ok: { type: "boolean" },
	},
	required: ["ok"],
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

function looksLikeJson(value: string): boolean {
	return value.startsWith("{") || value.startsWith("[");
}

function normalizeClaudeText(value: string): string {
	const trimmed = value.trim();
	const quote = trimmed[0];
	if (
		trimmed.length < 2 ||
		(quote !== "'" && quote !== '"') ||
		trimmed[trimmed.length - 1] !== quote
	) {
		return value;
	}
	const inner = trimmed.slice(1, -1).trim();
	if (looksLikeJson(inner)) return inner;
	const unescaped = inner.replace(/\\"/g, '"');
	return looksLikeJson(unescaped) ? unescaped : value;
}

function textFromStructuredValue(value: unknown): string {
	if (typeof value === "string" && value.trim()) return normalizeClaudeText(value);
	if (value && typeof value === "object") return JSON.stringify(value);
	return "";
}

export function extractClaudeCliOutput(stdout: string): string {
	const trimmed = stdout.trim();
	if (!trimmed) return "";
	try {
		const parsed = JSON.parse(trimmed);
		const record = asRecord(parsed);
		if (!record) return stdout;
		for (const key of ["structured_output", "structuredOutput"]) {
			const value = textFromStructuredValue(record[key]);
			if (value.trim()) return value;
		}
		const result = record.result;
		const resultText = textFromStructuredValue(result);
		if (resultText.trim()) return resultText;
		for (const key of ["output", "response", "text", "message"]) {
			const value = record[key];
			if (typeof value === "string" && value.trim()) {
				return normalizeClaudeText(value);
			}
		}
		const content = textFromContent(record.content);
		if (content.trim()) return normalizeClaudeText(content);
	} catch {
		// The CLI may already have printed the model's raw final response.
	}
	return normalizeClaudeText(stdout);
}

function isAuthMissing(output: string): boolean {
	const normalized = output.toLowerCase();
	return (
		/not\s+(logged|authenticated)|unauthenticated|login required|no active account|failed to authenticate|invalid authentication credentials/i.test(
			output
		) ||
		(normalized.includes("401") && normalized.includes("authentic"))
	);
}

export class ClaudeCliProvider implements AiProvider {
	readonly id = "claude-cli";
	readonly label = "Claude CLI";
	readonly requiresNetwork = true;
	readonly requiresDownload = false;

	private readonly command: string;
	private readonly model: string;
	private readonly cwd?: string;
	private readonly timeoutMs: number;
	private readonly runner: CommandRunner;

	constructor(opts: ClaudeCliProviderOptions) {
		this.command = opts.command.trim() || "claude";
		this.model = opts.model?.trim() ?? "";
		this.cwd = opts.cwd ?? defaultLocalCliCwd();
		this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.runner = opts.runner ?? new LocalCommandRunner();
	}

	async testConnection(): Promise<ProviderStatus> {
		try {
			const output = await this.runPrompt(
				"Return exactly this JSON object to confirm Claude CLI text generation works: {\"ok\":true}",
				CONNECTION_JSON_SCHEMA,
				STATUS_TIMEOUT_MS
			);
			const parsed = asRecord(JSON.parse(output));
			if (parsed?.ok !== true) {
				return {
					ok: false,
					message: "Claude CLI connected but returned an unexpected setup response.",
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
			if (isAuthMissing(message)) {
				return {
					ok: false,
					message: CLAUDE_CLI_AUTH_MESSAGE,
				};
			}
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
			"--input-format",
			"text",
			"--no-session-persistence",
			"--no-chrome",
			"--safe-mode",
			"--setting-sources",
			"user",
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

	private async runPrompt(
		prompt: string,
		schema: string,
		timeoutMs: number,
		signal?: AbortSignal
	): Promise<string> {
		const request: LocalCommandRequest = {
			command: this.command,
			args: this.commandArgs(schema),
			stdin: prompt,
			cwd: this.cwd,
			env: CLAUDE_CLI_ENV,
			timeoutMs,
			signal,
		};
		let result: LocalCommandResult;
		try {
			result = await this.runner.run(request);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (isAuthMissing(message)) {
				throw new ProviderError(CLAUDE_CLI_AUTH_MESSAGE);
			}
			if (error instanceof ProviderError) throw error;
			throw new ProviderError(`Claude CLI request failed: ${message}`);
		}
		const stdout = extractClaudeCliOutput(result.stdout);
		const stderr = extractClaudeCliOutput(result.stderr);
		const output = stdout.trim() ? stdout : stderr;
		if (
			isAuthMissing(result.stdout) ||
			isAuthMissing(result.stderr) ||
			isAuthMissing(output)
		) {
			throw new ProviderError(CLAUDE_CLI_AUTH_MESSAGE);
		}
		if (!output.trim()) {
			throw new ProviderError("Claude CLI returned an empty response.");
		}
		return output;
	}

	private async complete(
		prompt: string,
		schema: string,
		signal?: AbortSignal
	): Promise<string> {
		return this.runPrompt(prompt, schema, this.timeoutMs, signal);
	}
}
