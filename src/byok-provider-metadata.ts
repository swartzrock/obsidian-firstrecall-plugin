import {
	BYOK_PROVIDER_IDS,
	ByokProvider,
	type ByokProviderId,
} from "@swartzrock/byok-runtime";
import {
	BYOK_PROVIDER_ICONS,
	type FirstRecallProviderIconDefinition,
} from "./provider-icons";

export type FirstRecallCredentialKind = "api-key" | "url" | "command";
export type FirstRecallModelBehavior = "required" | "optional";

export interface FirstRecallCredentialFieldDefinition {
	label: string;
	placeholder: string;
	description: string;
	helpUrl?: string;
	secret: boolean;
	missingMessage: string;
	resetModelsMessage?: string;
}

export interface FirstRecallModelFieldDefinition {
	label: string;
	placeholder: string;
	description: string;
	listModelsLabel?: string;
	listModelsDescription?: string;
	emptyListMessage?: string;
}

export interface FirstRecallProviderDefinition {
	id: ByokProviderId;
	label: string;
	shortLabel: string;
	icon: FirstRecallProviderIconDefinition | string;
	credentialKind: FirstRecallCredentialKind;
	credentialField: FirstRecallCredentialFieldDefinition;
	modelBehavior: FirstRecallModelBehavior;
	modelField: FirstRecallModelFieldDefinition;
	supportsModelListing: boolean;
}

interface CloudDefinitionOptions {
	id: ByokProviderId;
	label: string;
	shortLabel: string;
	productLabel: string;
	credentialLabel: string;
	credentialPlaceholder: string;
	icon: FirstRecallProviderIconDefinition | string;
	modelLabel?: string;
	modelDescription?: string;
}

const HOST_CREDENTIAL_DESCRIPTION =
	"Saved in Obsidian's secure storage and provided to the AI service at runtime.";
const CLOUD_API_KEY_GUIDE_URL =
	"https://github.com/swartzrock/obsidian-firstrecall-plugin/blob/main/docs/cloud-api-keys.md";

function providerIcon(
	provider: ByokProviderId,
	fallback: string
): FirstRecallProviderIconDefinition | string {
	const icons: Partial<
		Record<ByokProviderId, FirstRecallProviderIconDefinition>
	> = BYOK_PROVIDER_ICONS;
	return icons[provider] ?? fallback;
}

function cloudDefinition(
	opts: CloudDefinitionOptions
): FirstRecallProviderDefinition {
	return {
		id: opts.id,
		label: opts.label,
		shortLabel: opts.shortLabel,
		icon: opts.icon,
		credentialKind: "api-key",
		credentialField: {
			label: opts.credentialLabel,
			placeholder: opts.credentialPlaceholder,
			description: HOST_CREDENTIAL_DESCRIPTION,
			helpUrl: `${CLOUD_API_KEY_GUIDE_URL}#${opts.id}`,
			secret: true,
			missingMessage: `Enter your ${opts.credentialLabel} first.`,
			resetModelsMessage: `Enter your ${opts.credentialLabel} first to fetch models.`,
		},
		modelBehavior: "required",
		modelField: {
			label: opts.modelLabel ?? `${opts.productLabel} model`,
			placeholder: "Select a model",
			description:
				opts.modelDescription ??
				`${opts.productLabel} model for AI generation.`,
			listModelsLabel: `${opts.shortLabel} models`,
			listModelsDescription: `Fetch ${opts.shortLabel} models for this account.`,
			emptyListMessage: `No ${opts.shortLabel} models were returned for this account.`,
		},
		supportsModelListing: true,
	};
}

const PROVIDER_DEFINITIONS: Record<
	ByokProviderId,
	FirstRecallProviderDefinition
> = {
	[ByokProvider.Anthropic]: cloudDefinition({
		id: ByokProvider.Anthropic,
		label: "Anthropic (Claude)",
		shortLabel: "Anthropic",
		productLabel: "Claude",
		credentialLabel: "Anthropic API key",
		credentialPlaceholder: "sk-ant-...",
		icon: providerIcon(ByokProvider.Anthropic, "bot"),
	}),
	[ByokProvider.OpenAI]: cloudDefinition({
		id: ByokProvider.OpenAI,
		label: "OpenAI (ChatGPT)",
		shortLabel: "OpenAI",
		productLabel: "OpenAI",
		credentialLabel: "OpenAI API key",
		credentialPlaceholder: "sk-...",
		icon: providerIcon(ByokProvider.OpenAI, "message-circle"),
	}),
	[ByokProvider.Google]: cloudDefinition({
		id: ByokProvider.Google,
		label: "Google (Gemini)",
		shortLabel: "Gemini",
		productLabel: "Gemini",
		credentialLabel: "Google API key",
		credentialPlaceholder: "AIza...",
		icon: providerIcon(ByokProvider.Google, "sparkles"),
	}),
	[ByokProvider.Xai]: cloudDefinition({
		id: ByokProvider.Xai,
		label: "xAI (Grok)",
		shortLabel: "xAI",
		productLabel: "Grok",
		credentialLabel: "xAI API key",
		credentialPlaceholder: "xai-...",
		icon: providerIcon(ByokProvider.Xai, "brain-circuit"),
	}),
	[ByokProvider.OpenRouter]: cloudDefinition({
		id: ByokProvider.OpenRouter,
		label: "OpenRouter",
		shortLabel: "OpenRouter",
		productLabel: "OpenRouter",
		credentialLabel: "OpenRouter API key",
		credentialPlaceholder: "sk-or-...",
		icon: providerIcon(ByokProvider.OpenRouter, "route"),
		modelDescription: "OpenRouter provider/model ID.",
	}),
	[ByokProvider.Groq]: cloudDefinition({
		id: ByokProvider.Groq,
		label: "Groq",
		shortLabel: "Groq",
		productLabel: "Groq",
		credentialLabel: "Groq API key",
		credentialPlaceholder: "gsk_...",
		icon: providerIcon(ByokProvider.Groq, "gauge"),
	}),
	[ByokProvider.Mistral]: cloudDefinition({
		id: ByokProvider.Mistral,
		label: "Mistral",
		shortLabel: "Mistral",
		productLabel: "Mistral",
		credentialLabel: "Mistral API key",
		credentialPlaceholder: "Enter API key",
		icon: providerIcon(ByokProvider.Mistral, "wind"),
	}),
	[ByokProvider.DeepSeek]: cloudDefinition({
		id: ByokProvider.DeepSeek,
		label: "DeepSeek",
		shortLabel: "DeepSeek",
		productLabel: "DeepSeek",
		credentialLabel: "DeepSeek API key",
		credentialPlaceholder: "sk-...",
		icon: providerIcon(ByokProvider.DeepSeek, "search"),
	}),
	[ByokProvider.DeepInfra]: cloudDefinition({
		id: ByokProvider.DeepInfra,
		label: "DeepInfra",
		shortLabel: "DeepInfra",
		productLabel: "DeepInfra",
		credentialLabel: "DeepInfra API token",
		credentialPlaceholder: "Enter API token",
		icon: providerIcon(ByokProvider.DeepInfra, "cloud"),
	}),
	[ByokProvider.Together]: cloudDefinition({
		id: ByokProvider.Together,
		label: "Together AI",
		shortLabel: "Together AI",
		productLabel: "Together AI",
		credentialLabel: "Together AI API key",
		credentialPlaceholder: "Enter API key",
		icon: providerIcon(ByokProvider.Together, "cloud"),
	}),
	[ByokProvider.Fireworks]: cloudDefinition({
		id: ByokProvider.Fireworks,
		label: "Fireworks AI",
		shortLabel: "Fireworks AI",
		productLabel: "Fireworks AI",
		credentialLabel: "Fireworks AI API key",
		credentialPlaceholder: "Enter API key",
		icon: providerIcon(ByokProvider.Fireworks, "cloud"),
	}),
	[ByokProvider.Ollama]: {
		id: ByokProvider.Ollama,
		label: "Ollama",
		shortLabel: "Ollama",
		icon: providerIcon(ByokProvider.Ollama, "server"),
		credentialKind: "url",
		credentialField: {
			label: "Ollama URL",
			placeholder: "http://localhost:11434",
			description: "Local Ollama server URL.",
			secret: false,
			missingMessage: "Enter your Ollama URL first.",
			resetModelsMessage: "Enter your Ollama URL first to fetch models.",
		},
		modelBehavior: "required",
		modelField: {
			label: "Ollama model",
			placeholder: "Select a model",
			description: "Installed Ollama model.",
			listModelsLabel: "Ollama models",
			listModelsDescription: "Fetch installed Ollama models.",
			emptyListMessage:
				"No Ollama models were returned by the configured URL.",
		},
		supportsModelListing: true,
	},
	[ByokProvider.LmStudio]: {
		id: ByokProvider.LmStudio,
		label: "LM Studio",
		shortLabel: "LM Studio",
		icon: providerIcon(ByokProvider.LmStudio, "monitor"),
		credentialKind: "url",
		credentialField: {
			label: "LM Studio URL",
			placeholder: "http://localhost:1234/v1",
			description: "Local LM Studio OpenAI-compatible REST API URL.",
			secret: false,
			missingMessage: "Enter your LM Studio URL first.",
			resetModelsMessage:
				"Enter your LM Studio URL first to fetch models.",
		},
		modelBehavior: "required",
		modelField: {
			label: "LM Studio model",
			placeholder: "Select a model",
			description: "Loaded LM Studio model.",
			listModelsLabel: "LM Studio models",
			listModelsDescription:
				"Fetch models from the local LM Studio server.",
			emptyListMessage:
				"No LM Studio models were returned by the configured URL.",
		},
		supportsModelListing: true,
	},
	[ByokProvider.CodexCli]: {
		id: ByokProvider.CodexCli,
		label: "Codex CLI",
		shortLabel: "Codex CLI",
		icon: providerIcon(ByokProvider.CodexCli, "terminal"),
		credentialKind: "command",
		credentialField: {
			label: "Codex CLI command",
			placeholder: "codex",
			description: "Local Codex CLI command.",
			secret: false,
			missingMessage: "Enter your Codex CLI command first.",
			resetModelsMessage:
				"Enter your Codex CLI command first to fetch models.",
		},
		modelBehavior: "optional",
		modelField: {
			label: "Codex CLI model override",
			placeholder: "CLI default",
			description: "Optional model override.",
			listModelsLabel: "Codex CLI models",
			listModelsDescription: "Fetch models from `codex debug models`.",
			emptyListMessage:
				"No Codex CLI models were returned by the configured command.",
		},
		supportsModelListing: true,
	},
	[ByokProvider.ClaudeCli]: {
		id: ByokProvider.ClaudeCli,
		label: "Claude CLI",
		shortLabel: "Claude CLI",
		icon: providerIcon(ByokProvider.ClaudeCli, "terminal"),
		credentialKind: "command",
		credentialField: {
			label: "Claude CLI command",
			placeholder: "claude",
			description: "Local Claude CLI command.",
			secret: false,
			missingMessage: "Enter your Claude CLI command first.",
			resetModelsMessage:
				"Enter your Claude CLI command first to fetch models.",
		},
		modelBehavior: "optional",
		modelField: {
			label: "Claude CLI model override",
			placeholder: "CLI default",
			description: "Optional model override.",
			listModelsLabel: "Claude CLI models",
			listModelsDescription:
				"Fetch latest Anthropic models from OpenRouter and use Claude CLI model IDs.",
			emptyListMessage:
				"No Anthropic models were returned by OpenRouter.",
		},
		supportsModelListing: true,
	},
};

export function byokProviderDefinition(
	provider: ByokProviderId
): FirstRecallProviderDefinition {
	return PROVIDER_DEFINITIONS[provider];
}

export function byokProviderDefinitions(): FirstRecallProviderDefinition[] {
	return BYOK_PROVIDER_IDS.map(byokProviderDefinition);
}
