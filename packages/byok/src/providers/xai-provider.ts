import { createXai } from "@ai-sdk/xai";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import type { Model as OpenAIModel } from "openai/resources/models";
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
	/** Overrides the model-list call in tests. */
	listModelsImpl?: () => Promise<string[]>;
}

export class XaiProvider extends AiSdkProvider {
	constructor(opts: XaiProviderOptions) {
		super({
			id: "xai",
			label: "xAI (Grok)",
			vendor: "xAI",
			model: opts.model,
			generate: opts.generator ?? defaultGenerator(opts.apiKey, opts.model, opts.fetchImpl),
			listModels: opts.listModelsImpl ?? (() => listXaiModels(opts.apiKey, opts.fetchImpl)),
		});
	}
}

async function listXaiModels(
	apiKey: string,
	fetchImpl?: FetchFunction
): Promise<string[]> {
	const { default: OpenAI } = await import("openai");
	const client = new OpenAI({
		apiKey,
		baseURL: "https://api.x.ai/v1",
		fetch: fetchImpl as typeof fetch | undefined,
		dangerouslyAllowBrowser: true,
	});
	const page = await client.models.list();
	return (page.data as OpenAIModel[] | undefined ?? [])
		.map((model) => model.id)
		.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

function defaultGenerator(
	apiKey: string,
	model: string,
	fetchImpl?: FetchFunction
): ObjectGenerator {
	const xai = createXai({ apiKey, fetch: fetchImpl });
	return modelGenerator(xai(model));
}
