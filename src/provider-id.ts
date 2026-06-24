export type ProviderId =
	| "ollama"
	| "anthropic"
	| "openai"
	| "google"
	| "xai"
	| "openrouter"
	| "codex-cli"
	| "claude-cli";

export function normalizeProviderId(value: unknown): ProviderId {
	switch (value) {
		case "ollama":
		case "anthropic":
		case "openai":
		case "google":
		case "xai":
		case "openrouter":
		case "codex-cli":
		case "claude-cli":
			return value;
		case "codex":
			return "codex-cli";
		case "claude":
			return "claude-cli";
	default:
		return "ollama";
	}
}
