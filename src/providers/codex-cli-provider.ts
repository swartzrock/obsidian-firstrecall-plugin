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

const PRESET_GUIDANCE: Record<string, string> = {
	conceptual: "Favor a single conceptual question that tests understanding, not trivia.",
	"exam-prep": "Write an exam-style question a student is likely to be tested on.",
	vocabulary: "Emphasize key terms and their definitions.",
	minimal: "Keep the question short and direct.",
	simpler: "Use simple, accessible language. Keep the question brief and focused on the single most basic idea.",
};

type CommandRunner = Pick<LocalCommandRunner, "run">;

export interface CodexCliProviderOptions {
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

function textFromEvent(value: unknown): string {
	const record = asRecord(value);
	if (!record) return "";
	for (const key of ["result", "output", "final_output", "response", "text"]) {
		const text = record[key];
		if (typeof text === "string" && text.trim()) return text;
	}
	const content = textFromContent(record.content);
	if (content.trim()) return content;
	const message = record.message;
	if (typeof message === "string" && message.trim()) return message;
	const nested = textFromEvent(message);
	if (nested.trim()) return nested;
	const item = textFromEvent(record.item);
	return item.trim() ? item : "";
}

export function extractCodexCliOutput(stdout: string): string {
	const trimmed = stdout.trim();
	if (!trimmed) return "";
	const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
	if (lines.length > 1) {
		for (let i = lines.length - 1; i >= 0; i--) {
			try {
				const text = textFromEvent(JSON.parse(lines[i]));
				if (text.trim()) return text;
			} catch {
				// Ignore non-JSON log lines.
			}
		}
	}
	try {
		const parsed = JSON.parse(trimmed);
		const text = textFromEvent(parsed);
		if (text.trim()) return text;
	} catch {
		// The CLI may already have printed the model's raw final response.
	}
	return stdout;
}

export class CodexCliProvider implements AiProvider {
	readonly id = "codex-cli";
	readonly label = "Codex CLI";
	readonly requiresNetwork = true;
	readonly requiresDownload = false;
	readonly sectionConcurrencyLimit = 1;

	private readonly command: string;
	private readonly model: string;
	private readonly cwd?: string;
	private readonly timeoutMs: number;
	private readonly runner: CommandRunner;

	constructor(opts: CodexCliProviderOptions) {
		this.command = opts.command.trim() || "codex";
		this.model = opts.model?.trim() ?? "";
		this.cwd = opts.cwd ?? defaultLocalCliCwd();
		this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.runner = opts.runner ?? new LocalCommandRunner();
	}

	async testConnection(): Promise<ProviderStatus> {
		try {
			const result = await this.runner.run({
				command: this.command,
				args: ["login", "status"],
				cwd: this.cwd,
				timeoutMs: STATUS_TIMEOUT_MS,
			});
			const output = `${result.stdout}\n${result.stderr}`;
			if (/not\s+(logged|authenticated)|unauthenticated|login required/i.test(output)) {
				return {
					ok: false,
					message: "Codex CLI is not logged in. Run `codex login` and try again.",
				};
			}
			return {
				ok: true,
				message: this.model
					? `Connected to Codex CLI (${this.model}).`
					: "Connected to Codex CLI.",
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

		const raw = await this.complete(basePrompt, signal);
		let result = validateCue(raw);
		if (!result.ok) {
			const repairPrompt =
				basePrompt +
				`\nYour previous reply could not be validated (${result.error}).\n` +
				`Previous reply:\n${raw}\n` +
				`Reply again with ONLY the corrected JSON object.`;
			result = validateCue(await this.complete(repairPrompt, signal));
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

		const raw = await this.complete(basePrompt, signal);
		let result = validateSummary(raw);
		if (!result.ok) {
			const repairPrompt =
				basePrompt +
				`\nYour previous reply could not be validated (${result.error}).\n` +
				`Reply again with ONLY the corrected JSON object.`;
			result = validateSummary(await this.complete(repairPrompt, signal));
		}
		if (!result.ok) {
			throw new ProviderError(`Model output could not be validated: ${result.error}`);
		}
		return result.value;
	}

	private commandArgs(): string[] {
		const args = [
			"exec",
			"--skip-git-repo-check",
			"--ask-for-approval",
			"never",
			"--sandbox",
			"read-only",
			"--json",
		];
		if (this.model) args.push("--model", this.model);
		return args;
	}

	private async complete(prompt: string, signal?: AbortSignal): Promise<string> {
		const request: LocalCommandRequest = {
			command: this.command,
			args: this.commandArgs(),
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
			throw new ProviderError(`Codex CLI request failed: ${message}`);
		}
		const output = extractCodexCliOutput(result.stdout);
		if (!output.trim()) {
			throw new ProviderError("Codex CLI returned an empty response.");
		}
		return output;
	}
}
