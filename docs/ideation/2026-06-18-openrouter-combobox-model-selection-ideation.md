---
date: 2026-06-18
topic: openrouter-combobox-model-selection
focus: AI model settings
mode: repo-grounded
---

# Ideation: OpenRouter and Combobox Model Selection

CueCraft already has the bones of a solid AI setup flow: per-provider credentials, model refresh, setup status, and strict structured cue generation. The next strong move is to add OpenRouter without multiplying settings complexity, then replace the current dropdown-or-text-field model picker with a searchable, suggestion-rich picker that works across providers.

## Grounding Context

CueCraft is an Obsidian plugin for active-recall study cues. It currently supports Ollama plus Anthropic, OpenAI, Google, and xAI cloud providers, and the progress doc says provider model-list discovery is already shipped for OpenAI, Gemini, xAI, and Ollama.

- **Provider surface:** `ProviderId` is currently limited to `ollama | anthropic | openai | google | xai`, and the settings model stores separate key/model/model-list fields per cloud provider in `src/settings.ts:61-100`.
- **AI setup flow:** the settings screen is already structured as choose provider, add credentials, verify setup, choose model, and tune speed in `src/settings.ts:394-470`. OpenRouter should fit into that flow, not require a second setup path.
- **Current model picker limitation:** `renderFetchedModelSelector` switches between a plain dropdown after fetch and a plain text field before fetch; options are currently string IDs only in `src/settings.ts:1250-1323`.
- **Cloud model refresh limitation:** `refreshCloudModels` casts `provider.listModels()` to `string[]`, sorts IDs, and stores only strings in `src/settings.ts:1399-1428`, so richer OpenRouter metadata would be discarded unless the model option shape changes.
- **Provider implementation seam:** `OpenAIProvider` wraps `createOpenAI`, injects Obsidian-safe fetch, and exposes `listModels()` in `src/providers/openai-provider.ts:21-69`. `CueCraftPlugin.makeProvider()` centralizes provider construction in `src/main.ts:803-838`.
- **Structured-output dependency:** CueCraft relies on AI SDK `generateObject` plus Zod schemas for validated cues and summaries in `src/providers/ai-sdk-provider.ts:32-68` and `src/providers/ai-sdk-provider.ts:309-319`. Any OpenRouter picker should care about structured-output compatibility.
- **Status caveat:** `currentConnectionVerificationModelValue()` returns the model only for Ollama, so cloud model changes intentionally do not stale the connection today in `src/provider-setup-status.ts:81-85`. The existing test locks that behavior in `tests/provider-setup-status.test.ts:52-62`.

External grounding: OpenRouter documents an OpenAI-like chat-completions API, optional app attribution headers, structured-output support, and model routing/fallback behavior. Its model endpoint returns model metadata such as `id`, `name`, `context_length`, `pricing`, and `supported_parameters`, with query filters and server-side sorting. The AI SDK also documents both a generic OpenAI provider with `baseURL` and custom headers, and a dedicated community OpenRouter provider package.

## Topic Axes

- Provider architecture
- Model-picking interaction
- Model intelligence and recommendations
- Structured-output reliability
- Setup trust and verification

## Ranked Ideas

### 1. Universal searchable model combobox

**Description:** Replace the current fetched-model dropdown plus custom text fallback with one provider-agnostic combobox. It should support typing a custom model ID, filtering fetched suggestions, keyboard navigation, recently used models, and a clear custom value state when the saved model is not in the fetched catalog.

**Axis:** Model-picking interaction

**Basis:** `direct:` current settings render either a dropdown or text input in `src/settings.ts:1269-1323`; OpenRouter's model list is too large and metadata-rich for a plain select.

**Rationale:** This is the highest-leverage UI improvement because it helps Anthropic, OpenAI, Gemini, xAI, Ollama, and OpenRouter at once. It also preserves the essential escape hatch for brand-new model IDs.

**Downsides:** Obsidian has no native combobox control in `Setting`, so CueCraft would need a small custom DOM component with careful focus, ARIA, keyboard, and theme styling.

**Confidence:** 92%

**Complexity:** Medium

### 2. OpenRouter as a first-class AI Router provider

**Description:** Add `openrouter` as a normal provider in CueCraft settings, labeled something like `OpenRouter (AI Router)`. Store an OpenRouter API key, selected model ID, fetched model list, and refresh message alongside the existing provider-specific settings, then wire it through the existing provider factory and tests.

**Axis:** Provider architecture

**Basis:** `direct:` provider construction is centralized in `src/main.ts:803-838`, while current settings fields are explicitly per-provider in `src/settings.ts:72-100`. `external:` OpenRouter's overview says its request and response schemas are very similar to OpenAI Chat API, and AI SDK documents both OpenAI-compatible customization and a dedicated OpenRouter provider.

**Rationale:** The user gets access to Claude, GPT, Gemini, open-source models, and routing/fallback through one key, while CueCraft keeps direct-provider paths for users who already have Anthropic or OpenAI keys.

**Downsides:** The team must choose between no-new-dependency OpenAI-compatible implementation and the official community package `@openrouter/ai-sdk-provider`. The former is simpler; the latter may better expose OpenRouter-specific behavior.

**Confidence:** 88%

**Complexity:** Medium

### 3. Model metadata layer with CueCraft-specific badges

**Description:** Stop treating fetched models as bare strings. Introduce a small internal `ModelOption` shape with `id`, `label`, `provider`, `contextLength`, `pricing`, `supportedParameters`, and optional CueCraft tags such as `Recommended`, `Fast`, `Low cost`, `Large context`, and `Structured output`.

**Axis:** Model intelligence and recommendations

**Basis:** `external:` OpenRouter's model endpoint returns display names, context length, pricing, supported parameters, and server-side sorting/search. `direct:` CueCraft currently stores OpenAI/Gemini/xAI/Ollama model lists as `string[]` and sorts bare IDs in `src/settings.ts:1420-1421`.

**Rationale:** This turns model choice from decoding vendor slugs into choosing a practical tradeoff. For CueCraft, the most useful defaults are probably fast, reliable structured-output models rather than the most expensive model on the market.

**Downsides:** Metadata normalization can sprawl if it tries to make every provider equal. Keep v1 tags deliberately sparse and derived from data the provider actually supplies.

**Confidence:** 86%

**Complexity:** Medium

### 4. Structured-output compatibility guardrails

**Description:** In OpenRouter model search, prefer or filter to models that support structured output. The picker should show a calm warning for models without visible `response_format` support, while still allowing a custom override for advanced users.

**Axis:** Structured-output reliability

**Basis:** `direct:` CueCraft depends on structured object generation and validates output through strict schemas in `src/providers/ai-sdk-provider.ts:32-68` and `src/providers/ai-sdk-provider.ts:309-319`. `external:` OpenRouter documents `response_format` with JSON object and JSON schema modes, and its structured-output guide says to check model supported parameters and use strict mode.

**Rationale:** OpenRouter's breadth is also the risk: a giant list includes models that may be attractive but brittle for CueCraft's schema-driven cue generation. Compatibility guidance protects the core loop.

**Downsides:** OpenRouter support metadata may not perfectly predict model behavior, so this should be a recommendation and warning layer, not an absolute lockout.

**Confidence:** 90%

**Complexity:** Low-Medium

### 5. Exact-model verification and stale-status honesty

**Description:** Make setup status and `Test connection` explicitly reflect the selected cloud model, not only the API key. For OpenRouter, a successful check should mean the key can reach the selected model and the model can satisfy CueCraft's structured-output test.

**Axis:** Setup trust and verification

**Basis:** `direct:` `currentConnectionVerificationModelValue()` returns an empty model value for every non-Ollama provider in `src/provider-setup-status.ts:81-85`, and the test suite currently expects a cloud model change to keep the verified status in `tests/provider-setup-status.test.ts:52-62`.

**Rationale:** OpenRouter makes model switching common. A green status that only means "this key listed models once" will feel misleading after the user selects a specific model for generation.

**Downsides:** Exact model checks can cost a tiny request and may fail temporarily because OpenRouter routes across upstream providers. The UI should distinguish key/list success from selected-model generation success.

**Confidence:** 84%

**Complexity:** Low-Medium

### 6. Progressive AI setup: direct providers plus router mode

**Description:** Keep the existing single provider dropdown for now, but group the copy around two mental models: direct providers and router provider. OpenRouter should be described as one key for many models, while Anthropic/OpenAI/Google/xAI remain direct paths for users who want vendor-specific billing or access.

**Axis:** Setup trust and verification

**Basis:** `direct:` the settings flow already has five explicit steps in `src/settings.ts:403-470`, and adding another provider option to the existing dropdown is cheap. `external:` AI SDK's OpenRouter page describes universal model access, transparent pricing, automatic failover, and access to new models.

**Rationale:** This avoids a big provider-card redesign before the OpenRouter behavior is proven. The product copy does the work: "Use direct providers when you already know what you want; use OpenRouter when you want one key and broad model choice."

**Downsides:** The dropdown will get longer. Provider cards may still be warranted later, but they should follow real usage rather than arrive with the first OpenRouter slice.

**Confidence:** 78%

**Complexity:** Low

## Top Recommendation

Build the provider plumbing and combobox as two separate slices:

1. Add OpenRouter with the current fetched selector so generation can work.
2. Replace the selector with a reusable combobox and richer model option shape.
3. Add structured-output compatibility hints and exact-model verification once the richer model data exists.

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Replace all direct providers with OpenRouter | Subject-replacement: users already have direct Anthropic/OpenAI/Gemini/xAI flows and keys; OpenRouter should add breadth, not erase existing trust paths. |
| 2 | Dump every OpenRouter model into a native dropdown | Below ambition floor: the model list is too large and metadata-rich; a plain select repeats the current picker weakness at larger scale. |
| 3 | Auto-pick the cheapest model silently | Trust risk: cost is not the only constraint for schema-valid study cues, and silent choice hides quality/reliability tradeoffs. |
| 4 | Expose every OpenRouter routing preference immediately | Too expensive relative to likely value: `models[]`, fallback routes, provider preferences, regions, and ZDR filters should come after basic provider use is proven. |
| 5 | Create a full model registry abstraction for every provider now | Scope overrun: useful later, but OpenRouter plus combobox only needs a small `ModelOption` shape first. |
| 6 | Use a frontend framework for the combobox | Not grounded in the repo: settings are Obsidian DOM APIs, not React; a framework runtime would be disproportionate. |
| 7 | Remove custom model ID entry | Already known bad outcome: model IDs change quickly, and earlier settings work intentionally preserved custom IDs. |
| 8 | Fetch OpenRouter search results on every keystroke | Reliability and UX risk: latency and network failure would make the settings control feel jumpy. Fetch once, cache locally, filter client-side; optionally add explicit refresh/search later. |
| 9 | Make OpenRouter OAuth/account linking part of v1 | Interesting but too large: API key entry matches existing cloud providers and keeps the first slice testable. |
| 10 | Add OpenRouter response-healing plugin automatically | Better handled later: response healing may mask model incompatibility; first protect the picker with structured-output metadata and exact tests. |
| 11 | Add provider cards before OpenRouter ships | Better as a brainstorm variant: cards may help, but the current flow is already structured and a card redesign would slow the provider slice. |
| 12 | Support multi-model fallback chains in CueCraft settings | Scope overrun: OpenRouter has native routing/fallback; CueCraft should not design its own fallback chain before basic OpenRouter use exists. |
| 13 | Store OpenRouter raw model payloads directly in settings forever | Data-shape risk: raw provider payloads can change. Store a normalized CueCraft option shape and keep refresh reconstructible. |
| 14 | Prompt users to choose models before entering a key | Usability mismatch: OpenRouter can list public models, but account/key context matters for availability and billing. Let suggestions exist, but verify after key entry. |

## Sources

- [OpenRouter API overview](https://openrouter.ai/docs/api/reference/overview)
- [OpenRouter list models endpoint](https://openrouter.ai/docs/api/api-reference/models/get-models)
- [OpenRouter structured outputs guide](https://openrouter.ai/docs/guides/features/structured-outputs)
- [AI SDK OpenAI provider docs](https://ai-sdk.dev/providers/ai-sdk-providers/openai)
- [AI SDK OpenRouter provider docs](https://ai-sdk.dev/providers/community-providers/openrouter)
