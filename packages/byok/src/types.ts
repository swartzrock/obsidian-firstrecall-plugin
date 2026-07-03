import type { z } from "zod/v3";

export type ByokProviderId =
	| "ollama"
	| "anthropic"
	| "openai"
	| "google"
	| "xai"
	| "openrouter"
	| "codex-cli"
	| "claude-cli";

export type ByokCredentialKind = "api-key" | "host" | "command";

export type ByokModelBehavior = "required" | "optional";

export type ByokProviderIconSource = "svgl" | "custom";

export interface ByokProviderIconDefinition {
	source: ByokProviderIconSource;
	sourceUrl: string;
	viewBox: string;
	svg: string;
}

export interface ByokCredentialFieldDefinition {
	label: string;
	placeholder: string;
	description: string;
	secret: boolean;
	missingMessage: string;
	resetModelsMessage?: string;
}

export interface ByokModelFieldDefinition {
	label: string;
	placeholder: string;
	description: string;
	listModelsLabel?: string;
	listModelsDescription?: string;
	emptyListMessage?: string;
}

export interface ByokProviderDefinition {
	id: ByokProviderId;
	label: string;
	shortLabel: string;
	productLabel: string;
	vendor: string;
	icon: ByokProviderIconDefinition;
	credentialKind: ByokCredentialKind;
	credentialField: ByokCredentialFieldDefinition;
	modelBehavior: ByokModelBehavior;
	modelField: ByokModelFieldDefinition;
	requiresNetwork: boolean;
	requiresDownload: boolean;
	supportsModelListing: boolean;
}

export interface ByokCloudProviderConfig {
	provider:
		| "anthropic"
		| "openai"
		| "google"
		| "xai"
		| "openrouter";
	apiKey: string;
	model: string;
}

export interface ByokOllamaProviderConfig {
	provider: "ollama";
	host: string;
	model: string;
}

export interface ByokCliProviderConfig {
	provider: "codex-cli" | "claude-cli";
	command: string;
	model?: string;
}

export type ByokProviderConfig =
	| ByokCloudProviderConfig
	| ByokOllamaProviderConfig
	| ByokCliProviderConfig;

export type ByokCoreProviderConfig =
	| ByokCloudProviderConfig
	| ByokOllamaProviderConfig;

export interface ByokHttpRequest {
	url: string;
	method: "GET" | "POST";
	body?: string;
	headers?: Record<string, string>;
	signal?: AbortSignal;
}

export interface ByokHttpResponse {
	status: number;
	text: string;
	json: unknown;
}

export type ByokHttpClient = (
	request: ByokHttpRequest
) => Promise<ByokHttpResponse>;

export interface ByokProviderAppInfo {
	/** Optional application name for provider-specific metadata headers. */
	name?: string;
	/** Optional public application URL for provider-specific metadata headers. */
	url?: string;
}

export interface ByokProviderDeps {
	fetchImpl: typeof fetch;
	http: ByokHttpClient;
	appInfo?: ByokProviderAppInfo;
}

export type ByokFacadeDeps = Partial<Omit<ByokProviderDeps, "appInfo">>;

export interface ByokProviderStatus {
	ok: boolean;
	message: string;
	models?: string[];
}

export type ByokConnectionState = "untested" | "verified" | "stale";

export interface ByokVerificationSnapshot {
	credentialFingerprint: string;
	credentialToken?: string;
	modelId: string;
	testedAt: string;
}

export type ByokVerificationSnapshotMap = Partial<
	Record<ByokProviderId, ByokVerificationSnapshot>
>;

export interface ByokSetupStatus {
	keySaved: boolean;
	modelSelected: boolean;
	connection: ByokConnectionState;
	testedAt?: string;
}

export interface ByokModelOption {
	id: string;
	label: string;
}

export interface ByokProviderStoredSettings {
	credential: string;
	credentialSaved?: boolean;
	credentialUpdatedAt?: string;
	credentialLength?: number;
	model: string;
	modelSelection?: string;
	availableModels: string[];
	modelOptions: ByokModelOption[];
	hasFetchedModels: boolean;
	modelRefreshMessage: string;
}

export interface ByokStoredSettings {
	selectedProvider: ByokProviderId;
	providers: Partial<Record<ByokProviderId, ByokProviderStoredSettings>>;
	verification: ByokVerificationSnapshotMap;
}

export interface ByokModelRefreshResult {
	models: string[];
	options: ByokModelOption[];
	message: string;
}

export interface ByokTextGenerationInput {
	prompt: string;
	/** Ask providers with native support to constrain the response to JSON text. */
	responseFormat?: "text" | "json";
	/** Optional JSON schema for providers that support structured text output. */
	jsonSchema?: string;
}

export interface ByokTextGenerationOutput {
	text: string;
}

export type ByokGenerateTextOptions =
	| (Omit<ByokCloudProviderConfig, "provider"> & {
			provider: "anthropic" | "openai" | "google" | "xai";
			prompt: string;
			deps?: ByokFacadeDeps;
			signal?: AbortSignal;
	  })
	| (Omit<ByokCloudProviderConfig, "provider"> & {
			provider: "openrouter";
			prompt: string;
			deps?: ByokFacadeDeps;
			signal?: AbortSignal;
			appInfo?: ByokProviderAppInfo;
	  })
	| (ByokOllamaProviderConfig & {
			prompt: string;
			deps?: ByokFacadeDeps;
			signal?: AbortSignal;
	  });

export type ByokClientConfig =
	| (Omit<ByokCloudProviderConfig, "provider" | "model"> & {
			provider: "anthropic" | "openai" | "google" | "xai";
			deps?: ByokFacadeDeps;
	  })
	| (Omit<ByokCloudProviderConfig, "provider" | "model"> & {
			provider: "openrouter";
			deps?: ByokFacadeDeps;
			appInfo?: ByokProviderAppInfo;
	  })
	| (Omit<ByokOllamaProviderConfig, "model"> & {
			deps?: ByokFacadeDeps;
	  });

export interface ByokClientTextGenerationInput {
	model: string;
	prompt: string;
	signal?: AbortSignal;
}

export interface ByokClient {
	generateText(
		input: ByokClientTextGenerationInput
	): Promise<ByokTextGenerationOutput>;
}

export interface ByokObjectGenerationInput<T> {
	prompt: string;
	schema: z.ZodType<T, z.ZodTypeDef, unknown>;
}

export interface ByokProviderRuntime {
	id: ByokProviderId;
	label: string;
	requiresNetwork: boolean;
	requiresDownload: boolean;
	sectionConcurrencyLimit?: number;
	testConnection(): Promise<ByokProviderStatus>;
	listModels?(): Promise<ByokModelOption[]>;
	generateText(
		input: ByokTextGenerationInput,
		signal?: AbortSignal
	): Promise<ByokTextGenerationOutput>;
	generateObject?<T>(
		input: ByokObjectGenerationInput<T>,
		signal?: AbortSignal
	): Promise<T>;
}

export class ByokProviderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ByokProviderError";
	}
}

export class ByokProviderRateLimitError extends ByokProviderError {
	readonly retryAfterMs: number | null;

	constructor(message: string, retryAfterMs: number | null = null) {
		super(message);
		this.name = "ByokProviderRateLimitError";
		this.retryAfterMs = retryAfterMs;
	}
}
