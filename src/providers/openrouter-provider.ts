import { createOpenAI } from "@ai-sdk/openai";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import { generateText } from "ai";
import { z } from "zod/v3";
import {
	AiSdkProvider,
	type ObjectGenerator,
} from "./ai-sdk-provider";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface OpenRouterProviderOptions {
	apiKey: string;
	model: string;
	/** Custom fetch (Obsidian's requestUrl) to avoid CORS in Electron. */
	fetchImpl?: FetchFunction;
	/** Overrides the real AI SDK call in tests. */
	generator?: ObjectGenerator;
	/** Overrides the model-list call in tests. */
	listModelsImpl?: () => Promise<string[]>;
}

export class OpenRouterProvider extends AiSdkProvider {
	constructor(opts: OpenRouterProviderOptions) {
		super({
			id: "openrouter",
			label: "OpenRouter",
			vendor: "OpenRouter",
			model: opts.model,
			generate: opts.generator ?? defaultGenerator(opts.apiKey, opts.model, opts.fetchImpl),
			listModels:
				opts.listModelsImpl ?? (() => listOpenRouterModels(opts.apiKey, opts.fetchImpl)),
		});
	}
}

interface OpenRouterModelEntry {
	id?: string;
}

async function listOpenRouterModels(
	apiKey: string,
	fetchImpl?: FetchFunction
): Promise<string[]> {
	const fetchFn = (fetchImpl ?? globalThis.fetch) as typeof fetch | undefined;
	if (!fetchFn) {
		throw new Error("OpenRouter model fetch requires a fetch implementation.");
	}
	const response = await fetchFn(`${OPENROUTER_BASE_URL}/models`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"HTTP-Referer": "https://github.com/swartzrock/obsidian-cuecraft-plugin",
			"X-Title": "CueCraft",
		},
	});
	if (!response.ok) {
		const detail = (await response.text()).trim();
		throw new Error(
			detail
				? `OpenRouter model fetch failed (${response.status}): ${detail}`
				: `OpenRouter model fetch failed (${response.status}).`
		);
	}
	const body = (await response.json()) as { data?: OpenRouterModelEntry[] };
	return (body.data ?? [])
		.map((model) => model.id)
		.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

function defaultGenerator(
	apiKey: string,
	modelId: string,
	fetchImpl?: FetchFunction
): ObjectGenerator {
	const openrouter = createOpenAI({
		apiKey,
		baseURL: OPENROUTER_BASE_URL,
		fetch: fetchImpl,
		name: "openrouter",
		headers: {
			"HTTP-Referer": "https://github.com/swartzrock/obsidian-cuecraft-plugin",
			"X-Title": "CueCraft",
		},
	});
	const model = openrouter.chat(modelId);
	return async function generate<T>({ schema, prompt, signal }: {
		schema: z.ZodType<T, z.ZodTypeDef, unknown>;
		prompt: string;
		signal?: AbortSignal;
	}): Promise<T> {
		const jsonPrompt =
			`${prompt}\n\nRespond with ONLY a valid JSON object matching this schema ` +
			`(no markdown fences, no extra text):\n${JSON.stringify(zodToJsonSchema(schema))}`;
		const { text } = await generateText({
			model,
			prompt: jsonPrompt,
			abortSignal: signal,
		});
		const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
		return JSON.parse(cleaned) as T;
	};
}

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
	if (schema instanceof z.ZodObject) {
		const shape = schema.shape as Record<string, z.ZodType>;
		const properties: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(shape)) {
			properties[key] = zodToJsonSchema(value);
		}
		return { type: "object", properties, required: Object.keys(shape) };
	}
	if (schema instanceof z.ZodArray) {
		return { type: "array", items: zodToJsonSchema(schema.element as z.ZodType) };
	}
	if (schema instanceof z.ZodEnum) {
		return { type: "string", enum: schema.options as string[] };
	}
	if (schema instanceof z.ZodNullable) {
		const inner = zodToJsonSchema(schema.unwrap() as z.ZodType);
		return { ...inner, nullable: true };
	}
	if (schema instanceof z.ZodString) {
		return { type: "string" };
	}
	if (schema instanceof z.ZodNumber) {
		return { type: "number" };
	}
	if (schema instanceof z.ZodBoolean) {
		return { type: "boolean" };
	}
	return { type: "string" };
}
