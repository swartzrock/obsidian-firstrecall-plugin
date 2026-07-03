# @cuecraft/byok API Reference

This reference documents the public API exported by `@cuecraft/byok` and `@cuecraft/byok/node`.

Use only the public entrypoints:

```ts
import { createByokProvider } from "@cuecraft/byok";
import { createByokNodeProvider } from "@cuecraft/byok/node";
```

Do not import provider implementation files directly. They are package internals and may change without a public API review.

## Entry Points

### `@cuecraft/byok`

The main entrypoint is for browser/Electron-safe core providers and shared helpers.

It exports:

- Provider registry constants and helpers.
- Core provider factory.
- Setup-status helpers.
- Model option and compatibility helpers.
- Anthropic model-selection helpers.
- Public runtime, config, storage, model, and error types.

It does not export local CLI providers or the local command runner.

### `@cuecraft/byok/node`

The Node subpath re-exports the main entrypoint and adds local CLI support:

- `createByokNodeProvider`
- `ClaudeCliProvider`
- `CodexCliProvider`
- `LocalCommandRunner`
- `extractClaudeCliOutput`
- `extractCodexCliOutput`
- Node-only CLI option and command-runner types

Use this subpath only where spawning local processes is acceptable.

## Provider Factories

### `createByokProvider(config, deps)`

Creates a runtime for the browser/Electron-safe providers.

```ts
function createByokProvider(
	config: ByokCoreProviderConfig,
	deps: ByokProviderDeps
): ByokProviderRuntime;
```

Supported provider configs:

- `anthropic`
- `openai`
- `google`
- `xai`
- `openrouter`
- `ollama`

Use this factory when your host application provides resolved API keys, selected models, and transport dependencies.

### `createByokNodeProvider(config, deps)`

Creates a runtime for every provider, including Node-only CLI providers.

```ts
function createByokNodeProvider(
	config: ByokProviderConfig,
	deps: ByokProviderDeps
): ByokProviderRuntime;
```

Supported provider configs:

- Every `createByokProvider` provider.
- `codex-cli`
- `claude-cli`

For core providers, this delegates to `createByokProvider`. For CLI providers, it constructs a local command-backed runtime.

## Runtime Contract

### `ByokProviderRuntime`

The common provider interface returned by the factories.

```ts
interface ByokProviderRuntime {
	id: ByokProviderId;
	label: string;
	requiresNetwork: boolean;
	requiresDownload: boolean;
	sectionConcurrencyLimit?: number;
	testConnection(): Promise<ByokProviderStatus>;
	listModels?(): Promise<ByokListedModel[]>;
	generateText(
		input: ByokTextGenerationInput,
		signal?: AbortSignal
	): Promise<ByokTextGenerationOutput>;
	generateObject?<T>(
		input: ByokObjectGenerationInput<T>,
		signal?: AbortSignal
	): Promise<T>;
}
```

Methods:

- `testConnection()` verifies that the provider can be reached and, where possible, that the selected model can generate.
- `listModels()` returns provider models when model discovery is supported.
- `generateText(input, signal?)` returns raw provider text.
- `generateObject(input, signal?)` returns parsed structured output for providers that expose native or emulated object generation.

### `ByokProviderStatus`

```ts
interface ByokProviderStatus {
	ok: boolean;
	message: string;
	models?: string[];
}
```

`message` is safe to show to users. `models` is optional and is usually present only when a connection test also performs model discovery.

## Provider Config Types

### `ByokProviderId`

```ts
type ByokProviderId =
	| "ollama"
	| "anthropic"
	| "openai"
	| "google"
	| "xai"
	| "openrouter"
	| "codex-cli"
	| "claude-cli";
```

### `ByokCloudProviderConfig`

Configuration for API-key cloud providers.

```ts
interface ByokCloudProviderConfig {
	provider: "anthropic" | "openai" | "google" | "xai" | "openrouter";
	apiKey: string;
	model: string;
}
```

BYOK does not persist `apiKey`. Resolve it from host-owned secure storage before creating the runtime.

### `ByokOllamaProviderConfig`

Configuration for Ollama.

```ts
interface ByokOllamaProviderConfig {
	provider: "ollama";
	host: string;
	model: string;
}
```

`host` is normalized by trimming trailing slashes.

### `ByokCliProviderConfig`

Configuration for local CLI providers.

```ts
interface ByokCliProviderConfig {
	provider: "codex-cli" | "claude-cli";
	command: string;
	model?: string;
}
```

CLI providers are Node-only and available through `@cuecraft/byok/node`.

### `ByokProviderConfig`

Union of every provider config.

```ts
type ByokProviderConfig =
	| ByokCloudProviderConfig
	| ByokOllamaProviderConfig
	| ByokCliProviderConfig;
```

### `ByokCoreProviderConfig`

Union accepted by the main entrypoint factory.

```ts
type ByokCoreProviderConfig =
	| ByokCloudProviderConfig
	| ByokOllamaProviderConfig;
```

## Runtime Dependencies

### `ByokProviderDeps`

Transport dependencies supplied by the host application.

```ts
interface ByokProviderDeps {
	fetchImpl: typeof fetch;
	http: ByokHttpClient;
	appInfo?: ByokProviderAppInfo;
}
```

- `fetchImpl` is used by AI SDK and vendor SDK providers.
- `http` is used by Ollama and by environments that need a custom request adapter.
- `appInfo` is forwarded to providers that support application metadata, currently OpenRouter.

### `ByokHttpClient`

```ts
type ByokHttpClient = (
	request: ByokHttpRequest
) => Promise<ByokHttpResponse>;
```

### `ByokHttpRequest`

```ts
interface ByokHttpRequest {
	url: string;
	method: "GET" | "POST";
	body?: string;
	headers?: Record<string, string>;
}
```

### `ByokHttpResponse`

```ts
interface ByokHttpResponse {
	status: number;
	text: string;
	json: unknown;
}
```

### `ByokProviderAppInfo`

```ts
interface ByokProviderAppInfo {
	name?: string;
	url?: string;
}
```

OpenRouter maps this to `X-Title` and `HTTP-Referer` headers.

## Generation Types

### `ByokTextGenerationInput`

```ts
interface ByokTextGenerationInput {
	prompt: string;
	responseFormat?: "text" | "json";
	jsonSchema?: string;
}
```

`responseFormat` and `jsonSchema` are hints. Support varies by provider. Always validate model output in the host application.

### `ByokTextGenerationOutput`

```ts
interface ByokTextGenerationOutput {
	text: string;
}
```

### `ByokObjectGenerationInput<T>`

```ts
interface ByokObjectGenerationInput<T> {
	prompt: string;
	schema: z.ZodType<T, z.ZodTypeDef, unknown>;
}
```

`generateObject` parses and validates with the supplied Zod schema where supported.

## Provider Registry

### `BYOK_PROVIDER_IDS`

Ordered provider IDs used by registry helpers and UI flows.

```ts
const BYOK_PROVIDER_IDS: readonly ByokProviderId[];
```

Current order:

```ts
[
	"anthropic",
	"openai",
	"google",
	"xai",
	"openrouter",
	"ollama",
	"codex-cli",
	"claude-cli",
]
```

### `BYOK_PROVIDER_DEFINITIONS`

Provider metadata keyed by provider ID.

```ts
const BYOK_PROVIDER_DEFINITIONS: Record<
	ByokProviderId,
	ByokProviderDefinition
>;
```

### `byokProviderDefinition(id)`

Returns metadata for one provider.

```ts
function byokProviderDefinition(
	id: ByokProviderId
): ByokProviderDefinition;
```

### `byokProviderDefinitions()`

Returns provider definitions in `BYOK_PROVIDER_IDS` order.

```ts
function byokProviderDefinitions(): ByokProviderDefinition[];
```

### `isByokProviderId(value)`

Type guard for provider IDs.

```ts
function isByokProviderId(value: unknown): value is ByokProviderId;
```

### `normalizeProviderId(value)`

Maps unknown values into a supported provider ID.

```ts
function normalizeProviderId(value: unknown): ByokProviderId;
```

Special cases:

- `"codex"` becomes `"codex-cli"`.
- `"claude"` becomes `"claude-cli"`.
- Unknown values become `"ollama"`.

### `ByokProviderDefinition`

Metadata for settings UIs and capability checks.

```ts
interface ByokProviderDefinition {
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
```

Related types:

- `ByokCredentialKind` is `"api-key" | "host" | "command"`.
- `ByokModelBehavior` is `"required" | "optional"`.
- `ByokProviderIconSource` is `"svgl" | "custom"`.
- `ByokProviderIconDefinition` describes SVG icon metadata.
- `ByokCredentialFieldDefinition` describes credential field labels and copy.
- `ByokModelFieldDefinition` describes model field labels and copy.

```ts
interface ByokProviderIconDefinition {
	source: ByokProviderIconSource;
	sourceUrl: string;
	viewBox: string;
	svg: string;
}

interface ByokCredentialFieldDefinition {
	label: string;
	placeholder: string;
	description: string;
	secret: boolean;
	missingMessage: string;
	resetModelsMessage?: string;
}

interface ByokModelFieldDefinition {
	label: string;
	placeholder: string;
	description: string;
	listModelsLabel?: string;
	listModelsDescription?: string;
	emptyListMessage?: string;
	optionSource?: ByokModelOptionSource;
}
```

## Model Options

### `ByokModelOption`

Normalized rich model metadata.

```ts
interface ByokModelOption {
	id: string;
	label: string;
	provider: string;
	contextLength: number | null;
	pricing: { prompt: number; completion: number } | null;
	supportedParameters: string[] | null;
	source: ByokModelOptionSource;
}
```

### `ByokModelOptionSource`

```ts
type ByokModelOptionSource =
	| "openrouter"
	| "openai"
	| "google"
	| "xai"
	| "ollama"
	| "anthropic"
	| "string";
```

### `ByokListedModel`

Model-list return value shape.

```ts
type ByokListedModel = string | ByokModelOption;
```

### `ModelOption` and `ModelOptionSource`

Aliases exported for model helper users:

```ts
type ModelOption = ByokModelOption;
type ModelOptionSource = ByokModelOptionSource;
```

### `OpenRouterRawModel`

Subset of the OpenRouter `/models` API response accepted by the normalizer.

```ts
interface OpenRouterRawModel {
	id?: string;
	name?: string;
	context_length?: number;
	pricing?: { prompt?: string; completion?: string };
	supported_parameters?: string[];
}
```

### `normalizeStringId(id, source)`

Converts a string model ID into a `ModelOption`.

```ts
function normalizeStringId(
	id: string,
	source: ModelOptionSource
): ModelOption;
```

### `normalizeModelIds(ids, source)`

Converts an array of string model IDs into `ModelOption` values.

```ts
function normalizeModelIds(
	ids: string[],
	source: ModelOptionSource
): ModelOption[];
```

### `normalizeOpenRouterModel(entry)`

Converts an OpenRouter model record into a `ModelOption`.

```ts
function normalizeOpenRouterModel(
	entry: OpenRouterRawModel
): ModelOption;
```

### `isModelOption(value)`

Type guard for `ModelOption`.

```ts
function isModelOption(value: unknown): value is ModelOption;
```

### `sortModelOptions(options, currentModelId?)`

Sorts model options with the current model first, then natural model-ID order.

```ts
function sortModelOptions(
	options: ModelOption[],
	currentModelId?: string
): ModelOption[];
```

### `compareFetchedModelIds(left, right)`

Natural string comparator for fetched model IDs.

```ts
function compareFetchedModelIds(left: string, right: string): number;
```

### `sortFetchedModelIds(modelIds)`

Sorts model IDs with natural collation.

```ts
function sortFetchedModelIds(modelIds: string[]): string[];
```

## Model Compatibility

### `StructuredOutputSupport`

```ts
type StructuredOutputSupport = "supported" | "unsupported" | "unknown";
```

### `modelStructuredOutputSupport(option)`

Infers structured-output support from a model option's advertised parameters.

```ts
function modelStructuredOutputSupport(
	option: ModelOption
): StructuredOutputSupport;
```

### `isLargeContextModel(option)`

Returns `true` when `contextLength` is at least `100000`.

```ts
function isLargeContextModel(option: ModelOption): boolean;
```

### `isLowCostModel(option)`

Returns `true` when prompt and completion pricing fall below BYOK's low-cost thresholds.

```ts
function isLowCostModel(option: ModelOption): boolean;
```

### `modelCompatibilityBadges(option)`

Returns up to three display badges:

- `"Structured output"`
- `"Large context"`
- `"Low cost"`

```ts
function modelCompatibilityBadges(option: ModelOption): string[];
```

### `modelCompatibilityWarning(option)`

Returns a user-facing warning when structured-output support is unsupported or unknown.

```ts
function modelCompatibilityWarning(option: ModelOption | null): string;
```

### `sortByokModelOptions(options, currentModelId?)`

Sorts model options with the current model first, then BYOK-preferred compatibility score, then natural model-ID order.

```ts
function sortByokModelOptions(
	options: ModelOption[],
	currentModelId?: string
): ModelOption[];
```

## Anthropic Model Helpers

These helpers support account-model selection, custom Anthropic model IDs, and user-facing model descriptions.

### `ANTHROPIC_CUSTOM_MODEL_ID`

Sentinel used when a user enters a custom Anthropic model ID.

```ts
const ANTHROPIC_CUSTOM_MODEL_ID = "__custom__";
```

### `AnthropicModelHint`

```ts
interface AnthropicModelHint {
	quality: string;
	speed: string;
	cost: string;
	context: string;
	generationHint: string;
}
```

### `AnthropicModelOption`

```ts
interface AnthropicModelOption {
	id: string;
	label: string;
	description: string;
	hint: AnthropicModelHint;
}
```

### `AnthropicModelListSource`

```ts
interface AnthropicModelListSource {
	listModels(): Promise<ModelInfo[]>;
}
```

`ModelInfo` comes from `@anthropic-ai/sdk/resources/models`.

### `AnthropicModelRefreshResult`

```ts
interface AnthropicModelRefreshResult {
	availableModels: ModelInfo[];
	options: AnthropicModelOption[];
	message: string;
}
```

### `anthropicModelInfoToByokModelOption(model)`

Converts Anthropic SDK model metadata into `ByokModelOption`.

```ts
function anthropicModelInfoToByokModelOption(
	model: ModelInfo
): ByokModelOption;
```

### `buildAnthropicModelOptions(availableModels?)`

Builds sorted Anthropic display options from Anthropic SDK model records or BYOK model options.

```ts
function buildAnthropicModelOptions(
	availableModels?: Array<ModelInfo | ByokModelOption>
): AnthropicModelOption[];
```

### `isAnthropicCustomModelSelection(settings)`

Returns whether the current Anthropic selection should be treated as a custom model ID.

```ts
function isAnthropicCustomModelSelection(settings: {
	anthropicModel: string;
	anthropicModelSelection?: string;
	anthropicAvailableModels?: Array<ModelInfo | ByokModelOption>;
}): boolean;
```

### `normalizeAnthropicModelSelection(settings)`

Mutates `settings.anthropicModelSelection` when it is missing.

```ts
function normalizeAnthropicModelSelection(settings: {
	anthropicModel: string;
	anthropicModelSelection?: string;
	anthropicAvailableModels?: Array<ModelInfo | ByokModelOption>;
}): void;
```

Known account models select themselves. Unknown models select `ANTHROPIC_CUSTOM_MODEL_ID`.

### `describeAnthropicModel(modelId, availableModels?)`

Returns a display label and raw ID.

```ts
function describeAnthropicModel(
	modelId: string,
	availableModels?: Array<ModelInfo | ByokModelOption>
): {
	label: string;
	rawId: string;
};
```

### `describeAnthropicModelDetails(modelId, availableModels?)`

Returns a display label, raw ID, and hint metadata.

```ts
function describeAnthropicModelDetails(
	modelId: string,
	availableModels?: Array<ModelInfo | ByokModelOption>
): {
	label: string;
	rawId: string;
	hint: AnthropicModelHint;
};
```

### `formatAnthropicUnavailableModelMessage(modelId, availableModels?)`

Returns a user-facing message for an inaccessible model.

```ts
function formatAnthropicUnavailableModelMessage(
	modelId: string,
	availableModels?: Array<ModelInfo | ByokModelOption>
): string;
```

### `formatAnthropicModelHint(modelId, availableModels?)`

Returns initial helper text when there is no selected model and no fetched models.

```ts
function formatAnthropicModelHint(
	modelId: string,
	availableModels?: Array<ModelInfo | ByokModelOption>
): string;
```

### `refreshAnthropicModelOptions(source)`

Fetches Anthropic models through a supplied source and returns normalized display options plus a user-facing result message.

```ts
function refreshAnthropicModelOptions(
	source: AnthropicModelListSource | null
): Promise<AnthropicModelRefreshResult>;
```

Errors are caught and returned as a refresh message with empty model arrays.

## Setup Status

BYOK setup helpers work with app-owned settings. They do not persist settings or credentials.

### `CLI_DEFAULT_MODEL_SENTINEL`

Model sentinel used when verifying CLI providers without an explicit model override.

```ts
const CLI_DEFAULT_MODEL_SENTINEL = "__byok_cli_default__";
```

### `ProviderSetupStatusId`

Alias for `ByokProviderId`.

```ts
type ProviderSetupStatusId = ByokProviderId;
```

### `ProviderConnectionSnapshot`

Alias for `ByokVerificationSnapshot`.

```ts
type ProviderConnectionSnapshot = ByokVerificationSnapshot;
```

### `ProviderConnectionStatusMap`

Alias for `ByokVerificationSnapshotMap`.

```ts
type ProviderConnectionStatusMap = ByokVerificationSnapshotMap;
```

### `ProviderSetupStatusSettings`

Expected wrapper shape for setup helpers.

```ts
interface ProviderSetupStatusSettings {
	byok: ByokStoredSettings;
}
```

### `DerivedProviderSetupStatus`

Alias for `ByokSetupStatus`.

```ts
type DerivedProviderSetupStatus = ByokSetupStatus;
```

### `providerCredentialFingerprint(settings)`

Returns a non-secret fingerprint for the selected provider's current credential state.

```ts
function providerCredentialFingerprint(
	settings: ProviderSetupStatusSettings
): string;
```

For cloud providers with `credentialSaved`, this returns `credentialUpdatedAt` or `"saved"`. Otherwise it returns a hash of the non-secret credential value.

### `recordProviderConnectionSuccess(settings, testedAt?)`

Returns a new verification map with the selected provider marked as verified for the current credential and model.

```ts
function recordProviderConnectionSuccess(
	settings: ProviderSetupStatusSettings,
	testedAt?: string
): ProviderConnectionStatusMap;
```

`testedAt` defaults to the current ISO timestamp.

### `deriveProviderSetupStatus(settings)`

Derives whether the selected provider has a credential, model selection, and fresh verification snapshot.

```ts
function deriveProviderSetupStatus(
	settings: ProviderSetupStatusSettings
): DerivedProviderSetupStatus;
```

## Settings Types

These types are useful for apps that want CueCraft-style setup-state tracking.

### `ByokConnectionState`

```ts
type ByokConnectionState = "untested" | "verified" | "stale";
```

### `ByokVerificationSnapshot`

```ts
interface ByokVerificationSnapshot {
	credentialFingerprint: string;
	credentialToken?: string;
	modelId: string;
	testedAt: string;
}
```

### `ByokVerificationSnapshotMap`

```ts
type ByokVerificationSnapshotMap = Partial<
	Record<ByokProviderId, ByokVerificationSnapshot>
>;
```

### `ByokSetupStatus`

```ts
interface ByokSetupStatus {
	keySaved: boolean;
	modelSelected: boolean;
	connection: ByokConnectionState;
	testedAt?: string;
}
```

### `ByokProviderStoredSettings`

```ts
interface ByokProviderStoredSettings {
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
```

### `ByokStoredSettings`

```ts
interface ByokStoredSettings {
	selectedProvider: ByokProviderId;
	providers: Partial<Record<ByokProviderId, ByokProviderStoredSettings>>;
	verification: ByokVerificationSnapshotMap;
}
```

## Model Refresh Types

### `ByokModelRefreshResult`

```ts
interface ByokModelRefreshResult {
	models: string[];
	options: ByokModelOption[];
	message: string;
}
```

## Errors

### `ByokProviderError`

Base user-readable provider error.

```ts
class ByokProviderError extends Error {
	constructor(message: string);
}
```

### `ByokProviderRateLimitError`

Rate-limit error with optional retry delay.

```ts
class ByokProviderRateLimitError extends ByokProviderError {
	readonly retryAfterMs: number | null;

	constructor(message: string, retryAfterMs?: number | null);
}
```

AI SDK providers retry rate limits before surfacing this error.

## Node Subpath APIs

The following APIs are exported only from `@cuecraft/byok/node`.

### `ClaudeCliProvider`

Local Claude CLI runtime class.

```ts
class ClaudeCliProvider implements ByokProviderRuntime {
	constructor(opts: ClaudeCliProviderOptions);
}
```

Behavior:

- Runs `claude` with safe non-interactive arguments.
- Uses `--output-format json` and `--input-format text`.
- Passes `jsonSchema` from `generateText` to Claude CLI when provided.
- Does not expose `generateObject`.

### `ClaudeCliProviderOptions`

```ts
interface ClaudeCliProviderOptions {
	command: string;
	model?: string;
	cwd?: string;
	timeoutMs?: number;
	runner?: Pick<LocalCommandRunner, "run">;
}
```

### `extractClaudeCliOutput(stdout)`

Extracts final text from Claude CLI JSON or raw stdout.

```ts
function extractClaudeCliOutput(stdout: string): string;
```

### `CodexCliProvider`

Local Codex CLI runtime class.

```ts
class CodexCliProvider implements ByokProviderRuntime {
	constructor(opts: CodexCliProviderOptions);
}
```

Behavior:

- Runs `codex exec --skip-git-repo-check --sandbox read-only --json`.
- Passes `--model` when a model override is configured.
- Does not expose `generateObject`.

### `CodexCliProviderOptions`

```ts
interface CodexCliProviderOptions {
	command: string;
	model?: string;
	cwd?: string;
	timeoutMs?: number;
	runner?: Pick<LocalCommandRunner, "run">;
}
```

### `extractCodexCliOutput(stdout)`

Extracts final text from Codex CLI JSON event output or raw stdout.

```ts
function extractCodexCliOutput(stdout: string): string;
```

### `LocalCommandRunner`

Command runner used by local CLI providers.

```ts
class LocalCommandRunner {
	constructor(
		spawnProcess?: LocalProcessSpawner,
		env?: NodeJS.ProcessEnv,
		logger?: Pick<Console, "warn">,
		loadLoginShellPath?: LoginShellPathLoader
	);

	run(request: LocalCommandRequest): Promise<LocalCommandResult>;
}
```

The runner:

- Spawns commands with `shell: false`.
- Writes `stdin` and captures stdout/stderr.
- Applies timeouts.
- Handles abort signals.
- Merges login-shell `PATH` for bare commands on non-Windows platforms.
- Maps process errors to `ByokProviderError`-compatible provider errors.

### `defaultLocalCliCwd()`

Returns the default current working directory for local CLI execution.

```ts
function defaultLocalCliCwd(): string;
```

Currently this is the operating system temporary directory.

### `LocalCommandRequest`

```ts
interface LocalCommandRequest {
	command: string;
	args?: string[];
	stdin?: string;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeoutMs?: number;
	signal?: AbortSignal;
}
```

### `LocalCommandResult`

```ts
interface LocalCommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}
```

### `LocalProcess`

Minimal process interface used for command-runner injection in tests.

```ts
interface LocalProcess {
	stdout: Readable;
	stderr: Readable;
	stdin: Writable;
	once(event: "close", listener: (code: number | null) => void): this;
	once(event: "error", listener: (error: NodeJS.ErrnoException) => void): this;
	kill(signal?: NodeJS.Signals): boolean;
}
```

### `LocalProcessSpawner`

```ts
type LocalProcessSpawner = (
	command: string,
	args: string[],
	options: { cwd?: string; shell: false; env?: NodeJS.ProcessEnv }
) => LocalProcess;
```

### `LoginShellPathLoader`

```ts
type LoginShellPathLoader = (
	env: NodeJS.ProcessEnv
) => string | Promise<string>;
```

## API Caveats Before Public v1

- `listModels()` should be normalized across providers. The public runtime type is `ByokListedModel[]`, but Anthropic-specific flows currently use `ModelInfo[]` plus Anthropic helpers before storing normalized BYOK options.
- `ByokProviderDeps.http` is required even for cloud-only usage. A Node convenience helper would reduce setup code.
- Structured-output support is currently indicated by the optional `generateObject` method, not by provider metadata.
- `ByokStoredSettings` is useful for CueCraft-style setup state, but many backend apps will prefer a smaller credential/model verification abstraction.
