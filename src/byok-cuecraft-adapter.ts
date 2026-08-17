import {
	BYOK_PROVIDER_IDS,
	ByokProviderError,
	isByokProviderId,
	listModels,
	normalizeProviderId,
	type ByokHttpClient,
	type ByokModelOption,
	type ByokProviderConfig,
	type ByokProviderDeps,
	type ByokProviderId,
	type ByokProviderRuntime,
	type ByokProviderStoredSettings,
	type ByokSetupStatus,
	type ByokStoredSettings,
	type ByokVerificationSnapshot,
	type ByokVerificationSnapshotMap,
} from "@swartzrock/byok-runtime";
import { createByokNodeProvider } from "@swartzrock/byok-runtime/node";
import { byokProviderDefinition } from "./byok-provider-metadata";
import {
	deriveProviderSetupStatus,
	recordProviderConnectionSuccess,
} from "./byok-setup-status";
import { sortFetchedModelIds } from "./byok-model-options";
import { DEFAULT_QUESTION_TYPE } from "./cue-generation";
import {
	buildSectionCueInstructionsTemplate,
	buildSectionCuePrompt,
} from "./cue-instructions";
import {
	buildCueBatchPrompt,
	cueBatchJsonSchema,
	parseCueBatch,
} from "./local-cli-cue-batch";
import type {
	CueCraftCueInput,
	CueCraftNoteBriefInput,
	CueCraftCueProviderRuntime,
} from "./cue-provider";
import {
	buildNoteBriefPrompt,
	buildNoteBriefInstructionsTemplate,
	NOTE_BRIEF_JSON_SCHEMA,
	SUMMARY_JSON_SCHEMA,
} from "./study-material-instructions";
import {
	cueGenerationSchema,
	cueOutputSchema,
	formatZodError,
	noteBriefGenerationSchema,
	noteBriefOutputSchema,
	validateCue,
	validateNoteBrief,
	type CueOutput,
	type NoteBriefOutput,
} from "./schemas";
import type { CueCraftSettings } from "./settings";
import {
	isCueCraftCloudCredentialProvider,
	type CueCraftCloudCredentialProvider,
	type SecureCredentialStore,
} from "./secure-credential-store";

export type CueCraftByokRuntime = CueCraftCueProviderRuntime;
export type CueCraftHttpClient = ByokHttpClient;
export type CueCraftProviderFactoryDeps = ByokProviderDeps;
export type CueCraftProviderConnectionStatusMap = ByokVerificationSnapshotMap;
export type { ByokProviderConfig, ByokProviderDeps } from "@swartzrock/byok-runtime";

type CueCraftApiKeyProvider = Extract<
	ByokProviderConfig,
	{ apiKey: string }
>["provider"];
type CueCraftUrlProvider = Extract<
	ByokProviderConfig,
	{ url?: string }
>["provider"];
type CueCraftCommandProvider = Extract<
	ByokProviderConfig,
	{ command: string }
>["provider"];
export type {
	CueCraftCueBatchResult,
	CueCraftCueInput,
	CueCraftCueOutput,
	CueCraftNoteBriefInput,
	CueCraftNoteBriefOutput,
} from "./cue-provider";

export type CueCraftFetchedModelProvider =
	ByokProviderId;

export interface CueCraftAppliedModelRefresh {
	models: string[];
	options: ByokModelOption[];
	message: string;
}

const CUE_JSON_SCHEMA = JSON.stringify({
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
});

const NOTE_BRIEF_SCHEMA = JSON.stringify(NOTE_BRIEF_JSON_SCHEMA);

type InstructionArtifact = "Section cue" | "Section cue batch" | "Note Brief";

function logInstructionTemplate(
	artifact: InstructionArtifact,
	instructions: string
): void {
	// eslint-disable-next-line obsidianmd/rule-custom-message -- User-requested prompt diagnostics in Obsidian DevTools.
	console.info(`[CueCraft BYOK] ${artifact} instructions\n${instructions}`);
}

function cueCraftProviderError(message: string): ByokProviderError {
	return new ByokProviderError(message);
}

function debugModelTextFailure(kind: string, stage: "initial" | "repair", text: string, error: string): void {
	console.warn("[CueCraft BYOK] Model output validation failed", {
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

function describeOllamaJsonRequest(body: string | undefined): Record<string, unknown> {
	const parsed = body ? parseJsonRecord(body) : null;
	return {
		bodyLength: body?.length ?? 0,
		model: typeof parsed?.model === "string" ? parsed.model : undefined,
		format: parsed?.format === undefined ? undefined : typeof parsed.format,
		think: parsed?.think,
		stream: parsed?.stream,
	};
}

function normalizeOllamaJsonRequestBody(body: string | undefined): string | undefined {
	if (!body) return body;
	const parsed = parseJsonRecord(body);
	if (!isRecord(parsed) || parsed.format === undefined) return body;
	return JSON.stringify({ ...parsed, think: false });
}

function normalizeOllamaJsonResponse(response: Awaited<ReturnType<ByokHttpClient>>) {
	const record = isRecord(response.json) ? response.json : parseJsonRecord(response.text);
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
		console.debug("[CueCraft BYOK] Recovered Ollama JSON response from thinking output", {
			thinkingLength: thinkingText.length,
			thinkingPreview: thinkingText.slice(0, 300),
		});
		return { ...response, json, text: JSON.stringify(json) };
	}
	if (typeof generatedText === "string" && generatedText.trim() === "") {
		console.warn("[CueCraft BYOK] Ollama returned an empty JSON response", {
			status: response.status,
			responseKeys: Object.keys(record),
			responseLength: generatedText.length,
			thinkingLength: typeof thinkingText === "string" ? thinkingText.length : undefined,
			textLength: response.text.length,
			textPreview: response.text.slice(0, 500),
		});
	}
	return response;
}

function cueCraftProviderDeps(
	config: ByokProviderConfig,
	deps: CueCraftProviderFactoryDeps
): CueCraftProviderFactoryDeps {
	if (config.provider !== "ollama") return deps;
	return {
		...deps,
		http: async (request) => {
			const body = normalizeOllamaJsonRequestBody(request.body);
			const requestSummary = describeOllamaJsonRequest(body);
			const response = await deps.http({ ...request, body });
			if (requestSummary.format !== undefined) {
				console.debug("[CueCraft BYOK] Ollama JSON request completed", {
					...requestSummary,
					status: response.status,
				});
			}
			return normalizeOllamaJsonResponse(response);
		},
	};
}

async function generateCueFromObjectProvider(
	runtime: ByokProviderRuntime,
	input: CueCraftCueInput,
	signal?: AbortSignal
): Promise<CueOutput> {
	if (!runtime.generateObject) {
		throw cueCraftProviderError("Provider does not support structured output.");
	}
	const raw = await runtime.generateObject({
		schema: cueGenerationSchema,
		prompt: buildSectionCuePrompt(input),
	}, signal);
	const parsed = cueOutputSchema.safeParse(raw);
	if (!parsed.success) {
		throw cueCraftProviderError(
			`Model output could not be validated: ${formatZodError(parsed.error)}`
		);
	}
	return parsed.data;
}

async function generateCueFromTextProvider(
	runtime: ByokProviderRuntime,
	input: CueCraftCueInput,
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
	let result = validateCue(raw.text);
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
		result = validateCue(retry.text);
		if (!result.ok) {
			debugModelTextFailure("cue", "repair", retry.text, result.error);
		}
	}
	if (!result.ok) {
		throw cueCraftProviderError(`Model output could not be validated: ${result.error}`);
	}
	return result.value;
}

async function generateNoteBriefFromObjectProvider(
	runtime: ByokProviderRuntime,
	input: CueCraftNoteBriefInput,
	signal?: AbortSignal
): Promise<NoteBriefOutput> {
	if (!runtime.generateObject) {
		throw cueCraftProviderError("Provider does not support structured output.");
	}
	const raw = await runtime.generateObject({
		schema: noteBriefGenerationSchema,
		prompt: buildNoteBriefPrompt(input),
	}, signal);
	const parsed = noteBriefOutputSchema.safeParse(raw);
	if (!parsed.success) {
		throw cueCraftProviderError(
			`Model output could not be validated: ${formatZodError(parsed.error)}`
		);
	}
	return parsed.data;
}

async function generateNoteBriefFromTextProvider(
	runtime: ByokProviderRuntime,
	input: CueCraftNoteBriefInput,
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
		throw cueCraftProviderError(`Model output could not be validated: ${result.error}`);
	}
	return result.value;
}

async function generateCueBatchFromTextProvider(
	runtime: ByokProviderRuntime,
	inputs: CueCraftCueInput[],
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
			item.error ? [`section ${index + 1}: ${item.error}`] : []
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
		throw cueCraftProviderError(`Model output could not be validated: ${result}`);
	}
	return result.results;
}

export function wrapCueCraftByokRuntime(
	runtime: ByokProviderRuntime
): CueCraftByokRuntime {
	const generateFromObject = Boolean(runtime.generateObject);
	const cueRuntime: CueCraftByokRuntime = {
		id: runtime.id,
		label: runtime.label,
		requiresNetwork: runtime.requiresNetwork,
		requiresDownload: runtime.requiresDownload,
		sectionConcurrencyLimit: runtime.sectionConcurrencyLimit,
		testConnection: () => runtime.testConnection(),
		listModels: () => runtime.listModels(),
		generateCue: (input, signal) => {
			logInstructionTemplate(
				"Section cue",
				buildSectionCueInstructionsTemplate(input.options.questionType, "single")
			);
			return generateFromObject
				? generateCueFromObjectProvider(runtime, input, signal)
				: generateCueFromTextProvider(runtime, input, signal);
		},
		generateNoteBrief: (input, signal) => {
			logInstructionTemplate("Note Brief", buildNoteBriefInstructionsTemplate());
			return generateFromObject
				? generateNoteBriefFromObjectProvider(runtime, input, signal)
				: generateNoteBriefFromTextProvider(runtime, input, signal);
		},
	};
	if (runtime.id === "codex-cli" || runtime.id === "claude-cli") {
		cueRuntime.generateCues = (inputs, signal) => {
			logInstructionTemplate(
				"Section cue batch",
				buildSectionCueInstructionsTemplate(
					inputs[0]?.options.questionType ?? DEFAULT_QUESTION_TYPE,
					"batch"
				)
			);
			return generateCueBatchFromTextProvider(runtime, inputs, signal);
		};
	}
	return cueRuntime;
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

export interface CueCraftCredentialStorageResult {
	settingsChanged: boolean;
	warnings: string[];
	securedProviders: CueCraftCloudCredentialProvider[];
}

type ProviderSettingsDefaults = Pick<
	CueCraftSettings,
	"byok"
>;

export function normalizeCueCraftProviderSettings(
	settings: CueCraftSettings,
	defaults: ProviderSettingsDefaults,
	rawSettings: unknown = settings
): void {
	settings.byok = normalizeCueCraftByokSettings(defaults.byok, rawSettings);
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

function normalizeStoredProviderSettings(
	value: unknown
): ByokProviderStoredSettings {
	const source = value && typeof value === "object"
		? value as Record<string, unknown>
		: {};
	const credentialLength = source.credentialLength;
	return {
		credential: typeof source.credential === "string" ? source.credential : "",
		credentialSaved:
			typeof source.credentialSaved === "boolean"
				? source.credentialSaved
				: false,
		credentialUpdatedAt:
			typeof source.credentialUpdatedAt === "string"
				? source.credentialUpdatedAt
				: "",
		credentialLength:
			typeof credentialLength === "number" &&
			Number.isFinite(credentialLength) &&
			credentialLength >= 0
				? Math.floor(credentialLength)
				: 0,
		model: typeof source.model === "string" ? source.model : "",
		modelSelection:
			typeof source.modelSelection === "string" ? source.modelSelection : "",
		availableModels: Array.isArray(source.availableModels)
			? source.availableModels.filter(
				(model): model is string => typeof model === "string"
			)
			: [],
		modelOptions: Array.isArray(source.modelOptions)
			? source.modelOptions.flatMap((option) => {
				if (!option || typeof option !== "object") return [];
				const record = option as Record<string, unknown>;
				return typeof record.id === "string" &&
					typeof record.label === "string"
					? [{ id: record.id, label: record.label }]
					: [];
			})
			: [],
		hasFetchedModels:
			typeof source.hasFetchedModels === "boolean"
				? source.hasFetchedModels
				: false,
		modelRefreshMessage:
			typeof source.modelRefreshMessage === "string"
				? source.modelRefreshMessage
				: "",
	};
}

function normalizeVerificationSnapshot(
	value: unknown
): ByokVerificationSnapshot | null {
	if (!value || typeof value !== "object") return null;
	const source = value as Record<string, unknown>;
	if (
		typeof source.credentialFingerprint !== "string" ||
		typeof source.modelId !== "string" ||
		typeof source.testedAt !== "string"
	) {
		return null;
	}
	return {
		credentialFingerprint: source.credentialFingerprint,
		...(typeof source.credentialToken === "string"
			? { credentialToken: source.credentialToken }
			: {}),
		modelId: source.modelId,
		testedAt: source.testedAt,
	};
}

function normalizeCueCraftByokSettings(
	defaults: CueCraftSettings["byok"],
	rawSettings: unknown
): CueCraftSettings["byok"] {
	const rawByok = (rawSettings as { byok?: unknown } | null | undefined)?.byok;
	const hasRawByok = Boolean(
		rawByok &&
			typeof rawByok === "object" &&
			"providers" in rawByok
	);
	const existing = hasRawByok
		? (rawByok as Partial<CueCraftSettings["byok"]>)
		: {};
	const providers: ByokStoredSettings["providers"] = {};
	const verification: ByokVerificationSnapshotMap = {};
	for (const provider of BYOK_PROVIDER_IDS) {
		const source = existing.providers?.[provider] ?? defaults.providers[provider];
		const stored = normalizeStoredProviderSettings(source);
		providers[provider] = stored;
		const snapshot = normalizeVerificationSnapshot(
			existing.verification?.[provider]
		);
		if (snapshot) verification[provider] = snapshot;
	}
	return {
		selectedProvider: normalizeCueCraftSelectedProvider(
			existing.selectedProvider ?? defaults.selectedProvider
		),
		providers,
		verification,
	};
}

function normalizeCueCraftSelectedProvider(value: unknown): ByokProviderId | null {
	if (isByokProviderId(value)) return value;
	if (value === "codex" || value === "claude") return normalizeProviderId(value);
	return null;
}

export function cueCraftSelectedProvider(
	settings: CueCraftSettings
): ByokProviderId | null {
	return normalizeCueCraftSelectedProvider(
		(settings.byok as { selectedProvider?: unknown } | undefined)
			?.selectedProvider
	);
}

function requireCueCraftSelectedProvider(
	settings: CueCraftSettings
): ByokProviderId {
	const provider = cueCraftSelectedProvider(settings);
	if (!provider) throw cueCraftProviderError("Choose an AI provider in Settings.");
	return provider;
}

export function setCueCraftSelectedProvider(
	settings: CueCraftSettings,
	provider: ByokProviderId
): void {
	ensureCueCraftByokSettings(settings).selectedProvider = provider;
}

function ensureCueCraftByokSettings(
	settings: CueCraftSettings
): CueCraftSettings["byok"] {
	const maybeSettings = settings as CueCraftSettings & {
		byok?: CueCraftSettings["byok"];
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

export function cueCraftProviderSettings(
	settings: CueCraftSettings,
	provider?: ByokProviderId
): ByokProviderStoredSettings {
	provider ??= requireCueCraftSelectedProvider(settings);
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
	metadata: { saved: boolean; token: string; length: number }
): void {
	const stored = cueCraftProviderSettings(settings, provider);
	stored.credentialSaved = metadata.saved;
	stored.credentialUpdatedAt = metadata.token;
	stored.credentialLength = metadata.length;
}

export function clearCueCraftProviderCredentialMetadata(
	settings: CueCraftSettings,
	provider: ByokProviderId
): void {
	setCueCraftProviderCredentialMetadata(settings, provider, {
		saved: false,
		token: "",
		length: 0,
	});
}

export function clearCueCraftStoredCloudCredential(
	settings: CueCraftSettings,
	provider: CueCraftCloudCredentialProvider
): void {
	cueCraftProviderSettings(settings, provider).credential = "";
	clearCueCraftProviderCredentialMetadata(settings, provider);
}

export function markCueCraftCloudCredentialSaved(
	settings: CueCraftSettings,
	provider: CueCraftCloudCredentialProvider,
	token: string,
	length: number
): void {
	cueCraftProviderSettings(settings, provider).credential = "";
	setCueCraftProviderCredentialMetadata(settings, provider, {
		saved: true,
		token,
		length,
	});
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
	const provider = requireCueCraftSelectedProvider(settings);
	const stored = cueCraftProviderSettings(settings, provider);
	const credentialKind = byokProviderDefinition(provider).credentialKind;
	if (credentialKind === "api-key") {
		const cloudProvider = provider as CueCraftApiKeyProvider;
		return {
			provider: cloudProvider,
			apiKey: opts.cloudCredentials?.[cloudProvider] ?? stored.credential,
			model: stored.model,
		};
	}
	if (credentialKind === "command") {
		return {
			provider: provider as CueCraftCommandProvider,
			command: stored.credential,
			model: stored.model,
		};
	}
	return {
		provider: provider as CueCraftUrlProvider,
		url: stored.credential,
		model: stored.model,
	};
}

export function makeCueCraftByokProvider(
	settings: CueCraftSettings,
	deps: CueCraftProviderFactoryDeps
): CueCraftByokRuntime {
	const config = cueCraftProviderConfigFromSettings(settings);
	return wrapCueCraftByokRuntime(
		createByokNodeProvider(config, cueCraftProviderDeps(config, deps))
	);
}

export async function resolveCueCraftProviderConfigFromStore(
	settings: CueCraftSettings,
	credentialStore: SecureCredentialStore
): Promise<ByokProviderConfig> {
	const provider = requireCueCraftSelectedProvider(settings);
	if (!isCueCraftCloudCredentialProvider(provider)) {
		return cueCraftProviderConfigFromSettings(settings);
	}
	const apiKey = await readCueCraftCloudCredential(provider, credentialStore);
	return cueCraftProviderConfigFromSettings(settings, {
		cloudCredentials: { [provider]: apiKey },
	});
}

async function readCueCraftCloudCredential(
	provider: CueCraftCloudCredentialProvider,
	credentialStore: SecureCredentialStore
): Promise<string> {
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
	return result.value;
}

export async function listCueCraftProviderModelsFromStore(
	settings: CueCraftSettings,
	provider: CueCraftFetchedModelProvider,
	deps: CueCraftProviderFactoryDeps,
	credentialStore: SecureCredentialStore
): Promise<ByokModelOption[]> {
	const stored = cueCraftProviderSettings(settings, provider);
	const definition = byokProviderDefinition(provider);
	if (!definition.supportsModelListing) {
		throw cueCraftProviderError("Provider does not support model discovery.");
	}
	if (definition.credentialKind === "api-key") {
		const cloudProvider = provider as CueCraftCloudCredentialProvider;
		const apiKey = await readCueCraftCloudCredential(cloudProvider, credentialStore);
		return listModels({ provider: cloudProvider, apiKey, deps });
	}
	if (definition.credentialKind === "url") {
		return listModels({
			provider: provider as CueCraftUrlProvider,
			url: stored.credential,
			deps,
		});
	}
	const runtime = createByokNodeProvider(
		{
			provider: provider as CueCraftCommandProvider,
			command: stored.credential,
			model: stored.model,
		},
		deps
	);
	return runtime.listModels();
}

export async function makeCueCraftByokProviderFromStore(
	settings: CueCraftSettings,
	deps: CueCraftProviderFactoryDeps,
	credentialStore: SecureCredentialStore
): Promise<CueCraftByokRuntime> {
	const config = await resolveCueCraftProviderConfigFromStore(settings, credentialStore);
	return wrapCueCraftByokRuntime(
		createByokNodeProvider(
			config,
			cueCraftProviderDeps(config, deps)
		)
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
	provider?: ByokProviderId
): string {
	provider ??= requireCueCraftSelectedProvider(settings);
	return cueCraftProviderSettings(settings, provider).credential;
}

export function cueCraftProviderCredentialSaved(
	settings: CueCraftSettings,
	provider?: ByokProviderId
): boolean {
	provider ??= requireCueCraftSelectedProvider(settings);
	const stored = cueCraftProviderSettings(settings, provider);
	return isCueCraftCloudCredentialProvider(provider)
		? Boolean(stored.credentialSaved) || stored.credential.trim().length > 0
		: stored.credential.trim().length > 0;
}

export function cueCraftProviderCredentialLength(
	settings: CueCraftSettings,
	provider?: ByokProviderId
): number {
	provider ??= requireCueCraftSelectedProvider(settings);
	const stored = cueCraftProviderSettings(settings, provider);
	if (isCueCraftCloudCredentialProvider(provider)) {
		return stored.credentialSaved
			? stored.credentialLength ?? 0
			: stored.credential.trim().length;
	}
	return stored.credential.trim().length;
}

export async function secureCueCraftCloudCredentials(
	settings: CueCraftSettings,
	credentialStore: SecureCredentialStore
): Promise<CueCraftCredentialStorageResult> {
	const result: CueCraftCredentialStorageResult = {
		settingsChanged: false,
		warnings: [],
		securedProviders: [],
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
				setCueCraftProviderCredentialMetadata(settings, provider, {
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
			markCueCraftCloudCredentialSaved(
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

export function cueCraftProviderModel(
	settings: CueCraftSettings,
	provider?: ByokProviderId
): string {
	provider ??= requireCueCraftSelectedProvider(settings);
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
	provider: CueCraftFetchedModelProvider,
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
	options: ByokModelOption[],
	emptyMessage: string
): CueCraftAppliedModelRefresh {
	const ids = options.map((option) => option.id);
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
