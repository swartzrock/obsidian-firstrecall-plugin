# BYOK Extraction Notes

BYOK is the internal module boundary for provider setup, model discovery, and provider calls. The first implementation lives inside CueCraft so the interface can be proven before a separate npm package exists.

## Public Surface

- Provider identity and metadata: `ByokProviderId`, `ByokProviderDefinition`, and registry helpers.
- Provider configuration: API-key, Ollama host/model, and local CLI command/model variants.
- Runtime dependencies: caller-supplied `fetchImpl` and `http` transports.
- Setup state: verification snapshots and derived setup status.
- Model discovery: normalized model IDs, rich model options, refresh results, and compatibility metadata.
- Generation: cue, cue batch, and summary requests/results plus provider errors.

## CueCraft-Owned Responsibilities

- Persist API keys, hosts, commands, selected models, fetched model caches, and verification snapshots.
- Render Obsidian settings UI and notices.
- Adapt Obsidian `requestUrl` into BYOK transport dependencies.
- Parse notes and decide which sections need generation.
- Map CueCraft settings into BYOK configs and map BYOK results back into settings.

## Extraction Checklist

- Keep `src/byok/**` free of Obsidian, DOM UI, `CueCraftSettings`, and plugin runtime imports.
- Keep provider tests runnable without live provider accounts or real CLI binaries.
- Document runtime dependencies that must move with BYOK, including AI SDK packages, vendor SDKs, Ollama, and local process support.
- Keep CueCraft adapters outside the package so another app can supply its own storage and UI.
- Publish only after CueCraft consumes the internal public surface end to end.

## Non-Goals

- BYOK is not published as an npm package in this epic.
- BYOK does not own encryption or persistence of stored keys.
- BYOK does not add new providers.
- BYOK is not a generic chat-completions package; this repo keeps CueCraft cue and summary generation as the proven first use case.
