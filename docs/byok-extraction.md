# BYOK Extraction Notes

BYOK is the workspace package for provider setup, model discovery, cue-generation contracts, and provider calls. It currently lives at `packages/byok` inside CueCraft so the interface can keep being proven before extraction to a separate public repository.

## Public Surface

Import public BYOK APIs from the barrel:

```ts
import {
	createByokProvider,
	deriveProviderSetupStatus,
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
- Runtime creation: `createByokProvider(config, deps): ByokProviderRuntime` from the main entrypoint for core providers.
- Node-only runtime creation: `createByokNodeProvider(config, deps): ByokProviderRuntime` from `@cuecraft/byok/node` for Codex CLI and Claude CLI providers.
- Setup state: verification snapshots, credential fingerprints, `recordProviderConnectionSuccess`, and `deriveProviderSetupStatus`.
- Model discovery: normalized model IDs, rich model options, model option sorting, refresh-result types, and OpenRouter compatibility metadata.
- Generation: cue, cue batch, and summary inputs/results plus `ByokProviderError` and `ByokProviderRateLimitError`.

The provider runtime contract intentionally stays app-agnostic:

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
const cue = await provider.generateCue({
	heading: "Terms",
	content: "Agent: an AI system that can plan and use tools.",
	preset: "conceptual",
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
- Map CueCraft settings into BYOK configs and map BYOK results back into settings through `src/byok-cuecraft-adapter.ts`.
- Preserve Obsidian-specific user experience: settings copy, model refresh notices, setup status text, and note-cache metadata.

`src/byok-cuecraft-adapter.ts` is deliberately outside `packages/byok/**`. A future non-Obsidian project should write its own adapter for storage, UI, and transport wiring instead of importing CueCraft settings types.

## CueCraft Credential Storage

CueCraft stores non-secret BYOK settings in Obsidian plugin data, but cloud provider API keys are not part of that JSON shape. Anthropic, OpenAI, Google, xAI, and OpenRouter keys are stored in Obsidian `app.secretStorage` under CueCraft-owned secret IDs. `data.json` keeps only provider/model/cache state and non-secret credential metadata such as saved-key presence and a change token for verification freshness.

The secure-storage boundary stays in CueCraft. BYOK receives plain `apiKey` values only after CueCraft resolves a key at runtime for provider creation, model refresh, connection testing, or generation. BYOK must not import Electron, Obsidian, filesystem adapters, or CueCraft settings types.

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
- BYOK is not a generic chat-completions package; this repo keeps CueCraft cue and summary generation as the proven first use case.
- BYOK does not own Obsidian-specific settings UI, notices, note parsing, cache invalidation, or Cornell rendering.
