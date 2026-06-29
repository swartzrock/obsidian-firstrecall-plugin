import type { ByokProviderDefinition, ByokProviderId } from "./types";
import { BYOK_PROVIDER_ICONS } from "./provider-icons";

export const BYOK_PROVIDER_IDS = [
	"anthropic",
	"openai",
	"google",
	"xai",
	"openrouter",
	"ollama",
	"codex-cli",
	"claude-cli",
] as const satisfies readonly ByokProviderId[];

export const BYOK_PROVIDER_DEFINITIONS: Record<
	ByokProviderId,
	ByokProviderDefinition
> = {
	ollama: {
		id: "ollama",
		label: "Ollama",
		shortLabel: "Ollama",
		productLabel: "Ollama",
		vendor: "Ollama",
		icon: BYOK_PROVIDER_ICONS.ollama,
		credentialKind: "host",
		credentialField: {
			label: "Ollama host",
			placeholder: "http://localhost:11434",
			description: "Local Ollama server URL.",
			secret: false,
			missingMessage: "Enter your Ollama host first.",
			resetModelsMessage: "Enter your Ollama host first to fetch models.",
		},
		modelBehavior: "required",
		modelField: {
			label: "Ollama model",
			placeholder: "Select a model",
			description: "Installed Ollama model.",
			listModelsLabel: "Ollama models",
			listModelsDescription: "Fetch installed Ollama models.",
			emptyListMessage: "No Ollama models were returned by the configured host.",
			optionSource: "ollama",
		},
		requiresNetwork: false,
		requiresDownload: false,
		supportsModelListing: true,
		supportsBatchGeneration: false,
	},
	anthropic: {
		id: "anthropic",
		label: "Anthropic (Claude)",
		shortLabel: "Anthropic",
		productLabel: "Claude",
		vendor: "Anthropic",
		icon: BYOK_PROVIDER_ICONS.anthropic,
		credentialKind: "api-key",
		credentialField: {
			label: "Anthropic API key",
			placeholder: "sk-ant-...",
			description: "Anthropic API key stored locally in this vault.",
			secret: true,
			missingMessage: "Enter your Anthropic API key first.",
			resetModelsMessage: "Enter your Anthropic API key first to fetch models.",
		},
		modelBehavior: "required",
		modelField: {
			label: "Claude model",
			placeholder: "Select a model",
			description: "Claude model for cue generation.",
			listModelsLabel: "Anthropic models",
			listModelsDescription: "Fetch Anthropic models for this account.",
			emptyListMessage: "No Anthropic models were returned for this account.",
			optionSource: "anthropic",
		},
		requiresNetwork: true,
		requiresDownload: false,
		supportsModelListing: true,
		supportsBatchGeneration: false,
	},
	openai: {
		id: "openai",
		label: "OpenAI (ChatGPT)",
		shortLabel: "OpenAI",
		productLabel: "ChatGPT",
		vendor: "OpenAI",
		icon: BYOK_PROVIDER_ICONS.openai,
		credentialKind: "api-key",
		credentialField: {
			label: "OpenAI API key",
			placeholder: "sk-...",
			description: "OpenAI API key stored locally in this vault.",
			secret: true,
			missingMessage: "Enter your OpenAI API key first.",
			resetModelsMessage: "Enter your OpenAI API key first to fetch models.",
		},
		modelBehavior: "required",
		modelField: {
			label: "OpenAI model",
			placeholder: "Select a model",
			description: "OpenAI model for cue generation.",
			listModelsLabel: "OpenAI models",
			listModelsDescription: "Fetch OpenAI models for this account.",
			emptyListMessage: "No OpenAI models were returned for this account.",
			optionSource: "openai",
		},
		requiresNetwork: true,
		requiresDownload: false,
		supportsModelListing: true,
		supportsBatchGeneration: false,
	},
	google: {
		id: "google",
		label: "Google (Gemini)",
		shortLabel: "Gemini",
		productLabel: "Gemini",
		vendor: "Google",
		icon: BYOK_PROVIDER_ICONS.google,
		credentialKind: "api-key",
		credentialField: {
			label: "Google API key",
			placeholder: "AIza...",
			description: "Google AI API key stored locally in this vault.",
			secret: true,
			missingMessage: "Enter your Google API key first.",
			resetModelsMessage: "Enter your Google API key first to fetch models.",
		},
		modelBehavior: "required",
		modelField: {
			label: "Gemini model",
			placeholder: "Select a model",
			description: "Gemini model for cue generation.",
			listModelsLabel: "Gemini models",
			listModelsDescription: "Fetch Gemini models for this account.",
			emptyListMessage: "No Gemini models were returned for this account.",
			optionSource: "google",
		},
		requiresNetwork: true,
		requiresDownload: false,
		supportsModelListing: true,
		supportsBatchGeneration: false,
	},
	xai: {
		id: "xai",
		label: "xAI (Grok)",
		shortLabel: "xAI",
		productLabel: "Grok",
		vendor: "xAI",
		icon: BYOK_PROVIDER_ICONS.xai,
		credentialKind: "api-key",
		credentialField: {
			label: "xAI API key",
			placeholder: "xai-...",
			description: "xAI API key stored locally in this vault.",
			secret: true,
			missingMessage: "Enter your xAI API key first.",
			resetModelsMessage: "Enter your xAI API key first to fetch models.",
		},
		modelBehavior: "required",
		modelField: {
			label: "Grok model",
			placeholder: "Select a model",
			description: "Grok model for cue generation.",
			listModelsLabel: "xAI models",
			listModelsDescription: "Fetch xAI models for this account.",
			emptyListMessage: "No xAI models were returned for this account.",
			optionSource: "xai",
		},
		requiresNetwork: true,
		requiresDownload: false,
		supportsModelListing: true,
		supportsBatchGeneration: false,
	},
	openrouter: {
		id: "openrouter",
		label: "OpenRouter",
		shortLabel: "OpenRouter",
		productLabel: "OpenRouter",
		vendor: "OpenRouter",
		icon: BYOK_PROVIDER_ICONS.openrouter,
		credentialKind: "api-key",
		credentialField: {
			label: "OpenRouter API key",
			placeholder: "sk-or-...",
			description: "OpenRouter API key stored locally in this vault.",
			secret: true,
			missingMessage: "Enter your OpenRouter API key first.",
			resetModelsMessage: "Enter your OpenRouter API key first to fetch models.",
		},
		modelBehavior: "required",
		modelField: {
			label: "OpenRouter model",
			placeholder: "Select a model",
			description: "OpenRouter provider/model ID.",
			listModelsLabel: "OpenRouter models",
			listModelsDescription: "Fetch OpenRouter models for this account.",
			emptyListMessage: "No OpenRouter models were returned for this account.",
			optionSource: "openrouter",
		},
		requiresNetwork: true,
		requiresDownload: false,
		supportsModelListing: true,
		supportsBatchGeneration: false,
	},
	"codex-cli": {
		id: "codex-cli",
		label: "Codex CLI",
		shortLabel: "Codex CLI",
		productLabel: "Codex CLI",
		vendor: "Codex CLI",
		icon: BYOK_PROVIDER_ICONS["codex-cli"],
		credentialKind: "command",
		credentialField: {
			label: "Codex CLI command",
			placeholder: "codex",
			description: "Local Codex CLI command.",
			secret: false,
			missingMessage: "Enter your Codex CLI command first.",
		},
		modelBehavior: "optional",
		modelField: {
			label: "Codex CLI model override",
			placeholder: "CLI default",
			description: "Optional model override.",
		},
		requiresNetwork: true,
		requiresDownload: false,
		supportsModelListing: false,
		supportsBatchGeneration: true,
	},
	"claude-cli": {
		id: "claude-cli",
		label: "Claude CLI",
		shortLabel: "Claude CLI",
		productLabel: "Claude CLI",
		vendor: "Claude CLI",
		icon: BYOK_PROVIDER_ICONS["claude-cli"],
		credentialKind: "command",
		credentialField: {
			label: "Claude CLI command",
			placeholder: "claude",
			description: "Local Claude CLI command.",
			secret: false,
			missingMessage: "Enter your Claude CLI command first.",
		},
		modelBehavior: "optional",
		modelField: {
			label: "Claude CLI model override",
			placeholder: "sonnet",
			description: "Optional model override.",
		},
		requiresNetwork: true,
		requiresDownload: false,
		supportsModelListing: false,
		supportsBatchGeneration: true,
	},
};

export function isByokProviderId(value: unknown): value is ByokProviderId {
	return (
		typeof value === "string" &&
		(BYOK_PROVIDER_IDS as readonly string[]).includes(value)
	);
}

export function normalizeProviderId(value: unknown): ByokProviderId {
	if (isByokProviderId(value)) return value;
	if (value === "codex") return "codex-cli";
	if (value === "claude") return "claude-cli";
	return "ollama";
}

export function byokProviderDefinition(
	id: ByokProviderId
): ByokProviderDefinition {
	return BYOK_PROVIDER_DEFINITIONS[id];
}

export function byokProviderDefinitions(): ByokProviderDefinition[] {
	return BYOK_PROVIDER_IDS.map((id) => BYOK_PROVIDER_DEFINITIONS[id]);
}
