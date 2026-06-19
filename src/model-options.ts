import { compareFetchedModelIds } from "./fetched-model-sorting";

/** Provider source that produced this option. */
export type ModelOptionSource =
	| "openrouter"
	| "openai"
	| "google"
	| "xai"
	| "ollama"
	| "anthropic"
	| "string";

/** Normalized model metadata shared across all providers. */
export interface ModelOption {
	id: string;
	label: string;
	provider: string;
	contextLength: number | null;
	pricing: { prompt: number; completion: number } | null;
	supportedParameters: string[] | null;
	source: ModelOptionSource;
}

/** Subset of the OpenRouter `/models` API response we normalize from. */
export interface OpenRouterRawModel {
	id?: string;
	name?: string;
	context_length?: number;
	pricing?: { prompt?: string; completion?: string };
	supported_parameters?: string[];
}

/** Build a ModelOption from a plain string ID (used by string-only providers). */
export function normalizeStringId(
	id: string,
	source: ModelOptionSource
): ModelOption {
	const provider = id.includes("/") ? id.split("/")[0] : source;
	return {
		id,
		label: id,
		provider,
		contextLength: null,
		pricing: null,
		supportedParameters: null,
		source,
	};
}

/** Batch-normalize an array of string IDs. */
export function normalizeModelIds(
	ids: string[],
	source: ModelOptionSource
): ModelOption[] {
	return ids.map((id) => normalizeStringId(id, source));
}

/** Build a ModelOption from a raw OpenRouter model entry. */
export function normalizeOpenRouterModel(
	entry: OpenRouterRawModel
): ModelOption {
	const id = entry.id ?? "";
	const provider = id.includes("/") ? id.split("/")[0] : "";
	const pricing =
		entry.pricing &&
		(entry.pricing.prompt != null || entry.pricing.completion != null)
			? {
					prompt: parseFloat(entry.pricing.prompt ?? "0"),
					completion: parseFloat(entry.pricing.completion ?? "0"),
				}
			: null;
	return {
		id,
		label: entry.name ?? id,
		provider,
		contextLength: entry.context_length ?? null,
		pricing,
		supportedParameters: entry.supported_parameters ?? null,
		source: "openrouter",
	};
}

/** Type guard: is the value a ModelOption (not a plain string)? */
export function isModelOption(value: unknown): value is ModelOption {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		"source" in value &&
		typeof (value as ModelOption).id === "string"
	);
}

/**
 * Sort ModelOptions with the current model first, then human-readable order.
 * Uses the same natural collation as {@link compareFetchedModelIds} for the
 * trailing sort so IDs stay consistent with the existing fetched-model dropdown.
 */
export function sortModelOptions(
	options: ModelOption[],
	currentModelId?: string
): ModelOption[] {
	return [...options].sort((a, b) => {
		if (currentModelId) {
			if (a.id === currentModelId && b.id !== currentModelId) return -1;
			if (b.id === currentModelId && a.id !== currentModelId) return 1;
		}
		return compareFetchedModelIds(a.id, b.id);
	});
}
