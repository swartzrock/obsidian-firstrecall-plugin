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
	optionSource?: ByokModelOptionSource;
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
	supportsBatchGeneration: boolean;
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

export interface ByokHttpRequest {
	url: string;
	method: "GET" | "POST";
	body?: string;
	headers?: Record<string, string>;
}

export interface ByokHttpResponse {
	status: number;
	text: string;
	json: unknown;
}

export type ByokHttpClient = (
	request: ByokHttpRequest
) => Promise<ByokHttpResponse>;

export interface ByokProviderDeps {
	fetchImpl: typeof fetch;
	http: ByokHttpClient;
}

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

export type ByokModelOptionSource =
	| "openrouter"
	| "openai"
	| "google"
	| "xai"
	| "ollama"
	| "anthropic"
	| "string";

export interface ByokModelOption {
	id: string;
	label: string;
	provider: string;
	contextLength: number | null;
	pricing: { prompt: number; completion: number } | null;
	supportedParameters: string[] | null;
	source: ByokModelOptionSource;
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

export type ByokListedModel = string | ByokModelOption;

export type ByokCueConfidence = "high" | "medium" | "low";

export interface ByokCueGenerationOptions {
	cueDensity?: 1 | 2 | 3;
	questionStyle?: "recall" | "socratic" | "exam";
	generateKeywords?: boolean;
	autoSummary?: boolean;
}

export interface ByokCueOutput {
	question: string;
	keywords: string[];
	confidence: ByokCueConfidence;
	rationale?: string | null;
}

export interface ByokSummaryOutput {
	summary: string;
	learningObjective: string | null;
}

export interface ByokCueInput {
	heading: string;
	content: string;
	noteContext?: string;
	preset: string;
	options?: ByokCueGenerationOptions;
}

export interface ByokCueBatchResult {
	cue?: ByokCueOutput;
	error?: string;
}

export interface ByokSummaryInput {
	noteTitle: string;
	fullText: string;
	sectionQuestions: string[];
}

export interface ByokProviderRuntime {
	id: ByokProviderId;
	label: string;
	requiresNetwork: boolean;
	requiresDownload: boolean;
	sectionConcurrencyLimit?: number;
	testConnection(): Promise<ByokProviderStatus>;
	listModels?(): Promise<ByokListedModel[]>;
	generateCue(
		input: ByokCueInput,
		signal?: AbortSignal
	): Promise<ByokCueOutput>;
	generateCues?(
		inputs: ByokCueInput[],
		signal?: AbortSignal
	): Promise<ByokCueBatchResult[]>;
	generateSummary(
		input: ByokSummaryInput,
		signal?: AbortSignal
	): Promise<ByokSummaryOutput>;
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
