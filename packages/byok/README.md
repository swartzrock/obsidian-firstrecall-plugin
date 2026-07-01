# @cuecraft/byok

Provider runtime, model discovery, and cue-generation contracts for BYOK study-cue apps.

This package is currently developed as a CueCraft workspace package. It is not published yet, but it is shaped so it can later move to a separate public repository.

## Entry Points

Use the main entrypoint for browser/Electron-safe providers and shared types:

```ts
import {
	createByokProvider,
	type ByokCoreProviderConfig,
	type ByokProviderDeps,
} from "@cuecraft/byok";
```

Use the Node-only subpath for local CLI providers:

```ts
import {
	createByokNodeProvider,
	type ByokProviderConfig,
	type ByokProviderDeps,
} from "@cuecraft/byok/node";
```

Provider implementations and model helpers under `src/providers` or `src/models` are package internals. Callers should use the public barrel unless a test is intentionally exercising internals.

## Development

From the repository root:

```sh
bun run typecheck:byok
bun run typecheck:byok-examples
bun run test:byok
```

From this package directory:

```sh
bun run typecheck
bun run typecheck:examples
bun run test
```

CueCraft owns storage, UI, and Obsidian integration. BYOK receives resolved runtime credentials through provider configs and must not import Obsidian, Electron, DOM UI helpers, or CueCraft settings.
