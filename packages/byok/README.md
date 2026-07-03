# @cuecraft/byok

Function-first text generation, provider runtime, and model discovery for bring-your-own-key AI applications.

`@cuecraft/byok` lets a TypeScript app run against user-supplied AI accounts without owning provider-specific generation code. For first success, call `generateText` with an explicit provider, credential, model, and prompt. When an app needs setup flows, model discovery, structured output, or custom transports, BYOK also exposes the lower-level provider runtime.

This package currently lives inside the CueCraft workspace and is not published yet. The API is shaped for extraction into a standalone public repository for backend, desktop, Electron, and browser-adjacent TypeScript apps.

## Features

- Unified runtime for Anthropic, OpenAI, Google Gemini, xAI, OpenRouter, Ollama, Codex CLI, and Claude CLI.
- One-call `generateText` helper for core providers with default fetch-based transports.
- `createByok` client for repeated text generation with one bound credential or Ollama host.
- Browser/Electron-safe main entrypoint for API-key providers and Ollama.
- Node-only subpath for local CLI providers and command execution.
- App-supplied `fetch` and HTTP transports so callers can run in Node, Electron, Obsidian, browsers, tests, or custom runtimes.
- Provider metadata for settings UIs: labels, credential fields, model fields, icons, setup requirements, and model-list capability flags.
- Connection testing with user-readable provider errors and rate-limit retry handling for AI SDK providers.
- Model discovery helpers, portable model options, and Anthropic model-selection helpers.
- Plain text generation for every provider runtime.
- Optional structured-object generation for AI SDK providers that expose `generateObject`.
- Setup-state helpers for determining whether credentials, model selection, and verification snapshots are current.

## Provider Support

| Provider ID | Credential | Entry point | Model listing | Generation |
| --- | --- | --- | --- | --- |
| `anthropic` | API key + model | `@cuecraft/byok` | Anthropic account models | Text and object |
| `openai` | API key + model | `@cuecraft/byok` | OpenAI model IDs | Text and object |
| `google` | API key + model | `@cuecraft/byok` | Gemini model IDs | Text and object |
| `xai` | API key + model | `@cuecraft/byok` | xAI model IDs | Text and object |
| `openrouter` | API key + model | `@cuecraft/byok` | Portable model options | Text and object-like JSON parsing |
| `ollama` | Host + model | `@cuecraft/byok` | Installed local models | Text |
| `codex-cli` | Local command, optional model | `@cuecraft/byok/node` | None | Text |
| `claude-cli` | Local command, optional model | `@cuecraft/byok/node` | None | Text, with JSON-schema hints through `generateText` |

The main entrypoint avoids Node-only process APIs. Use `@cuecraft/byok/node` only from trusted Node or desktop backends that are allowed to spawn local commands.

## Installation

After this package is extracted and published:

```sh
npm install @cuecraft/byok
```

If your application builds schemas directly, install `zod` as an application dependency too:

```sh
npm install zod
```

Inside the CueCraft workspace, the package is consumed through the workspace dependency:

```json
{
  "dependencies": {
    "@cuecraft/byok": "workspace:*"
  }
}
```

Runtime requirement: Node.js 20 or newer for backend usage. Node 20 and Electron main-process usage work with the default fetch transport. Browser and Electron renderer usage depends on provider CORS and host-app security policy; app-owned keys should stay behind a server, main process, or custom transport.

## Entry Points

Use the main entrypoint for browser/Electron-safe providers and shared types:

```ts
import {
	createByok,
	createByokProvider,
	generateText,
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

Provider implementation files under `src/providers` and helper files under `src/models` are package internals. Consumers should import from the public entrypoints only.

## Quick Start

This example generates text with OpenAI in Node 20.

```ts
import { generateText } from "@cuecraft/byok";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("Set OPENAI_API_KEY before running this example.");

const { text } = await generateText({
	provider: "openai",
	apiKey,
	model: "gpt-4o-mini",
	prompt: "Explain retrieval-augmented generation in two sentences.",
});

console.log(text);
```

BYOK is AI-SDK-shaped, not AI-SDK-compatible. If your app needs AI SDK `LanguageModel` objects or AI SDK's full result object semantics, use AI SDK directly. Use BYOK when the app's job is to run against user-owned provider credentials and local providers through one small interface.
The function-first API accepts plain text prompts only. Use the lower-level runtime when you need provider-specific generation hints such as JSON response formatting.

BYOK receives credentials only as call inputs. It does not persist or log API keys. Direct browser or Electron-renderer calls are appropriate only for user-entered transient keys; app-owned keys should stay behind a server, main process, or custom transport.

## Basic Usage

### Reuse a Credential

Use `createByok` when several calls share the same provider credential or Ollama host. The model stays per call.

```ts
import { createByok } from "@cuecraft/byok";

const ai = createByok({
	provider: "openai",
	apiKey: process.env.OPENAI_API_KEY!,
});

const { text } = await ai.generateText({
	model: "gpt-4o-mini",
	prompt: "Draft a short release note for a model-provider SDK.",
});
```

`createByok` is intentionally narrower than the provider runtime. Use `createByokProvider` when you need connection testing, model discovery, or structured-object generation.

### List Providers

Use the registry helpers to drive configuration screens or backend allowlists.

```ts
import { byokProviderDefinitions } from "@cuecraft/byok";

for (const provider of byokProviderDefinitions()) {
	console.log(provider.id, provider.label, provider.supportsModelListing);
}
```

### Advanced: Create a Runtime

Create a runtime when your app is building a setup screen, fetching models, testing credentials, using structured output, or supplying custom transports.

```ts
import { createByokProvider } from "@cuecraft/byok";

const provider = createByokProvider({
	provider: "openai",
	apiKey,
	model: "gpt-4o-mini",
});
```

Pass custom deps when your host app owns transport behavior:

```ts
const provider = createByokProvider(
	{
		provider: "openai",
		apiKey,
		model: "gpt-4o-mini",
	},
	{ fetchImpl: fetch, http }
);
```

### Test Connection

Every runtime exposes `testConnection()`.

```ts
const status = await provider.testConnection();

if (!status.ok) {
	console.error(status.message);
} else {
	console.log(status.message);
}
```

For providers with model-list support, `status.models` may include model IDs returned during the connection test.

### Fetch Models

Providers with model-list support expose `listModels()`.

```ts
const models = await provider.listModels?.();
```

Model discovery returns portable `ByokModelOption` values with `id` and `label`. Provider-specific metadata such as pricing, context length, supported parameters, or recommendation badges belongs in provider-specific APIs or the host app.

### Generate Text with a Runtime

```ts
const result = await provider.generateText(
	{
		prompt: "Draft a short release note for a model-provider SDK.",
	},
	abortController.signal
);

console.log(result.text);
```

Text providers may accept JSON-oriented hints:

```ts
const result = await provider.generateText({
	prompt: "Return a JSON object with an `ok` boolean.",
	responseFormat: "json",
	jsonSchema: JSON.stringify({
		type: "object",
		properties: { ok: { type: "boolean" } },
		required: ["ok"],
	}),
});
```

These hints are provider dependent. Host apps should still validate and repair model output.

### Generate Structured Objects

AI SDK based providers expose `generateObject`. Check for the method before calling it because Ollama and local CLI providers are text-only.

```ts
import { z } from "zod/v3";

const schema = z.object({
	title: z.string(),
	risks: z.array(z.string()),
});

if (!provider.generateObject) {
	throw new Error(`${provider.label} does not support structured objects.`);
}

const report = await provider.generateObject({
	prompt: "Return the main risks of storing API keys in plaintext.",
	schema,
});
```

## Model Discovery

Providers with model-list support return portable model options:

```ts
const models = await provider.listModels?.();
// [{ id: "gpt-4o-mini", label: "gpt-4o-mini" }]
```

`ByokModelOption` intentionally contains only `id` and `label`. Provider-specific metadata such as pricing, context length, supported parameters, or recommendation badges belongs in provider-specific APIs or the host app.

### List Models for Non-CLI Providers

Use the provider runtime when you need setup-time model discovery. All main-entrypoint providers support `listModels()`:

| Provider | Config |
| --- | --- |
| `anthropic` | API key + any current Claude model |
| `openai` | API key + any current OpenAI model |
| `google` | API key + any current Gemini model |
| `xai` | API key + any current xAI model |
| `openrouter` | API key + any current OpenRouter model ID |
| `ollama` | Host URL + any installed Ollama model |

The `model` field can be the currently selected model while the runtime fetches the account's available model IDs.

```ts
import { createByokProvider, type ByokCoreProviderConfig } from "@cuecraft/byok";

const configs = [
	{
		provider: "anthropic",
		apiKey: process.env.ANTHROPIC_API_KEY!,
		model: "claude-sonnet-4-6",
	},
	{
		provider: "openai",
		apiKey: process.env.OPENAI_API_KEY!,
		model: "gpt-4o-mini",
	},
	{
		provider: "google",
		apiKey: process.env.GOOGLE_API_KEY!,
		model: "gemini-1.5-flash",
	},
	{
		provider: "xai",
		apiKey: process.env.XAI_API_KEY!,
		model: "grok-2-latest",
	},
	{
		provider: "openrouter",
		apiKey: process.env.OPENROUTER_API_KEY!,
		model: "openai/gpt-4o",
	},
	{
		provider: "ollama",
		host: "http://localhost:11434",
		model: "llama3.1:8b",
	},
] satisfies ByokCoreProviderConfig[];

for (const config of configs) {
	const provider = createByokProvider(config);
	console.log(config.provider, await provider.listModels?.());
}
```

Local CLI providers from `@cuecraft/byok/node` do not expose model discovery because the Codex and Claude command-line tools do not provide a stable model-list API through this package.

### Use Ollama

Ollama uses a host URL instead of a raw API key.

```ts
import { generateText } from "@cuecraft/byok";

const response = await generateText({
	provider: "ollama",
	host: "http://localhost:11434",
	model: "llama3.1:8b",
	prompt: "Write one sentence about local model inference.",
});
```

BYOK accepts explicit `http:` and `https:` Ollama hosts without embedded credentials. Prompts are sent to the configured host; remote or LAN Ollama hosts are caller-approved trust boundaries.

### Use Local CLI Providers

Local CLI providers are available only from the Node subpath.

```ts
import { createByokNodeProvider } from "@cuecraft/byok/node";

const provider = createByokNodeProvider(
	{
		provider: "claude-cli",
		command: "claude",
		model: "sonnet",
	},
	deps
);

const status = await provider.testConnection();
if (!status.ok) throw new Error(status.message);

const { text } = await provider.generateText({
	prompt: "Summarize this backend job failure in one paragraph.",
});
```

CLI providers execute local commands. Only expose them in environments where users expect local process execution.

### Track Setup Status

BYOK does not store credentials, but it can derive setup state from app-owned settings.

```ts
import {
	deriveProviderSetupStatus,
	recordProviderConnectionSuccess,
	type ByokStoredSettings,
} from "@cuecraft/byok";

const settings: { byok: ByokStoredSettings } = loadSettings();

const setup = deriveProviderSetupStatus(settings);
if (setup.connection === "stale") {
	console.log("The selected credential or model changed since the last test.");
}

settings.byok.verification = recordProviderConnectionSuccess(settings);
saveSettings(settings);
```

Host apps own the actual storage schema, encryption, and migration flow.

## API Reference

See [API.md](./API.md) for the full public API reference, including exported functions, constants, classes, entrypoint differences, and public types.

## SDK Improvement Notes

Follow-up API design items before a broader public release:

- Make structured output capability explicit in provider metadata. Today callers infer it by checking whether `runtime.generateObject` exists.
- Replace OpenRouter's local Zod-to-JSON-schema subset with a more complete schema conversion path before documenting broad schema support.
- Separate app-settings helpers from generation runtime helpers if external consumers do not need CueCraft-style setup-state derivation.

These are follow-up API design items, not blockers for documenting the current package.

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

## Package Boundaries

CueCraft owns storage, UI, Obsidian integration, prompting, validation, and note-specific workflows. BYOK receives resolved runtime credentials through provider configs and must not import Obsidian, Electron, DOM UI helpers, CueCraft settings, or CueCraft prompt/validation modules.

## License

MIT. See [LICENSE](./LICENSE).
