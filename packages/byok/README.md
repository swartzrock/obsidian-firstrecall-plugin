# @cuecraft/byok

Provider runtime, model discovery, and text/object generation for BYOK AI apps.

This package is currently developed as a CueCraft workspace package. It is not published yet, but it is shaped so it can later move to a separate public repository for any TypeScript app that wants user-supplied AI providers.

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

## Generation

Every runtime supports plain text generation:

```ts
const provider = createByokProvider(config, deps);
const { text } = await provider.generateText({
	prompt: "Explain retrieval-augmented generation in two sentences.",
});
```

Providers with structured-output support also expose `generateObject`:

```ts
import { z } from "zod/v3";

const answer = await provider.generateObject?.({
	prompt: "Return the primary colors.",
	schema: z.object({
		colors: z.array(z.string()),
	}),
});
```

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

CueCraft owns storage, UI, Obsidian integration, and app-specific prompting. BYOK receives resolved runtime credentials through provider configs and must not import Obsidian, Electron, DOM UI helpers, CueCraft settings, or CueCraft prompt/validation modules.
