import { describe, it, expect, vi } from "vitest";
import { OllamaProvider } from "../src/providers/ollama-provider";
import { ProviderError, HttpClient, HttpResponse } from "../src/providers/types";

function jsonResponse(body: unknown, status = 200): HttpResponse {
	return { status, text: JSON.stringify(body), json: body };
}

/** HTTP client that returns /api/generate responses from a queue. */
function generateClient(responses: string[]): HttpClient {
	let i = 0;
	return async (req) => {
		if (req.url.endsWith("/api/tags")) {
			return jsonResponse({ models: [{ name: "test-model" }] });
		}
		const resp = responses[Math.min(i, responses.length - 1)];
		i++;
		return jsonResponse({ response: resp });
	};
}

const baseOpts = (http: HttpClient) => ({
	host: "http://localhost:11434/",
	model: "test-model",
	http,
});

describe("OllamaProvider.testConnection", () => {
	it("lists locally installed model ids", async () => {
		const p = new OllamaProvider(baseOpts(generateClient([])));
		await expect(p.listModels()).resolves.toEqual(["test-model"]);
	});

	it("reports success when the model is available", async () => {
		const p = new OllamaProvider(baseOpts(generateClient([])));
		const status = await p.testConnection();
		expect(status.ok).toBe(true);
		expect(status.models).toContain("test-model");
	});

	it("reports a missing model clearly", async () => {
		const http: HttpClient = async () =>
			jsonResponse({ models: [{ name: "other" }] });
		const p = new OllamaProvider(baseOpts(http));
		const status = await p.testConnection();
		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/not installed/);
	});

	it("reports unreachable when the request throws", async () => {
		const http: HttpClient = async () => {
			throw new Error("ECONNREFUSED");
		};
		const p = new OllamaProvider(baseOpts(http));
		const status = await p.testConnection();
		expect(status.ok).toBe(false);
		expect(status.message).toMatch(/unreachable/);
	});
});

describe("OllamaProvider.generateCue", () => {
	it("returns a validated cue on first try", async () => {
		const good = JSON.stringify({
			question: "What is X?",
			keywords: ["a", "b"],
			confidence: "high",
		});
		const http = generateClient([good]);
		const spy = vi.fn(http);
		const p = new OllamaProvider(baseOpts(spy));
		const cue = await p.generateCue({ heading: "H", content: "c", preset: "conceptual" });
		expect(cue.question).toBe("What is X?");
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("includes simpler preset guidance in the prompt", async () => {
		const good = JSON.stringify({ question: "What is X?", keywords: ["a", "b"], confidence: "high" });
		const spy = vi.fn(generateClient([good]));
		const p = new OllamaProvider(baseOpts(spy));
		await p.generateCue({ heading: "H", content: "c", preset: "simpler" });
		const body = JSON.parse(spy.mock.calls[0][0].body as string);
		expect(body.prompt).toContain("simple, accessible");
	});

	it("includes generation option guidance in the prompt", async () => {
		const good = JSON.stringify({ question: "What is X?", keywords: ["a", "b"], confidence: "high" });
		const spy = vi.fn(generateClient([good]));
		const p = new OllamaProvider(baseOpts(spy));
		await p.generateCue({
			heading: "H",
			content: "c",
			preset: "conceptual",
			options: {
				cueDensity: 3,
				questionStyle: "socratic",
				generateKeywords: false,
				autoSummary: true,
			},
		});
		const body = JSON.parse(spy.mock.calls[0][0].body as string);
		expect(body.prompt).toContain("Socratic");
		expect(body.prompt).toContain("thorough");
		expect(body.prompt).toContain("minimum 2");
	});

	it("repairs once when the first response is malformed", async () => {
		const bad = "totally not json";
		const good = JSON.stringify({
			question: "Fixed?",
			keywords: ["a", "b", "c"],
			confidence: "medium",
		});
		const spy = vi.fn(generateClient([bad, good]));
		const p = new OllamaProvider(baseOpts(spy));
		const cue = await p.generateCue({ heading: "H", content: "c", preset: "minimal" });
		expect(cue.question).toBe("Fixed?");
		expect(spy).toHaveBeenCalledTimes(2); // original + one repair
	});

	it("throws ProviderError when repair still fails", async () => {
		const spy = vi.fn(generateClient(["nope", "still nope"]));
		const p = new OllamaProvider(baseOpts(spy));
		await expect(
			p.generateCue({ heading: "H", content: "c", preset: "conceptual" })
		).rejects.toBeInstanceOf(ProviderError);
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it("throws ProviderError when the server is unreachable", async () => {
		const http: HttpClient = async (req) => {
			if (req.url.endsWith("/api/generate")) throw new Error("down");
			return jsonResponse({ models: [{ name: "test-model" }] });
		};
		const p = new OllamaProvider(baseOpts(http));
		await expect(
			p.generateCue({ heading: "H", content: "c", preset: "conceptual" })
		).rejects.toBeInstanceOf(ProviderError);
	});

	it("surfaces the server's error body and a status hint on HTTP 500", async () => {
		const http: HttpClient = async (req) => {
			if (req.url.endsWith("/api/tags")) {
				return jsonResponse({ models: [{ name: "test-model" }] });
			}
			return jsonResponse({ error: "model requires more system memory" }, 500);
		};
		const p = new OllamaProvider(baseOpts(http));
		await expect(
			p.generateCue({ heading: "H", content: "c", preset: "conceptual" })
		).rejects.toThrow(/HTTP 500.*memory.*model requires more system memory/i);
	});

	it("hints to pull the model on HTTP 404", async () => {
		const http: HttpClient = async () =>
			jsonResponse({ error: "model 'x' not found" }, 404);
		const p = new OllamaProvider(baseOpts(http));
		await expect(
			p.generateCue({ heading: "H", content: "c", preset: "conceptual" })
		).rejects.toThrow(/HTTP 404.*ollama pull.*not found/i);
	});
});

describe("OllamaProvider.generateSummary", () => {
	it("returns a validated summary", async () => {
		const good = JSON.stringify({ summary: "Covers X and Y." });
		const spy = vi.fn(generateClient([good]));
		const p = new OllamaProvider(baseOpts(spy));
		const sum = await p.generateSummary({
			noteTitle: "T",
			fullText: "text",
			sectionQuestions: ["Q1"],
		});
		expect(sum.summary).toBe("Covers X and Y.");
		const body = JSON.parse(spy.mock.calls[0][0].body as string);
		expect(body.prompt).toContain("one concise study takeaway sentence");
		expect(body.prompt).toContain("learningObjective");
	});
});
