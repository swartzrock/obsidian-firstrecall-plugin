import { describe, expect, it, vi } from "vitest";
import {
	ClaudeCliProvider,
	extractClaudeCliOutput,
} from "../src/byok/providers/claude-cli-provider";
import { defaultLocalCliCwd } from "../src/byok/providers/local-command-runner";
import type {
	LocalCommandRequest,
	LocalCommandResult,
} from "../src/byok/providers/local-command-runner";
import { ProviderError } from "../src/byok/providers/types";

function result(stdout: string, stderr = ""): LocalCommandResult {
	return { stdout, stderr, exitCode: 0 };
}

function makeProvider(responses: Array<LocalCommandResult | Error>, model = ""): {
	provider: ClaudeCliProvider;
	run: ReturnType<typeof vi.fn<[LocalCommandRequest], Promise<LocalCommandResult>>>;
} {
	const run = vi.fn<[LocalCommandRequest], Promise<LocalCommandResult>>(
		async () => {
			const next = responses.shift();
			if (!next) throw new Error("unexpected runner call");
			if (next instanceof Error) throw next;
			return next;
		}
	);
	return {
		provider: new ClaudeCliProvider({
			command: "claude",
			model,
			cwd: "/tmp/cuecraft-empty",
			timeoutMs: 50,
			runner: { run },
		}),
		run,
	};
}

const sectionLens = {
	takeaway: "X is the main idea to review.",
	keyPhrase: "main idea",
	explanation: "This phrase anchors the section for recall.",
};

describe("extractClaudeCliOutput", () => {
	it("extracts a string result from Claude JSON output", () => {
		expect(
			extractClaudeCliOutput(
				JSON.stringify({ type: "result", result: "{\"summary\":\"S\"}" })
			)
		).toBe("{\"summary\":\"S\"}");
	});

	it("stringifies an object result from structured output", () => {
		expect(
			extractClaudeCliOutput(
				JSON.stringify({ type: "result", result: { summary: "S" } })
			)
		).toBe("{\"summary\":\"S\"}");
	});

	it("uses validated structured_output when Claude result text is empty", () => {
		expect(
			extractClaudeCliOutput(
				JSON.stringify({
					type: "result",
					subtype: "success",
					result: "",
					structured_output: { ok: true },
				})
			)
		).toBe("{\"ok\":true}");
	});

	it("unwraps single-quoted JSON result strings", () => {
		expect(
			extractClaudeCliOutput(
				JSON.stringify({ type: "result", result: "'{\"ok\":true}'" })
			)
		).toBe("{\"ok\":true}");
	});
});

describe("ClaudeCliProvider", () => {
	it("returns a validated cue from Claude structured output", async () => {
		const { provider, run } = makeProvider([
			result(
				JSON.stringify({
					type: "result",
					result: {
						question: "What is X?",
						keywords: ["a", "b"],
						confidence: "high",
						sectionLens,
					},
				})
			),
		]);

		const cue = await provider.generateCue({
			heading: "X",
			content: "body",
			preset: "conceptual",
		});

		expect(cue.question).toBe("What is X?");
		expect(cue.sectionLens?.keyPhrase).toBe("main idea");
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toMatchObject({
			command: "claude",
			cwd: "/tmp/cuecraft-empty",
			env: expect.objectContaining({
				CLAUDE_CODE_DISABLE_AGENT_VIEW: "1",
				CLAUDE_CODE_SKIP_PROMPT_HISTORY: "1",
				DISABLE_AUTOUPDATER: "1",
			}),
			timeoutMs: 50,
		});
		expect(run.mock.calls[0][0].args).toEqual(
			expect.arrayContaining([
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
			])
		);
		expect(run.mock.calls[0][0].args.at(-1)).toContain("sectionLens");
		expect(run.mock.calls[0][0].stdin).toContain("Section heading: X");
		expect(run.mock.calls[0][0].stdin).toContain("sectionLens");
	});

	it("returns validated cues from a batched Claude structured output", async () => {
		const { provider, run } = makeProvider([
			result(
				JSON.stringify({
					type: "result",
					structured_output: {
						cues: [
							{
								question: "What is A?",
								keywords: ["a", "b"],
								confidence: "high",
								sectionLens,
							},
							{
								question: "What is B?",
								keywords: ["c", "d"],
								confidence: "medium",
								sectionLens,
							},
						],
					},
				})
			),
		]);

		const cues = await provider.generateCues?.([
			{ heading: "A", content: "alpha", preset: "conceptual" },
			{ heading: "B", content: "beta", preset: "conceptual" },
		]);

		expect(cues?.map((item) => item.cue?.question)).toEqual([
			"What is A?",
			"What is B?",
		]);
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0].stdin).toContain("Return ONLY a JSON object");
		expect(run.mock.calls[0][0].stdin).toContain("sectionLens");
		expect(run.mock.calls[0][0].stdin).toContain("Section 1");
		expect(run.mock.calls[0][0].stdin).toContain("Section 2");
	});

	it("keeps invalid batched Claude cue items isolated", async () => {
		const { provider } = makeProvider([
			result(
				JSON.stringify({
					type: "result",
					structured_output: {
						cues: [
							{
								question: "What is A?",
								keywords: ["a", "b"],
								confidence: "high",
							},
							{
								question: "",
								keywords: ["c", "d"],
								confidence: "medium",
							},
						],
					},
				})
			),
		]);

		const cues = await provider.generateCues?.([
			{ heading: "A", content: "alpha", preset: "conceptual" },
			{ heading: "B", content: "beta", preset: "conceptual" },
		]);

		expect(cues?.[0].cue?.question).toBe("What is A?");
		expect(cues?.[1].error).toMatch(/question/);
	});

	it("uses stderr JSON when Claude leaves stdout empty", async () => {
		const { provider } = makeProvider([
			result(
				"",
				JSON.stringify({
					type: "result",
					result: {
						question: "What is X?",
						keywords: ["a", "b"],
						confidence: "high",
					},
				})
			),
		]);

		const cue = await provider.generateCue({
			heading: "X",
			content: "body",
			preset: "conceptual",
		});

		expect(cue.question).toBe("What is X?");
	});

	it("repairs malformed cue output once", async () => {
		const { provider, run } = makeProvider([
			result(JSON.stringify({ type: "result", result: "not json" })),
			result(
				JSON.stringify({
					type: "result",
					result: {
						question: "Fixed?",
						keywords: ["a", "b"],
						confidence: "medium",
					},
				})
			),
		]);

		const cue = await provider.generateCue({
			heading: "H",
			content: "c",
			preset: "minimal",
		});

		expect(cue.question).toBe("Fixed?");
		expect(run).toHaveBeenCalledTimes(2);
		expect(run.mock.calls[1][0].stdin).toContain("Previous reply");
	});

	it("throws ProviderError when repair cannot produce valid output", async () => {
		const { provider } = makeProvider([
			result(JSON.stringify({ type: "result", result: "nope" })),
			result(JSON.stringify({ type: "result", result: "still nope" })),
		]);

		await expect(
			provider.generateCue({ heading: "H", content: "c", preset: "conceptual" })
		).rejects.toBeInstanceOf(ProviderError);
	});

	it("returns a validated summary", async () => {
		const { provider } = makeProvider([
			result(JSON.stringify({ type: "result", result: { summary: "Covers X." } })),
		]);

		const summary = await provider.generateSummary({
			noteTitle: "Note",
			fullText: "text",
			sectionQuestions: ["Q1?"],
		});

		expect(summary.summary).toBe("Covers X.");
	});

	it("reports command-not-found from the runner during connection checks", async () => {
		const { provider } = makeProvider([
			new ProviderError(
				"claude was not found. Check the command path supplied by the host app."
			),
		]);

		const status = await provider.testConnection();

		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/claude was not found/i);
	});

	it("reports unauthenticated Claude CLI status", async () => {
		const { provider } = makeProvider([
			new ProviderError("not authenticated"),
		]);

		const status = await provider.testConnection();

		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/claude auth login/i);
	});

	it("reports Claude CLI 401 auth failures as setup guidance", async () => {
		const { provider } = makeProvider([
			new ProviderError(
				'claude exited with code 1: {"type":"result","is_error":true,"api_error_status":401,"result":"Failed to authenticate. API Error: 401 Invalid authentication credentials"}'
			),
		]);

		const status = await provider.testConnection();

		expect(status).toEqual({
			ok: false,
			message:
				"Claude CLI is not authenticated. Run `claude auth login` in your terminal, then try again.",
		});
	});

	it("maps Claude CLI generation auth failures to setup guidance", async () => {
		const { provider } = makeProvider([
			new ProviderError(
				'claude exited with code 1: {"type":"result","is_error":true,"api_error_status":401,"result":"Failed to authenticate. API Error: 401 Invalid authentication credentials"}'
			),
		]);

		await expect(
			provider.generateCue({ heading: "H", content: "c", preset: "conceptual" })
		).rejects.toThrow(
			"Claude CLI is not authenticated. Run `claude auth login` in your terminal, then try again."
		);
	});

	it("reports successful Claude CLI status", async () => {
		const { provider } = makeProvider([
			result(JSON.stringify({ type: "result", result: { ok: true } })),
		], "sonnet");

		const status = await provider.testConnection();

		expect(status).toEqual({
			ok: true,
			message: "Connected to Claude CLI (sonnet).",
		});
	});

	it("reports successful Claude CLI status from structured_output", async () => {
		const { provider } = makeProvider([
			result(
				JSON.stringify({
					type: "result",
					subtype: "success",
					result: "",
					structured_output: { ok: true },
				})
			),
		]);

		const status = await provider.testConnection();

		expect(status).toEqual({
			ok: true,
			message: "Connected to Claude CLI.",
		});
	});

	it("accepts single-quoted JSON from the connection probe", async () => {
		const { provider } = makeProvider([
			result(JSON.stringify({ type: "result", result: "'{\"ok\":true}'" })),
		]);

		const status = await provider.testConnection();

		expect(status).toEqual({
			ok: true,
			message: "Connected to Claude CLI.",
		});
	});

	it("tests Claude CLI through the same non-interactive path used for generation", async () => {
		const { provider, run } = makeProvider([
			result(JSON.stringify({ type: "result", result: { ok: true } })),
		]);

		await provider.testConnection();

		expect(run.mock.calls[0][0]).toMatchObject({
			command: "claude",
			cwd: "/tmp/cuecraft-empty",
			env: expect.objectContaining({
				CLAUDE_CODE_DISABLE_AGENT_VIEW: "1",
				CLAUDE_CODE_DISABLE_ARTIFACT: "1",
				CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
				CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: "1",
				CLAUDE_CODE_DISABLE_WORKFLOWS: "1",
				CLAUDE_CODE_SAFE_MODE: "1",
				CLAUDE_CODE_SKIP_PROMPT_HISTORY: "1",
				DISABLE_AUTOUPDATER: "1",
			}),
			timeoutMs: 15_000,
		});
		expect(run.mock.calls[0][0].args).toEqual(
			expect.arrayContaining([
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
			])
		);
		expect(run.mock.calls[0][0].args).not.toEqual(
			expect.arrayContaining(["auth", "status"])
		);
		expect(run.mock.calls[0][0].args).not.toContain("--bare");
		expect(run.mock.calls[0][0].env).not.toHaveProperty("CLAUDE_CODE_SIMPLE");
	});

	it("uses a neutral temp cwd when no cwd is configured", async () => {
		const run = vi.fn<[LocalCommandRequest], Promise<LocalCommandResult>>(
			async () => result(JSON.stringify({ type: "result", result: { ok: true } }))
		);
		const provider = new ClaudeCliProvider({
			command: "claude",
			runner: { run },
		});

		await provider.testConnection();

		expect(run.mock.calls[0][0].cwd).toBe(defaultLocalCliCwd());
	});

	it("passes the configured model override and omits it when blank", async () => {
		const withModel = makeProvider([
			result(
				JSON.stringify({
					type: "result",
					result: {
						question: "Q?",
						keywords: ["a", "b"],
						confidence: "high",
					},
				})
			),
		], "sonnet");
		await withModel.provider.generateCue({
			heading: "H",
			content: "c",
			preset: "conceptual",
		});
		expect(withModel.run.mock.calls[0][0].args).toContain("--model");
		expect(withModel.run.mock.calls[0][0].args).toContain("sonnet");

		const withoutModel = makeProvider([
			result(
				JSON.stringify({
					type: "result",
					result: {
						question: "Q?",
						keywords: ["a", "b"],
						confidence: "high",
					},
				})
			),
		]);
		await withoutModel.provider.generateCue({
			heading: "H",
			content: "c",
			preset: "conceptual",
		});
		expect(withoutModel.run.mock.calls[0][0].args).not.toContain("--model");
	});
});
