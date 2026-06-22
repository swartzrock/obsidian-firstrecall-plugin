import { describe, expect, it, vi } from "vitest";
import {
	ClaudeCliProvider,
	extractClaudeCliOutput,
} from "../src/providers/claude-cli-provider";
import type {
	LocalCommandRequest,
	LocalCommandResult,
} from "../src/providers/local-command-runner";
import { ProviderError } from "../src/providers/types";

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
				"--no-session-persistence",
				"--safe-mode",
				"--permission-mode",
				"dontAsk",
				"--tools",
				"",
				"--json-schema",
			])
		);
		expect(run.mock.calls[0][0].stdin).toContain("Section heading: X");
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
				"CueCraft: claude was not found. Check the command path in settings."
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
		expect(status.message).toMatch(/claude login/i);
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
				"--no-session-persistence",
				"--safe-mode",
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
