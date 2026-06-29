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
import {
	isCueCraftCloudCredentialProvider,
	type CueCraftCloudCredentialProvider,
	type SecureCredentialStore,
} from "./secure-credential-store";

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

export class CueCraftCredentialUnavailableError extends Error {
	constructor(
		readonly provider: CueCraftCloudCredentialProvider,
		readonly reason: string,
		message: string
	) {
		super(message);
		this.name = "CueCraftCredentialUnavailableError";
	}
}

export interface CueCraftCredentialMigrationResult {
	settingsChanged: boolean;
	warnings: string[];
	migratedProviders: CueCraftCloudCredentialProvider[];
}

type ProviderSettingsDefaults = Pick<
	CueCraftSettings,
	"byok"
>;

type LegacyCueCraftProviderSettings = Partial<{
	provider: unknown;
	ollamaHost: string;
	ollamaModel: string;
	ollamaAvailableModels: string[];
	ollamaHasFetchedModels: boolean;
	ollamaModelRefreshMessage: string;
	anthropicApiKey: string;
	anthropicModel: string;
	anthropicModelSelection: string;
	anthropicAvailableModels: ModelInfo[];
	anthropicAvailableModelIds: string[];
	anthropicHasFetchedModels: boolean;
	anthropicModelRefreshMessage: string;
	openaiApiKey: string;
	openaiModel: string;
	openaiAvailableModels: string[];
	openaiHasFetchedModels: boolean;
	openaiModelRefreshMessage: string;
	googleApiKey: string;
	googleModel: string;
	googleAvailableModels: string[];
	googleHasFetchedModels: boolean;
	googleModelRefreshMessage: string;
	xaiApiKey: string;
	xaiModel: string;
	xaiAvailableModels: string[];
	xaiHasFetchedModels: boolean;
	xaiModelRefreshMessage: string;
	openrouterApiKey: string;
	openrouterModel: string;
	openrouterAvailableModels: string[];
	openrouterModelOptions: ByokModelOption[];
	openrouterHasFetchedModels: boolean;
	openrouterModelRefreshMessage: string;
	codexCliCommand: string;
	codexCliModel: string;
	claudeCliCommand: string;
	claudeCliModel: string;
	providerConnectionStatus: CueCraftProviderConnectionStatusMap;
}>;

export function normalizeCueCraftProviderSettings(
	settings: CueCraftSettings,
	defaults: ProviderSettingsDefaults,
	rawSettings: unknown = settings
): void {
	normalizeCueCraftAnthropicSettings(settings);
	const defaultByok =
		defaults.byok ?? cueCraftByokSettingsFromCueCraftSettings(defaults as CueCraftSettings);
	settings.byok = normalizeCueCraftByokSettings(
		settings,
		defaultByok,
		rawSettings
	);
}

function normalizeCueCraftAnthropicSettings(settings: CueCraftSettings): void {
	const legacy = settings as unknown as LegacyCueCraftProviderSettings;
	const legacyAvailableModelIds = legacy.anthropicAvailableModelIds;
	const hasAvailableModels = Boolean(
		legacy.anthropicAvailableModels
	);
	if (Array.isArray(legacyAvailableModelIds) && !hasAvailableModels) {
		legacy.anthropicAvailableModels = legacyAvailableModelIds.map((id) => ({
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
		!("anthropicHasFetchedModels" in legacy) &&
		Array.isArray(legacy.anthropicAvailableModels)
	) {
		legacy.anthropicHasFetchedModels =
			(legacy.anthropicAvailableModels?.length ?? 0) > 0;
	}
	normalizeAnthropicModelSelection(legacy as {
		anthropicModel: string;
		anthropicModelSelection?: string;
		anthropicAvailableModels?: ModelInfo[];
	});
}

function emptyStoredProviderSettings(): ByokProviderStoredSettings {
	return {
		credential: "",
		credentialSaved: false,
		credentialUpdatedAt: "",
		model: "",
		modelSelection: "",
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
	const legacy = settings as unknown as LegacyCueCraftProviderSettings;
	switch (provider) {
		case "ollama":
			return legacy.ollamaHost ?? "";
		case "anthropic":
			return legacy.anthropicApiKey ?? "";
		case "openai":
			return legacy.openaiApiKey ?? "";
		case "google":
			return legacy.googleApiKey ?? "";
		case "xai":
			return legacy.xaiApiKey ?? "";
		case "openrouter":
			return legacy.openrouterApiKey ?? "";
		case "codex-cli":
			return legacy.codexCliCommand ?? "";
		case "claude-cli":
			return legacy.claudeCliCommand ?? "";
	}
}

function deleteLegacyCloudProviderCredential(
	settings: CueCraftSettings,
	provider: CueCraftCloudCredentialProvider
): boolean {
	const legacy = settings as unknown as LegacyCueCraftProviderSettings;
	switch (provider) {
		case "anthropic":
			if (!("anthropicApiKey" in legacy)) return false;
			delete legacy.anthropicApiKey;
			return true;
		case "openai":
			if (!("openaiApiKey" in legacy)) return false;
			delete legacy.openaiApiKey;
			return true;
		case "google":
			if (!("googleApiKey" in legacy)) return false;
			delete legacy.googleApiKey;
			return true;
		case "xai":
			if (!("xaiApiKey" in legacy)) return false;
			delete legacy.xaiApiKey;
			return true;
		case "openrouter":
			if (!("openrouterApiKey" in legacy)) return false;
			delete legacy.openrouterApiKey;
			return true;
	}
}

function legacyProviderModel(
	settings: CueCraftSettings,
	provider: ByokProviderId
): string {
	const legacy = settings as unknown as LegacyCueCraftProviderSettings;
	switch (provider) {
		case "ollama":
			return legacy.ollamaModel ?? "";
		case "anthropic":
			return legacy.anthropicModel ?? "";
		case "openai":
			return legacy.openaiModel ?? "";
		case "google":
			return legacy.googleModel ?? "";
		case "xai":
			return legacy.xaiModel ?? "";
		case "openrouter":
			return legacy.openrouterModel ?? "";
		case "codex-cli":
			return legacy.codexCliModel ?? "";
		case "claude-cli":
			return legacy.claudeCliModel ?? "";
	}
}

function storedProviderSettingsFromCueCraftSettings(
	settings: CueCraftSettings,
	provider: ByokProviderId
): ByokProviderStoredSettings {
	const legacy = settings as unknown as LegacyCueCraftProviderSettings;
	const stored = emptyStoredProviderSettings();
	stored.credential = legacyProviderCredential(settings, provider);
	stored.model = legacyProviderModel(settings, provider);
	switch (provider) {
		case "ollama":
			stored.availableModels = legacyStringArray(legacy.ollamaAvailableModels);
			stored.hasFetchedModels = legacyBoolean(legacy.ollamaHasFetchedModels);
			stored.modelRefreshMessage = legacyString(legacy.ollamaModelRefreshMessage);
			break;
		case "anthropic":
			stored.availableModels = (legacy.anthropicAvailableModels ?? []).map(
				(model) => model.id
			);
			stored.modelSelection = legacyString(legacy.anthropicModelSelection);
			stored.hasFetchedModels = legacyBoolean(legacy.anthropicHasFetchedModels);
			stored.modelRefreshMessage = legacyString(legacy.anthropicModelRefreshMessage);
			break;
		case "openai":
			stored.availableModels = legacyStringArray(legacy.openaiAvailableModels);
			stored.hasFetchedModels = legacyBoolean(legacy.openaiHasFetchedModels);
			stored.modelRefreshMessage = legacyString(legacy.openaiModelRefreshMessage);
			break;
		case "google":
			stored.availableModels = legacyStringArray(legacy.googleAvailableModels);
			stored.hasFetchedModels = legacyBoolean(legacy.googleHasFetchedModels);
			stored.modelRefreshMessage = legacyString(legacy.googleModelRefreshMessage);
			break;
		case "xai":
			stored.availableModels = legacyStringArray(legacy.xaiAvailableModels);
			stored.hasFetchedModels = legacyBoolean(legacy.xaiHasFetchedModels);
			stored.modelRefreshMessage = legacyString(legacy.xaiModelRefreshMessage);
			break;
		case "openrouter":
			stored.availableModels = legacyStringArray(legacy.openrouterAvailableModels);
			stored.modelOptions = Array.isArray(legacy.openrouterModelOptions)
				? [...legacy.openrouterModelOptions]
				: [];
			stored.hasFetchedModels = legacyBoolean(legacy.openrouterHasFetchedModels);
			stored.modelRefreshMessage = legacyString(legacy.openrouterModelRefreshMessage);
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
	const legacy = settings as unknown as LegacyCueCraftProviderSettings;
	const providers: ByokStoredSettings["providers"] = {};
	for (const provider of BYOK_PROVIDER_IDS) {
		providers[provider] = storedProviderSettingsFromCueCraftSettings(
			settings,
			provider
		);
	}
	return {
		selectedProvider: normalizeProviderId(legacy.provider),
		providers,
		verification: { ...(legacy.providerConnectionStatus ?? {}) },
	};
}

function normalizeStoredProviderSettings(
	value: unknown
): ByokProviderStoredSettings {
	const stored = {
		...emptyStoredProviderSettings(),
		...((value && typeof value === "object")
			? (value as Partial<ByokProviderStoredSettings>)
			: {}),
	};
	if (typeof stored.credential !== "string") stored.credential = "";
	if (typeof stored.credentialSaved !== "boolean") {
		stored.credentialSaved = false;
	}
	if (typeof stored.credentialUpdatedAt !== "string") {
		stored.credentialUpdatedAt = "";
	}
	if (typeof stored.model !== "string") stored.model = "";
	if (typeof stored.modelSelection !== "string") stored.modelSelection = "";
	if (!Array.isArray(stored.availableModels)) stored.availableModels = [];
	if (!Array.isArray(stored.modelOptions)) stored.modelOptions = [];
	if (typeof stored.hasFetchedModels !== "boolean") {
		stored.hasFetchedModels = false;
	}
	if (typeof stored.modelRefreshMessage !== "string") {
		stored.modelRefreshMessage = "";
	}
	return stored;
}

function normalizeCueCraftByokSettings(
	settings: CueCraftSettings,
	defaults: ByokStoredSettings,
	rawSettings: unknown
): ByokStoredSettings {
	const rawByok = (rawSettings as { byok?: unknown } | null | undefined)?.byok;
	const hasRawByok = Boolean(
		rawByok &&
			typeof rawByok === "object" &&
			"providers" in rawByok
	);
	const existing = hasRawByok ? (rawByok as Partial<ByokStoredSettings>) : {};
	const legacy = cueCraftByokSettingsFromCueCraftSettings(settings);
	const providers: ByokStoredSettings["providers"] = {};
	for (const provider of BYOK_PROVIDER_IDS) {
		const source = hasRawByok
			? existing.providers?.[provider] ?? legacy.providers[provider]
			: legacy.providers[provider] ?? defaults.providers[provider];
		const stored = normalizeStoredProviderSettings(source);
		if (
			!hasRawByok &&
			byokProviderDefinition(provider).credentialKind === "command"
		) {
			const fallback = normalizeStoredProviderSettings(defaults.providers[provider]);
			if (!stored.credential) stored.credential = fallback.credential;
			if (!stored.model) stored.model = fallback.model;
		}
		providers[provider] = stored;
	}
	return {
		selectedProvider: normalizeProviderId(
			existing.selectedProvider ?? legacy.selectedProvider ?? defaults.selectedProvider
		),
		providers,
		verification: {
			...(hasRawByok ? {} : legacy.verification),
			...(existing.verification ?? {}),
		},
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
	if (typeof stored.credentialSaved !== "boolean") {
		stored.credentialSaved = false;
	}
	if (typeof stored.credentialUpdatedAt !== "string") {
		stored.credentialUpdatedAt = "";
	}
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

export function setCueCraftProviderCredential(
	settings: CueCraftSettings,
	provider: ByokProviderId,
	value: string
): void {
	cueCraftProviderSettings(settings, provider).credential = value;
}

export function setCueCraftProviderCredentialMetadata(
	settings: CueCraftSettings,
	provider: ByokProviderId,
	metadata: { saved: boolean; token: string }
): void {
	const stored = cueCraftProviderSettings(settings, provider);
	stored.credentialSaved = metadata.saved;
	stored.credentialUpdatedAt = metadata.token;
}

export function clearCueCraftProviderCredentialMetadata(
	settings: CueCraftSettings,
	provider: ByokProviderId
): void {
	setCueCraftProviderCredentialMetadata(settings, provider, {
		saved: false,
		token: "",
	});
}

export function clearCueCraftStoredCloudCredential(
	settings: CueCraftSettings,
	provider: CueCraftCloudCredentialProvider
): void {
	cueCraftProviderSettings(settings, provider).credential = "";
	clearCueCraftProviderCredentialMetadata(settings, provider);
	deleteLegacyCloudProviderCredential(settings, provider);
}

export function markCueCraftCloudCredentialSaved(
	settings: CueCraftSettings,
	provider: CueCraftCloudCredentialProvider,
	token: string
): void {
	cueCraftProviderSettings(settings, provider).credential = "";
	setCueCraftProviderCredentialMetadata(settings, provider, {
		saved: true,
		token,
	});
	deleteLegacyCloudProviderCredential(settings, provider);
}

export function setCueCraftProviderModel(
	settings: CueCraftSettings,
	provider: ByokProviderId,
	value: string
): void {
	cueCraftProviderSettings(settings, provider).model = value;
}

export function cueCraftProviderConfigFromSettings(
	settings: CueCraftSettings,
	opts: {
		cloudCredentials?: Partial<Record<CueCraftCloudCredentialProvider, string>>;
	} = {}
): ByokProviderConfig {
	const provider = cueCraftSelectedProvider(settings);
	const stored = cueCraftProviderSettings(settings, provider);
	switch (provider) {
		case "anthropic":
			return {
				provider: "anthropic",
				apiKey: opts.cloudCredentials?.anthropic ?? stored.credential,
				model: stored.model,
			};
		case "openai":
			return {
				provider: "openai",
				apiKey: opts.cloudCredentials?.openai ?? stored.credential,
				model: stored.model,
			};
		case "google":
			return {
				provider: "google",
				apiKey: opts.cloudCredentials?.google ?? stored.credential,
				model: stored.model,
			};
		case "xai":
			return {
				provider: "xai",
				apiKey: opts.cloudCredentials?.xai ?? stored.credential,
				model: stored.model,
			};
		case "openrouter":
			return {
				provider: "openrouter",
				apiKey: opts.cloudCredentials?.openrouter ?? stored.credential,
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

export async function resolveCueCraftProviderConfigFromStore(
	settings: CueCraftSettings,
	credentialStore: SecureCredentialStore
): Promise<ByokProviderConfig> {
	const provider = cueCraftSelectedProvider(settings);
	if (!isCueCraftCloudCredentialProvider(provider)) {
		return cueCraftProviderConfigFromSettings(settings);
	}
	const result = await credentialStore.read(provider);
	if (!result.ok || !result.value) {
		const providerName = cueCraftProviderLabel(provider);
		throw new CueCraftCredentialUnavailableError(
			provider,
			result.reason ?? "missing-credential",
			result.message ??
				`CueCraft: ${providerName} API key is not available from secure storage.`
		);
	}
	return cueCraftProviderConfigFromSettings(settings, {
		cloudCredentials: { [provider]: result.value },
	});
}

export async function makeCueCraftByokProviderFromStore(
	settings: CueCraftSettings,
	deps: CueCraftProviderFactoryDeps,
	credentialStore: SecureCredentialStore
): Promise<CueCraftByokRuntime> {
	return createByokProvider(
		await resolveCueCraftProviderConfigFromStore(settings, credentialStore),
		deps
	);
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

export function cueCraftProviderCredentialSaved(
	settings: CueCraftSettings,
	provider: ByokProviderId = cueCraftSelectedProvider(settings)
): boolean {
	const stored = cueCraftProviderSettings(settings, provider);
	return isCueCraftCloudCredentialProvider(provider)
		? Boolean(stored.credentialSaved) || stored.credential.trim().length > 0
		: stored.credential.trim().length > 0;
}

export async function migrateCueCraftCloudCredentials(
	settings: CueCraftSettings,
	credentialStore: SecureCredentialStore
): Promise<CueCraftCredentialMigrationResult> {
	const result: CueCraftCredentialMigrationResult = {
		settingsChanged: false,
		warnings: [],
		migratedProviders: [],
	};
	for (const provider of BYOK_PROVIDER_IDS) {
		if (!isCueCraftCloudCredentialProvider(provider)) continue;
		const stored = cueCraftProviderSettings(settings, provider);
		const plaintext = stored.credential.trim();
		if (plaintext) {
			const saved = await credentialStore.save(provider, plaintext);
			if (!saved.ok || !saved.metadata) {
				result.warnings.push(
					`${cueCraftProviderLabel(provider)} API key could not be moved to secure storage: ${saved.message ?? saved.reason ?? "unknown error"}`
				);
				continue;
			}
			markCueCraftCloudCredentialSaved(
				settings,
				provider,
				saved.metadata.token
			);
			result.settingsChanged = true;
			result.migratedProviders.push(provider);
			continue;
		}
		if (stored.credentialSaved) {
			result.settingsChanged =
				deleteLegacyCloudProviderCredential(settings, provider) ||
				result.settingsChanged;
			continue;
		}
		const metadata = await credentialStore.metadata(provider);
		if (metadata.ok && metadata.metadata) {
			markCueCraftCloudCredentialSaved(
				settings,
				provider,
				metadata.metadata.token
			);
			result.settingsChanged = true;
		}
	}
	return result;
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
	return verification;
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
