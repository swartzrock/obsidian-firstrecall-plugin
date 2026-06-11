export interface AnthropicModelOption {
	id: string;
	label: string;
	description: string;
	recommended?: boolean;
	legacy?: boolean;
}

export const ANTHROPIC_CUSTOM_MODEL_ID = "__custom__";

export const ANTHROPIC_MODEL_CATALOG: AnthropicModelOption[] = [
	{
		id: "claude-sonnet-4-6",
		label: "Claude Sonnet 4.6",
		description: "Recommended balanced option for CueCraft.",
		recommended: true,
	},
	{
		id: "claude-haiku-4-5",
		label: "Claude Haiku 4.5",
		description: "Faster and lower-cost option for frequent generation.",
	},
	{
		id: "claude-opus-4-8",
		label: "Claude Opus 4.8",
		description: "Higher-quality option for dense or subtle notes.",
	},
	{
		id: "claude-fable-5",
		label: "Claude Fable 5",
		description: "Premium option when available on the user's account.",
	},
	{
		id: "claude-3-5-sonnet-latest",
		label: "Claude 3.5 Sonnet Latest",
		description: "Legacy compatibility for existing settings.",
		legacy: true,
	},
	{
		id: "claude-3-5-haiku-latest",
		label: "Claude 3.5 Haiku Latest",
		description: "Legacy compatibility for users already configured this way.",
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
