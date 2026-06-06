import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import {
	AiSdkProvider,
	modelGenerator,
	type ObjectGenerator,
} from "./ai-sdk-provider";

export interface GoogleProviderOptions {
	apiKey: string;
	model: string;
	/** Custom fetch (Obsidian's requestUrl) to avoid CORS in Electron. */
	fetchImpl?: FetchFunction;
	/** Overrides the real AI SDK call in tests. */
	generator?: ObjectGenerator;
}

export class GoogleProvider extends AiSdkProvider {
	constructor(opts: GoogleProviderOptions) {
		super({
			id: "google",
			label: "Google (Gemini)",
			vendor: "Google",
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
	const google = createGoogleGenerativeAI({ apiKey, fetch: fetchImpl });
	return modelGenerator(google(model));
}
