import { describe, it, expect } from "vitest";
import { z } from "zod";
import { OpenAIProvider } from "../src/providers/openai-provider";
import { GoogleProvider } from "../src/providers/google-provider";
import { XaiProvider } from "../src/providers/xai-provider";
import { OpenRouterProvider } from "../src/providers/openrouter-provider";
import type { ObjectGenerator } from "../src/providers/ai-sdk-provider";
import { ProviderError, ProviderRateLimitError } from "../src/providers/types";
import { normalizeStringId, type ModelOption } from "../src/model-options";

type Ctor = new (opts: {
	apiKey: string;
	model: string;
	generator?: ObjectGenerator;
	fetchImpl?: typeof fetch;
	listModelsImpl?: () => Promise<string[] | ModelOption[]>;
}) => {
	id: string;
	label: string;
	generateCue: (
		input: {
			heading: string;
			content: string;
			preset: string;
			noteContext?: string;
			options?: {
				cueDensity: 1 | 2 | 3;
				questionStyle: "recall" | "socratic" | "exam";
				generateKeywords: boolean;
				autoSummary: boolean;
			};
		},
		signal?: AbortSignal
	) => Promise<{ question: string; keywords: string[]; confidence: string }>;
	generateSummary: (input: {
		noteTitle: string;
		fullText: string;
		sectionQuestions: string[];
	}) => Promise<{ summary: string }>;
	testConnection: () => Promise<{ ok: boolean; message: string }>;
	listModels: () => Promise<unknown[]>;
};

/** Generator returning a fixed object and recording prompts. */
function fixedGenerator(value: unknown): { generator: ObjectGenerator; prompts: string[] } {
	const prompts: string[] = [];
	const generator: ObjectGenerator = async ({ prompt }) => {
		prompts.push(prompt);
		return value as never;
	};
	return { generator, prompts };
}

const cases: Array<{ name: string; Ctor: Ctor; id: string; vendor: RegExp; model: string }> = [
	{ name: "OpenAIProvider", Ctor: OpenAIProvider, id: "openai", vendor: /OpenAI/, model: "gpt-4o-mini" },
	{ name: "GoogleProvider", Ctor: GoogleProvider, id: "google", vendor: /Google/, model: "gemini-1.5-flash" },
	{ name: "XaiProvider", Ctor: XaiProvider, id: "xai", vendor: /xAI/, model: "grok-2-latest" },
	{ name: "OpenRouterProvider", Ctor: OpenRouterProvider, id: "openrouter", vendor: /OpenRouter/, model: "anthropic/claude-sonnet-4" },
];

for (const c of cases) {
	const make = (generator: ObjectGenerator) =>
		new c.Ctor({ apiKey: "k", model: c.model, generator });

	describe(c.name, () => {
		it("exposes its id and uses the shared AiProvider shape", () => {
			const p = make(async () => ({}) as never);
			expect(p.id).toBe(c.id);
			expect(typeof p.label).toBe("string");
		});

		it("returns a validated, coerced cue from structured output", async () => {
			const { generator } = fixedGenerator({
				question: "What is X?",
				keywords: ["a", "b", "c", "d", "e", "f"],
				confidence: "HIGH",
				rationale: null,
			});
			const cue = await make(generator).generateCue({
				heading: "X",
				content: "body",
				preset: "conceptual",
			});
			expect(cue.question).toBe("What is X?");
			expect(cue.keywords).toHaveLength(5); // trimmed from 6
			expect(cue.confidence).toBe("high"); // casing normalized
		});

		it("uses an OpenAI strict cue schema with nullable rationale", async () => {
			const generator: ObjectGenerator = async ({ schema }) => {
				expect(
					schema.safeParse({
						question: "Q?",
						keywords: ["a", "b"],
						confidence: "high",
						rationale: null,
					}).success
				).toBe(true);
				expect(
					schema.safeParse({
						question: "Q?",
						keywords: ["a", "b"],
						confidence: "high",
					}).success
				).toBe(false);
				return {
					question: "Q?",
					keywords: ["a", "b"],
					confidence: "high",
					rationale: null,
				} as never;
			};
			const cue = await make(generator).generateCue({
				heading: "H",
				content: "c",
				preset: "conceptual",
			});
			expect((cue as { rationale?: string }).rationale).toBeUndefined();
		});

		it("embeds heading, content, context and preset in the prompt", async () => {
			const { generator, prompts } = fixedGenerator({
				question: "Q?",
				keywords: ["a", "b"],
				confidence: "low",
			});
			await make(generator).generateCue({
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

		it("includes simpler preset guidance in the prompt", async () => {
				const { generator, prompts } = fixedGenerator({
					question: "Q?",
					keywords: ["a", "b"],
					confidence: "low",
				});
				await make(generator).generateCue({
					heading: "H",
					content: "c",
					preset: "simpler",
				});
				expect(prompts[0]).toContain("simple, accessible");
			});

		it("includes generation option guidance in the prompt", async () => {
			const { generator, prompts } = fixedGenerator({
				question: "Q?",
				keywords: ["a", "b"],
				confidence: "low",
			});
			await make(generator).generateCue({
				heading: "H",
				content: "c",
				preset: "conceptual",
				options: {
					cueDensity: 1,
					questionStyle: "exam",
					generateKeywords: false,
					autoSummary: true,
				},
			});
			expect(prompts[0]).toContain("exam prompt");
			expect(prompts[0]).toContain("minimal");
			expect(prompts[0]).toContain("minimum 2");
		});

		it("throws a ProviderError on invalid model output", async () => {
			const { generator } = fixedGenerator({
				question: "Q?",
				keywords: [], // too few -> invalid
				confidence: "high",
			});
			await expect(
				make(generator).generateCue({ heading: "H", content: "c", preset: "conceptual" })
			).rejects.toBeInstanceOf(ProviderError);
		});

		it("maps an auth error to a vendor-named readable message", async () => {
			const generator: ObjectGenerator = async () => {
				throw new Error("401 unauthorized invalid api key");
			};
			await expect(
				make(generator).generateCue({ heading: "H", content: "c", preset: "conceptual" })
			).rejects.toThrow(c.vendor);
		});

		it("retries rate-limit errors before surfacing failure", async () => {
			let calls = 0;
			const generator: ObjectGenerator = async () => {
				calls++;
				if (calls < 3) {
					throw Object.assign(new Error("429 rate limit"), {
						status: 429,
						retryAfterMs: 0,
					});
				}
				return {
					question: "Recovered?",
					keywords: ["a", "b"],
					confidence: "medium",
				} as never;
			};
			const cue = await make(generator).generateCue({
				heading: "H",
				content: "c",
				preset: "conceptual",
			});
			expect(cue.question).toBe("Recovered?");
			expect(calls).toBe(3);
		});

		it("throws ProviderRateLimitError after retry budget is exhausted", async () => {
			let calls = 0;
			const generator: ObjectGenerator = async () => {
				calls++;
				throw Object.assign(new Error("429 rate limit"), {
					status: 429,
					retryAfterMs: 0,
				});
			};
			await expect(
				make(generator).generateCue({
					heading: "H",
					content: "c",
					preset: "conceptual",
				})
			).rejects.toBeInstanceOf(ProviderRateLimitError);
			expect(calls).toBe(3);
		});

		it("returns a validated summary", async () => {
			const { generator, prompts } = fixedGenerator({
				summary: "A short summary.",
				learningObjective: "Understand X.",
			});
			const out = await make(generator).generateSummary({
				noteTitle: "Note",
				fullText: "text",
				sectionQuestions: ["Q1?"],
			});
			expect(out.summary).toBe("A short summary.");
			expect(prompts[0]).toContain("one concise study takeaway sentence");
			expect(prompts[0]).toContain("one short sentence");
		});

		it("uses an OpenAI strict summary schema with nullable learning objective", async () => {
			const generator: ObjectGenerator = async ({ schema }) => {
				expect(
					schema.safeParse({
						summary: "A short summary.",
						learningObjective: null,
					}).success
				).toBe(true);
				expect(schema.safeParse({ summary: "A short summary." }).success).toBe(false);
				return {
					summary: "A short summary.",
					learningObjective: null,
				} as never;
			};
			const out = await make(generator).generateSummary({
				noteTitle: "Note",
				fullText: "text",
				sectionQuestions: ["Q1?"],
			});
			expect((out as { learningObjective?: string }).learningObjective).toBeUndefined();
		});

		it("testConnection reports success and names the vendor", async () => {
			const generator: ObjectGenerator = async ({ schema }) => {
				expect(schema).toBeInstanceOf(z.ZodType);
				return { ok: true } as never;
			};
			const status = await make(generator).testConnection();
			expect(status.ok).toBe(true);
			expect(status.message).toMatch(c.vendor);
			expect(status.message).toContain(c.model);
		});

		it("testConnection reports a readable failure on auth error", async () => {
			const generator: ObjectGenerator = async () => {
				throw new Error("403 authentication_error");
			};
			const status = await make(generator).testConnection();
			expect(status.ok).toBe(false);
			expect(status.message).toMatch(/API key/i);
		});

		it("listModels returns provider model ids", async () => {
			const modelIdsByProvider: Record<string, string[]> = {
				openai: ["gpt-4o-mini", "gpt-4.1"],
				google: ["gemini-1.5-flash"],
				xai: ["grok-2-latest", "grok-beta"],
				openrouter: ["anthropic/claude-sonnet-4", "openai/gpt-4o"],
			};
			const ids = modelIdsByProvider[c.id] ?? ["grok-2-latest", "grok-beta"];
			const expected: string[] | ModelOption[] =
				c.id === "openrouter"
					? ids.map((id) => normalizeStringId(id, "openrouter"))
					: ids;
			const provider = new c.Ctor({
				apiKey: "k",
				model: c.model,
				generator: async () => ({ ok: true }) as never,
				listModelsImpl: async () => expected,
			});
			const result = await provider.listModels();
			if (c.id === "openrouter") {
				expect((result as ModelOption[]).map((m) => m.id)).toEqual(ids);
			} else {
				expect(result).toEqual(expected);
			}
		});
	});
}
