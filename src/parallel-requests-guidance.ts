import { describeAnthropicModel } from "./anthropic-models";
import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";

export type ParallelGuidanceProviderId =
	| "ollama"
	| "anthropic"
	| "openai"
	| "google"
	| "xai";

export interface ParallelRequestsGuidanceSettings {
	provider: ParallelGuidanceProviderId;
	sectionConcurrency: number;
	ollamaModel: string;
	anthropicModel: string;
	anthropicAvailableModels?: ModelInfo[];
	openaiModel: string;
	googleModel: string;
	xaiModel: string;
}

const FAST_MODEL_HINT =
	"Usually safe for faster parallel generation. Lower this value if generation fails with rate-limit errors.";
const PREMIUM_MODEL_HINT =
	"Premium models can hit rate limits sooner. Consider fewer parallel requests if generation fails.";
const OLLAMA_HINT =
	"Local performance depends on your machine and selected model. Larger Ollama models often work best with fewer parallel requests.";
const DEFAULT_CLOUD_HINT =
	"Lower this value if generation fails with rate-limit errors.";

function selectedCloudModel(settings: ParallelRequestsGuidanceSettings): string {
	switch (settings.provider) {
		case "anthropic":
			return describeAnthropicModel(
				settings.anthropicModel,
				settings.anthropicAvailableModels
			).rawId;
		case "openai":
			return settings.openaiModel;
		case "google":
			return settings.googleModel;
		case "xai":
			return settings.xaiModel;
		default:
			return settings.ollamaModel;
	}
}

function normalizeModelId(modelId: string): string {
	return modelId.trim().toLowerCase();
}

function isFastModel(modelId: string): boolean {
	return /(^|[-\s])(haiku|mini|flash)($|[-\s])/.test(modelId);
}

function isPremiumOrRateLimitProneModel(modelId: string): boolean {
	return /(^|[-\s])(opus|fable|pro|ultra|reasoning|o1|o3)($|[-\s])|gpt-5|gpt-4\.5/.test(
		modelId
	);
}

export function parallelRequestsGuidance(
	settings: ParallelRequestsGuidanceSettings
): string {
	if (settings.provider === "ollama") return OLLAMA_HINT;
	const modelId = normalizeModelId(selectedCloudModel(settings));
	if (isFastModel(modelId)) return FAST_MODEL_HINT;
	if (isPremiumOrRateLimitProneModel(modelId)) return PREMIUM_MODEL_HINT;
	return DEFAULT_CLOUD_HINT;
}

export function formatParallelRequestsDescription(
	settings: ParallelRequestsGuidanceSettings
): string {
	return `Run up to ${settings.sectionConcurrency} section request${
		settings.sectionConcurrency === 1 ? "" : "s"
	} at once. ${parallelRequestsGuidance(settings)}`;
}
