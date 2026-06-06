import { createXai } from "@ai-sdk/xai";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import {
	AiSdkProvider,
	modelGenerator,
	type ObjectGenerator,
} from "./ai-sdk-provider";

export interface XaiProviderOptions {
	apiKey: string;
	model: string;
	/** Custom fetch (Obsidian's requestUrl) to avoid CORS in Electron. */
	fetchImpl?: FetchFunction;
	/** Overrides the real AI SDK call in tests. */
	generator?: ObjectGenerator;
}

export class XaiProvider extends AiSdkProvider {
	constructor(opts: XaiProviderOptions) {
		super({
			id: "xai",
			label: "xAI (Grok)",
			vendor: "xAI",
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
	const xai = createXai({ apiKey, fetch: fetchImpl });
	return modelGenerator(xai(model));
}
