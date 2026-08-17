# BYOK Extraction Notes

BYOK is the extracted runtime package for provider setup, model discovery, and app-agnostic AI access through text and structured-object generation. CueCraft consumes the `@swartzrock/byok-runtime` v0.1 release from `swartzrock/byok-runtime` instead of a local workspace package.

## Public Surface

Import public BYOK APIs from the barrel:

```ts
import {
	ByokProvider,
	createByok,
	generateText,
	isByokProviderId,
	listModels,
	type ByokCoreProviderConfig,
	type ByokProviderDeps,
	type ByokProviderRuntime,
} from "@swartzrock/byok-runtime";
```

The public surface is:

- Provider identity and metadata: `ByokProvider`, `ByokProviderId`, `ByokProviderDefinition`, `BYOK_PROVIDER_IDS`, `byokProviderDefinition`, `byokProviderDefinitions`, and `isByokProviderId`.
- Provider configuration: `ByokCoreProviderConfig` for API-key cloud providers and Ollama host/model on the browser-safe main entrypoint; `ByokProviderConfig` remains the full union for Node consumers.
- Runtime dependencies: `ByokProviderDeps`, with caller-supplied `fetchImpl` and `http` transports.
- Function-first generation: `generateText(options)` for one-call text generation with explicit provider credentials, model, prompt, optional `signal`, and optional custom deps.
- Model discovery: `listModels(options)` for fetching portable model options without requiring a selected model.
- Repeated-call client: `createByok(config)` for binding one provider credential or Ollama host while supplying `model` per generation call.
- Node-only runtime creation: `createByokNodeProvider(config, deps): ByokProviderRuntime` from `@swartzrock/byok-runtime/node` for connection testing, structured output, and Codex CLI or Claude CLI providers.
- Model discovery: provider runtimes return portable `ByokModelOption` values with `id` and `label` only. Provider-specific metadata such as OpenRouter pricing, context length, supported parameters, and compatibility badges is intentionally not part of the main public surface.
- Runtime generation: `ByokProviderRuntime.generateText`, optional `generateObject`, and provider errors such as `ByokProviderError` and `ByokProviderRateLimitError`.

The first-success API is function-first:

```ts
const { text } = await generateText({
	provider: ByokProvider.OpenAI,
	apiKey,
	model: "gpt-4o-mini",
	prompt: "Explain agentic AI in two sentences.",
});
```

Model discovery does not require a generation model:

```ts
const models = await listModels({
	provider: ByokProvider.OpenAI,
	apiKey,
});
```

For repeated calls, bind the credential once and keep the model per call:

```ts
const ai = createByok({ provider: ByokProvider.OpenAI, apiKey });

const { text } = await ai.generateText({
	model: "gpt-4o-mini",
	prompt: "Write one sentence about BYOK.",
});
```

BYOK is AI-SDK-shaped, not AI-SDK-compatible. Consumers that need AI SDK `LanguageModel` objects or full AI SDK result semantics should use AI SDK directly.
The function-first API accepts plain text prompts only; provider-specific generation hints stay on the lower-level runtime.

The node provider runtime contract remains the advanced setup/model-discovery layer and intentionally stays app-agnostic:

```ts
import { ByokProvider, createByokNodeProvider } from "@swartzrock/byok-runtime/node";

const provider = createByokNodeProvider(
	{ provider: ByokProvider.OpenAI, apiKey, model: "gpt-4o-mini" },
	{
		fetchImpl,
		http,
	}
);

const status = await provider.testConnection();
const models = await provider.listModels();
const { text } = await provider.generateText({
	prompt: "Explain agentic AI in two sentences.",
});
```

Structured-output capable providers also expose `generateObject`:

```ts
import { z } from "zod/v3";
import { createByokNodeProvider } from "@swartzrock/byok-runtime/node";

const provider = createByokNodeProvider(config, deps);
const result = await provider.generateObject?.({
	prompt: "Return three user-facing risks of storing API keys.",
	schema: z.object({
		risks: z.array(z.string()),
	}),
});
```

Local CLI providers are opt-in through the Node-only subpath:

```ts
import {
	ByokProvider,
	createByokNodeProvider,
	type ByokProviderConfig,
	type ByokProviderDeps,
} from "@swartzrock/byok-runtime/node";

const config: ByokProviderConfig = {
	provider: ByokProvider.CodexCli,
	command: "codex",
};

const provider = createByokNodeProvider(config, deps satisfies ByokProviderDeps);
```

## CueCraft-Owned Responsibilities

- Persist host URLs, commands, selected models, fetched model caches, and verification snapshots.
- Store cloud API keys through app-owned secure storage before passing them to BYOK runtime configs.
- Derive setup status, verification snapshots, credential fingerprints, and model-refresh UI messages.
- Sort, cache, and render app-specific model picker options such as Anthropic custom-model affordances.
- Render Obsidian settings UI and notices.
- Adapt Obsidian `requestUrl` into BYOK transport dependencies.
- Parse notes and decide which sections need generation.
- Build CueCraft Section cue and Note Brief instructions, schemas, validation, repair paths, and
  runtime methods around BYOK text/object generation.
- Map CueCraft settings into BYOK configs and map BYOK results back into settings through `src/byok-cuecraft-adapter.ts`.
- Preserve Obsidian-specific user experience: settings copy, model refresh notices, setup status text, and note-cache metadata.

`src/byok-cuecraft-adapter.ts` stays in CueCraft. A future non-Obsidian project should write its own adapter for storage, UI, transport wiring, prompting, and output validation instead of importing CueCraft settings or Section cue types.

## CueCraft Credential Storage

CueCraft stores non-secret BYOK settings in Obsidian plugin data, but cloud provider API keys are not part of that JSON shape. Anthropic, OpenAI, Google, xAI, and OpenRouter keys are stored in Obsidian `app.secretStorage` under CueCraft-owned secret IDs. `data.json` keeps only provider/model/cache state and non-secret credential metadata such as saved-key presence and a change token for verification freshness.

The secure-storage boundary stays in CueCraft. BYOK receives plain `apiKey` values only after CueCraft resolves a key at runtime for provider creation, model refresh, connection testing, or generation. BYOK must not import Electron, Obsidian, filesystem adapters, or CueCraft settings types.

Direct browser or Electron-renderer BYOK calls are appropriate only for user-entered transient keys. App-owned keys should stay behind a server, main process, or custom transport. Ollama hosts are explicit prompt destinations and must be valid `http:` or `https:` URLs without embedded credentials.

If Obsidian `app.secretStorage` is unavailable, cloud providers fail closed in that state; Ollama host and local CLI command providers remain regular non-secret settings. CueCraft requires Obsidian 1.11.4 or newer for cloud API-key storage.

## Runtime Dependency Expectations

The `@swartzrock/byok-runtime` package owns provider-runtime dependencies and Node CLI support:

- AI SDK provider packages: `ai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`, and `@ai-sdk/xai`.
- Vendor/model-list clients: `@anthropic-ai/sdk`, `@google/genai`, `openai`, and `ollama`.
- Validation: `zod`.
- Local CLI support: Node built-ins used by the command runner, including `node:child_process`, `node:os`, and `node:stream`.

The package should not depend on `obsidian`, CodeMirror, DOM UI helpers, CueCraft settings, CueCraft plugin runtime, or CueCraft note/cache modules. Callers provide browser/Electron-safe transports through `ByokProviderDeps`, resolve secrets before provider creation, and own all secure storage or settings UI copy.

## Package Shape and Verification Gates

The released package keeps exactly two documented public entrypoints:

- `.` for browser/Electron-safe core providers and shared types.
- `./node` for Codex CLI, Claude CLI, and local command-runner support.

The v0.1 GitHub release is currently source-shaped. CueCraft pins the release tag in `package.json` and resolves the package name to the release source while the runtime repository owns its own build, declarations, public examples, and package-level tests.

Runtime release validation belongs in `swartzrock/byok-runtime`: typecheck, examples typecheck, package tests, package build, and pack-consumer validation for ESM imports, declarations, the main entrypoint, the Node subpath, and README examples.

## Ownership Boundary

Owned by `swartzrock/byok-runtime`:

- Runtime source and package documentation.
- BYOK-focused tests for provider-owned behavior, command runner behavior, model normalization, setup status, and provider factory behavior.
- Build, declaration output, package publishing, and release validation.

Stay in CueCraft:

- `src/byok-cuecraft-adapter.ts`
- `src/cue-generation.ts`, `src/schemas.ts`, `src/local-cli-cue-batch.ts`, and `src/cue-provider.ts`
- `src/settings.ts`, `src/main.ts`, `src/generator.ts`, note parsing/cache/export/view code, and all Obsidian UI modules.
- Any app-specific compatibility adapters that a future consumer needs. CueCraft no longer keeps the old `src/providers/*` or top-level model/setup shims.

## Current Consumption Sequence

1. Pin `@swartzrock/byok-runtime` to the released v0.1 source in CueCraft.
2. Import only from `@swartzrock/byok-runtime` and `@swartzrock/byok-runtime/node`.
3. Keep `src/byok-cuecraft-adapter.ts` as CueCraft's app-specific bridge.
4. Keep CueCraft free of local compatibility shims unless a real downstream consumer needs a transition path.
5. Move package API, provider, and release validation changes to `swartzrock/byok-runtime` before cutting later runtime releases.

## Release Governance

- Treat every new export, removed export, renamed type, or changed provider config shape as an API review item.
- Use semver from the first public beta: patch for fixes, minor for additive exports/provider metadata, and major for breaking runtime or type changes.
- Maintain a changelog that calls out provider behavior changes, runtime dependency changes, Node/browser entrypoint changes, and migration notes.
- Publish prereleases until CueCraft consumes package-shaped API end to end from packed output.
- Before a stable release, create `SECURITY.md`, `CONTRIBUTING.md`, issue templates, a release checklist, and npm trusted publishing with provenance enabled.

## Runtime Release Checklist

- Keep runtime source free of Obsidian, DOM UI, `CueCraftSettings`, and plugin runtime imports.
- Keep provider tests runnable without live provider accounts or real CLI binaries.
- Document runtime dependencies that must move with BYOK, including AI SDK packages, vendor SDKs, Ollama, and local process support.
- Keep CueCraft adapters outside the package so another app can supply its own storage and UI.
- Publish only after CueCraft consumes the public surface end to end.
- Keep examples and package docs pointed at public BYOK exports, not provider implementation files.
- Verify runtime package metadata, declaration output, docs examples, and pack-consumer smoke tests before creating a public release.
- Confirm CueCraft consumes the package-shaped API before promoting any release from beta to stable.

## Non-Goals

- This branch does not publish a new BYOK runtime release.
- BYOK does not own encryption or persistence of stored keys.
- BYOK does not add new providers.
- BYOK is not a storage, UI, prompt-template, or output-validation framework; host apps own those layers.
- BYOK does not own Obsidian-specific settings UI, notices, note parsing, cache invalidation, or cue rendering.
