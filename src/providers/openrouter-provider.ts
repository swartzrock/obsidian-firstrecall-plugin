import { createOpenAI } from "@ai-sdk/openai";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import {
	AiSdkProvider,
	modelGenerator,
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
	model: string,
	fetchImpl?: FetchFunction
): ObjectGenerator {
	const openrouter = createOpenAI({
		apiKey,
		baseURL: OPENROUTER_BASE_URL,
		fetch: fetchImpl,
		headers: {
			"HTTP-Referer": "https://github.com/swartzrock/obsidian-cuecraft-plugin",
			"X-Title": "CueCraft",
		},
	});
	return modelGenerator(openrouter(model));
}
