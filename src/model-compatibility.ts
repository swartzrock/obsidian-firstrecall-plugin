import { compareFetchedModelIds } from "./fetched-model-sorting";
import type { ModelOption } from "./model-options";

export type StructuredOutputSupport = "supported" | "unsupported" | "unknown";

const STRUCTURED_OUTPUT_PARAMS = new Set([
	"response_format",
	"structured_outputs",
	"json_schema",
]);

function normalizedParameters(option: ModelOption): string[] {
	return (option.supportedParameters ?? []).map((param) =>
		param.trim().toLowerCase()
	);
}

export function modelStructuredOutputSupport(
	option: ModelOption
): StructuredOutputSupport {
	if (!option.supportedParameters) return "unknown";
	const params = normalizedParameters(option);
	if (params.length === 0) return "unsupported";
	return params.some(
		(param) =>
			STRUCTURED_OUTPUT_PARAMS.has(param) ||
			param.includes("structured") ||
			param.includes("json_schema")
	)
		? "supported"
		: "unsupported";
}

export function isLargeContextModel(option: ModelOption): boolean {
	return (option.contextLength ?? 0) >= 100_000;
}

export function isLowCostModel(option: ModelOption): boolean {
	if (!option.pricing) return false;
	return option.pricing.prompt <= 0.000001 && option.pricing.completion <= 0.000005;
}

export function isRecommendedCueCraftModel(option: ModelOption): boolean {
	if (modelStructuredOutputSupport(option) !== "supported") return false;
	return (
		/claude|gpt-4o|gemini/i.test(`${option.id} ${option.label}`) ||
		isLargeContextModel(option)
	);
}

export function modelCompatibilityBadges(option: ModelOption): string[] {
	const badges: string[] = [];
	if (isRecommendedCueCraftModel(option)) {
		badges.push("Recommended");
	} else if (modelStructuredOutputSupport(option) === "supported") {
		badges.push("Structured output");
	}
	if (isLargeContextModel(option)) badges.push("Large context");
	if (isLowCostModel(option)) badges.push("Low cost");
	return badges.slice(0, 3);
}

export function modelCompatibilityWarning(option: ModelOption | null): string {
	if (!option) return "";
	const support = modelStructuredOutputSupport(option);
	if (support === "supported") return "";
	if (support === "unsupported") {
		return "This model does not advertise structured-output support. CueCraft can still try it, but generated cues may be less reliable.";
	}
	return "CueCraft does not have structured-output metadata for this model. You can still use it, but testing the connection is recommended.";
}

function cueCraftSortScore(option: ModelOption): number {
	let score = 0;
	if (isRecommendedCueCraftModel(option)) score += 8;
	if (modelStructuredOutputSupport(option) === "supported") score += 4;
	if (isLargeContextModel(option)) score += 2;
	if (isLowCostModel(option)) score += 1;
	return score;
}

export function sortCueCraftModelOptions(
	options: ModelOption[],
	currentModelId?: string
): ModelOption[] {
	return [...options].sort((a, b) => {
		if (currentModelId) {
			if (a.id === currentModelId && b.id !== currentModelId) return -1;
			if (b.id === currentModelId && a.id !== currentModelId) return 1;
		}
		const scoreDelta = cueCraftSortScore(b) - cueCraftSortScore(a);
		if (scoreDelta !== 0) return scoreDelta;
		return compareFetchedModelIds(a.id, b.id);
	});
}
