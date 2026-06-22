import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";

export type ProviderSetupStatusId =
	| "ollama"
	| "anthropic"
	| "openai"
	| "google"
	| "xai"
	| "openrouter"
	| "codex-cli"
	| "claude-cli";

export const CLI_DEFAULT_MODEL_SENTINEL = "__cuecraft_cli_default__";

export interface ProviderConnectionSnapshot {
	credentialFingerprint: string;
	modelId: string;
	testedAt: string;
}

export interface ProviderConnectionStatusMap {
	ollama?: ProviderConnectionSnapshot;
	anthropic?: ProviderConnectionSnapshot;
	openai?: ProviderConnectionSnapshot;
	google?: ProviderConnectionSnapshot;
	xai?: ProviderConnectionSnapshot;
	openrouter?: ProviderConnectionSnapshot;
	"codex-cli"?: ProviderConnectionSnapshot;
	"claude-cli"?: ProviderConnectionSnapshot;
}

export interface ProviderSetupStatusSettings {
	provider: ProviderSetupStatusId;
	ollamaHost: string;
	ollamaModel: string;
	anthropicApiKey: string;
	anthropicModel: string;
	anthropicAvailableModels?: ModelInfo[];
	openaiApiKey: string;
	openaiModel: string;
	googleApiKey: string;
	googleModel: string;
	xaiApiKey: string;
	xaiModel: string;
	openrouterApiKey: string;
	openrouterModel: string;
	codexCliCommand: string;
	codexCliModel: string;
	claudeCliCommand: string;
	claudeCliModel: string;
	providerConnectionStatus?: ProviderConnectionStatusMap;
}

export interface DerivedProviderSetupStatus {
	keySaved: boolean;
	modelSelected: boolean;
	connection: "untested" | "verified" | "stale";
	testedAt?: string;
}

function trimValue(value: string): string {
	return value.trim();
}

function isCliProvider(provider: ProviderSetupStatusId): boolean {
	return provider === "codex-cli" || provider === "claude-cli";
}

function currentCredentialValue(settings: ProviderSetupStatusSettings): string {
	switch (settings.provider) {
		case "ollama":
			return trimValue(settings.ollamaHost);
		case "anthropic":
			return trimValue(settings.anthropicApiKey);
		case "openai":
			return trimValue(settings.openaiApiKey);
		case "google":
			return trimValue(settings.googleApiKey);
		case "xai":
			return trimValue(settings.xaiApiKey);
		case "openrouter":
			return trimValue(settings.openrouterApiKey);
		case "codex-cli":
			return trimValue(settings.codexCliCommand);
		case "claude-cli":
			return trimValue(settings.claudeCliCommand);
	}
}

function currentModelValue(settings: ProviderSetupStatusSettings): string {
	switch (settings.provider) {
		case "ollama":
			return trimValue(settings.ollamaModel);
		case "anthropic":
			return trimValue(settings.anthropicModel);
		case "openai":
			return trimValue(settings.openaiModel);
		case "google":
			return trimValue(settings.googleModel);
		case "xai":
			return trimValue(settings.xaiModel);
		case "openrouter":
			return trimValue(settings.openrouterModel);
		case "codex-cli":
			return trimValue(settings.codexCliModel);
		case "claude-cli":
			return trimValue(settings.claudeCliModel);
	}
}

function currentConnectionVerificationModelValue(
	settings: ProviderSetupStatusSettings
): string {
	const model = currentModelValue(settings);
	return isCliProvider(settings.provider) && !model
		? CLI_DEFAULT_MODEL_SENTINEL
		: model;
}

function djb2Hash(value: string): string {
	let hash = 5381;
	for (const char of value) {
		hash = (hash * 33) ^ char.charCodeAt(0);
	}
	return (hash >>> 0).toString(16);
}

export function providerCredentialFingerprint(
	settings: ProviderSetupStatusSettings
): string {
	const value = currentCredentialValue(settings);
	return value ? djb2Hash(value) : "";
}

export function recordProviderConnectionSuccess(
	settings: ProviderSetupStatusSettings,
	testedAt: string = new Date().toISOString()
): ProviderConnectionStatusMap {
	return {
		...(settings.providerConnectionStatus ?? {}),
		[settings.provider]: {
			credentialFingerprint: providerCredentialFingerprint(settings),
			modelId: currentConnectionVerificationModelValue(settings),
			testedAt,
		},
	};
}

export function deriveProviderSetupStatus(
	settings: ProviderSetupStatusSettings
): DerivedProviderSetupStatus {
	const keySaved = currentCredentialValue(settings).length > 0;
	const modelSelected =
		isCliProvider(settings.provider) || currentModelValue(settings).length > 0;
	const snapshot = settings.providerConnectionStatus?.[settings.provider];
	if (!snapshot) {
		return { keySaved, modelSelected, connection: "untested" };
	}
	const isFresh =
		snapshot.credentialFingerprint === providerCredentialFingerprint(settings) &&
		snapshot.modelId === currentConnectionVerificationModelValue(settings);
	return {
		keySaved,
		modelSelected,
		connection: isFresh ? "verified" : "stale",
		testedAt: snapshot.testedAt,
	};
}
