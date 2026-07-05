import type { ByokModelOption } from "@cuecraft/byok";

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
