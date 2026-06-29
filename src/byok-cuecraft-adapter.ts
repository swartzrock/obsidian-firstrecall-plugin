import {
	BYOK_PROVIDER_IDS,
	byokProviderDefinition,
	createByokProvider,
	deriveProviderSetupStatus,
	isModelOption,
	normalizeAnthropicModelSelection,
	normalizeProviderId,
	recordProviderConnectionSuccess,
	sortFetchedModelIds,
	type ByokHttpClient,
	type ByokListedModel,
	type ByokModelOption,
	type ByokProviderConfig,
	type ByokProviderDeps,
	type ByokProviderId,
	type ByokProviderRuntime,
	type ByokProviderStoredSettings,
	type ByokSetupStatus,
	type ByokStoredSettings,
	type ByokVerificationSnapshotMap,
} from "./byok";
import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";
import type { CueCraftSettings } from "./settings";

export type CueCraftByokRuntime = ByokProviderRuntime;
export type CueCraftHttpClient = ByokHttpClient;
export type CueCraftProviderFactoryDeps = ByokProviderDeps;
export type CueCraftProviderConnectionStatusMap = ByokVerificationSnapshotMap;
export type CueCraftByokSettings = ByokStoredSettings;
export type CueCraftByokProviderSettings = ByokProviderStoredSettings;
export type { ByokProviderConfig, ByokProviderDeps } from "./byok";

export type CueCraftFetchedModelProvider =
	| "ollama"
	| "openai"
	| "google"
	| "xai"
	| "openrouter";

export interface CueCraftAppliedModelRefresh {
	models: string[];
	options: ByokModelOption[];
	message: string;
}

type ProviderSettingsDefaults = Pick<
	CueCraftSettings,
	"codexCliCommand" | "codexCliModel" | "claudeCliCommand" | "claudeCliModel"
>;

export function normalizeCueCraftProviderSettings(
	settings: CueCraftSettings,
	defaults: ProviderSettingsDefaults
): void {
	settings.provider = normalizeProviderId(
		(settings as { provider?: unknown }).provider
	);
	for (const key of [
		"codexCliCommand",
		"codexCliModel",
		"claudeCliCommand",
		"claudeCliModel",
	] as const) {
		if (
			typeof (settings as unknown as Record<string, unknown>)[key] !==
			"string"
		) {
			settings[key] = defaults[key];
		}
	}
	normalizeCueCraftAnthropicSettings(settings);
}

function normalizeCueCraftAnthropicSettings(settings: CueCraftSettings): void {
	const legacyAvailableModelIds = (settings as unknown as {
		anthropicAvailableModelIds?: string[];
	}).anthropicAvailableModelIds;
	const hasAvailableModels = Boolean(
		(settings as { anthropicAvailableModels?: ModelInfo[] })
			.anthropicAvailableModels
	);
	if (Array.isArray(legacyAvailableModelIds) && !hasAvailableModels) {
		(settings as { anthropicAvailableModels?: ModelInfo[] }).anthropicAvailableModels =
			legacyAvailableModelIds.map((id) => ({
				id,
				display_name: id,
				type: "model",
				created_at: new Date(0).toISOString(),
				max_input_tokens: null,
				max_tokens: null,
				capabilities: null,
			} as ModelInfo));
	}
	if (
		!("anthropicHasFetchedModels" in settings) &&
		Array.isArray(
			(settings as { anthropicAvailableModels?: ModelInfo[] })
				.anthropicAvailableModels
		)
	) {
		(settings as { anthropicHasFetchedModels?: boolean }).anthropicHasFetchedModels =
			((settings as { anthropicAvailableModels?: ModelInfo[] })
				.anthropicAvailableModels?.length ?? 0) > 0;
	}
	normalizeAnthropicModelSelection(settings as {
		anthropicModel: string;
		anthropicModelSelection?: string;
		anthropicAvailableModels?: ModelInfo[];
	});
}

function emptyStoredProviderSettings(): ByokProviderStoredSettings {
	return {
		credential: "",
		model: "",
		availableModels: [],
		modelOptions: [],
		hasFetchedModels: false,
		modelRefreshMessage: "",
	};
}

function storedProviderSettingsFromCueCraftSettings(
	settings: CueCraftSettings,
	provider: ByokProviderId
): ByokProviderStoredSettings {
	const stored = emptyStoredProviderSettings();
	stored.credential = cueCraftProviderCredential(settings, provider);
	stored.model = cueCraftProviderModel(settings, provider);
	switch (provider) {
		case "ollama":
			stored.availableModels = [...settings.ollamaAvailableModels];
			stored.hasFetchedModels = settings.ollamaHasFetchedModels;
			stored.modelRefreshMessage = settings.ollamaModelRefreshMessage;
			break;
		case "anthropic":
			stored.availableModels = settings.anthropicAvailableModels.map(
				(model) => model.id
			);
			stored.hasFetchedModels = settings.anthropicHasFetchedModels;
			stored.modelRefreshMessage = settings.anthropicModelRefreshMessage;
			break;
		case "openai":
			stored.availableModels = [...settings.openaiAvailableModels];
			stored.hasFetchedModels = settings.openaiHasFetchedModels;
			stored.modelRefreshMessage = settings.openaiModelRefreshMessage;
			break;
		case "google":
			stored.availableModels = [...settings.googleAvailableModels];
			stored.hasFetchedModels = settings.googleHasFetchedModels;
			stored.modelRefreshMessage = settings.googleModelRefreshMessage;
			break;
		case "xai":
			stored.availableModels = [...settings.xaiAvailableModels];
			stored.hasFetchedModels = settings.xaiHasFetchedModels;
			stored.modelRefreshMessage = settings.xaiModelRefreshMessage;
			break;
		case "openrouter":
			stored.availableModels = [...settings.openrouterAvailableModels];
			stored.modelOptions = [...settings.openrouterModelOptions];
			stored.hasFetchedModels = settings.openrouterHasFetchedModels;
			stored.modelRefreshMessage = settings.openrouterModelRefreshMessage;
			break;
		case "codex-cli":
		case "claude-cli":
			break;
	}
	return stored;
}

export function cueCraftByokSettingsFromCueCraftSettings(
	settings: CueCraftSettings
): ByokStoredSettings {
	const providers: ByokStoredSettings["providers"] = {};
	for (const provider of BYOK_PROVIDER_IDS) {
		providers[provider] = storedProviderSettingsFromCueCraftSettings(
			settings,
			provider
		);
	}
	return {
		selectedProvider: settings.provider,
		providers,
		verification: { ...settings.providerConnectionStatus },
	};
}

export function cueCraftProviderConfigFromSettings(
	settings: CueCraftSettings
): ByokProviderConfig {
	switch (settings.provider) {
		case "anthropic":
			return {
				provider: "anthropic",
				apiKey: settings.anthropicApiKey,
				model: settings.anthropicModel,
			};
		case "openai":
			return {
				provider: "openai",
				apiKey: settings.openaiApiKey,
				model: settings.openaiModel,
			};
		case "google":
			return {
				provider: "google",
				apiKey: settings.googleApiKey,
				model: settings.googleModel,
			};
		case "xai":
			return {
				provider: "xai",
				apiKey: settings.xaiApiKey,
				model: settings.xaiModel,
			};
		case "openrouter":
			return {
				provider: "openrouter",
				apiKey: settings.openrouterApiKey,
				model: settings.openrouterModel,
			};
		case "codex-cli":
			return {
				provider: "codex-cli",
				command: settings.codexCliCommand,
				model: settings.codexCliModel,
			};
		case "claude-cli":
			return {
				provider: "claude-cli",
				command: settings.claudeCliCommand,
				model: settings.claudeCliModel,
			};
		case "ollama":
			return {
				provider: "ollama",
				host: settings.ollamaHost,
				model: settings.ollamaModel,
			};
	}
}

export function makeCueCraftByokProvider(
	settings: CueCraftSettings,
	deps: CueCraftProviderFactoryDeps
): CueCraftByokRuntime {
	return createByokProvider(cueCraftProviderConfigFromSettings(settings), deps);
}

export function isCueCraftLocalCliProvider(provider: ByokProviderId): boolean {
	return byokProviderDefinition(provider).credentialKind === "command";
}

export function cueCraftProviderLabel(provider: ByokProviderId): string {
	return byokProviderDefinition(provider).label;
}

export function cueCraftProviderCredential(
	settings: CueCraftSettings,
	provider: ByokProviderId = settings.provider
): string {
	switch (provider) {
		case "ollama":
			return settings.ollamaHost;
		case "anthropic":
			return settings.anthropicApiKey;
		case "openai":
			return settings.openaiApiKey;
		case "google":
			return settings.googleApiKey;
		case "xai":
			return settings.xaiApiKey;
		case "openrouter":
			return settings.openrouterApiKey;
		case "codex-cli":
			return settings.codexCliCommand;
		case "claude-cli":
			return settings.claudeCliCommand;
	}
}

export function cueCraftProviderModel(
	settings: CueCraftSettings,
	provider: ByokProviderId = settings.provider
): string {
	switch (provider) {
		case "ollama":
			return settings.ollamaModel;
		case "anthropic":
			return settings.anthropicModel;
		case "openai":
			return settings.openaiModel;
		case "google":
			return settings.googleModel;
		case "xai":
			return settings.xaiModel;
		case "openrouter":
			return settings.openrouterModel;
		case "codex-cli":
			return settings.codexCliModel;
		case "claude-cli":
			return settings.claudeCliModel;
	}
}

export function deriveCueCraftProviderSetupStatus(
	settings: CueCraftSettings
): ByokSetupStatus {
	return deriveProviderSetupStatus({
		byok: cueCraftByokSettingsFromCueCraftSettings(settings),
	});
}

export function recordCueCraftProviderConnectionSuccess(
	settings: CueCraftSettings,
	testedAt?: string
): CueCraftProviderConnectionStatusMap {
	return recordProviderConnectionSuccess(
		{ byok: cueCraftByokSettingsFromCueCraftSettings(settings) },
		testedAt
	);
}

export function resetCueCraftFetchedModels(
	settings: CueCraftSettings,
	provider: CueCraftFetchedModelProvider | "anthropic",
	message: string
): void {
	switch (provider) {
		case "anthropic":
			settings.anthropicAvailableModels = [];
			settings.anthropicHasFetchedModels = false;
			settings.anthropicModelRefreshMessage = message;
			return;
		case "ollama":
			settings.ollamaAvailableModels = [];
			settings.ollamaHasFetchedModels = false;
			settings.ollamaModelRefreshMessage = message;
			return;
		case "openai":
			settings.openaiAvailableModels = [];
			settings.openaiHasFetchedModels = false;
			settings.openaiModelRefreshMessage = message;
			return;
		case "google":
			settings.googleAvailableModels = [];
			settings.googleHasFetchedModels = false;
			settings.googleModelRefreshMessage = message;
			return;
		case "xai":
			settings.xaiAvailableModels = [];
			settings.xaiHasFetchedModels = false;
			settings.xaiModelRefreshMessage = message;
			return;
		case "openrouter":
			settings.openrouterAvailableModels = [];
			settings.openrouterModelOptions = [];
			settings.openrouterHasFetchedModels = false;
			settings.openrouterModelRefreshMessage = message;
			return;
	}
}

export function applyCueCraftListedModels(
	settings: CueCraftSettings,
	provider: CueCraftFetchedModelProvider,
	listedModels: ByokListedModel[],
	emptyMessage: string
): CueCraftAppliedModelRefresh {
	const options =
		listedModels.length > 0 && isModelOption(listedModels[0])
			? (listedModels as ByokModelOption[])
			: [];
	const ids =
		options.length > 0
			? options.map((option) => option.id)
			: (listedModels as string[]);
	const models = sortFetchedModelIds(ids);
	const message = models.length > 0 ? "" : emptyMessage;

	switch (provider) {
		case "ollama":
			settings.ollamaAvailableModels = models;
			settings.ollamaHasFetchedModels = true;
			settings.ollamaModelRefreshMessage = message;
			break;
		case "openai":
			settings.openaiAvailableModels = models;
			settings.openaiHasFetchedModels = true;
			settings.openaiModelRefreshMessage = message;
			break;
		case "google":
			settings.googleAvailableModels = models;
			settings.googleHasFetchedModels = true;
			settings.googleModelRefreshMessage = message;
			break;
		case "xai":
			settings.xaiAvailableModels = models;
			settings.xaiHasFetchedModels = true;
			settings.xaiModelRefreshMessage = message;
			break;
		case "openrouter":
			settings.openrouterAvailableModels = models;
			settings.openrouterModelOptions = options;
			settings.openrouterHasFetchedModels = true;
			settings.openrouterModelRefreshMessage = message;
			break;
	}

	return { models, options, message };
}

export function applyCueCraftModelRefreshFailure(
	settings: CueCraftSettings,
	provider: CueCraftFetchedModelProvider,
	message: string
): void {
	switch (provider) {
		case "ollama":
			settings.ollamaAvailableModels = [];
			settings.ollamaHasFetchedModels = true;
			settings.ollamaModelRefreshMessage = message;
			return;
		case "openai":
			settings.openaiAvailableModels = [];
			settings.openaiHasFetchedModels = true;
			settings.openaiModelRefreshMessage = message;
			return;
		case "google":
			settings.googleAvailableModels = [];
			settings.googleHasFetchedModels = true;
			settings.googleModelRefreshMessage = message;
			return;
		case "xai":
			settings.xaiAvailableModels = [];
			settings.xaiHasFetchedModels = true;
			settings.xaiModelRefreshMessage = message;
			return;
		case "openrouter":
			settings.openrouterAvailableModels = [];
			settings.openrouterModelOptions = [];
			settings.openrouterHasFetchedModels = true;
			settings.openrouterModelRefreshMessage = message;
			return;
	}
}

export function cueCraftFetchedModelCount(
	settings: CueCraftSettings,
	provider: CueCraftFetchedModelProvider
): number {
	switch (provider) {
		case "ollama":
			return settings.ollamaAvailableModels.length;
		case "openai":
			return settings.openaiAvailableModels.length;
		case "google":
			return settings.googleAvailableModels.length;
		case "xai":
			return settings.xaiAvailableModels.length;
		case "openrouter":
			return settings.openrouterAvailableModels.length;
	}
}

export function cueCraftModelRefreshMessage(
	settings: CueCraftSettings,
	provider: CueCraftFetchedModelProvider
): string {
	switch (provider) {
		case "ollama":
			return settings.ollamaModelRefreshMessage;
		case "openai":
			return settings.openaiModelRefreshMessage;
		case "google":
			return settings.googleModelRefreshMessage;
		case "xai":
			return settings.xaiModelRefreshMessage;
		case "openrouter":
			return settings.openrouterModelRefreshMessage;
	}
}
