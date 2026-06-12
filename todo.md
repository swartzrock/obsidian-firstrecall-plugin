# AI Model Settings TODO

Source brief: "docs/AI Model Settings Improvements.md"

## Goal

Implement all AI model settings improvements from the brief, preserving current CueCraft behavior and updating tests/progress docs after each change.

## Goal Mode Instructions

If this file is used with `/goal`, the goal for a single run is NOT to finish this whole file. The goal for a single run is:

> Complete all unchecked tasks in exactly one phase, report manual test instructions, and stop.

Stopping after one phase is a successful completion of that run. Do not continue just because there are more unchecked phases below.

## Phase 1: Anthropic Picker
- [x] Add curated Anthropic model catalog
- [x] Replace Anthropic free-text field with dropdown
- [x] Add custom model ID fallback
- [x] Preserve existing saved model IDs
- [x] Default Anthropic to Claude Sonnet 4.6
- [x] Add tests
- [x] Update docs/CueCraft-Progress.md
- [x] Manual Obsidian test instructions

## Phase 2: Connection Test Copy
- [x] Show friendly model name and raw ID on success
- [x] Improve unavailable-model error copy
- [x] Add tests
- [x] Update progress docs
- [x] Manual Obsidian test instructions

## Phase 3: Model Capability And Cost Hints
- [x] Add short model hint metadata for quality, speed, cost, and context tradeoffs
- [x] Show the selected model's practical CueCraft-specific hint under the model picker
- [x] Keep hint copy concise enough to fit the existing settings layout
- [x] Add tests for model hint selection/fallback behavior
- [x] Update docs/CueCraft-Progress.md and test counts if needed
- [x] Manual Obsidian test instructions

## Phase 4: Refresh Available Models
- [x] Add a provider model-list abstraction that can return curated fallback models
- [x] Add Anthropic model refresh support after an API key is entered
- [x] Merge refreshed models with curated fallback models without losing recommended labels
- [x] Preserve the saved model as a custom option if it is not returned by the provider
- [x] Show a clear fallback/error state if refresh fails
- [x] Add tests for refresh success, refresh failure, and saved-model preservation
- [x] Update docs/CueCraft-Progress.md and test counts if needed
- [x] Manual Obsidian test instructions

## Phase 5: Parallel Request Guidance
- [x] Add provider/model-specific guidance text for the Parallel requests setting
- [x] Show safer guidance for premium or rate-limit-prone cloud models
- [x] Show local-performance guidance for Ollama
- [x] Add tests for guidance selection/fallback behavior
- [x] Update docs/CueCraft-Progress.md and test counts if needed
- [x] Manual Obsidian test instructions

## Phase 6: Cleaner Provider Selection Layout
- [x] Group provider, API key, model picker, and test connection into one coherent AI setup section
- [x] Make the setup order visually match choose provider, enter key, choose model, test connection, tune speed
- [x] Keep the settings page compact and consistent with existing Obsidian settings styling
- [x] Confirm no setting controls overlap or wrap awkwardly at narrow settings widths
- [x] Add tests only if shared settings rendering helpers are introduced
- [x] Update docs/CueCraft-Progress.md and test counts if needed
- [x] Manual Obsidian test instructions

## Phase 7: Per-Provider Setup Status
- [x] Add lightweight setup status indicators for key saved, model selected, and connection tested
- [x] Store or derive the most recent successful connection test for the current provider/model combination
- [x] Clear or mark connection status stale when provider, model, or API key changes
- [x] Add tests for status derivation and stale-status behavior
- [x] Update docs/CueCraft-Progress.md and test counts if needed
- [x] Manual Obsidian test instructions

## Phase 7.5: List Models Support
- [x] Add "List Models" support for OpenAI
- [x] Add "List Models" support for Gemini
- [x] Add "List Models" support for xAI
- [x] Add "List Models" support for Ollama
- [x] Update docs/CueCraft-Progress.md and test counts if needed
- [x] Manual Obsidian test instructions




## Phase 8: Advanced Model Details Drawer
- [ ] Add an optional details area for the selected model
- [ ] Show model ID, provider family, recommended use, availability notes, and last refreshed timestamp when available
- [ ] Keep advanced details collapsed or unobtrusive by default
- [ ] Preserve custom model IDs and show useful details even when catalog metadata is unavailable
- [ ] Add tests for details metadata and custom-model fallback behavior
- [ ] Update docs/CueCraft-Progress.md and test counts if needed
- [ ] Manual Obsidian test instructions

## Phase 9: OpenAI Model Picker
- [ ] Add curated OpenAI model catalog with recommended, fast, and high-quality options
- [ ] Replace the OpenAI free-text model field with a dropdown plus custom model ID fallback
- [ ] Preserve existing saved OpenAI model IDs
- [ ] Add OpenAI-specific model hints and setup status coverage
- [ ] Add tests
- [ ] Update docs/CueCraft-Progress.md and test counts if needed
- [ ] Manual Obsidian test instructions

## Phase 10: Gemini Model Picker
- [ ] Add curated Gemini model catalog with recommended, fast, and high-quality options
- [ ] Replace the Gemini free-text model field with a dropdown plus custom model ID fallback
- [ ] Preserve existing saved Gemini model IDs
- [ ] Add Gemini-specific model hints and setup status coverage
- [ ] Add tests
- [ ] Update docs/CueCraft-Progress.md and test counts if needed
- [ ] Manual Obsidian test instructions

## Phase 11: Grok Model Picker
- [ ] Add curated Grok model catalog with recommended, fast, and high-quality options
- [ ] Replace the Grok free-text model field with a dropdown plus custom model ID fallback
- [ ] Preserve existing saved Grok model IDs
- [ ] Add Grok-specific model hints and setup status coverage
- [ ] Add tests
- [ ] Update docs/CueCraft-Progress.md and test counts if needed
- [ ] Manual Obsidian test instructions

## Phase 12: Ollama Model Picker
- [ ] Use Ollama's local model list when Ollama is reachable
- [ ] Keep the current manual/custom Ollama model entry path when Ollama is unavailable
- [ ] Add local-performance hints for selected Ollama models when possible
- [ ] Preserve existing saved Ollama model IDs
- [ ] Add tests for local model list success, failure, and saved-model preservation
- [ ] Update docs/CueCraft-Progress.md and test counts if needed
- [ ] Manual Obsidian test instructions

## Phase 13: Final AI Settings Review
- [ ] Review all AI model settings against docs/AI Model Settings Improvements.md
- [ ] Confirm every improvement in the priority table is implemented or intentionally deferred with a note
- [ ] Run the full automated test suite and build
- [ ] Update docs/CueCraft-Progress.md with final status and test count
- [ ] Provide a full manual Obsidian regression test checklist

## Rules
1. Only work on ONE incomplete phase at a time.
2. Before editing code, identify the single phase you are about to complete.
3. Complete all unchecked tasks in the selected phase.
4. Do not inspect or implement later phases except to understand dependencies for the selected phase.
5. When the selected phase is fully coded and verified, mark only that phase's completed tasks as [x].
6. After finishing the selected phase, STOP immediately and report:
   - what changed
   - tests/build results
   - whether docs/CueCraft-Progress.md and test counts were updated
   - manual Obsidian test instructions
7. Do not commit immediately after finishing a phase.
8. Wait for the user to manually test in Obsidian.
9. Only create a git commit after the user explicitly says `continue`.
10. When the user says `continue`, first commit the completed phase with a descriptive commit message, then begin exactly one next incomplete phase.
11. Never include unfinished phase work in the commit.
12. If there are still incomplete phases after the selected phase is complete, leave them incomplete and stop anyway.
