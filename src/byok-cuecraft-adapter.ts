import {
	BYOK_PROVIDER_IDS,
	ByokProviderError,
	byokProviderDefinition,
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
	type ByokVerificationSnapshotMap,
} from "@swartzrock/byok-runtime";
import { createByokNodeProvider } from "@swartzrock/byok-runtime/node";
import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";
import { normalizeAnthropicModelSelection } from "./anthropic-model-options";
import {
	deriveProviderSetupStatus,
	recordProviderConnectionSuccess,
} from "./byok-setup-status";
import { sortFetchedModelIds } from "./byok-model-options";
import {
	cueDensityGuidance,
	keywordGuidance,
	questionStyleGuidance,
} from "./cue-generation";
import {
	buildCueBatchPrompt,
	cueBatchJsonSchema,
	parseCueBatch,
} from "./local-cli-cue-batch";
import type {
	CueCraftCueInput,
	CueCraftNoteBriefInput,
	CueCraftCueProviderRuntime,
	CueCraftSummaryInput,
} from "./cue-provider";
import {
	buildNoteBriefPrompt,
	NOTE_BRIEF_JSON_SCHEMA,
	SECTION_LENS_JSON_SCHEMA,
	SECTION_LENS_PROMPT,
} from "./review-artifact-prompts";
import {
	CUE_CATEGORY_PROMPT_VALUES,
	CUE_CATEGORY_VALUES,
	cueGenerationSchema,
	cueOutputSchema,
	formatZodError,
	noteBriefGenerationSchema,
	noteBriefOutputSchema,
	summaryGenerationSchema,
	summaryOutputSchema,
	validateCue,
	validateNoteBrief,
	validateSummary,
	type CueOutput,
	type NoteBriefOutput,
	type SummaryOutput,
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
export type CueCraftByokSettings = ByokStoredSettings;
export type CueCraftByokProviderSettings = ByokProviderStoredSettings;
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
	CueCraftSummaryInput,
	CueCraftSummaryOutput,
} from "./cue-provider";

export type CueCraftFetchedModelProvider =
	ByokProviderId;

export interface CueCraftAppliedModelRefresh {
	models: string[];
	options: ByokModelOption[];
	message: string;
}

const PRESET_GUIDANCE: Record<string, string> = {
	conceptual: "Favor a single conceptual question that tests understanding, not trivia.",
	"exam-prep": "Write an exam-style question a student is likely to be tested on.",
	vocabulary: "Emphasize key terms and their definitions.",
	minimal: "Keep the question short and direct.",
	simpler: "Use simple, accessible language. Keep the question brief and focused on the single most basic idea.",
};

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
		confidence: { enum: ["high", "medium", "low"] },
		category: { enum: CUE_CATEGORY_VALUES },
		rationale: { type: "string" },
		sectionLens: SECTION_LENS_JSON_SCHEMA,
	},
	required: ["question", "keywords", "confidence", "sectionLens"],
	additionalProperties: false,
});

const SUMMARY_JSON_SCHEMA = JSON.stringify({
	type: "object",
	properties: {
		summary: { type: "string" },
		learningObjective: { type: "string" },
	},
	required: ["summary"],
	additionalProperties: false,
});

const NOTE_BRIEF_SCHEMA = JSON.stringify(NOTE_BRIEF_JSON_SCHEMA);

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

function buildCuePrompt(input: CueCraftCueInput): string {
	const preset = PRESET_GUIDANCE[input.preset] ?? PRESET_GUIDANCE.conceptual;
	const contextLine = input.noteContext
		? `\nWhole-note context (for relevance only):\n${input.noteContext}\n`
		: "";
	return (
		`You are a study assistant creating Cornell-style active-recall cues.\n` +
		`${preset}\n` +
		`${questionStyleGuidance(input.options?.questionStyle)}\n` +
		`${cueDensityGuidance(input.options?.cueDensity)}\n` +
		`${keywordGuidance(input.options?.generateKeywords ?? true)}\n` +
		`Return ONLY a JSON object with keys: "question" (string), ` +
		`"keywords" (array of 2 to 5 short strings), "confidence" ("high" | "medium" | "low"), ` +
		`optional "category" (${CUE_CATEGORY_PROMPT_VALUES}) when the section clearly fits one of those semantic families, ` +
		`optional "rationale" (short reason, only when confidence is "low"), ` +
		`and "sectionLens" (object).\n` +
		`${SECTION_LENS_PROMPT}\n` +
		contextLine +
		`\nSection heading: ${input.heading || "(untitled)"}\n` +
		`Section content:\n${input.content}\n`
	);
}

function buildSummaryPrompt(input: CueCraftSummaryInput): string {
	const questions = input.sectionQuestions.length
		? `\nSection questions to reflect:\n- ${input.sectionQuestions.join("\n- ")}\n`
		: "";
	return (
		`Summarize the following note for study review.\n` +
		`Return ONLY a JSON object with keys: "summary" (one concise study takeaway sentence, not a paragraph) ` +
		`and optional "learningObjective" (one short sentence).\n` +
		`\nNote title: ${input.noteTitle}\n` +
		questions +
		`\nNote text:\n${input.fullText}\n`
	);
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
		prompt: buildCuePrompt(input),
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
	const basePrompt = buildCuePrompt(input);
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

async function generateSummaryFromObjectProvider(
	runtime: ByokProviderRuntime,
	input: CueCraftSummaryInput,
	signal?: AbortSignal
): Promise<SummaryOutput> {
	if (!runtime.generateObject) {
		throw cueCraftProviderError("Provider does not support structured output.");
	}
	const raw = await runtime.generateObject({
		schema: summaryGenerationSchema,
		prompt: buildSummaryPrompt(input),
	}, signal);
	const parsed = summaryOutputSchema.safeParse(raw);
	if (!parsed.success) {
		throw cueCraftProviderError(
			`Model output could not be validated: ${formatZodError(parsed.error)}`
		);
	}
	return parsed.data;
}

async function generateSummaryFromTextProvider(
	runtime: ByokProviderRuntime,
	input: CueCraftSummaryInput,
	signal?: AbortSignal
): Promise<SummaryOutput> {
	const basePrompt = buildSummaryPrompt(input);
	const raw = await runtime.generateText(
		{
			prompt: basePrompt,
			responseFormat: "json",
			jsonSchema: SUMMARY_JSON_SCHEMA,
		},
		signal
	);
	let result = validateSummary(raw.text);
	if (!result.ok) {
		debugModelTextFailure("summary", "initial", raw.text, result.error);
		const repairPrompt =
			basePrompt +
			`\nYour previous reply could not be validated (${result.error}).\n` +
			`Reply again with ONLY the corrected JSON object.`;
		const retry = await runtime.generateText(
			{
				prompt: repairPrompt,
				responseFormat: "json",
				jsonSchema: SUMMARY_JSON_SCHEMA,
			},
			signal
		);
		result = validateSummary(retry.text);
		if (!result.ok) {
			debugModelTextFailure("summary", "repair", retry.text, result.error);
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
	const basePrompt = buildCueBatchPrompt(inputs, PRESET_GUIDANCE);
	const raw = await runtime.generateText(
		{
			prompt: basePrompt,
			responseFormat: "json",
			jsonSchema: schema,
		},
		signal
	);
	let result = parseCueBatch(raw.text, inputs.length);
	if (typeof result === "string") {
		debugModelTextFailure("cueBatch", "initial", raw.text, result);
		const repairPrompt =
			basePrompt +
			`\nYour previous reply could not be validated (${result}).\n` +
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
		if (typeof result === "string") {
			debugModelTextFailure("cueBatch", "repair", retry.text, result);
		}
	}
	if (typeof result === "string") {
		throw cueCraftProviderError(`Model output could not be validated: ${result}`);
	}
	return result.results;
}

function wrapCueCraftByokRuntime(
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
		generateCue: (input, signal) =>
			generateFromObject
				? generateCueFromObjectProvider(runtime, input, signal)
				: generateCueFromTextProvider(runtime, input, signal),
		generateSummary: (input, signal) =>
			generateFromObject
				? generateSummaryFromObjectProvider(runtime, input, signal)
				: generateSummaryFromTextProvider(runtime, input, signal),
		generateNoteBrief: (input, signal) =>
			generateFromObject
				? generateNoteBriefFromObjectProvider(runtime, input, signal)
				: generateNoteBriefFromTextProvider(runtime, input, signal),
	};
	if (runtime.id === "codex-cli" || runtime.id === "claude-cli") {
		cueRuntime.generateCues = (inputs, signal) =>
			generateCueBatchFromTextProvider(runtime, inputs, signal);
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
	lmStudioUrl: string;
	lmStudioModel: string;
	lmStudioAvailableModels: string[];
	lmStudioHasFetchedModels: boolean;
	lmStudioModelRefreshMessage: string;
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
		credentialLength: 0,
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
		case "lm-studio":
			return legacy.lmStudioUrl ?? "";
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
	return false;
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
		case "lm-studio":
			return legacy.lmStudioModel ?? "";
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
		case "lm-studio":
			stored.availableModels = legacyStringArray(legacy.lmStudioAvailableModels);
			stored.hasFetchedModels = legacyBoolean(legacy.lmStudioHasFetchedModels);
			stored.modelRefreshMessage = legacyString(legacy.lmStudioModelRefreshMessage);
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
	deleteLegacyCloudProviderCredential(settings, provider);
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
	const provider = cueCraftSelectedProvider(settings);
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

export function cueCraftProviderCredentialLength(
	settings: CueCraftSettings,
	provider: ByokProviderId = cueCraftSelectedProvider(settings)
): number {
	const stored = cueCraftProviderSettings(settings, provider);
	if (isCueCraftCloudCredentialProvider(provider)) {
		return stored.credentialSaved
			? stored.credentialLength ?? 0
			: stored.credential.trim().length;
	}
	return stored.credential.trim().length;
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
				saved.metadata.token,
				saved.metadata.length
			);
			result.settingsChanged = true;
			result.migratedProviders.push(provider);
			continue;
		}
		if (stored.credentialSaved) {
			const deletedLegacy =
				deleteLegacyCloudProviderCredential(settings, provider);
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
			result.settingsChanged = deletedLegacy || result.settingsChanged;
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
