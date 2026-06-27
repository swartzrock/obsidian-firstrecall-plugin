import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";
import type {
	ByokProviderId,
	ByokSetupStatus,
	ByokVerificationSnapshot,
	ByokVerificationSnapshotMap,
} from "./types";

export type ProviderSetupStatusId = ByokProviderId;

export const CLI_DEFAULT_MODEL_SENTINEL = "__cuecraft_cli_default__";

export type ProviderConnectionSnapshot = ByokVerificationSnapshot;

export type ProviderConnectionStatusMap = ByokVerificationSnapshotMap;

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

export type DerivedProviderSetupStatus = ByokSetupStatus;

function trimValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function isCliProvider(provider: unknown): boolean {
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
		default:
			return "";
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
		default:
			return "";
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
