import { createOpenAI } from "@ai-sdk/openai";
import type { FetchFunction } from "@ai-sdk/provider-utils";
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
}

export class OpenAIProvider extends AiSdkProvider {
	constructor(opts: OpenAIProviderOptions) {
		super({
			id: "openai",
			label: "OpenAI (ChatGPT)",
			vendor: "OpenAI",
			model: opts.model,
			generate: opts.generator ?? defaultGenerator(opts.apiKey, opts.model, opts.fetchImpl),
		});
	}
}

function defaultGenerator(
	apiKey: string,
	model: string,
	fetchImpl?: FetchFunction
): ObjectGenerator {
	const openai = createOpenAI({ apiKey, fetch: fetchImpl });
	return modelGenerator(openai(model));
}
