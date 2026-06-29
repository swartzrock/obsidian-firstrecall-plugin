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

function legacyStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function legacyBoolean(value: unknown): boolean {
	return typeof value === "boolean" ? value : false;
}

function legacyString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function legacyProviderCredential(
	settings: CueCraftSettings,
	provider: ByokProviderId
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

function legacyProviderModel(
	settings: CueCraftSettings,
	provider: ByokProviderId
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

function storedProviderSettingsFromCueCraftSettings(
	settings: CueCraftSettings,
	provider: ByokProviderId
): ByokProviderStoredSettings {
	const stored = emptyStoredProviderSettings();
	stored.credential = legacyProviderCredential(settings, provider);
	stored.model = legacyProviderModel(settings, provider);
	switch (provider) {
		case "ollama":
			stored.availableModels = legacyStringArray(settings.ollamaAvailableModels);
			stored.hasFetchedModels = legacyBoolean(settings.ollamaHasFetchedModels);
			stored.modelRefreshMessage = legacyString(settings.ollamaModelRefreshMessage);
			break;
		case "anthropic":
			stored.availableModels = (settings.anthropicAvailableModels ?? []).map(
				(model) => model.id
			);
			stored.hasFetchedModels = legacyBoolean(settings.anthropicHasFetchedModels);
			stored.modelRefreshMessage = legacyString(settings.anthropicModelRefreshMessage);
			break;
		case "openai":
			stored.availableModels = legacyStringArray(settings.openaiAvailableModels);
			stored.hasFetchedModels = legacyBoolean(settings.openaiHasFetchedModels);
			stored.modelRefreshMessage = legacyString(settings.openaiModelRefreshMessage);
			break;
		case "google":
			stored.availableModels = legacyStringArray(settings.googleAvailableModels);
			stored.hasFetchedModels = legacyBoolean(settings.googleHasFetchedModels);
			stored.modelRefreshMessage = legacyString(settings.googleModelRefreshMessage);
			break;
		case "xai":
			stored.availableModels = legacyStringArray(settings.xaiAvailableModels);
			stored.hasFetchedModels = legacyBoolean(settings.xaiHasFetchedModels);
			stored.modelRefreshMessage = legacyString(settings.xaiModelRefreshMessage);
			break;
		case "openrouter":
			stored.availableModels = legacyStringArray(settings.openrouterAvailableModels);
			stored.modelOptions = Array.isArray(settings.openrouterModelOptions)
				? [...settings.openrouterModelOptions]
				: [];
			stored.hasFetchedModels = legacyBoolean(settings.openrouterHasFetchedModels);
			stored.modelRefreshMessage = legacyString(settings.openrouterModelRefreshMessage);
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

export function cueCraftSelectedProvider(
	settings: CueCraftSettings
): ByokProviderId {
	return normalizeProviderId(
		(settings.byok as { selectedProvider?: unknown } | undefined)
			?.selectedProvider ?? (settings as { provider?: unknown }).provider
	);
}

export function setCueCraftSelectedProvider(
	settings: CueCraftSettings,
	provider: ByokProviderId
): void {
	settings.provider = provider;
	ensureCueCraftByokSettings(settings).selectedProvider = provider;
}

function ensureCueCraftByokSettings(settings: CueCraftSettings): ByokStoredSettings {
	const maybeSettings = settings as CueCraftSettings & {
		byok?: ByokStoredSettings;
	};
	if (!maybeSettings.byok?.providers) {
		maybeSettings.byok = cueCraftByokSettingsFromCueCraftSettings(settings);
		return maybeSettings.byok;
	}
	if (!maybeSettings.byok.verification) {
		maybeSettings.byok.verification = {};
	}
	if (!maybeSettings.byok.selectedProvider) {
		maybeSettings.byok.selectedProvider = cueCraftSelectedProvider(settings);
	}
	return maybeSettings.byok;
}

export function cueCraftProviderSettings(
	settings: CueCraftSettings,
	provider: ByokProviderId = cueCraftSelectedProvider(settings)
): ByokProviderStoredSettings {
	const providers = ensureCueCraftByokSettings(settings).providers;
	const stored = {
		...emptyStoredProviderSettings(),
		...(providers[provider] ?? {}),
	};
	if (!Array.isArray(stored.availableModels)) stored.availableModels = [];
	if (!Array.isArray(stored.modelOptions)) stored.modelOptions = [];
	if (typeof stored.credential !== "string") stored.credential = "";
	if (typeof stored.model !== "string") stored.model = "";
	if (typeof stored.hasFetchedModels !== "boolean") {
		stored.hasFetchedModels = false;
	}
	if (typeof stored.modelRefreshMessage !== "string") {
		stored.modelRefreshMessage = "";
	}
	providers[provider] = stored;
	return stored;
}

function mirrorLegacyProviderCredential(
	settings: CueCraftSettings,
	provider: ByokProviderId,
	value: string
): void {
	switch (provider) {
		case "ollama":
			settings.ollamaHost = value;
			return;
		case "anthropic":
			settings.anthropicApiKey = value;
			return;
		case "openai":
			settings.openaiApiKey = value;
			return;
		case "google":
			settings.googleApiKey = value;
			return;
		case "xai":
			settings.xaiApiKey = value;
			return;
		case "openrouter":
			settings.openrouterApiKey = value;
			return;
		case "codex-cli":
			settings.codexCliCommand = value;
			return;
		case "claude-cli":
			settings.claudeCliCommand = value;
			return;
	}
}

function mirrorLegacyProviderModel(
	settings: CueCraftSettings,
	provider: ByokProviderId,
	value: string
): void {
	switch (provider) {
		case "ollama":
			settings.ollamaModel = value;
			return;
		case "anthropic":
			settings.anthropicModel = value;
			return;
		case "openai":
			settings.openaiModel = value;
			return;
		case "google":
			settings.googleModel = value;
			return;
		case "xai":
			settings.xaiModel = value;
			return;
		case "openrouter":
			settings.openrouterModel = value;
			return;
		case "codex-cli":
			settings.codexCliModel = value;
			return;
		case "claude-cli":
			settings.claudeCliModel = value;
			return;
	}
}

export function setCueCraftProviderCredential(
	settings: CueCraftSettings,
	provider: ByokProviderId,
	value: string
): void {
	cueCraftProviderSettings(settings, provider).credential = value;
	mirrorLegacyProviderCredential(settings, provider, value);
}

export function setCueCraftProviderModel(
	settings: CueCraftSettings,
	provider: ByokProviderId,
	value: string
): void {
	cueCraftProviderSettings(settings, provider).model = value;
	mirrorLegacyProviderModel(settings, provider, value);
}

export function cueCraftProviderConfigFromSettings(
	settings: CueCraftSettings
): ByokProviderConfig {
	const provider = cueCraftSelectedProvider(settings);
	const stored = cueCraftProviderSettings(settings, provider);
	switch (provider) {
		case "anthropic":
			return {
				provider: "anthropic",
				apiKey: stored.credential,
				model: stored.model,
			};
		case "openai":
			return {
				provider: "openai",
				apiKey: stored.credential,
				model: stored.model,
			};
		case "google":
			return {
				provider: "google",
				apiKey: stored.credential,
				model: stored.model,
			};
		case "xai":
			return {
				provider: "xai",
				apiKey: stored.credential,
				model: stored.model,
			};
		case "openrouter":
			return {
				provider: "openrouter",
				apiKey: stored.credential,
				model: stored.model,
			};
		case "codex-cli":
			return {
				provider: "codex-cli",
				command: stored.credential,
				model: stored.model,
			};
		case "claude-cli":
			return {
				provider: "claude-cli",
				command: stored.credential,
				model: stored.model,
			};
		case "ollama":
			return {
				provider: "ollama",
				host: stored.credential,
				model: stored.model,
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
	provider: ByokProviderId = cueCraftSelectedProvider(settings)
): string {
	return cueCraftProviderSettings(settings, provider).credential;
}

export function cueCraftProviderModel(
	settings: CueCraftSettings,
	provider: ByokProviderId = cueCraftSelectedProvider(settings)
): string {
	return cueCraftProviderSettings(settings, provider).model;
}

export function deriveCueCraftProviderSetupStatus(
	settings: CueCraftSettings
): ByokSetupStatus {
	return deriveProviderSetupStatus({ byok: ensureCueCraftByokSettings(settings) });
}

export function recordCueCraftProviderConnectionSuccess(
	settings: CueCraftSettings,
	testedAt?: string
): CueCraftProviderConnectionStatusMap {
	const byok = ensureCueCraftByokSettings(settings);
	const verification = recordProviderConnectionSuccess(
		{ byok },
		testedAt
	);
	byok.verification = verification;
	settings.providerConnectionStatus = verification;
	return verification;
}

function mirrorLegacyFetchedModelSettings(
	settings: CueCraftSettings,
	provider: CueCraftFetchedModelProvider | "anthropic",
	stored: ByokProviderStoredSettings
): void {
	switch (provider) {
		case "anthropic":
			settings.anthropicAvailableModels = stored.availableModels.map((id) => ({
				id,
				display_name: id,
				type: "model",
				created_at: new Date(0).toISOString(),
				max_input_tokens: null,
				max_tokens: null,
				capabilities: null,
			} as ModelInfo));
			settings.anthropicHasFetchedModels = stored.hasFetchedModels;
			settings.anthropicModelRefreshMessage = stored.modelRefreshMessage;
			return;
		case "ollama":
			settings.ollamaAvailableModels = [...stored.availableModels];
			settings.ollamaHasFetchedModels = stored.hasFetchedModels;
			settings.ollamaModelRefreshMessage = stored.modelRefreshMessage;
			return;
		case "openai":
			settings.openaiAvailableModels = [...stored.availableModels];
			settings.openaiHasFetchedModels = stored.hasFetchedModels;
			settings.openaiModelRefreshMessage = stored.modelRefreshMessage;
			return;
		case "google":
			settings.googleAvailableModels = [...stored.availableModels];
			settings.googleHasFetchedModels = stored.hasFetchedModels;
			settings.googleModelRefreshMessage = stored.modelRefreshMessage;
			return;
		case "xai":
			settings.xaiAvailableModels = [...stored.availableModels];
			settings.xaiHasFetchedModels = stored.hasFetchedModels;
			settings.xaiModelRefreshMessage = stored.modelRefreshMessage;
			return;
		case "openrouter":
			settings.openrouterAvailableModels = [...stored.availableModels];
			settings.openrouterModelOptions = [...stored.modelOptions];
			settings.openrouterHasFetchedModels = stored.hasFetchedModels;
			settings.openrouterModelRefreshMessage = stored.modelRefreshMessage;
			return;
	}
}

export function resetCueCraftFetchedModels(
	settings: CueCraftSettings,
	provider: CueCraftFetchedModelProvider | "anthropic",
	message: string
): void {
	const stored = cueCraftProviderSettings(settings, provider);
	stored.availableModels = [];
	stored.modelOptions = [];
	stored.hasFetchedModels = false;
	stored.modelRefreshMessage = message;
	mirrorLegacyFetchedModelSettings(settings, provider, stored);
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
	const stored = cueCraftProviderSettings(settings, provider);
	stored.availableModels = models;
	stored.modelOptions = options;
	stored.hasFetchedModels = true;
	stored.modelRefreshMessage = message;
	mirrorLegacyFetchedModelSettings(settings, provider, stored);

	return { models, options, message };
}

export function applyCueCraftModelRefreshFailure(
	settings: CueCraftSettings,
	provider: CueCraftFetchedModelProvider,
	message: string
): void {
	const stored = cueCraftProviderSettings(settings, provider);
	stored.availableModels = [];
	stored.modelOptions = [];
	stored.hasFetchedModels = true;
	stored.modelRefreshMessage = message;
	mirrorLegacyFetchedModelSettings(settings, provider, stored);
}

export function cueCraftFetchedModelCount(
	settings: CueCraftSettings,
	provider: CueCraftFetchedModelProvider
): number {
	return cueCraftProviderSettings(settings, provider).availableModels.length;
}

export function cueCraftModelRefreshMessage(
	settings: CueCraftSettings,
	provider: CueCraftFetchedModelProvider
): string {
	return cueCraftProviderSettings(settings, provider).modelRefreshMessage;
}
