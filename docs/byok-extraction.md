# BYOK Extraction Notes

BYOK is the workspace package for provider setup, model discovery, and app-agnostic AI access through text and structured-object generation. It currently lives at `packages/byok` inside CueCraft so the interface can keep being proven before extraction to a separate public repository.

## Public Surface

Import public BYOK APIs from the barrel:

```ts
import {
	createByok,
	createByokProvider,
	deriveProviderSetupStatus,
	generateText,
	isByokProviderId,
	recordProviderConnectionSuccess,
	type ByokCoreProviderConfig,
	type ByokProviderDeps,
	type ByokProviderRuntime,
} from "@cuecraft/byok";
```

The public surface is:

- Provider identity and metadata: `ByokProviderId`, `ByokProviderDefinition`, `BYOK_PROVIDER_IDS`, `byokProviderDefinition`, `byokProviderDefinitions`, and `isByokProviderId`.
- Provider configuration: `ByokCoreProviderConfig` for API-key cloud providers and Ollama host/model on the browser-safe main entrypoint; `ByokProviderConfig` remains the full union for Node consumers.
- Runtime dependencies: `ByokProviderDeps`, with caller-supplied `fetchImpl`, `http` transports, and optional `appInfo` metadata for provider-specific headers.
- Function-first generation: `generateText(options)` for one-call text generation with explicit provider credentials, model, prompt, optional `signal`, and optional custom deps.
- Repeated-call client: `createByok(config)` for binding one provider credential or Ollama host while supplying `model` per generation call.
- Runtime creation: `createByokProvider(config, deps): ByokProviderRuntime` from the main entrypoint for core providers.
- Node-only runtime creation: `createByokNodeProvider(config, deps): ByokProviderRuntime` from `@cuecraft/byok/node` for Codex CLI and Claude CLI providers.
- Setup state: verification snapshots, credential fingerprints, `recordProviderConnectionSuccess`, and `deriveProviderSetupStatus`.
- Model discovery: provider runtimes return portable `ByokModelOption` values with `id` and `label` only. Provider-specific metadata such as OpenRouter pricing, context length, supported parameters, and compatibility badges is intentionally not part of the main public surface.
- Runtime generation: `ByokProviderRuntime.generateText`, optional `generateObject`, and provider errors such as `ByokProviderError` and `ByokProviderRateLimitError`.

The first-success API is function-first:

```ts
const { text } = await generateText({
	provider: "openai",
	apiKey,
	model: "gpt-4o-mini",
	prompt: "Explain agentic AI in two sentences.",
});
```

For repeated calls, bind the credential once and keep the model per call:

```ts
const ai = createByok({ provider: "openai", apiKey });

const { text } = await ai.generateText({
	model: "gpt-4o-mini",
	prompt: "Write one sentence about BYOK.",
});
```

BYOK is AI-SDK-shaped, not AI-SDK-compatible. Consumers that need AI SDK `LanguageModel` objects or full AI SDK result semantics should use AI SDK directly.
The function-first API accepts plain text prompts only; provider-specific generation hints stay on the lower-level runtime.

The provider runtime contract remains the advanced setup/model-discovery layer and intentionally stays app-agnostic:

```ts
const provider = createByokProvider(
	{ provider: "openai", apiKey, model: "gpt-4o-mini" },
	{
		fetchImpl,
		http,
		appInfo: { name: "My Study App", url: "https://example.com" },
	}
);

const status = await provider.testConnection();
const models = await provider.listModels?.();
const { text } = await provider.generateText({
	prompt: "Explain agentic AI in two sentences.",
});
```

Structured-output capable providers also expose `generateObject`:

```ts
import { z } from "zod/v3";
import { createByokProvider } from "@cuecraft/byok";

const provider = createByokProvider(config, deps);
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
	createByokNodeProvider,
	type ByokProviderConfig,
	type ByokProviderDeps,
} from "@cuecraft/byok/node";

const config: ByokProviderConfig = {
	provider: "codex-cli",
	command: "codex",
};

const provider = createByokNodeProvider(config, deps satisfies ByokProviderDeps);
```

## CueCraft-Owned Responsibilities

- Persist host URLs, commands, selected models, fetched model caches, and verification snapshots.
- Store cloud API keys through app-owned secure storage before passing them to BYOK runtime configs.
- Render Obsidian settings UI and notices.
- Adapt Obsidian `requestUrl` into BYOK transport dependencies.
- Parse notes and decide which sections need generation.
- Build CueCraft study-cue prompts, JSON schemas, validation, repair prompts, and cue/summary runtime methods around BYOK text/object generation.
- Map CueCraft settings into BYOK configs and map BYOK results back into settings through `src/byok-cuecraft-adapter.ts`.
- Preserve Obsidian-specific user experience: settings copy, model refresh notices, setup status text, and note-cache metadata.

`src/byok-cuecraft-adapter.ts` is deliberately outside `packages/byok/**`. A future non-Obsidian project should write its own adapter for storage, UI, transport wiring, prompting, and output validation instead of importing CueCraft settings or study-cue types.

## CueCraft Credential Storage

CueCraft stores non-secret BYOK settings in Obsidian plugin data, but cloud provider API keys are not part of that JSON shape. Anthropic, OpenAI, Google, xAI, and OpenRouter keys are stored in Obsidian `app.secretStorage` under CueCraft-owned secret IDs. `data.json` keeps only provider/model/cache state and non-secret credential metadata such as saved-key presence and a change token for verification freshness.

The secure-storage boundary stays in CueCraft. BYOK receives plain `apiKey` values only after CueCraft resolves a key at runtime for provider creation, model refresh, connection testing, or generation. BYOK must not import Electron, Obsidian, filesystem adapters, or CueCraft settings types.

Direct browser or Electron-renderer BYOK calls are appropriate only for user-entered transient keys. App-owned keys should stay behind a server, main process, or custom transport. Ollama hosts are explicit prompt destinations and must be valid `http:` or `https:` URLs without embedded credentials. OpenRouter `appInfo` is provider-visible metadata forwarded as headers after normalization.

If Obsidian `app.secretStorage` is unavailable, cloud providers fail closed in that state; Ollama host and local CLI command providers remain regular non-secret settings. CueCraft requires Obsidian 1.11.4 or newer for cloud API-key storage.

## Package Dependency Expectations

The `packages/byok` package owns provider-runtime dependencies and Node CLI support:

- AI SDK provider packages: `ai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`, and `@ai-sdk/xai`.
- Vendor/model-list clients: `@anthropic-ai/sdk`, `@google/genai`, `openai`, and `ollama`.
- Validation: `zod`.
- Local CLI support: Node built-ins used by the command runner, including `node:child_process`, `node:os`, and `node:stream`.

The package should not depend on `obsidian`, CodeMirror, DOM UI helpers, CueCraft settings, CueCraft plugin runtime, or CueCraft note/cache modules. Callers provide browser/Electron-safe transports through `ByokProviderDeps`, resolve secrets before provider creation, and own all secure storage or settings UI copy.

## Package Shape and Verification Gates

The workspace package manifest lives in `packages/byok/package.json`. It keeps exactly two documented public entrypoints:

- `.` for browser/Electron-safe core providers and shared types.
- `./node` for Codex CLI, Claude CLI, and local command-runner support.

Declaration output is configured in `packages/byok/tsconfig.json`, and public examples are typechecked through `packages/byok/tsconfig.examples.json`. Before extraction or release, run:

```sh
bun run typecheck:byok
bun run typecheck:byok-examples
bun run test:byok
```

Pack-consumer validation should install the built package archive into a fresh fixture and verify ESM imports, declarations, the main entrypoint, the Node subpath, and the README examples before publishing.

## Package Ownership

Owned by `packages/byok`:

- `packages/byok/src/**`
- BYOK-focused tests under `packages/byok/tests/**`
- Provider adapter tests that exercise package-owned providers, command runner behavior, model normalization, setup status, and provider factory behavior.

Stay in CueCraft:

- `src/byok-cuecraft-adapter.ts`
- `src/cue-generation.ts`, `src/schemas.ts`, `src/local-cli-cue-batch.ts`, and `src/cue-provider.ts`
- `src/settings.ts`, `src/main.ts`, `src/generator.ts`, note parsing/cache/export/view code, and all Obsidian UI modules.
- Any app-specific compatibility adapters that a future consumer needs. CueCraft no longer keeps the old `src/providers/*` or top-level model/setup shims.

## Public Repository Extraction Sequence

1. Copy `packages/byok/**` into the new public repository.
2. Install the runtime dependencies listed above and keep `obsidian`, CodeMirror, and CueCraft UI dependencies out of the package manifest.
3. Keep the import-boundary tests in the package test suite so package code cannot drift back toward CueCraft or Obsidian imports.
4. Publish package types from the public barrel and Node subpath only; avoid documenting internal submodule imports.
5. Add a real package build that emits JavaScript and declarations to `dist`.
6. Install the packed output into CueCraft and update the workspace dependency to the published package name/version.
7. Keep `src/byok-cuecraft-adapter.ts` as CueCraft's app-specific bridge.
8. Keep CueCraft free of local compatibility shims unless a real downstream consumer needs a transition path.

## Release Governance

- Treat every new export, removed export, renamed type, or changed provider config shape as an API review item.
- Use semver from the first public beta: patch for fixes, minor for additive exports/provider metadata, and major for breaking runtime or type changes.
- Maintain a changelog that calls out provider behavior changes, runtime dependency changes, Node/browser entrypoint changes, and migration notes.
- Publish first as beta or prerelease until CueCraft consumes the package-shaped API end to end from packed output.
- Before a stable release, create `SECURITY.md`, `CONTRIBUTING.md`, issue templates, a release checklist, and npm trusted publishing with provenance enabled.

## Extraction Checklist

- Keep `packages/byok/src/**` free of Obsidian, DOM UI, `CueCraftSettings`, and plugin runtime imports.
- Keep provider tests runnable without live provider accounts or real CLI binaries.
- Document runtime dependencies that must move with BYOK, including AI SDK packages, vendor SDKs, Ollama, and local process support.
- Keep CueCraft adapters outside the package so another app can supply its own storage and UI.
- Publish only after CueCraft consumes the internal public surface end to end.
- Keep examples and package docs pointed at public BYOK exports, not provider implementation files.
- Verify `packages/byok/package.json`, declaration output, docs examples, and pack-consumer smoke tests before creating a public release.
- Confirm CueCraft consumes the package-shaped API internally before promoting any release from beta to stable.

## Non-Goals

- BYOK is not published as an npm package in this branch.
- BYOK does not own encryption or persistence of stored keys.
- BYOK does not add new providers.
- BYOK is not a storage, UI, prompt-template, or output-validation framework; host apps own those layers.
- BYOK does not own Obsidian-specific settings UI, notices, note parsing, cache invalidation, or Cornell rendering.
