# AI Model Settings Improvements

## Priority Table

| Priority | Improvement | Benefit | Suggested Scope |
| --- | --- | --- | --- |
| P0 | Provider-specific model dropdown | Removes guesswork and typo-prone model IDs; users can pick a known-good model confidently. | Start with Anthropic, then repeat for OpenAI, Gemini, Grok, and Ollama. |
| P0 | Exact-model connection test | Confirms the selected API key can actually use the selected model, not just reach the provider. | Update the test result copy and error handling around unavailable models. |
| P1 | Recommended default per provider | Gives most users a strong starting point without research. | Use Claude Sonnet 4.6 for Anthropic as the balanced default, with Haiku for speed/cost and Opus for quality. |
| P1 | Custom model ID escape hatch | Keeps CueCraft usable when providers release new models before the plugin is updated. | Add a `Custom model ID...` option that reveals a text field. |
| P1 | Model capability and cost hints | Helps users understand the tradeoff between speed, quality, and cost before generating many cues. | Show short helper text under the model picker. |
| P2 | Refresh available models | Lets users discover newly available account-specific models. | Add a refresh action after an API key is entered, falling back to the curated list if the API call fails. |
| P2 | Parallel request guidance by provider/model | Prevents accidental rate-limit pain while preserving fast generation for users with higher limits. | Show a hint near `Parallel requests` based on provider and selected model. |
| P2 | Cleaner provider selection layout | Makes AI setup feel more intentional and less like a pile of unrelated fields. | Group provider, key, model, and test connection into one coherent setup block. |
| P3 | Per-provider setup status | Makes it obvious whether CueCraft is ready to generate cues. | Show small statuses like `Key saved`, `Model selected`, and `Connection tested`. |
| P3 | Advanced model details drawer | Gives power users context without cluttering the main settings page. | Hide model IDs, context window, and provider notes behind an optional details area. |

## 1. Provider-Specific Model Dropdown

The current free-text model field makes users remember exact provider IDs, which is brittle. A dropdown should list friendly names first, while still preserving the actual model ID behind the scenes.

For Anthropic, the first curated list should include:

| Display Name | Model ID | Positioning |
| --- | --- | --- |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | Recommended balanced option for CueCraft. |
| Claude Haiku 4.5 | `claude-haiku-4-5` | Faster and lower-cost option for frequent generation. |
| Claude Opus 4.8 | `claude-opus-4-8` | Higher-quality option for dense or subtle notes. |
| Claude Fable 5 | `claude-fable-5` | Premium option when available on the user's account. |
| Claude 3.5 Sonnet Latest | `claude-3-5-sonnet-latest` | Legacy compatibility for existing settings. |
| Claude 3.5 Haiku Latest | `claude-3-5-haiku-latest` | Legacy compatibility for users already configured this way. |

Benefit: users can make a model choice based on intent instead of memorizing provider naming schemes. It also gives CueCraft a place to recommend a default without hiding the underlying model ID from advanced users.

## 2. Exact-Model Connection Test

The connection test should validate the selected provider, API key, and model together. A key can be valid while a specific model is unavailable, deprecated, or not enabled for the account.

The success state should say something like:

> Connected to Anthropic with Claude Sonnet 4.6 (`claude-sonnet-4-6`).

The error state should distinguish likely causes:

| Error Type | User-Facing Message |
| --- | --- |
| Invalid key | `Anthropic rejected this API key.` |
| Model unavailable | `This key cannot access Claude Opus 4.8. Pick another model or check your Anthropic account.` |
| Rate limited | `Anthropic is rate-limiting requests right now. Try again or lower parallel requests.` |
| Network issue | `CueCraft could not reach Anthropic from Obsidian.` |

Benefit: users get actionable troubleshooting instead of a vague failure.

## 3. Recommended Defaults

CueCraft should choose a strong default for each provider. For Anthropic, Claude Sonnet 4.6 is the best default because it should balance quality, speed, and cost for study-cue generation.

Suggested Anthropic framing:

| Model | Best For |
| --- | --- |
| Claude Haiku 4.5 | Fast cue refreshes, lower cost, large batches. |
| Claude Sonnet 4.6 | Everyday use, strong cue quality, balanced latency. |
| Claude Opus 4.8 | Harder notes, subtle concepts, best-quality generation. |

Benefit: new users can start generating without researching model families, while experienced users still have control.

## 4. Custom Model ID Escape Hatch

Provider model lists change quickly. CueCraft should avoid blocking early adopters when Anthropic, OpenAI, Google, or xAI releases something new.

The dropdown can include:

- `Custom model ID...`

When selected, CueCraft reveals a text input and stores exactly what the user enters.

Benefit: the plugin stays useful between releases, and user support becomes easier because advanced users have an obvious override.

## 5. Capability And Cost Hints

The settings page should help users understand what a model choice means for CueCraft specifically. Instead of generic provider marketing language, use short practical hints:

| Hint Type | Example |
| --- | --- |
| Quality | `Best for dense notes and nuanced explanations.` |
| Speed | `Fastest option for frequent cue refreshes.` |
| Cost | `Good choice when regenerating large notes often.` |
| Context | `Useful for long documents with many sections.` |

Benefit: model selection becomes a product decision, not an API documentation task.

## 6. Refresh Available Models

After an API key is entered, CueCraft can eventually offer a `Refresh models` action. This should query the provider when supported and merge those results with the curated fallback list.

Suggested behavior:

- If the request succeeds, show available models for that account.
- If the request fails, keep the curated list visible.
- If the saved model is missing from the list, preserve it as a custom model instead of overwriting it.

Benefit: users see account-specific availability while CueCraft remains resilient offline or during provider API changes.

## 7. Parallel Request Guidance

CueCraft can already generate section cues in parallel. The AI settings page should connect model/provider choice to the `Parallel requests` slider.

Examples:

| Situation | Hint |
| --- | --- |
| Anthropic + Haiku | `Usually safe for faster parallel generation.` |
| Anthropic + Opus | `Consider fewer parallel requests if you hit rate limits.` |
| Any provider after rate-limit error | `Lower this value if generation fails with rate-limit errors.` |
| Ollama | `Local performance depends on your machine and selected model.` |

Benefit: users understand why parallelism exists and how to tune it without learning provider rate-limit systems.

## 8. Cleaner Provider Selection Layout

The AI model section should feel like one setup flow:

1. Choose provider.
2. Enter or confirm key.
3. Choose model.
4. Test connection.
5. Tune generation speed.

This can stay compact, but the grouping should make the relationship between fields clearer. The current page has all the right ingredients; the next improvement is hierarchy.

Benefit: setup feels deliberate and trustworthy, especially for users bringing paid API keys.

## 9. Per-Provider Setup Status

A lightweight status row can reduce uncertainty:

| Status | Meaning |
| --- | --- |
| `Key saved` | CueCraft has a stored key for this provider. |
| `Model selected` | A model ID is configured. |
| `Connection tested` | The current provider/key/model combination worked recently. |

Benefit: users can quickly tell whether CueCraft is ready before generating cues on a large document.

## 10. Advanced Model Details Drawer

Most users should not need to stare at model IDs, token windows, provider dates, or raw API metadata. A small details drawer can expose that information without cluttering the main setup.

Possible contents:

- Model ID
- Provider family
- Recommended use
- Known availability note
- Last refreshed timestamp, once dynamic model fetching exists

Benefit: advanced users get transparency without making the default settings page feel technical.

## Suggested First Implementation Slice

Build this in the smallest useful step:

1. Add the Anthropic curated model dropdown.
2. Make Claude Sonnet 4.6 the recommended/default Anthropic model.
3. Preserve legacy/custom saved model IDs.
4. Add a custom model option.
5. Improve test connection copy so it names the exact selected model.
6. Update the progress note and tests.

This gives CueCraft an immediately better setup experience without requiring dynamic provider model discovery yet.

## Manual Obsidian Test Plan

After implementing the first slice:

1. Keep `bun run dev` running.
2. Hot reload the CueCraft plugin in Obsidian.
3. Open Settings -> Community plugins -> CueCraft.
4. Select `Anthropic (Claude)` as the AI provider.
5. Confirm the model field is a dropdown with friendly Claude model names.
6. Select Claude Haiku 4.5, close settings, reopen settings, and confirm it persists.
7. Select `Custom model ID...`, enter a custom value, close and reopen settings, and confirm it persists.
8. Run `Test connection` with a valid key and confirm the notice names the selected model.
9. Select a model your key cannot access, if available, and confirm the error message is specific enough to act on.
10. Generate cues for a note and confirm cue generation uses the selected model.
