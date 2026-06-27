import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";
import {
	AnthropicProvider,
	type ObjectGenerator,
} from "../src/byok/providers/anthropic-provider";
import { ProviderError } from "../src/byok/providers/types";

/** Generator that returns a fixed object and records the last prompt seen. */
function fixedGenerator(value: unknown): {
	generator: ObjectGenerator;
	prompts: string[];
} {
	const prompts: string[] = [];
	const generator: ObjectGenerator = async ({ prompt }) => {
		prompts.push(prompt);
		return value as never;
	};
	return { generator, prompts };
}

const opts = (generator: ObjectGenerator) => ({
	apiKey: "sk-ant-test",
	model: "claude-3-5-sonnet-latest",
	generator,
});

describe("AnthropicProvider.generateCue", () => {
	it("returns a validated cue from the structured output", async () => {
		const { generator } = fixedGenerator({
			question: "What is X?",
			keywords: ["a", "b", "c"],
			confidence: "high",
		});
		const p = new AnthropicProvider(opts(generator));
		const cue = await p.generateCue({
			heading: "X",
			content: "body",
			preset: "conceptual",
		});
		expect(cue.question).toBe("What is X?");
		expect(cue.keywords).toEqual(["a", "b", "c"]);
		expect(cue.confidence).toBe("high");
	});

	it("coerces benign model quirks (>5 keywords, odd casing)", async () => {
		const { generator } = fixedGenerator({
			question: "Q?",
			keywords: ["a", "b", "c", "d", "e", "f"],
			confidence: "HIGH",
		});
		const p = new AnthropicProvider(opts(generator));
		const cue = await p.generateCue({ heading: "H", content: "c", preset: "minimal" });
		expect(cue.keywords).toHaveLength(5);
		expect(cue.confidence).toBe("high");
	});

	it("includes heading, content, preset, and note context in the prompt", async () => {
		const { generator, prompts } = fixedGenerator({
			question: "Q?",
			keywords: ["a", "b"],
			confidence: "low",
		});
		const p = new AnthropicProvider(opts(generator));
		await p.generateCue({
			heading: "Photosynthesis",
			content: "light to sugar",
			noteContext: "WHOLE NOTE",
			preset: "exam-prep",
		});
		expect(prompts[0]).toContain("Photosynthesis");
		expect(prompts[0]).toContain("light to sugar");
		expect(prompts[0]).toContain("WHOLE NOTE");
		expect(prompts[0]).toContain("exam-style");
	});

	it("throws a readable ProviderError when the model output is invalid", async () => {
		const { generator } = fixedGenerator({
			question: "Q?",
			keywords: ["only-one"],
			confidence: "high",
		});
		const p = new AnthropicProvider(opts(generator));
		await expect(
			p.generateCue({ heading: "H", content: "c", preset: "conceptual" })
		).rejects.toBeInstanceOf(ProviderError);
	});

	it("maps an auth failure to a readable message", async () => {
		const generator: ObjectGenerator = async () => {
			throw new Error("401 invalid x-api-key");
		};
		const p = new AnthropicProvider(opts(generator));
		await expect(
			p.generateCue({ heading: "H", content: "c", preset: "conceptual" })
		).rejects.toThrow(/API key/i);
	});
});

describe("AnthropicProvider.generateSummary", () => {
	it("returns a validated summary", async () => {
		const { generator } = fixedGenerator({
			summary: "A short summary.",
			learningObjective: "Understand X.",
		});
		const p = new AnthropicProvider(opts(generator));
		const out = await p.generateSummary({
			noteTitle: "Note",
			fullText: "text",
			sectionQuestions: ["Q1?"],
		});
		expect(out.summary).toBe("A short summary.");
		expect(out.learningObjective).toBe("Understand X.");
	});
});

describe("AnthropicProvider.testConnection", () => {
	it("reports success when a trivial generation resolves", async () => {
		const generator: ObjectGenerator = async ({ schema }) => {
			// Honor the trivial schema used by testConnection.
			expect(schema).toBeInstanceOf(z.ZodType);
			return { ok: true } as never;
		};
		const p = new AnthropicProvider(opts(generator));
		const status = await p.testConnection();
		expect(status.ok).toBe(true);
		expect(status.message).toMatch(/Connected to Anthropic/);
	});

	it("reports a readable failure when the key is rejected", async () => {
		const generator: ObjectGenerator = async () => {
			throw new Error("403 authentication_error");
		};
		const p = new AnthropicProvider(opts(generator));
		const status = await p.testConnection();
		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/API key/i);
	});
});

describe("AnthropicProvider.listModels", () => {
	it("returns typed models with display names from the official SDK", async () => {
		const models: ModelInfo[] = [
			{
				id: "claude-account-123",
				display_name: "Claude Account 123",
				type: "model",
				created_at: "2026-01-01T00:00:00Z",
				max_input_tokens: 1000,
				max_tokens: 1000,
				capabilities: null,
			},
		];
		const fetchMock = async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : input.toString();
			expect(url).toContain("/v1/models");
			return new Response(
				JSON.stringify({
					data: models,
					first_id: "claude-account-123",
					last_id: "claude-account-123",
					has_more: false,
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				}
			);
		};
		const p = new AnthropicProvider({
			apiKey: "sk-ant-test",
			model: "claude-3-5-sonnet-latest",
			fetchImpl: fetchMock as never,
		});
		const listed = await p.listModels();
		expect(listed).toHaveLength(1);
		expect(listed[0].display_name).toBe("Claude Account 123");
		expect(listed[0].id).toBe("claude-account-123");
	});
});
