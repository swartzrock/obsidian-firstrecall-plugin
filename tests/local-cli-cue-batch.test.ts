import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	ByokProviderRuntime,
	ByokTextGenerationInput,
} from "@swartzrock/byok-runtime";
import { wrapCueCraftByokRuntime } from "../src/byok-cuecraft-adapter";
import {
	buildSectionCueInstructionsTemplate,
	SECTION_COUNT_PLACEHOLDER,
	SECTION_LIST_PLACEHOLDER,
	WHOLE_NOTE_CONTEXT_PLACEHOLDER,
} from "../src/cue-instructions";
import {
	buildCueBatchPrompt,
	cueBatchJsonSchema,
} from "../src/local-cli-cue-batch";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("local CLI cue batch prompt", () => {
	it("builds the inspected batch template with the production composer", () => {
		const input = {
			heading: "Queues",
			content: "A queue removes the oldest item first.",
			noteContext: "# Collections\nQueues and stacks.",
			options: { questionType: "direct-recall" as const },
		};
		const runtime = buildCueBatchPrompt([input]);
		const sectionList =
			"Section 1\nHeading: Queues\nContent:\nA queue removes the oldest item first.\n";
		const inspected = buildSectionCueInstructionsTemplate(
			"direct-recall",
			"batch"
		);

		expect(
			inspected
				.replaceAll(SECTION_COUNT_PLACEHOLDER, "1")
				.replace(SECTION_LIST_PLACEHOLDER, sectionList)
				.replace(
					WHOLE_NOTE_CONTEXT_PLACEHOLDER,
					"# Collections\nQueues and stacks."
				)
		).toBe(runtime);
	});

	it("uses the shared batch template for initial and repair requests", async () => {
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
									summary: {
										takeaway: "Stacks remove the newest item first.",
										keyPhrase: "last-in-first-out",
										explanation: "The phrase defines stack order.",
									},
								},
								{
									question: "What makes a queue FIFO?",
									keywords: ["queue", "FIFO"],
									summary: {
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
		const provider = wrapCueCraftByokRuntime(runtime);
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
		const initialTemplate = buildCueBatchPrompt(inputs);
		expect(calls[0].prompt).toBe(initialTemplate);
		for (const call of calls) {
			expect(call.prompt).toContain(
				"Create exactly one Section cue for each of the 2 supplied sections"
			);
			expect(call.prompt).toContain("Question: Ask one precise exam-style question");
			for (const field of [
				"question",
				"keywords",
				"summary",
				"takeaway",
				"keyPhrase",
				"explanation",
			]) {
				expect(call.prompt).toContain(field);
			}
			expect(call.prompt).toContain("A stack removes the newest item first.");
			expect(call.prompt).toContain("A queue removes the oldest item first.");
			expect(call.jsonSchema).toBe(cueBatchJsonSchema(2));
		}
		expect(calls[1].prompt).toContain(
			"Your previous reply could not be validated (response was not valid JSON)."
		);
		expect(calls[1].prompt).toContain("Previous reply:\nnot json");
		expect(calls[1].prompt).toContain(
			"Reply again with ONLY the corrected JSON object."
		);
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
		const provider = wrapCueCraftByokRuntime(runtime);

		await expect(
			provider.generateCues?.([
				{
					heading: "Queues",
					content: "A queue removes the oldest item first.",
					options: { questionType: "conceptual" },
				},
			])
		).rejects.toThrow(
			"Model output could not be validated: response was not valid JSON"
		);
		expect(calls).toHaveLength(2);
		expect(calls[1].prompt).toContain("Previous reply:\nstill not json");
	});

	it("repairs item-level validation failures once", async () => {
		const calls: ByokTextGenerationInput[] = [];
		const validCue = {
			question: "What makes a queue FIFO?",
			keywords: ["queue", "FIFO"],
			summary: {
				takeaway: "Queues remove the oldest item first.",
				keyPhrase: "first-in-first-out",
				explanation: "The phrase defines queue order.",
			},
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
		const provider = wrapCueCraftByokRuntime(runtime);

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
		expect(calls[1].prompt).toContain(
			"Your previous reply could not be validated (section 1:"
		);
		expect(calls[1].prompt).toContain("Previous reply:");
	});

	it("requests only the current cue fields", () => {
		const prompt = buildCueBatchPrompt([
				{
					heading: "Stacks",
					content: "A stack is last-in-first-out.",
					options: { questionType: "conceptual" },
				},
			]);

		expect(prompt).toContain('"question"');
		expect(prompt).toContain('"keywords"');
		expect(prompt).toContain('"summary"');
		expect(prompt).not.toContain("sequences");
		expect(prompt).not.toContain("linkedlists");
		expect(prompt).not.toContain("stacks");
		expect(prompt).not.toContain("intervals");
	});

	it("requires every current cue field in the JSON schema", () => {
		const schema = JSON.parse(cueBatchJsonSchema(1));
		expect(schema.properties.cues.items.required).toEqual([
			"question",
			"keywords",
			"summary",
		]);
	});

});
