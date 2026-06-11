import Anthropic from "@anthropic-ai/sdk";
import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import {
	AiSdkProvider,
	modelGenerator,
	type ObjectGenerator,
} from "./ai-sdk-provider";

export type { ObjectGenerator } from "./ai-sdk-provider";

export interface AnthropicProviderOptions {
	apiKey: string;
	model: string;
	/** Custom fetch (Obsidian's requestUrl) to avoid CORS in Electron. */
	fetchImpl?: FetchFunction;
	/** Overrides the real AI SDK call in tests. */
	generator?: ObjectGenerator;
}

export class AnthropicProvider extends AiSdkProvider {
	private readonly apiKey: string;
	private readonly fetchImpl?: FetchFunction;

	constructor(opts: AnthropicProviderOptions) {
		super({
			id: "anthropic",
			label: "Anthropic (Claude)",
			vendor: "Anthropic",
			model: opts.model,
			generate: opts.generator ?? defaultGenerator(opts.apiKey, opts.model, opts.fetchImpl),
		});
		this.apiKey = opts.apiKey;
		this.fetchImpl = opts.fetchImpl;
	}

	async listModels(): Promise<ModelInfo[]> {
		const client = new Anthropic({
			apiKey: this.apiKey,
			fetch: this.fetchImpl,
			dangerouslyAllowBrowser: true,
		});
		const models: ModelInfo[] = [];
		for await (const model of client.models.list()) {
			models.push(model);
		}
		return models;
	}
}

/** Build the real AI SDK structured-output caller for a given key/model. */
function defaultGenerator(
	apiKey: string,
	model: string,
	fetchImpl?: FetchFunction
): ObjectGenerator {
	const anthropic = createAnthropic({ apiKey, fetch: fetchImpl });
	return modelGenerator(anthropic(model));
}
