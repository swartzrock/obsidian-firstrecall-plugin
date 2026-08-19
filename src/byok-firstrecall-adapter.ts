import {
	BYOK_PROVIDER_IDS,
	ByokProviderError,
	isByokProviderId,
	listModels,
	normalizeProviderId,
	parseByokStoredSettings,
	type ByokModelOption,
	type ByokProviderConfig,
	type ByokProviderDeps,
	type ByokProviderId,
	type ByokProviderRuntime,
	type ByokProviderStoredSettings,
	type ByokSetupStatus,
	type ByokStoredSettings,
	type ByokTransport,
	type ByokVerificationSnapshotMap,
} from "@swartzrock/byok-runtime";
import { createByokNodeProvider } from "@swartzrock/byok-runtime/node";
import { byokProviderDefinition } from "./byok-provider-metadata";
import {
	deriveProviderSetupStatus,
	recordProviderConnectionSuccess,
} from "./byok-setup-status";
import { sortFetchedModelIds } from "./byok-model-options";
import {
	
	buildSectionCuePrompt,
} from "./cue-instructions";
import {
	buildCueBatchPrompt,
	cueBatchJsonSchema,
	parseCueBatch,
} from "./local-cli-cue-batch";
import type {
	FirstRecallCueInput,
	FirstRecallNoteBriefInput,
	FirstRecallCueProviderRuntime,
} from "./cue-provider";
import {
	buildNoteBriefPrompt,
	
	NOTE_BRIEF_JSON_SCHEMA,
	SUMMARY_JSON_SCHEMA,
} from "./study-material-instructions";
import {
	cueGenerationResponseSchema,
	cueOutputSchema,
	formatZodError,
	INSUFFICIENT_SOURCE_ERROR,
	isInsufficientSource,
	noteBriefGenerationSchema,
	noteBriefOutputSchema,
	validateCueResponse,
	validateNoteBrief,
	type CueOutput,
	type NoteBriefOutput,
} from "./schemas";
import type { FirstRecallSettings } from "./settings";
import {
	isFirstRecallCloudCredentialProvider,
	type FirstRecallCloudCredentialProvider,
	type SecureCredentialStore,
} from "./secure-credential-store";

export type FirstRecallByokRuntime = FirstRecallCueProviderRuntime;
export type FirstRecallTransport = ByokTransport;
export type FirstRecallProviderFactoryDeps = ByokProviderDeps;
export type FirstRecallProviderConnectionStatusMap = ByokVerificationSnapshotMap;
export type { ByokProviderConfig, ByokProviderDeps } from "@swartzrock/byok-runtime";

type FirstRecallApiKeyProvider = Extract<
	ByokProviderConfig,
	{ apiKey: string }
>["provider"];
type FirstRecallUrlProvider = Extract<
	ByokProviderConfig,
	{ url?: string }
>["provider"];
type FirstRecallCommandProvider = Extract<
	ByokProviderConfig,
	{ command: string }
>["provider"];
export type {
	FirstRecallCueBatchResult,
	FirstRecallCueInput,
	FirstRecallCueOutput,
	FirstRecallNoteBriefInput,
	FirstRecallNoteBriefOutput,
} from "./cue-provider";

export type FirstRecallFetchedModelProvider =
	ByokProviderId;

export interface FirstRecallAppliedModelRefresh {
	models: string[];
	options: ByokModelOption[];
	message: string;
}

const CUE_OUTPUT_JSON_SCHEMA = {
	type: "object",
	properties: {
		question: { type: "string" },
		keywords: {
			type: "array",
			items: { type: "string" },
			minItems: 2,
			maxItems: 5,
		},
		summary: SUMMARY_JSON_SCHEMA,
	},
	required: ["question", "keywords", "summary"],
	additionalProperties: false,
};

const INSUFFICIENT_SOURCE_JSON_SCHEMA = {
	type: "object",
	properties: {
		insufficientSource: { const: true },
	},
	required: ["insufficientSource"],
	additionalProperties: false,
};

const CUE_JSON_SCHEMA = JSON.stringify({
	oneOf: [CUE_OUTPUT_JSON_SCHEMA, INSUFFICIENT_SOURCE_JSON_SCHEMA],
});

const NOTE_BRIEF_SCHEMA = JSON.stringify(NOTE_BRIEF_JSON_SCHEMA);

function firstRecallProviderError(message: string): ByokProviderError {
	return new ByokProviderError(message);
}

function debugModelTextFailure(kind: string, stage: "initial" | "repair", text: string, error: string): void {
	console.warn("[FirstRecall BYOK] Model output validation failed", {
		kind,
		stage,
		error,
		textLength: text.length,
		textPreview: text.slice(0, 500),
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseJsonRecord(text: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(text);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function normalizeOllamaJsonRequestBody(body: string | undefined): string | undefined {
	if (!body) return body;
	const parsed = parseJsonRecord(body);
	if (!isRecord(parsed) || parsed.format === undefined) return body;
	return JSON.stringify({ ...parsed, think: false });
}

async function normalizeOllamaJsonResponse(response: Response): Promise<Response> {
	const text = await response.clone().text();
	const record = parseJsonRecord(text);
	if (!record) return response;
	const generatedText = record.response;
	const thinkingText = record.thinking;
	if (
		typeof generatedText === "string" &&
		generatedText.trim() === "" &&
		typeof thinkingText === "string" &&
		thinkingText.trim()
	) {
		const json = { ...record, response: thinkingText };
		const headers = new Headers(response.headers);
		headers.delete("content-length");
		return new Response(JSON.stringify(json), {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	}
	if (typeof generatedText === "string" && generatedText.trim() === "") {
		console.warn("[FirstRecall BYOK] Ollama returned an empty JSON response", {
			status: response.status,
			responseKeys: Object.keys(record),
			responseLength: generatedText.length,
			thinkingLength: typeof thinkingText === "string" ? thinkingText.length : undefined,
			textLength: text.length,
			textPreview: text.slice(0, 500),
		});
	}
	return response;
}

function firstRecallProviderDeps(
	config: ByokProviderConfig,
	deps: FirstRecallProviderFactoryDeps
): FirstRecallProviderFactoryDeps {
	if (config.provider !== "ollama") return deps;
	return {
		...deps,
		transport: async (request) => {
			const body = normalizeOllamaJsonRequestBody(
				request.body === null ? undefined : await request.clone().text()
			);
			let normalizedRequest = request;
			if (body !== undefined) {
				const headers = new Headers(request.headers);
				headers.delete("content-length");
				normalizedRequest = new Request(request, { body, headers });
			}
			const response = await deps.transport(normalizedRequest);
			return normalizeOllamaJsonResponse(response);
		},
	};
}

async function generateCueFromObjectProvider(
	runtime: ByokProviderRuntime,
	input: FirstRecallCueInput,
	signal?: AbortSignal
): Promise<CueOutput> {
	if (!runtime.generateObject) {
		throw firstRecallProviderError("Provider does not support structured output.");
	}
	const raw = await runtime.generateObject({
		schema: cueGenerationResponseSchema,
		prompt: buildSectionCuePrompt(input),
	}, signal);
	const response = cueGenerationResponseSchema.safeParse(raw);
	if (!response.success) {
		throw firstRecallProviderError(
			`Model output could not be validated: ${formatZodError(response.error)}`
		);
	}
	if (isInsufficientSource(response.data)) {
		throw firstRecallProviderError(INSUFFICIENT_SOURCE_ERROR);
	}
	const parsed = cueOutputSchema.safeParse(raw);
	if (!parsed.success) {
		throw firstRecallProviderError(
			`Model output could not be validated: ${formatZodError(parsed.error)}`
		);
	}
	return parsed.data;
}

async function generateCueFromTextProvider(
	runtime: ByokProviderRuntime,
	input: FirstRecallCueInput,
	signal?: AbortSignal
): Promise<CueOutput> {
	const basePrompt = buildSectionCuePrompt(input);
	const raw = await runtime.generateText(
		{
			prompt: basePrompt,
			responseFormat: "json",
			jsonSchema: CUE_JSON_SCHEMA,
		},
		signal
	);
	let result = validateCueResponse(raw.text);
	if (!result.ok) {
		debugModelTextFailure("cue", "initial", raw.text, result.error);
		const repairPrompt =
			basePrompt +
			`\nYour previous reply could not be validated (${result.error}).\n` +
			`Previous reply:\n${raw.text}\n` +
			`Reply again with ONLY the corrected JSON object.`;
		const retry = await runtime.generateText(
			{
				prompt: repairPrompt,
				responseFormat: "json",
				jsonSchema: CUE_JSON_SCHEMA,
			},
			signal
		);
		result = validateCueResponse(retry.text);
		if (!result.ok) {
			debugModelTextFailure("cue", "repair", retry.text, result.error);
		}
	}
	if (!result.ok) {
		throw firstRecallProviderError(`Model output could not be validated: ${result.error}`);
	}
	if (isInsufficientSource(result.value)) {
		throw firstRecallProviderError(INSUFFICIENT_SOURCE_ERROR);
	}
	return result.value;
}

async function generateNoteBriefFromObjectProvider(
	runtime: ByokProviderRuntime,
	input: FirstRecallNoteBriefInput,
	signal?: AbortSignal
): Promise<NoteBriefOutput> {
	if (!runtime.generateObject) {
		throw firstRecallProviderError("Provider does not support structured output.");
	}
	const raw = await runtime.generateObject({
		schema: noteBriefGenerationSchema,
		prompt: buildNoteBriefPrompt(input),
	}, signal);
	const parsed = noteBriefOutputSchema.safeParse(raw);
	if (!parsed.success) {
		throw firstRecallProviderError(
			`Model output could not be validated: ${formatZodError(parsed.error)}`
		);
	}
	return parsed.data;
}

async function generateNoteBriefFromTextProvider(
	runtime: ByokProviderRuntime,
	input: FirstRecallNoteBriefInput,
	signal?: AbortSignal
): Promise<NoteBriefOutput> {
	const basePrompt = buildNoteBriefPrompt(input);
	const raw = await runtime.generateText(
		{
			prompt: basePrompt,
			responseFormat: "json",
			jsonSchema: NOTE_BRIEF_SCHEMA,
		},
		signal
	);
	let result = validateNoteBrief(raw.text);
	if (!result.ok) {
		debugModelTextFailure("noteBrief", "initial", raw.text, result.error);
		const repairPrompt =
			basePrompt +
			`\nYour previous reply could not be validated (${result.error}).\n` +
			`Reply again with ONLY the corrected JSON object.`;
		const retry = await runtime.generateText(
			{
				prompt: repairPrompt,
				responseFormat: "json",
				jsonSchema: NOTE_BRIEF_SCHEMA,
			},
			signal
		);
		result = validateNoteBrief(retry.text);
		if (!result.ok) {
			debugModelTextFailure("noteBrief", "repair", retry.text, result.error);
		}
	}
	if (!result.ok) {
		throw firstRecallProviderError(`Model output could not be validated: ${result.error}`);
	}
	return result.value;
}

async function generateCueBatchFromTextProvider(
	runtime: ByokProviderRuntime,
	inputs: FirstRecallCueInput[],
	signal?: AbortSignal
) {
	if (inputs.length === 0) return [];
	const schema = cueBatchJsonSchema(inputs.length);
	const basePrompt = buildCueBatchPrompt(inputs);
	const raw = await runtime.generateText(
		{
			prompt: basePrompt,
			responseFormat: "json",
			jsonSchema: schema,
		},
		signal
	);
	let result = parseCueBatch(raw.text, inputs.length);
	const itemErrors = (batch: Exclude<typeof result, string>) =>
		batch.results.flatMap((item, index) =>
			item.error && item.error !== INSUFFICIENT_SOURCE_ERROR
				? [`section ${index + 1}: ${item.error}`]
				: []
		);
	const initialError =
		typeof result === "string" ? result : itemErrors(result).join("; ");
	if (initialError) {
		debugModelTextFailure("cueBatch", "initial", raw.text, initialError);
		const repairPrompt =
			basePrompt +
			`\nYour previous reply could not be validated (${initialError}).\n` +
			`Previous reply:\n${raw.text}\n` +
			`Reply again with ONLY the corrected JSON object.`;
		const retry = await runtime.generateText(
			{
				prompt: repairPrompt,
				responseFormat: "json",
				jsonSchema: schema,
			},
			signal
		);
		result = parseCueBatch(retry.text, inputs.length);
		const repairError =
			typeof result === "string" ? result : itemErrors(result).join("; ");
		if (repairError) {
			debugModelTextFailure("cueBatch", "repair", retry.text, repairError);
		}
	}
	if (typeof result === "string") {
		throw firstRecallProviderError(`Model output could not be validated: ${result}`);
	}
	return result.results;
}

export function wrapFirstRecallByokRuntime(
	runtime: ByokProviderRuntime
): FirstRecallByokRuntime {
	const generateFromObject = Boolean(runtime.generateObject);
	const cueRuntime: FirstRecallByokRuntime = {
		id: runtime.id,
		label: runtime.label,
		requiresNetwork: runtime.requiresNetwork,
		requiresDownload: runtime.requiresDownload,
		sectionConcurrencyLimit: runtime.sectionConcurrencyLimit,
		testConnection: () => runtime.testConnection(),
		listModels: () => runtime.listModels(),
		generateCue: (input, signal) => {
			return generateFromObject
				? generateCueFromObjectProvider(runtime, input, signal)
				: generateCueFromTextProvider(runtime, input, signal);
		},
		generateNoteBrief: (input, signal) => {
			return generateFromObject
				? generateNoteBriefFromObjectProvider(runtime, input, signal)
				: generateNoteBriefFromTextProvider(runtime, input, signal);
		},
	};
	if (runtime.id === "codex-cli" || runtime.id === "claude-cli") {
		cueRuntime.generateCues = (inputs, signal) => {
			return generateCueBatchFromTextProvider(runtime, inputs, signal);
		};
	}
	return cueRuntime;
}

export class FirstRecallCredentialUnavailableError extends Error {
	constructor(
		readonly provider: FirstRecallCloudCredentialProvider,
		readonly reason: string,
		message: string
	) {
		super(message);
		this.name = "FirstRecallCredentialUnavailableError";
	}
}

export interface FirstRecallCredentialStorageResult {
	settingsChanged: boolean;
	warnings: string[];
	securedProviders: FirstRecallCloudCredentialProvider[];
}

type ProviderSettingsDefaults = Pick<
	FirstRecallSettings,
	"byok"
>;

export function normalizeFirstRecallProviderSettings(
	settings: FirstRecallSettings,
	defaults: ProviderSettingsDefaults,
	rawSettings: unknown = settings
): void {
	settings.byok = normalizeFirstRecallByokSettings(defaults.byok, rawSettings);
}

function emptyStoredProviderSettings(): ByokProviderStoredSettings {
	return {
		credential: "",
		credentialSaved: false,
		credentialUpdatedAt: "",
		credentialLength: 0,
		model: "",
		modelSelection: "",
		availableModels: [],
		modelOptions: [],
		hasFetchedModels: false,
		modelRefreshMessage: "",
	};
}

function normalizeFirstRecallByokSettings(
	defaults: FirstRecallSettings["byok"],
	rawSettings: unknown
): FirstRecallSettings["byok"] {
	const rawByok = (rawSettings as { byok?: unknown } | null | undefined)?.byok;
	const hasRawByok = Boolean(
		rawByok &&
			typeof rawByok === "object" &&
			"providers" in rawByok
	);
	const existing = hasRawByok
		? (rawByok as Partial<FirstRecallSettings["byok"]>)
		: {};
	const parsed = parseByokStoredSettings(hasRawByok ? rawByok : defaults);
	const providers: ByokStoredSettings["providers"] = {};
	for (const provider of BYOK_PROVIDER_IDS) {
		providers[provider] = {
			...emptyStoredProviderSettings(),
			...(parsed.providers[provider] ?? defaults.providers[provider]),
		};
	}
	return {
		selectedProvider: normalizeFirstRecallSelectedProvider(
			existing.selectedProvider ?? defaults.selectedProvider
		),
		providers,
		verification: parsed.verification,
	};
}

function normalizeFirstRecallSelectedProvider(value: unknown): ByokProviderId | null {
	if (isByokProviderId(value)) return value;
	if (value === "codex" || value === "claude") return normalizeProviderId(value);
	return null;
}

export function firstRecallSelectedProvider(
	settings: FirstRecallSettings
): ByokProviderId | null {
	return normalizeFirstRecallSelectedProvider(
		(settings.byok as { selectedProvider?: unknown } | undefined)
			?.selectedProvider
	);
}

function requireFirstRecallSelectedProvider(
	settings: FirstRecallSettings
): ByokProviderId {
	const provider = firstRecallSelectedProvider(settings);
	if (!provider) throw firstRecallProviderError("Choose an AI provider in Settings.");
	return provider;
}

export function setFirstRecallSelectedProvider(
	settings: FirstRecallSettings,
	provider: ByokProviderId
): void {
	ensureFirstRecallByokSettings(settings).selectedProvider = provider;
}

function ensureFirstRecallByokSettings(
	settings: FirstRecallSettings
): FirstRecallSettings["byok"] {
	const maybeSettings = settings as FirstRecallSettings & {
		byok?: FirstRecallSettings["byok"];
	};
	if (!maybeSettings.byok?.providers) {
		maybeSettings.byok = {
			selectedProvider: null,
			providers: {},
			verification: {},
		};
		return maybeSettings.byok;
	}
	if (!maybeSettings.byok.verification) {
		maybeSettings.byok.verification = {};
	}
	return maybeSettings.byok;
}

export function firstRecallProviderSettings(
	settings: FirstRecallSettings,
	provider?: ByokProviderId
): ByokProviderStoredSettings {
	provider ??= requireFirstRecallSelectedProvider(settings);
	const providers = ensureFirstRecallByokSettings(settings).providers;
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
	if (
		typeof stored.credentialLength !== "number" ||
		!Number.isFinite(stored.credentialLength) ||
		stored.credentialLength < 0
	) {
		stored.credentialLength = 0;
	} else {
		stored.credentialLength = Math.floor(stored.credentialLength);
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

export function setFirstRecallProviderCredential(
	settings: FirstRecallSettings,
	provider: ByokProviderId,
	value: string
): void {
	firstRecallProviderSettings(settings, provider).credential = value;
}

export function setFirstRecallProviderCredentialMetadata(
	settings: FirstRecallSettings,
	provider: ByokProviderId,
	metadata: { saved: boolean; token: string; length: number }
): void {
	const stored = firstRecallProviderSettings(settings, provider);
	stored.credentialSaved = metadata.saved;
	stored.credentialUpdatedAt = metadata.token;
	stored.credentialLength = metadata.length;
}

export function clearFirstRecallProviderCredentialMetadata(
	settings: FirstRecallSettings,
	provider: ByokProviderId
): void {
	setFirstRecallProviderCredentialMetadata(settings, provider, {
		saved: false,
		token: "",
		length: 0,
	});
}

export function clearFirstRecallStoredCloudCredential(
	settings: FirstRecallSettings,
	provider: FirstRecallCloudCredentialProvider
): void {
	firstRecallProviderSettings(settings, provider).credential = "";
	clearFirstRecallProviderCredentialMetadata(settings, provider);
}

export function markFirstRecallCloudCredentialSaved(
	settings: FirstRecallSettings,
	provider: FirstRecallCloudCredentialProvider,
	token: string,
	length: number
): void {
	firstRecallProviderSettings(settings, provider).credential = "";
	setFirstRecallProviderCredentialMetadata(settings, provider, {
		saved: true,
		token,
		length,
	});
}

export function setFirstRecallProviderModel(
	settings: FirstRecallSettings,
	provider: ByokProviderId,
	value: string
): void {
	firstRecallProviderSettings(settings, provider).model = value;
}

export function firstRecallProviderConfigFromSettings(
	settings: FirstRecallSettings,
	opts: {
		cloudCredentials?: Partial<Record<FirstRecallCloudCredentialProvider, string>>;
	} = {}
): ByokProviderConfig {
	const provider = requireFirstRecallSelectedProvider(settings);
	const stored = firstRecallProviderSettings(settings, provider);
	const credentialKind = byokProviderDefinition(provider).credentialKind;
	if (credentialKind === "api-key") {
		const cloudProvider = provider as FirstRecallApiKeyProvider;
		return {
			provider: cloudProvider,
			apiKey: opts.cloudCredentials?.[cloudProvider] ?? stored.credential,
			model: stored.model,
		};
	}
	if (credentialKind === "command") {
		return {
			provider: provider as FirstRecallCommandProvider,
			command: stored.credential,
			model: stored.model,
		};
	}
	return {
		provider: provider as FirstRecallUrlProvider,
		url: stored.credential,
		model: stored.model,
	};
}

export function makeFirstRecallByokProvider(
	settings: FirstRecallSettings,
	deps: FirstRecallProviderFactoryDeps
): FirstRecallByokRuntime {
	const config = firstRecallProviderConfigFromSettings(settings);
	return wrapFirstRecallByokRuntime(
		createByokNodeProvider(config, firstRecallProviderDeps(config, deps))
	);
}

export async function resolveFirstRecallProviderConfigFromStore(
	settings: FirstRecallSettings,
	credentialStore: SecureCredentialStore
): Promise<ByokProviderConfig> {
	const provider = requireFirstRecallSelectedProvider(settings);
	if (!isFirstRecallCloudCredentialProvider(provider)) {
		return firstRecallProviderConfigFromSettings(settings);
	}
	const apiKey = await readFirstRecallCloudCredential(provider, credentialStore);
	return firstRecallProviderConfigFromSettings(settings, {
		cloudCredentials: { [provider]: apiKey },
	});
}

async function readFirstRecallCloudCredential(
	provider: FirstRecallCloudCredentialProvider,
	credentialStore: SecureCredentialStore
): Promise<string> {
	const result = await credentialStore.read(provider);
	if (!result.ok || !result.value) {
		const providerName = firstRecallProviderLabel(provider);
		throw new FirstRecallCredentialUnavailableError(
			provider,
			result.reason ?? "missing-credential",
			result.message ??
				`FirstRecall: ${providerName} API key is not available from secure storage.`
		);
	}
	return result.value;
}

export async function listFirstRecallProviderModelsFromStore(
	settings: FirstRecallSettings,
	provider: FirstRecallFetchedModelProvider,
	deps: FirstRecallProviderFactoryDeps,
	credentialStore: SecureCredentialStore
): Promise<ByokModelOption[]> {
	const stored = firstRecallProviderSettings(settings, provider);
	const definition = byokProviderDefinition(provider);
	if (!definition.supportsModelListing) {
		throw firstRecallProviderError("Provider does not support model discovery.");
	}
	if (definition.credentialKind === "api-key") {
		const cloudProvider = provider as FirstRecallCloudCredentialProvider;
		const apiKey = await readFirstRecallCloudCredential(cloudProvider, credentialStore);
		return listModels({ provider: cloudProvider, apiKey, deps });
	}
	if (definition.credentialKind === "url") {
		return listModels({
			provider: provider as FirstRecallUrlProvider,
			url: stored.credential,
			deps,
		});
	}
	const runtime = createByokNodeProvider(
		{
			provider: provider as FirstRecallCommandProvider,
			command: stored.credential,
			model: stored.model,
		},
		deps
	);
	return runtime.listModels();
}

export async function makeFirstRecallByokProviderFromStore(
	settings: FirstRecallSettings,
	deps: FirstRecallProviderFactoryDeps,
	credentialStore: SecureCredentialStore
): Promise<FirstRecallByokRuntime> {
	const config = await resolveFirstRecallProviderConfigFromStore(settings, credentialStore);
	return wrapFirstRecallByokRuntime(
		createByokNodeProvider(
			config,
			firstRecallProviderDeps(config, deps)
		)
	);
}

export function isFirstRecallLocalCliProvider(provider: ByokProviderId): boolean {
	return byokProviderDefinition(provider).credentialKind === "command";
}

export function firstRecallProviderLabel(provider: ByokProviderId): string {
	return byokProviderDefinition(provider).label;
}

export function firstRecallProviderCredential(
	settings: FirstRecallSettings,
	provider?: ByokProviderId
): string {
	provider ??= requireFirstRecallSelectedProvider(settings);
	return firstRecallProviderSettings(settings, provider).credential;
}

export function firstRecallProviderCredentialSaved(
	settings: FirstRecallSettings,
	provider?: ByokProviderId
): boolean {
	provider ??= requireFirstRecallSelectedProvider(settings);
	const stored = firstRecallProviderSettings(settings, provider);
	return isFirstRecallCloudCredentialProvider(provider)
		? Boolean(stored.credentialSaved) || stored.credential.trim().length > 0
		: stored.credential.trim().length > 0;
}

export function firstRecallProviderCredentialLength(
	settings: FirstRecallSettings,
	provider?: ByokProviderId
): number {
	provider ??= requireFirstRecallSelectedProvider(settings);
	const stored = firstRecallProviderSettings(settings, provider);
	if (isFirstRecallCloudCredentialProvider(provider)) {
		return stored.credentialSaved
			? stored.credentialLength ?? 0
			: stored.credential.trim().length;
	}
	return stored.credential.trim().length;
}

export async function secureFirstRecallCloudCredentials(
	settings: FirstRecallSettings,
	credentialStore: SecureCredentialStore
): Promise<FirstRecallCredentialStorageResult> {
	const result: FirstRecallCredentialStorageResult = {
		settingsChanged: false,
		warnings: [],
		securedProviders: [],
	};
	for (const provider of BYOK_PROVIDER_IDS) {
		if (!isFirstRecallCloudCredentialProvider(provider)) continue;
		const stored = firstRecallProviderSettings(settings, provider);
		const plaintext = stored.credential.trim();
		if (plaintext) {
			const saved = await credentialStore.save(provider, plaintext);
			if (!saved.ok || !saved.metadata) {
				result.warnings.push(
					`${firstRecallProviderLabel(provider)} API key could not be moved to secure storage: ${saved.message ?? saved.reason ?? "unknown error"}`
				);
				continue;
			}
			markFirstRecallCloudCredentialSaved(
				settings,
				provider,
				saved.metadata.token,
				saved.metadata.length
			);
			result.settingsChanged = true;
			result.securedProviders.push(provider);
			continue;
		}
		if (stored.credentialSaved) {
			const metadata = stored.credentialLength
				? null
				: await credentialStore.metadata(provider);
			if (metadata?.ok && metadata.metadata) {
				setFirstRecallProviderCredentialMetadata(settings, provider, {
					saved: true,
					token: metadata.metadata.token,
					length: metadata.metadata.length,
				});
				result.settingsChanged = true;
			}
			continue;
		}
		const metadata = await credentialStore.metadata(provider);
		if (metadata.ok && metadata.metadata) {
			markFirstRecallCloudCredentialSaved(
				settings,
				provider,
				metadata.metadata.token,
				metadata.metadata.length
			);
			result.settingsChanged = true;
		}
	}
	return result;
}

export function firstRecallProviderModel(
	settings: FirstRecallSettings,
	provider?: ByokProviderId
): string {
	provider ??= requireFirstRecallSelectedProvider(settings);
	return firstRecallProviderSettings(settings, provider).model;
}

export function deriveFirstRecallProviderSetupStatus(
	settings: FirstRecallSettings
): ByokSetupStatus {
	return deriveProviderSetupStatus({ byok: ensureFirstRecallByokSettings(settings) });
}

export function recordFirstRecallProviderConnectionSuccess(
	settings: FirstRecallSettings,
	testedAt?: string
): FirstRecallProviderConnectionStatusMap {
	const byok = ensureFirstRecallByokSettings(settings);
	const verification = recordProviderConnectionSuccess(
		{ byok },
		testedAt
	);
	byok.verification = verification;
	return verification;
}

export function resetFirstRecallFetchedModels(
	settings: FirstRecallSettings,
	provider: FirstRecallFetchedModelProvider,
	message: string
): void {
	const stored = firstRecallProviderSettings(settings, provider);
	stored.availableModels = [];
	stored.modelOptions = [];
	stored.hasFetchedModels = false;
	stored.modelRefreshMessage = message;
}

export function applyFirstRecallListedModels(
	settings: FirstRecallSettings,
	provider: FirstRecallFetchedModelProvider,
	options: ByokModelOption[],
	emptyMessage: string
): FirstRecallAppliedModelRefresh {
	const ids = options.map((option) => option.id);
	const models = sortFetchedModelIds(ids);
	const message = models.length > 0 ? "" : emptyMessage;
	const stored = firstRecallProviderSettings(settings, provider);
	stored.availableModels = models;
	stored.modelOptions = options;
	stored.hasFetchedModels = true;
	stored.modelRefreshMessage = message;

	return { models, options, message };
}

export function applyFirstRecallModelRefreshFailure(
	settings: FirstRecallSettings,
	provider: FirstRecallFetchedModelProvider,
	message: string
): void {
	const stored = firstRecallProviderSettings(settings, provider);
	stored.availableModels = [];
	stored.modelOptions = [];
	stored.hasFetchedModels = true;
	stored.modelRefreshMessage = message;
}

export function firstRecallFetchedModelCount(
	settings: FirstRecallSettings,
	provider: FirstRecallFetchedModelProvider
): number {
	return firstRecallProviderSettings(settings, provider).availableModels.length;
}

export function firstRecallModelRefreshMessage(
	settings: FirstRecallSettings,
	provider: FirstRecallFetchedModelProvider
): string {
	return firstRecallProviderSettings(settings, provider).modelRefreshMessage;
}
