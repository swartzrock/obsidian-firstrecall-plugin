# OpenRouter + Model Combobox TODO

Source ideation: `docs/ideation/2026-06-18-openrouter-combobox-model-selection-ideation.md`

## Goal

Implement OpenRouter as a first-class CueCraft AI provider and replace the current model ID field/dropdown experience with a searchable, provider-aware model picker. Keep the work phase-gated so each phase can be tested in Obsidian before committing and moving on.

## Goal Mode Instructions

If this file is used with `/goal`, the goal for a single run is NOT to finish this whole file.

> Complete all unchecked tasks in exactly one phase, report manual Obsidian test instructions, and stop.

Rules:

1. Only work on ONE incomplete phase at a time.
2. Within that phase, complete all unchecked tasks that belong to the phase when feasible.
3. Do not start the next phase in the same run.
4. Do not skip ahead to easier or more interesting work in a later phase.
5. After code changes, update `docs/CueCraft-Progress.md` and the documented test count.
6. Run the relevant automated checks for the phase, preferably `bun run typecheck` and `bun run test`.
7. Report manual Obsidian testing instructions after every phase, even if the phase is mostly internal.
8. Stop after reporting the phase result and wait for the user to test.
9. Do not create a git commit until the user explicitly says `continue`.
10. When the user says `continue`, first commit the completed phase with a descriptive message, then begin exactly one next incomplete phase.
11. If a phase cannot be completed, leave its checkbox unchecked and explain the blocker.
12. Keep selected model IDs stored as strings so existing settings remain compatible.

## Scope

- Add OpenRouter without removing direct Anthropic, OpenAI, Google, xAI, or Ollama support.
- Preserve the custom model ID escape hatch for every provider.
- Prefer the existing AI SDK/OpenAI-compatible provider path for OpenRouter. Add a new dependency only if implementation proves the existing path cannot support OpenRouter cleanly inside Obsidian.
- Use explicit model refresh/fetch controls first; do not add live network search while typing.
- Treat structured-output support as a warning/recommendation layer, not a hard block.
- Keep settings UI calm and compact. Avoid large provider cards in this pass.

## Out Of Scope

- OpenRouter routing preference controls.
- Multi-model fallback chains.
- OAuth or hosted key management.
- Automatic remote model search on every keystroke.
- Response-repair or response-healing loops.
- Reworking cue generation prompts beyond provider/model compatibility needs.

## Phase 1 - OpenRouter Provider Plumbing

- [x] Add `openrouter` to `ProviderId` and every provider switch that must recognize it.
- [x] Add OpenRouter settings fields to `CueCraftSettings` and `DEFAULT_SETTINGS`:
  - `openrouterApiKey`
  - `openrouterModel`
  - `openrouterAvailableModels`
  - `openrouterHasFetchedModels`
  - `openrouterModelRefreshMessage`
- [x] Add OpenRouter to provider display names, selected model labels, and setup/status maps.
- [x] Add OpenRouter credential UI using the same local-key pattern as the other cloud providers.
- [x] Add OpenRouter to `isConfigured()` and `makeProvider()` in `src/main.ts`.
- [x] Create `src/providers/openrouter-provider.ts`.
- [x] Implement OpenRouter generation through the OpenAI-compatible AI SDK path with base URL `https://openrouter.ai/api/v1`.
- [x] Add minimal OpenRouter attribution headers if supported by the existing fetch path, without sending vault or note content as metadata.
- [x] Implement `listModels()` against OpenRouter's models endpoint and return string IDs for this first phase.
- [x] Add provider tests covering generation, connection testing, model listing, API key handling, and abort behavior.
- [x] Update `docs/CueCraft-Progress.md` and the test count.
- [x] Run `bun run typecheck`.
- [x] Run `bun run test`.

Manual Obsidian test instructions:

- Reload CueCraft in Obsidian.
- Open Settings -> CueCraft -> AI model.
- Confirm `OpenRouter` appears in the provider dropdown.
- Select OpenRouter, enter an OpenRouter API key, and enter a known model ID manually.
- Click `Test connection` and confirm the status reflects the current provider.
- Generate cues on a small note and confirm cues appear normally.

## Phase 2 - OpenRouter Model Fetch UX

- [ ] Wire OpenRouter into the existing fetched-model selector path.
- [ ] Make the OpenRouter model row describe the model ID format clearly, including the provider/model pattern.
- [ ] Add refresh/fetch copy specific enough to make it clear models come from OpenRouter.
- [ ] Preserve the current model value if the fetched model list does not include it.
- [ ] Preserve custom model entry behavior for OpenRouter.
- [ ] Ensure switching away from OpenRouter and back does not lose the saved OpenRouter key/model.
- [ ] Add tests for OpenRouter model refresh, sorted model IDs, refresh status messages, and custom model preservation.
- [ ] Update `docs/CueCraft-Progress.md` and the test count.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run test`.

Manual Obsidian test instructions:

- Reload CueCraft in Obsidian.
- Select OpenRouter in Settings -> CueCraft -> AI model.
- Click the model refresh/fetch button.
- Confirm fetched OpenRouter models appear in the selector.
- Select a fetched model, close settings, reopen settings, and confirm the selection persists.
- Choose or type a custom model ID and confirm it is not overwritten by refresh.

## Phase 3 - Model Metadata Layer

- [ ] Add a small model metadata module, such as `src/model-options.ts`.
- [ ] Define a normalized model option shape with at least:
  - `id`
  - `label`
  - `provider`
  - `contextLength`
  - `pricing`
  - `supportedParameters`
  - `source`
- [ ] Add helper functions to normalize string IDs and OpenRouter model objects into the same display-ready shape.
- [ ] Add stable sorting helpers that put recommended/current models first, then sort human-readably.
- [ ] Keep persisted selected model values as strings.
- [ ] Avoid storing raw OpenRouter payloads in settings; store only normalized metadata needed for display and compatibility checks.
- [ ] Update OpenRouter model fetching to retain metadata when available.
- [ ] Adapt existing string-only model arrays through the normalization helper so current providers keep working.
- [ ] Add unit tests for OpenRouter model metadata parsing, string fallback normalization, and sorting.
- [ ] Update `docs/CueCraft-Progress.md` and the test count.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run test`.

Manual Obsidian test instructions:

- Reload CueCraft in Obsidian.
- Fetch OpenRouter models.
- Confirm models still display and select correctly.
- Confirm previously saved custom model IDs still appear as valid custom selections.
- Switch between OpenRouter and another cloud provider to confirm existing provider model selection still works.

## Phase 4 - Searchable Model Combobox

- [ ] Build a reusable model combobox component, preferably in its own file if it keeps `src/settings.ts` smaller.
- [ ] Support mouse selection, keyboard navigation, `Enter`, `Escape`, and blur behavior.
- [ ] Filter client-side by model ID, label, provider, and useful badges.
- [ ] Show a clear empty state when no fetched suggestions match.
- [ ] Allow custom typed model IDs without forcing the user to pick a fetched suggestion.
- [ ] Keep the current saved model visible even when suggestions are empty or stale.
- [ ] Replace the existing fetched-model selector with the combobox for OpenRouter and the generic cloud providers.
- [ ] Reuse the combobox for Anthropic curated/fetched model selection if this can be done without a broad rewrite; otherwise leave Anthropic for a follow-up phase and document why.
- [ ] Add theme-safe CSS in `styles.css`.
- [ ] Add tests for filtering helpers, custom value handling, and selected-value preservation.
- [ ] Update `docs/CueCraft-Progress.md` and the test count.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run test`.

Manual Obsidian test instructions:

- Reload CueCraft in Obsidian.
- Open Settings -> CueCraft -> AI model and select OpenRouter.
- Fetch models, then type part of a provider name or model name into the combobox.
- Use arrow keys and `Enter` to select a suggestion.
- Type a custom model ID and confirm it can be saved.
- Close and reopen settings to confirm the selected model persists.
- Repeat a quick selection check for at least one non-OpenRouter cloud provider.

## Phase 5 - Compatibility Badges And Warnings

- [ ] Use model metadata to detect likely structured-output support, especially OpenRouter `supported_parameters`.
- [ ] Add concise model badges such as `Recommended`, `Structured output`, `Large context`, or `Low cost` only when they help selection.
- [ ] Keep badges visually restrained and avoid turning every metadata field into a chip.
- [ ] Show a warning when the selected model appears to lack structured-output support.
- [ ] Make the warning explanatory but non-blocking: users can still choose the model.
- [ ] Prefer CueCraft-suitable models in sorting without hiding the rest of the list.
- [ ] Add tests for compatibility detection, badge selection, and warning copy helpers.
- [ ] Update `docs/CueCraft-Progress.md` and the test count.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run test`.

Manual Obsidian test instructions:

- Reload CueCraft in Obsidian.
- Fetch OpenRouter models.
- Confirm recommended or structured-output-friendly models are easy to identify.
- Select a model without structured-output metadata and confirm a non-blocking warning appears.
- Select a structured-output-friendly model and confirm the warning clears.
- Generate cues to confirm warnings do not prevent normal operation.

## Phase 6 - Exact Model Verification

- [ ] Revisit `src/provider-setup-status.ts` so cloud model changes can make setup status stale when appropriate.
- [ ] Decide whether exact-model verification applies to all cloud providers or only OpenRouter, then document the rationale in code or progress notes.
- [ ] Update `testCloudProvider()` so a selected model is actually tested, not just the provider API key/model-list endpoint.
- [ ] Keep a reasonable key-only/list-model check for cases where no model has been selected yet.
- [ ] Improve setup status copy so users understand whether the key, provider, and selected model are verified.
- [ ] Update tests that currently expect cloud model changes to keep verification fresh.
- [ ] Add tests for OpenRouter model-change staleness and exact selected-model connection testing.
- [ ] Update `docs/CueCraft-Progress.md` and the test count.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run test`.

Manual Obsidian test instructions:

- Reload CueCraft in Obsidian.
- Select OpenRouter, choose a model, and click `Test connection`.
- Confirm the setup status shows the current model as verified.
- Change the selected model and confirm the setup status becomes stale or asks for re-test.
- Click `Test connection` again and confirm the new model is verified.
- Generate cues with the verified model.

## Phase 7 - Documentation And Final QA

- [ ] Update README or user-facing docs that list supported AI providers.
- [ ] Update `docs/CueCraft-Progress.md` with the full OpenRouter/model-picker status and final test count.
- [ ] Confirm all new settings have sensible defaults and do not expose API keys.
- [ ] Confirm no `.env` files, vault notes, or local credentials were touched.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run test`.
- [ ] Run the normal build command if different from the user's background `bun run dev` flow.
- [ ] Review the settings page visually in Obsidian for spacing, focus states, and text overflow.

Manual Obsidian test instructions:

- Reload CueCraft in Obsidian.
- Test the full AI setup flow for OpenRouter from a fresh provider selection.
- Fetch models, search/select a recommended model, test connection, close settings, and reopen settings.
- Generate cues for a short note and a multi-heading note.
- Change the selected OpenRouter model, confirm setup status updates correctly, re-test connection, and regenerate cues.
- Spot-check one existing direct provider to confirm it was not broken.

## Future Follow-Ups

- Add OpenRouter routing controls for cost, latency, and provider fallback.
- Add provider comparison details such as estimated cost per cue batch.
- Add model families or saved favorites.
- Add remote search for very large provider catalogs if client-side filtering becomes noisy.
- Add response-repair for models that nearly satisfy the cue schema.
