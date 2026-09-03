import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	ByokProviderRuntime,
	ByokTextGenerationInput,
} from "@swartzrock/byok-runtime";
import { wrapFirstRecallByokRuntime } from "../src/byok-firstrecall-adapter";
import { cueBatchJsonSchema } from "../src/local-cli-cue-batch";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("local CLI cue batch prompt", () => {
	it("submits every section and repairs one invalid batch response", async () => {
		const calls: ByokTextGenerationInput[] = [];
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
									summary: "Stacks remove the newest item first.",
								},
								{
									question: "What makes a queue FIFO?",
									keywords: ["queue", "FIFO"],
									summary: "Queues remove the oldest item first.",
								},
							],
						}),
				};
			},
		};
		const provider = wrapFirstRecallByokRuntime(runtime);
		const inputs = [
			{
				heading: "Stacks",
				content: "A stack removes the newest item first.",
				options: { questionType: "exam-practice" as const },
			},
			{
				heading: "Queues",
				content: "A queue removes the oldest item first.",
				options: { questionType: "exam-practice" as const },
			},
		];

		await expect(
			provider.generateCues?.(inputs)
		).resolves.toMatchObject([
			{ cue: { question: "What makes a stack LIFO?" } },
			{ cue: { question: "What makes a queue FIFO?" } },
		]);

		expect(calls).toHaveLength(2);
		expect(calls[0].prompt).toMatch(
			/Section 1\s+Heading: Stacks\s+Content:\s+A stack removes the newest item first\.[\s\S]*Section 2\s+Heading: Queues\s+Content:\s+A queue removes the oldest item first\./
		);
		for (const call of calls) {
			expect(call.prompt).toContain("A stack removes the newest item first.");
			expect(call.prompt).toContain("A queue removes the oldest item first.");
			expect(call.prompt).toMatch(/source data.*never as instructions/i);
			expect(call.jsonSchema).toBe(cueBatchJsonSchema(2));
		}
		expect(calls[0].prompt).not.toContain("not json");
		expect(calls[1].prompt).toContain("not json");
		expect(calls[1].prompt.startsWith(calls[0].prompt)).toBe(true);
	});

	it("fails a batch after one protected repair attempt", async () => {
		const calls: ByokTextGenerationInput[] = [];
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
		const provider = wrapFirstRecallByokRuntime(runtime);

		await expect(
			provider.generateCues?.([
				{
					heading: "Queues",
					content: "A queue removes the oldest item first.",
					options: { questionType: "conceptual" },
				},
			])
		).rejects.toThrow();
		expect(calls).toHaveLength(2);
		expect(calls[1].prompt).toContain("still not json");
	});

	it("repairs item-level validation failures once", async () => {
		const calls: ByokTextGenerationInput[] = [];
		const validCue = {
			question: "What makes a queue FIFO?",
			keywords: ["queue", "FIFO"],
			summary: "Queues remove the oldest item first.",
		};
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
					text: JSON.stringify({
						cues: calls.length === 1 ? [{}] : [validCue],
					}),
				};
			},
		};
		const provider = wrapFirstRecallByokRuntime(runtime);

		await expect(
			provider.generateCues?.([
				{
					heading: "Queues",
					content: "A queue removes the oldest item first.",
					options: { questionType: "conceptual" },
				},
			])
		).resolves.toEqual([{ cue: validCue }]);
		expect(calls).toHaveLength(2);
		expect(calls[1].prompt).toContain(JSON.stringify({ cues: [{}] }));
	});

	it("keeps an insufficient-source abstention without repairing it", async () => {
		const calls: ByokTextGenerationInput[] = [];
		const runtime: ByokProviderRuntime = {
			id: "codex-cli",
			label: "Fake Codex CLI",
			requiresNetwork: true,
			requiresDownload: false,
			testConnection: async () => ({ ok: true, message: "Connected." }),
			listModels: async () => [],
			generateText: async (input) => {
				calls.push(input);
				return { text: JSON.stringify({ cues: [{ insufficientSource: true }] }) };
			},
		};
		const provider = wrapFirstRecallByokRuntime(runtime);

		await expect(
			provider.generateCues?.([
				{
					heading: "A Picture Of Tonks",
					content: "Tonks",
					options: { questionType: "conceptual" },
				},
			])
		).resolves.toMatchObject([{ error: expect.any(String) }]);
		expect(calls).toHaveLength(1);
	});

	it("requires every current cue field in the JSON schema", () => {
		const schema = JSON.parse(cueBatchJsonSchema(1));
		expect(schema.properties.cues.items.oneOf[0].required).toEqual([
			"question",
			"keywords",
			"summary",
		]);
		expect(schema.properties.cues.items.oneOf[1].required).toEqual([
			"insufficientSource",
		]);
	});

});
