import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";

export interface AnthropicModelOption {
	id: string;
	label: string;
	description: string;
	hint: AnthropicModelHint;
	recommended?: boolean;
	legacy?: boolean;
}

export interface AnthropicModelHint {
	quality: string;
	speed: string;
	cost: string;
	context: string;
	cuecraftHint: string;
}

export interface AnthropicModelListSource {
	listModels(): Promise<ModelInfo[]>;
}

export interface AnthropicModelRefreshResult {
	availableModels: ModelInfo[];
	options: AnthropicModelOption[];
	message: string;
	usedFallback: boolean;
}

export const ANTHROPIC_CUSTOM_MODEL_ID = "__custom__";
export const ANTHROPIC_DEFAULT_MODEL_ID = "claude-sonnet-4-6";

export const ANTHROPIC_MODEL_CATALOG: AnthropicModelOption[] = [
	{
		id: ANTHROPIC_DEFAULT_MODEL_ID,
		label: "Claude Sonnet 4.6",
		description: "Recommended balanced option for CueCraft.",
		hint: {
			quality: "Balanced",
			speed: "Balanced",
			cost: "Balanced",
			context: "Strong",
			cuecraftHint: "Best daily-use balance for cue generation.",
		},
		recommended: true,
	},
	{
		id: "claude-haiku-4-5",
		label: "Claude Haiku 4.5",
		description: "Faster and lower-cost option for frequent generation.",
		hint: {
			quality: "Good",
			speed: "Fast",
			cost: "Low",
			context: "Good",
			cuecraftHint: "Fast, lower-cost refreshes for frequent cue generation.",
		},
	},
	{
		id: "claude-opus-4-8",
		label: "Claude Opus 4.8",
		description: "Higher-quality option for dense or subtle notes.",
		hint: {
			quality: "High",
			speed: "Slower",
			cost: "High",
			context: "Best",
			cuecraftHint: "Best when subtle notes need the strongest cue quality.",
		},
	},
	{
		id: "claude-fable-5",
		label: "Claude Fable 5",
		description: "Premium option when available on the user's account.",
		hint: {
			quality: "High",
			speed: "Slower",
			cost: "High",
			context: "Best",
			cuecraftHint: "Premium model for the toughest cue-generation cases.",
		},
	},
	{
		id: "claude-3-5-sonnet-latest",
		label: "Claude 3.5 Sonnet Latest",
		description: "Legacy compatibility for existing settings.",
		hint: {
			quality: "Balanced",
			speed: "Balanced",
			cost: "Balanced",
			context: "Strong",
			cuecraftHint: "Legacy fallback for existing Anthropic setups.",
		},
		legacy: true,
	},
	{
		id: "claude-3-5-haiku-latest",
		label: "Claude 3.5 Haiku Latest",
		description: "Legacy compatibility for users already configured this way.",
		hint: {
			quality: "Good",
			speed: "Fast",
			cost: "Low",
			context: "Good",
			cuecraftHint: "Legacy fast path for existing Anthropic setups.",
		},
		legacy: true,
	},
];

const GENERIC_ANTHROPIC_MODEL_HINT: AnthropicModelHint = {
	quality: "Varies",
	speed: "Varies",
	cost: "Varies",
	context: "Varies",
	cuecraftHint: "Cue quality depends on the exact custom model you enter.",
};

const ANTHROPIC_DISCOVERED_FAMILY_ORDER = ["sonnet", "haiku", "opus", "fable"];

function compareAnthropicModelVersions(a: number[], b: number[]): number {
	const maxLength = Math.max(a.length, b.length);
	for (let index = 0; index < maxLength; index += 1) {
		const left = a[index] ?? 0;
		const right = b[index] ?? 0;
		if (left !== right) return right - left;
	}
	return 0;
}

function normalizeAnthropicModelLabel(label: string): string {
	return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseAnthropicDiscoveredModelSortKey(label: string): {
	familyIndex: number;
	version: number[];
	normalizedLabel: string;
} {
	const normalizedLabel = normalizeAnthropicModelLabel(label);
	const match = normalizedLabel.match(
		/claude\s+(sonnet|haiku|opus|fable)\s+(\d+(?:\.\d+)*)/
	);
	if (!match) {
		return {
			familyIndex: Number.MAX_SAFE_INTEGER,
			version: [],
			normalizedLabel,
		};
	}
	const familyIndex = ANTHROPIC_DISCOVERED_FAMILY_ORDER.indexOf(match[1]);
	return {
		familyIndex: familyIndex === -1 ? Number.MAX_SAFE_INTEGER : familyIndex,
		version: match[2].split(".").map((part) => Number.parseInt(part, 10) || 0),
		normalizedLabel,
	};
}

export function buildAnthropicModelOptions(
	availableModels: ModelInfo[] = []
): AnthropicModelOption[] {
	const options = [...ANTHROPIC_MODEL_CATALOG];
	const knownIds = new Set(options.map((model) => model.id));
	const seenLabels = new Set(
		options.map((model) => normalizeAnthropicModelLabel(model.label))
	);
	const discoveredOptions: AnthropicModelOption[] = [];
	for (const model of availableModels) {
		if (knownIds.has(model.id)) continue;
		const normalizedLabel = normalizeAnthropicModelLabel(model.display_name);
		if (seenLabels.has(normalizedLabel)) continue;
		discoveredOptions.push({
			id: model.id,
			label: model.display_name,
			description: "Available from your Anthropic account.",
			hint: GENERIC_ANTHROPIC_MODEL_HINT,
		});
		knownIds.add(model.id);
		seenLabels.add(normalizedLabel);
	}
	discoveredOptions.sort((left, right) => {
		const leftKey = parseAnthropicDiscoveredModelSortKey(left.label);
		const rightKey = parseAnthropicDiscoveredModelSortKey(right.label);
		if (leftKey.familyIndex !== rightKey.familyIndex) {
			return leftKey.familyIndex - rightKey.familyIndex;
		}
		const versionComparison = compareAnthropicModelVersions(
			leftKey.version,
			rightKey.version
		);
		if (versionComparison !== 0) return versionComparison;
		return leftKey.normalizedLabel.localeCompare(rightKey.normalizedLabel);
	});
	options.push(...discoveredOptions);
	return options;
}

function resolveAnthropicModelOption(
	modelId: string,
	availableModels: ModelInfo[] = []
): AnthropicModelOption | null {
	const curated = ANTHROPIC_MODEL_CATALOG.find((model) => model.id === modelId);
	if (curated) return curated;
	return (
		buildAnthropicModelOptions(availableModels).find((model) => model.id === modelId) ??
		null
	);
}

export function isAnthropicCustomModelSelection(settings: {
	anthropicModel: string;
	anthropicModelSelection?: string;
	anthropicAvailableModels?: ModelInfo[];
}): boolean {
	return (
		settings.anthropicModelSelection === ANTHROPIC_CUSTOM_MODEL_ID ||
		!resolveAnthropicModelOption(settings.anthropicModel, settings.anthropicAvailableModels)
	);
}

export function normalizeAnthropicModelSelection(settings: {
	anthropicModel: string;
	anthropicModelSelection?: string;
	anthropicAvailableModels?: ModelInfo[];
}): void {
	if (settings.anthropicModelSelection) return;
	settings.anthropicModelSelection = resolveAnthropicModelOption(
		settings.anthropicModel,
		settings.anthropicAvailableModels
	)
		? settings.anthropicModel
		: ANTHROPIC_CUSTOM_MODEL_ID;
}

export function describeAnthropicModel(
	modelId: string,
	availableModels: ModelInfo[] = []
): {
	label: string;
	rawId: string;
} {
	const model = resolveAnthropicModelOption(modelId, availableModels);
	if (model) {
		return { label: model.label, rawId: model.id };
	}
	return { label: "Custom model ID", rawId: modelId };
}

export function describeAnthropicModelDetails(
	modelId: string,
	availableModels: ModelInfo[] = []
): {
	label: string;
	rawId: string;
	hint: AnthropicModelHint;
} {
	const model = resolveAnthropicModelOption(modelId, availableModels);
	if (model) {
		return { label: model.label, rawId: model.id, hint: model.hint };
	}
	return {
		label: "Custom model ID",
		rawId: modelId,
		hint: GENERIC_ANTHROPIC_MODEL_HINT,
	};
}

export function formatAnthropicUnavailableModelMessage(
	modelId: string,
	availableModels: ModelInfo[] = []
): string {
	const model = describeAnthropicModel(modelId, availableModels);
	return `CueCraft: This key cannot access ${model.label} (${model.rawId}). Pick another model or check your Anthropic account.`;
}

export function formatAnthropicModelHint(
	modelId: string,
	availableModels: ModelInfo[] = []
): string {
	const model = describeAnthropicModelDetails(modelId, availableModels);
	return `${model.hint.speed} · ${model.hint.cost} · ${model.hint.context}`;
}

export async function refreshAnthropicModelOptions(
	source: AnthropicModelListSource | null
): Promise<AnthropicModelRefreshResult> {
	try {
		const availableModels = source ? await source.listModels() : [];
		const options = buildAnthropicModelOptions(availableModels);
		const extraCount = options.length - ANTHROPIC_MODEL_CATALOG.length;
		return {
			availableModels,
			options,
			message:
				extraCount > 0
					? `Refreshed Anthropic models. Added ${extraCount} account-specific model${extraCount === 1 ? "" : "s"} to the curated fallback list.`
					: "Refreshed Anthropic models. Showing the curated fallback list.",
			usedFallback: false,
		};
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			availableModels: [],
			options: buildAnthropicModelOptions(),
			message: detail
				? `Could not refresh Anthropic models (${detail}). Showing the curated fallback list.`
				: "Could not refresh Anthropic models. Showing the curated fallback list.",
			usedFallback: true,
		};
	}
}
