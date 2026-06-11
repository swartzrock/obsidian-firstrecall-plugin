import { describe, expect, it } from "vitest";
import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";
import {
	formatParallelRequestsDescription,
	parallelRequestsGuidance,
	type ParallelRequestsGuidanceSettings,
} from "../src/parallel-requests-guidance";

function modelInfo(id: string, display_name: string): ModelInfo {
	return {
		id,
		display_name,
		type: "model",
		created_at: "2026-01-01T00:00:00Z",
		max_input_tokens: null,
		max_tokens: null,
		capabilities: null,
	} as ModelInfo;
}

function baseSettings(
	overrides: Partial<ParallelRequestsGuidanceSettings> = {}
): ParallelRequestsGuidanceSettings {
	return {
		provider: "anthropic",
		sectionConcurrency: 5,
		ollamaModel: "llama3.1:8b",
		anthropicModel: "claude-sonnet-4-6",
		anthropicAvailableModels: [],
		openaiModel: "gpt-4o-mini",
		googleModel: "gemini-1.5-flash",
		xaiModel: "grok-2-latest",
		...overrides,
	};
}

describe("parallelRequestsGuidance", () => {
	it("uses faster guidance for Anthropic Haiku", () => {
		expect(
			parallelRequestsGuidance(
				baseSettings({ anthropicModel: "claude-haiku-4-5" })
			)
		).toMatch(/Usually safe for faster parallel generation/i);
	});

	it("uses premium guidance for Opus-like models", () => {
		expect(
			parallelRequestsGuidance(
				baseSettings({
					provider: "google",
					googleModel: "gemini-1.5-pro",
				})
			)
		).toMatch(/Premium models can hit rate limits sooner/i);
	});

	it("uses Ollama-specific local performance guidance", () => {
		expect(
			parallelRequestsGuidance(baseSettings({ provider: "ollama" }))
		).toMatch(/Local performance depends on your machine/i);
	});

	it("falls back to generic cloud guidance for balanced models", () => {
		expect(
			parallelRequestsGuidance(
				baseSettings({
					provider: "xai",
					xaiModel: "grok-2-latest",
				})
			)
		).toBe("Lower this value if generation fails with rate-limit errors.");
	});

	it("uses refreshed Anthropic model ids when available", () => {
		expect(
			parallelRequestsGuidance(
				baseSettings({
					anthropicModel: "claude-opus-4-7",
					anthropicAvailableModels: [
						modelInfo("claude-opus-4-7", "Claude Opus 4.7"),
					],
				})
			)
		).toMatch(/Premium models can hit rate limits sooner/i);
	});

	it("formats the slider description with the current concurrency", () => {
		expect(
			formatParallelRequestsDescription(
				baseSettings({ sectionConcurrency: 3, anthropicModel: "claude-haiku-4-5" })
			)
		).toBe(
			"Run up to 3 section requests at once. Usually safe for faster parallel generation. Lower this value if generation fails with rate-limit errors."
		);
	});
});
