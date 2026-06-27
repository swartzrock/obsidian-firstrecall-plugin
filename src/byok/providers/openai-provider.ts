import { createOpenAI } from "@ai-sdk/openai";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import type { Model as OpenAIModel } from "openai/resources/models";
import {
	AiSdkProvider,
	modelGenerator,
	type ObjectGenerator,
} from "./ai-sdk-provider";

export interface OpenAIProviderOptions {
	apiKey: string;
	model: string;
	/** Custom fetch (Obsidian's requestUrl) to avoid CORS in Electron. */
	fetchImpl?: FetchFunction;
	/** Overrides the real AI SDK call in tests. */
	generator?: ObjectGenerator;
	/** Overrides the model-list call in tests. */
	listModelsImpl?: () => Promise<string[]>;
}

export class OpenAIProvider extends AiSdkProvider {
	constructor(opts: OpenAIProviderOptions) {
		super({
			id: "openai",
			label: "OpenAI (ChatGPT)",
			vendor: "OpenAI",
			model: opts.model,
			generate: opts.generator ?? defaultGenerator(opts.apiKey, opts.model, opts.fetchImpl),
			listModels:
				opts.listModelsImpl ?? (() => listOpenAiModels(opts.apiKey, opts.fetchImpl)),
		});
	}
}

async function listOpenAiModels(
	apiKey: string,
	fetchImpl?: FetchFunction
): Promise<string[]> {
	const fetchFn = (fetchImpl ?? globalThis.fetch) as typeof fetch | undefined;
	if (!fetchFn) {
		throw new Error("OpenAI model fetch requires a fetch implementation.");
	}
	const response = await fetchFn("https://api.openai.com/v1/models", {
		method: "GET",
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
	});
	if (!response.ok) {
		const detail = (await response.text()).trim();
		throw new Error(
			detail
				? `OpenAI model fetch failed (${response.status}): ${detail}`
				: `OpenAI model fetch failed (${response.status}).`
		);
	}
	const body = (await response.json()) as { data?: OpenAIModel[] };
	return (body.data ?? [])
		.map((model) => model.id)
		.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

function defaultGenerator(
	apiKey: string,
	model: string,
	fetchImpl?: FetchFunction
): ObjectGenerator {
	const openai = createOpenAI({ apiKey, fetch: fetchImpl });
	return modelGenerator(openai(model));
}
