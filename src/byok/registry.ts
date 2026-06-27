import type { ByokProviderDefinition, ByokProviderId } from "./types";

export const BYOK_PROVIDER_IDS = [
	"ollama",
	"anthropic",
	"openai",
	"google",
	"xai",
	"openrouter",
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
		vendor: "Ollama",
		credentialKind: "host",
		modelBehavior: "required",
		requiresNetwork: false,
		requiresDownload: false,
		supportsModelListing: true,
		supportsBatchGeneration: false,
	},
	anthropic: {
		id: "anthropic",
		label: "Anthropic (Claude)",
		vendor: "Anthropic",
		credentialKind: "api-key",
		modelBehavior: "required",
		requiresNetwork: true,
		requiresDownload: false,
		supportsModelListing: true,
		supportsBatchGeneration: false,
	},
	openai: {
		id: "openai",
		label: "OpenAI (ChatGPT)",
		vendor: "OpenAI",
		credentialKind: "api-key",
		modelBehavior: "required",
		requiresNetwork: true,
		requiresDownload: false,
		supportsModelListing: true,
		supportsBatchGeneration: false,
	},
	google: {
		id: "google",
		label: "Google (Gemini)",
		vendor: "Google",
		credentialKind: "api-key",
		modelBehavior: "required",
		requiresNetwork: true,
		requiresDownload: false,
		supportsModelListing: true,
		supportsBatchGeneration: false,
	},
	xai: {
		id: "xai",
		label: "xAI (Grok)",
		vendor: "xAI",
		credentialKind: "api-key",
		modelBehavior: "required",
		requiresNetwork: true,
		requiresDownload: false,
		supportsModelListing: true,
		supportsBatchGeneration: false,
	},
	openrouter: {
		id: "openrouter",
		label: "OpenRouter",
		vendor: "OpenRouter",
		credentialKind: "api-key",
		modelBehavior: "required",
		requiresNetwork: true,
		requiresDownload: false,
		supportsModelListing: true,
		supportsBatchGeneration: false,
	},
	"codex-cli": {
		id: "codex-cli",
		label: "Codex CLI",
		vendor: "Codex CLI",
		credentialKind: "command",
		modelBehavior: "optional",
		requiresNetwork: true,
		requiresDownload: false,
		supportsModelListing: false,
		supportsBatchGeneration: true,
	},
	"claude-cli": {
		id: "claude-cli",
		label: "Claude CLI",
		vendor: "Claude CLI",
		credentialKind: "command",
		modelBehavior: "optional",
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

export function byokProviderDefinition(
	id: ByokProviderId
): ByokProviderDefinition {
	return BYOK_PROVIDER_DEFINITIONS[id];
}

export function byokProviderDefinitions(): ByokProviderDefinition[] {
	return BYOK_PROVIDER_IDS.map((id) => BYOK_PROVIDER_DEFINITIONS[id]);
}
