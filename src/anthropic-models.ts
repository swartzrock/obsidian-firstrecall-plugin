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

export function isAnthropicCustomModelSelection(settings: {
	anthropicModel: string;
	anthropicModelSelection?: string;
}): boolean {
	return (
		settings.anthropicModelSelection === ANTHROPIC_CUSTOM_MODEL_ID ||
		!ANTHROPIC_MODEL_CATALOG.some((model) => model.id === settings.anthropicModel)
	);
}

export function normalizeAnthropicModelSelection(settings: {
	anthropicModel: string;
	anthropicModelSelection?: string;
}): void {
	if (settings.anthropicModelSelection) return;
	settings.anthropicModelSelection = ANTHROPIC_MODEL_CATALOG.some(
		(model) => model.id === settings.anthropicModel
	)
		? settings.anthropicModel
		: ANTHROPIC_CUSTOM_MODEL_ID;
}

export function describeAnthropicModel(modelId: string): {
	label: string;
	rawId: string;
} {
	const model = ANTHROPIC_MODEL_CATALOG.find((item) => item.id === modelId);
	if (model) {
		return { label: model.label, rawId: model.id };
	}
	return { label: "Custom model ID", rawId: modelId };
}

export function describeAnthropicModelDetails(modelId: string): {
	label: string;
	rawId: string;
	hint: AnthropicModelHint;
} {
	const model = ANTHROPIC_MODEL_CATALOG.find((item) => item.id === modelId);
	if (model) {
		return { label: model.label, rawId: model.id, hint: model.hint };
	}
	return {
		label: "Custom model ID",
		rawId: modelId,
		hint: {
			quality: "Varies",
			speed: "Varies",
			cost: "Varies",
			context: "Varies",
			cuecraftHint: "Cue quality depends on the exact custom model you enter.",
		},
	};
}

export function formatAnthropicUnavailableModelMessage(modelId: string): string {
	const model = describeAnthropicModel(modelId);
	return `CueCraft: This key cannot access ${model.label} (${model.rawId}). Pick another model or check your Anthropic account.`;
}

export function formatAnthropicModelHint(modelId: string): string {
	const model = describeAnthropicModelDetails(modelId);
	return `${model.hint.speed} · ${model.hint.cost} · ${model.hint.context}`;
}
