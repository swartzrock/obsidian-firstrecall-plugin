import { describe, expect, it, vi } from "vitest";
import {
	CodexCliProvider,
	extractCodexCliOutput,
} from "../src/byok/providers/codex-cli-provider";
import { defaultLocalCliCwd } from "../src/byok/providers/local-command-runner";
import type {
	LocalCommandRequest,
	LocalCommandResult,
} from "../src/byok/providers/local-command-runner";
import { ProviderError } from "../src/byok/providers/types";

function result(stdout: string, stderr = ""): LocalCommandResult {
	return { stdout, stderr, exitCode: 0 };
}

function eventOutput(text: string): string {
	return [
		JSON.stringify({ type: "session.started" }),
		JSON.stringify({ type: "message", item: { content: [{ text }] } }),
	].join("\n");
}

function makeProvider(responses: Array<LocalCommandResult | Error>, model = ""): {
	provider: CodexCliProvider;
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
		provider: new CodexCliProvider({
			command: "codex",
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

describe("extractCodexCliOutput", () => {
	it("extracts the final text from JSONL event output", () => {
		expect(extractCodexCliOutput(eventOutput('{"question":"Q?"}'))).toBe(
			'{"question":"Q?"}'
		);
	});

	it("falls back to plain stdout when the CLI prints raw final text", () => {
		expect(extractCodexCliOutput('{"summary":"S"}')).toBe('{"summary":"S"}');
	});
});

describe("CodexCliProvider", () => {
	it("returns a validated cue from Codex structured output", async () => {
		const { provider, run } = makeProvider([
			result(
				eventOutput(
					JSON.stringify({
						question: "What is X?",
						keywords: ["a", "b"],
						confidence: "high",
						sectionLens,
					})
				)
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
			command: "codex",
			cwd: "/tmp/cuecraft-empty",
			timeoutMs: 50,
		});
		expect(run.mock.calls[0][0].args).toEqual([
			"exec",
			"--skip-git-repo-check",
			"--sandbox",
			"read-only",
			"--json",
		]);
		expect(run.mock.calls[0][0].args).not.toContain("--ask-for-approval");
		expect(run.mock.calls[0][0].stdin).toContain("Section heading: X");
		expect(run.mock.calls[0][0].stdin).toContain("sectionLens");
	});

	it("returns validated cues from a batched Codex output", async () => {
		const { provider, run } = makeProvider([
			result(
				eventOutput(
					JSON.stringify({
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
					})
				)
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

	it("keeps invalid batched Codex cue items isolated", async () => {
		const { provider } = makeProvider([
			result(
				JSON.stringify({
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

	it("repairs malformed cue output once", async () => {
		const { provider, run } = makeProvider([
			result("not json"),
			result(
				JSON.stringify({
					question: "Fixed?",
					keywords: ["a", "b"],
					confidence: "medium",
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
		const { provider } = makeProvider([result("nope"), result("still nope")]);

		await expect(
			provider.generateCue({ heading: "H", content: "c", preset: "conceptual" })
		).rejects.toBeInstanceOf(ProviderError);
	});

	it("returns a validated summary", async () => {
		const { provider } = makeProvider([
			result(JSON.stringify({ summary: "Covers X and Y." })),
		]);

		const summary = await provider.generateSummary({
			noteTitle: "Note",
			fullText: "text",
			sectionQuestions: ["Q1?"],
		});

		expect(summary.summary).toBe("Covers X and Y.");
	});

	it("reports command-not-found from the runner during connection checks", async () => {
		const { provider } = makeProvider([
			new ProviderError(
				"CueCraft: codex was not found. Check the command path in settings."
			),
		]);

		const status = await provider.testConnection();

		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/codex was not found/i);
	});

	it("reports unauthenticated Codex CLI status", async () => {
		const { provider } = makeProvider([result("Not logged in")]);

		const status = await provider.testConnection();

		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/codex login/i);
	});

	it("reports successful Codex CLI status", async () => {
		const { provider } = makeProvider([result("Logged in as user")], "gpt-5");

		const status = await provider.testConnection();

		expect(status).toEqual({
			ok: true,
			message: "Connected to Codex CLI (gpt-5).",
		});
	});

	it("passes the configured model override and omits it when blank", async () => {
		const withModel = makeProvider([
			result(
				JSON.stringify({
					question: "Q?",
					keywords: ["a", "b"],
					confidence: "high",
				})
			),
		], "gpt-5");
		await withModel.provider.generateCue({
			heading: "H",
			content: "c",
			preset: "conceptual",
		});
		expect(withModel.run.mock.calls[0][0].args).toContain("--model");
		expect(withModel.run.mock.calls[0][0].args).toContain("gpt-5");

		const withoutModel = makeProvider([
			result(
				JSON.stringify({
					question: "Q?",
					keywords: ["a", "b"],
					confidence: "high",
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

	it("uses a neutral temp cwd when no cwd is configured", async () => {
		const run = vi.fn<[LocalCommandRequest], Promise<LocalCommandResult>>(
			async () => result("Logged in as user")
		);
		const provider = new CodexCliProvider({
			command: "codex",
			runner: { run },
		});

		await provider.testConnection();

		expect(run.mock.calls[0][0].cwd).toBe(defaultLocalCliCwd());
	});
});
