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
	/** Overrides the model-list call in tests. */
	listModelsImpl?: () => Promise<string[]>;
}

export class GoogleProvider extends AiSdkProvider {
	constructor(opts: GoogleProviderOptions) {
		super({
			id: "google",
			label: "Google (Gemini)",
			vendor: "Google",
			model: opts.model,
			generate: opts.generator ?? defaultGenerator(opts.apiKey, opts.model, opts.fetchImpl),
			listModels:
				opts.listModelsImpl ?? (() => listGoogleModels(opts.apiKey, opts.fetchImpl)),
		});
	}
}

async function listGoogleModels(
	apiKey: string,
	fetchImpl?: FetchFunction
): Promise<string[]> {
	const originalFetch = globalThis.fetch;
	if (fetchImpl) globalThis.fetch = fetchImpl as typeof fetch;
	try {
		const { GoogleGenAI } = await import("@google/genai/web");
		const client = new GoogleGenAI({ apiKey });
		const pager = await client.models.list();
		return pager.page
			.filter((model) =>
				(model.supportedActions ?? []).some((action) =>
					/generatecontent|generatetext/i.test(action)
				)
			)
			.map((model) => model.name?.replace(/^models\//, ""))
			.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
	} finally {
		if (fetchImpl) globalThis.fetch = originalFetch;
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
