import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	ByokProviderRuntime,
	ByokTextGenerationInput,
} from "@swartzrock/byok-runtime";
import { wrapCueCraftByokRuntime } from "../src/byok-cuecraft-adapter";
import {
	buildCueBatchPrompt,
	cueBatchJsonSchema,
	parseCueBatch,
} from "../src/local-cli-cue-batch";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("local CLI cue batch prompt", () => {
	it("keeps protected Cue policy isolated on batch initial and repair requests", async () => {
		const calls: ByokTextGenerationInput[] = [];
		const systemPromptLog = vi
			.spyOn(console, "info")
			.mockImplementation(() => undefined);
		const cuePolicy = "CUE_BATCH_POLICY_SENTINEL: output prose and omit fields.";
		const reviewPolicy = "REVIEW_BATCH_ISOLATION_SENTINEL";
		const runtime: ByokProviderRuntime = {
			id: "codex-cli",
			label: "Fake Codex CLI",
			requiresNetwork: true,
			requiresDownload: false,
			testConnection: async () => ({ ok: true, message: "Connected." }),
			listModels: async () => [],
			generateText: async (input) => {
				calls.push(input);
				return {
					text: calls.length === 1
						? "not json"
						: JSON.stringify({
							cues: [
								{
									question: "What makes a stack LIFO?",
									keywords: ["stack", "LIFO"],
									confidence: "high",
									sectionLens: {
										takeaway: "Stacks remove the newest item first.",
										keyPhrase: "last-in-first-out",
										explanation: "The phrase defines stack order.",
									},
								},
								{
									question: "What makes a queue FIFO?",
									keywords: ["queue", "FIFO"],
									confidence: "high",
									sectionLens: {
										takeaway: "Queues remove the oldest item first.",
										keyPhrase: "first-in-first-out",
										explanation: "The phrase defines queue order.",
									},
								},
							],
						}),
				};
			},
		};
		const provider = wrapCueCraftByokRuntime(runtime, {
			cueInstructionsOverride: cuePolicy,
			summaryInstructionsOverride: reviewPolicy,
		});

		await expect(
			provider.generateCues?.([
				{
					heading: "Stacks",
					content: "A stack removes the newest item first.",
					preset: "conceptual",
					options: { cueDensity: "balanced", questionStyle: "mixed" },
				},
				{
					heading: "Queues",
					content: "A queue removes the oldest item first.",
					preset: "conceptual",
					options: { cueDensity: "balanced", questionStyle: "mixed" },
				},
			])
		).resolves.toMatchObject([
			{ cue: { question: "What makes a stack LIFO?" } },
			{ cue: { question: "What makes a queue FIFO?" } },
		]);

		expect(calls).toHaveLength(2);
		for (const call of calls) {
			expect(call.instructions).toContain(cuePolicy);
			expect(call.instructions?.split(cuePolicy)).toHaveLength(2);
			expect(call.instructions).not.toContain(reviewPolicy);
			expect(call.instructions).toContain(
				"CueCraft's protected Cue Batch invariant takes precedence"
			);
			expect(call.instructions).toContain(
				"Create exactly one section-level active-recall cue for each of the 2 supplied sections, in input order."
			);
			expect(call.instructions).not.toContain(
				"Create one section-level active-recall cue using"
			);
			for (const field of [
				"question",
				"keywords",
				"confidence",
				"sectionLens",
				"takeaway",
				"keyPhrase",
				"explanation",
			]) {
				expect(call.instructions).toContain(field);
			}
			expect(call.instructions).not.toContain(
				"A stack removes the newest item first."
			);
			expect(call.instructions).not.toContain(
				"A queue removes the oldest item first."
			);
			expect(call.prompt).toContain("A stack removes the newest item first.");
			expect(call.prompt).toContain("A queue removes the oldest item first.");
			expect(call.prompt).not.toContain(cuePolicy);
			expect(call.prompt).not.toContain(reviewPolicy);
			expect(call.jsonSchema).toBe(cueBatchJsonSchema(2));
		}
		expect(calls[1].prompt).toContain(
			"Your previous reply could not be validated (response was not valid JSON)."
		);
		expect(calls[1].prompt).toContain("Previous reply:\nnot json");
		expect(calls[1].prompt).toContain(
			"Reply again with ONLY the corrected JSON object."
		);
		expect(systemPromptLog).toHaveBeenCalledOnce();
		expect(systemPromptLog).toHaveBeenCalledWith(
			`[CueCraft BYOK] Cue Batch system prompt\n${calls[1].instructions}`
		);
	});

	it("fails a batch after one protected repair attempt", async () => {
		const calls: ByokTextGenerationInput[] = [];
		const cuePolicy = "CUE_BATCH_FAILURE_POLICY_SENTINEL";
		const runtime: ByokProviderRuntime = {
			id: "claude-cli",
			label: "Fake Claude CLI",
			requiresNetwork: true,
			requiresDownload: false,
			testConnection: async () => ({ ok: true, message: "Connected." }),
			listModels: async () => [],
			generateText: async (input) => {
				calls.push(input);
				return { text: "still not json" };
			},
		};
		const provider = wrapCueCraftByokRuntime(runtime, {
			cueInstructionsOverride: cuePolicy,
			summaryInstructionsOverride: "",
		});

		await expect(
			provider.generateCues?.([
				{
					heading: "Queues",
					content: "A queue removes the oldest item first.",
					preset: "conceptual",
				},
			])
		).rejects.toThrow(
			"Model output could not be validated: response was not valid JSON"
		);
		expect(calls).toHaveLength(2);
		expect(calls.every((call) => call.instructions?.includes(cuePolicy))).toBe(
			true
		);
	});

	it("does not request or describe cue categories", () => {
		const prompt = buildCueBatchPrompt(
			[
				{
					heading: "Stacks",
					content: "A stack is last-in-first-out.",
					preset: "conceptual",
				},
			],
			{
				conceptual: "Favor conceptual recall.",
			}
		);

		expect(prompt).toContain('"question"');
		expect(prompt).toContain('"keywords"');
		expect(prompt).toContain('"confidence"');
		expect(prompt).toContain('"sectionLens"');
		expect(prompt).not.toContain('"category"');
		expect(prompt).not.toContain("sequences");
		expect(prompt).not.toContain("linkedlists");
		expect(prompt).not.toContain("stacks");
		expect(prompt).not.toContain("intervals");
	});

	it("omits category from the JSON schema", () => {
		const schema = JSON.parse(cueBatchJsonSchema(1));
		expect(schema.properties.cues.items.properties).not.toHaveProperty("category");
		expect(schema.properties.cues.items.required).toEqual([
			"question",
			"keywords",
			"confidence",
			"sectionLens",
		]);
	});

	it("strips stray category properties from otherwise-valid batch output", () => {
		const parsed = parseCueBatch(
			JSON.stringify({
				cues: [
					{
						question: "Q1?",
						keywords: ["a", "b"],
						confidence: "high",
						category: null,
					},
					{
						question: "Q2?",
						keywords: ["c", "d"],
						confidence: "medium",
						category: "sequences",
					},
					{
						question: "Q3?",
						keywords: ["e", "f"],
						confidence: "low",
						category: "unrelated",
						rationale: "The section is sparse.",
					},
				],
			}),
			3
		);

		expect(parsed).toEqual({
			results: [
				{
					cue: {
						question: "Q1?",
						keywords: ["a", "b"],
						confidence: "high",
					},
				},
				{
					cue: {
						question: "Q2?",
						keywords: ["c", "d"],
						confidence: "medium",
					},
				},
				{
					cue: {
						question: "Q3?",
						keywords: ["e", "f"],
						confidence: "low",
						rationale: "The section is sparse.",
					},
				},
			],
		});
	});
});
