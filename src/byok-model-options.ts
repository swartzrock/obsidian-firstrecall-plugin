import type { ByokModelOption, ByokProviderId } from "@swartzrock/byok-runtime";

const fetchedModelCollator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

export type ModelOption = ByokModelOption;

export function compareFetchedModelIds(left: string, right: string): number {
	return fetchedModelCollator.compare(left, right);
}

export function sortFetchedModelIds(modelIds: string[]): string[] {
	return [...modelIds].sort(compareFetchedModelIds);
}

export function normalizeStringId(id: string): ModelOption {
	return {
		id,
		label: id,
	};
}

export function normalizeModelIds(ids: string[]): ModelOption[] {
	return ids.map((id) => normalizeStringId(id));
}

// Fireworks model IDs are namespaced like "accounts/fireworks/models/llama-v3p1-70b-instruct".
// The prefix is required for the model ID but clutters the dropdown, so strip it from the label only.
const FIREWORKS_MODEL_ID_PREFIX = /^accounts\/[^/]+\/models\//;

export function displayModelOptions(
	provider: ByokProviderId,
	options: ByokModelOption[]
): ByokModelOption[] {
	if (provider !== "fireworks") return options;
	return options.map((option) => {
		const label = option.label.replace(FIREWORKS_MODEL_ID_PREFIX, "");
		return label && label !== option.label ? { id: option.id, label } : option;
	});
}

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
