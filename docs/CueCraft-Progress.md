# CueCraft — Progress & Remaining Work

A living snapshot of what's shipped and what's next, so work can be picked back up easily.
See [`CueCraft-MVP-Scope.md`](./CueCraft-MVP-Scope.md) for the full vision/roadmap and
[`CueCraft-v1-User-Stories.md`](./CueCraft-v1-User-Stories.md) for acceptance criteria.

_Last updated: 2026-06 (Study Area Autopilot shipped: vault/folder study areas, previewed generation, retry/cancel controls, opt-in maintain-on-save, and refined settings UI. Local CLI providers — Codex CLI and Claude CLI now run as desktop-only process providers using the user's existing CLI login, optional model overrides, setup-status snapshots, non-interactive generation, and a one-at-a-time provider concurrency cap. Exact selected-model verification — cloud providers now run the provider generation probe when a model is selected, so successful setup means the current key can use the current model; if no model is selected, Test connection keeps the lighter provider-access/model-list check. Exact-model verification applies to all cloud providers because they share the same AI SDK generation probe path, and changing a cloud model now marks setup verification stale until re-tested. Model compatibility badges and warnings — OpenRouter model metadata now detects structured-output support from `supported_parameters`, surfaces restrained `Structured output`, `Large context`, and `Low cost` badges in the combobox, sorts objective compatibility signals upward without hiding unsupported options, and shows a non-blocking warning when the selected OpenRouter model lacks or does not expose structured-output metadata. Searchable model combobox — fetched model selection now uses a reusable provider-aware combobox for Ollama, OpenRouter, OpenAI, Gemini, and xAI; it filters client-side by model ID, label, provider, and caller-supplied badges; supports mouse, arrow-key, `Enter`, `Escape`, and blur behavior; preserves custom/stale saved IDs as selectable values; and keeps typed custom IDs as the escape hatch. Anthropic keeps its specialized account-model picker for now because it has separate provider display-name metadata and custom selection state that would make this slice broader than the shared fetched-list path. Model metadata layer — normalized `ModelOption` shape (`id`, `label`, `provider`, `contextLength`, `pricing`, `supportedParameters`, `source`) with helpers to normalize plain string IDs and OpenRouter API model objects into the same display-ready type; stable `sortModelOptions` puts the current model first, then sorts human-readably; OpenRouter model fetching now retains rich metadata while persisted model values remain strings; OpenRouter model fetch UX — OpenRouter wired into the fetched-model selector with provider/model format descriptions, model refresh/fetch, custom model preservation, and provider-switch resilience; `resolveModelRefreshDescription` extracted as a standalone testable helper; OpenRouter provider plumbing — first-class OpenRouter support via the OpenAI-compatible AI SDK path with attribution headers, `generateText`-based structured output for broad model compatibility, model listing against the OpenRouter models endpoint, credential UI, and full provider switch integration; per-section and summary generation timing in debug logs; Anthropic account-model fetching, provider model-list discovery across OpenAI/Gemini/xAI/Ollama, exact-model connection-test copy, a cleaner AI setup flow, per-provider setup status, a new settings home with dedicated AI model / cue generation / appearance subpages, configurable Reading-mode display options, a softer Cornell Classic visual treatment, a narrower one-sentence `Study takeaway` summary presentation, and calmer Cornell cue supports now ship with custom-model fallback, preserved saved IDs, provider-safe concurrency tuning copy, and OpenAI-compatible strict structured-output schemas). 439 unit tests passing; `bun run build` + `bun run test` green._

---

## Where we are

**The full core loop is shipped and proven end-to-end** (note → parse → generate → cache →
display → study), the two biggest risks are retired (theme-safe CM6 cue rendering; a provider
producing reliable validated structured cues), and provider breadth now covers a local model,
four direct frontier providers, OpenRouter, and local Codex / Claude CLI process providers. What
remains is mostly **breadth and UX polish**, not core risk.

Rough completion against the full V1.0 → V2 vision: **~72%**, with 100% of the MVP core loop,
all of V1.1 done, V1.2 (presets + typography/layout + in-view controls) effectively
complete (an editor-only Left rail was tried and dropped as a poor fit for CodeMirror), and the V1.5
reading/review slice (reading-mode cues, export, Review) now shipped.

---

## Completed work

Each item links to the PR that delivered it.

### V1.0 — Study Layer MVP (complete)
- **Docs / scope** — MVP scope + phased roadmap (#1), v1.0 user stories & acceptance criteria (#2).
- **Plugin scaffold** — build, ribbon, command palette, settings skeleton (#3).
- **Parser + Ollama provider + generator** — heading-section parser, Ollama provider, bounded
  parallel generation with validation + tests (#4; parallel batching added later).
- **Tooling/CI** — switch to Bun + GitHub Actions (build & test on PRs) (#5).
- **Per-note cache** — per-note JSON cache with `contentHash` stale detection + schema migration (#6).
- **Editor rendering** — cues rendered in the editor via CodeMirror 6 decorations (#8).
- **Ollama robustness** — surface Ollama server errors clearly + cap whole-note context (#9).
- **Lenient validation** — coerce benign model quirks (extra keywords, odd casing) instead of failing (#11).
- **Per-note enable/hide** — hide/enable the cue layer per note, cache kept (#12).
- **Clickable enable/hide** — status-pill click + file/editor context menu toggle (#13, re-landed as #14).
- **Ribbon tooltip** — make the ribbon tooltip describe its (state-dependent) action (#15).

### V1.1 — Provider breadth + control (complete)
- **Per-section regenerate** — regenerate a single section's cue (command + Cornell button) (#17).
- **Refresh stale sections** — regenerate only changed/errored sections (command + toolbar) (#18).
- **Anthropic (Claude) provider** — first frontier provider via the Vercel AI SDK `generateObject`,
  CORS-safe via Obsidian `requestUrl` (#19).
- **OpenAI / Gemini / Grok providers** — shared `AiSdkProvider` base + three vendor subclasses;
  per-provider key/model settings + Test connection (#21).
- **OpenRouter provider** — first-class OpenRouter support via the OpenAI-compatible AI SDK path
  (`@ai-sdk/openai` with `baseURL: https://openrouter.ai/api/v1`), attribution headers
  (`HTTP-Referer`, `X-Title`), model listing against `GET /models`, credential UI following
  the same local-key pattern as the other cloud providers, and full integration across every
  provider switch (`isConfigured`, `makeProvider`, setup status, settings display). Uses
  `generateText` with prompt-embedded JSON schema instead of `generateObject` for broad model
  compatibility.
- **OpenRouter model fetch UX** — OpenRouter wired into the fetched-model selector path with
  `provider/model` format descriptions, fetch/refresh controls with OpenRouter-specific copy,
  custom model entry preserved across refresh, and provider-switching does not lose saved
  OpenRouter key/model. `resolveModelRefreshDescription` extracted as a standalone module for
  testability.
- **Model metadata layer** — `src/model-options.ts` defines a normalized `ModelOption` shape
  with `id`, `label`, `provider`, `contextLength`, `pricing`, `supportedParameters`, and `source`.
  `normalizeStringId` adapts existing string-only provider model arrays; `normalizeOpenRouterModel`
  parses the OpenRouter API response into the same type; `sortModelOptions` puts the current model
  first, then sorts by natural collation. OpenRouter model fetching now returns `ModelOption[]`
  and stores normalized metadata in `openrouterModelOptions` while persisted selected model
  values remain plain strings.
- **Regenerate tone variants** — per-section regenerate offers a tone menu (More conceptual,
  Exam prep, Simpler, Vocabulary), forwarded as a one-off preset override without changing the
  global setting (#27).
- Context menus + clickable toggle (delivered with #13/#14).

### V1.2 — Expression & presets (in progress)
- **Visual style presets** — "Cornell view style" settings dropdown: Cornell Classic, Exam Prep,
  Legal Pad, Minimal, Handwritten. Display-only (never touches generation/cache); switching
  re-renders open Cornell views live (#23).
- **Typography / layout controls** — "Cue column width" (Narrow/Medium/Wide) and "Cue font size"
  (Small/Medium/Large) settings dropdowns applied live to the Cornell view via CSS classes.
  Display-only; pure `cornell-layout.ts` module with unit tests (#28).
- **In-view display controls (Hybrid)** — a `⚙ Display` button in the Cornell toolbar expands an
  in-pane control row (no overlay) with Style / Width / Font controls, so you tweak them while
  looking right at the cues. Writes through to the same saved settings; settings stays the place
  to set the default (#29).
- **Cue content presets** — "Cue preset" (Conceptual / Exam prep / Vocabulary-heavy / Minimal) plus
  one-off tone variants on per-section regenerate; both feed `PRESET_GUIDANCE` into the prompt
  (shipped with #27).

### V1.5 — Reading & Review (shipped)
- **Reading-mode cues** — a Markdown post-processor inserts cached cues beneath their headings in
  reading (preview) view, reusing the same `buildCueLineData` resolution as the editor. Pure
  `reading-cues.ts` map (`buildReadingCueMap`) with unit tests; respects per-note hide (#32).
- **Reading-mode Cornell entry.** Reading view now shows one compact `Review in Cornell` launcher
  near the top of notes with usable cached cues. It stays hidden when cues are missing, hidden, or
  unusable, and routes through the existing `reviewThisNote` flow so Cornell Study Mode behavior
  remains centralized instead of splitting review logic across two entry points.
- **Reading-mode display options.** The Note format settings now expose `Reading mode display`
  choices for `Inline cues` and `Review button`, with the compact review button as the default.
  The full Cornell layout is surfaced as a first-class destination through a dedicated ribbon button
  and the `Open Active Note in Cornell View` command, so edit mode can jump straight to the polished
  Cornell view without entering Study Mode. Study Mode, reveal state, regenerate controls, and the
  display toolbar remain anchored in the dedicated Cornell view.
- **Softer Cornell Classic styling.** Cornell Classic now uses quieter theme-border rules for the
  page title, cue-column divider, and summary boundary, plus more intentional cue-rail spacing and
  softer cue cards. This was implemented as a direct refinement of the existing Classic preset, so
  all current style presets and display controls remain intact without adding a new style id.
- **Study takeaway summary treatment.** Cornell view now presents the cached note summary as a
  narrower `Study takeaway` block instead of a generic full-width summary band, and keeps the
  learning objective visible but visually secondary. Generation prompts for both AI SDK providers
  and Ollama now ask for a one-sentence study takeaway while preserving the existing cache fields,
  so older multi-sentence cached summaries still render safely.
- **Calmer cue supports.** Cornell view now renders cached keyword hints as subtle support text
  capped at the first three useful terms instead of a pile of rounded chips. Study Mode keeps those
  supports readable while blurring/revealing the note-side answer text, and the full cached keyword
  arrays remain intact for exports and old-cache compatibility. Richer generated fields such as
  `hint`, `evidence`, or `answerCheck` are intentionally deferred until there is a clearer need for
  a cache/schema migration.
- **Export** — "Export Cues to Markdown" (study sheet) and "Export Cues to Anki (TSV)" commands
  write a sibling file next to the note; pure `export.ts` formatters (`cuesToMarkdown`/`cuesToAnki`,
  TSV-safe) with unit tests. Never modifies the source note (#32).
- **"Review this note"** — command + context-menu entry that enables the note's cues (if hidden),
  opens it in the **Cornell view**, and turns on that view's Study Mode (questions shown, note-side
  answers blurred for active recall) — the surface where Study Mode is actually visible (#32).

### Core UX — settings redesign (in progress)
- **Settings reorganized by section (v0 design).** The settings tab is now grouped under
  `setHeading()` sections — **AI model / Cue generation / Note format / Appearance / Study Mode** —
  mirroring the v0 prototype in PR #33. New persisted controls: Auto-generate on save, Cue density
  (slider, Minimal/Balanced/Thorough), Question style (Recall/Socratic/Exam-style), Generate cue
  supports, Auto-write section summary, Show CueCraft in Reading mode, Reading mode display, Fold cue
  column on mobile, Cue accent color (swatches), Show cue column border, Compact supports. Provider API-key fields gained a show/hide
  eye + a presence badge. New single-source-of-truth modules `cue-generation.ts` (question style +
  density) and `cornell-accent.ts` (accent → CSS class), with unit tests. The existing multi-provider
  config (Ollama + Anthropic/OpenAI/Gemini/Grok + Test connection) is preserved under "AI model" —
  the v0 single-"AI Gateway" concept was intentionally not adopted.
- **Cue accent color wired (first settings→view feature).** The chosen accent (violet/teal/amber/
  rose) now tints the Cornell view's support text and cue rail via the `--cuecraft-accent` CSS
  variable; the view re-renders live when the swatch changes. Per the v0 design the question text
  stays the normal foreground color (the accent is for supports/rail, not the question copy). Accent
  rules use low specificity so style presets that deliberately recolor (legal-pad, minimal) keep
  their look; failed cues keep their red rail via a `:not(.cuecraft-cornell-cue-error)` guard.
- **Settings controls wired into generation/rendering.** Cue density and question style now feed
  shared prompt guidance for Ollama and all AI SDK providers; "Auto-write section summary" skips
  summary generation when off. "Generate cue supports" hides support terms consistently in editor,
  Cornell, and Reading mode; "Show CueCraft in Reading mode" gates the post-processor; "Show cue column
  border", "Compact supports", and "Fold cue column on mobile" now apply CSS classes in Cornell view.
  "Auto-generate on save" now debounces Markdown file modifications and refreshes cues when enabled.
- **Anthropic picker refinement.** The Anthropic model setting now supports account-fetched Claude
  models with provider `display_name` labels, a `Custom model ID...` escape hatch, and preserved
  legacy/custom saved IDs when a model is no longer returned. Unit tests cover custom-vs-fetched
  selection and preserved-load behavior.
- **Anthropic connection-test copy.** `Test connection` now reports the friendly Anthropic model
  name alongside the raw ID on success, and uses a more specific unavailable-model notice when the
  selected Claude model is inaccessible. Unit tests cover both the friendly success copy and the
  unavailable-model wording.
- **Anthropic model helper copy.** The Anthropic picker now stays quiet once a model is selected,
  and only shows a fetch prompt before any Claude models have been loaded. Unit tests cover the
  empty-state prompt and custom/fetched fallback behavior.
- **Anthropic model refresh.** The Anthropic picker now has a `Fetch Anthropic models` /
  `Refresh models` action that re-fetches Anthropic's account-specific model IDs after an API key
  is entered, uses the official Anthropic TypeScript SDK model types to pull each model's
  `display_name`, and keeps the custom-model path visible when refresh fails or a saved custom ID
  is not returned. Unit tests cover refresh success, refresh failure, and custom-model preservation behavior.
- **Parallel cue generation + setting-change regeneration.** Full-note generation now runs section
  cue requests in bounded batches of five while preserving section order for cache/summary output;
  stale-section refresh uses the configured concurrency too. Cue-affecting settings (preset,
  density, question style, keyword generation, summary generation) now debounce and offer to
  regenerate the current note when it already has cached cues.
- **Provider safety controls.** The AI model settings now expose **Parallel requests** (1–5,
  default 5) so cloud-provider users can reduce concurrency if they hit API limits. AI SDK
  providers retry rate-limit responses with backoff before surfacing a section failure. Cue-affecting
  settings now ask "Regenerate cues with new settings?" after the user leaves CueCraft settings,
  instead of interrupting settings edits or immediately spending API calls.
- **Parallel request guidance.** The **Parallel requests** slider now uses one clear,
  provider-agnostic explanation about safer concurrency and rate-limit recovery. Unit tests cover
  the shared description text and request-count formatting.
- **Cleaner AI setup flow.** The AI model section now groups setup into a compact Obsidian-native
  card with explicit steps: choose provider, add credentials and model, test the setup, then tune
  parallel speed. The `Auto-generate on save` toggle now sits as a final optional automation step,
  and the grouped controls add narrow-width wrapping guards so key/model controls stay readable in
  tighter settings panes.
- **Per-provider setup status.** The AI setup flow now shows lightweight status chips for `Key saved`,
  `Model selected`, and connection state (`Connection untested`, `Connection verified`, or
  `Connection stale`). Successful test connections are stored per provider/model/key combination, and
  changing the current key or model automatically marks that provider's saved connection check stale
  until `Test connection` is run again. Unit tests cover verified, stale, and per-provider fallback
  status derivation.
- **Provider model-list discovery.** OpenAI, Gemini, xAI, and Ollama providers now expose
  `listModels()` support in the shared provider layer. `Test connection` can use that model-list
  path when the model field is blank, so users can verify API-key/local connectivity and see how
  many models are discoverable before choosing one. Unit tests cover list-model parsing for all
  four providers.
- **Low-confidence warnings + per-cue regenerate icon.** High/medium confidence is now treated as
  internal metadata and hidden from the cue UI. Low-confidence cues show a compact warning button
  with the model's rationale in the tooltip, and keep the circle-arrow (↻) regenerate icon visible
  as a nudge to retry them (opens the existing tone menu → `regenerateSection`).
- **Cornell cue control spacing polish.** Low-confidence warning and per-cue regenerate controls
  are now positioned in the cue corner instead of reserving an always-empty meta row, so normal cue
  questions start flush with the top of the accent rail.
- **Removed two unused "Note format" controls.** The read-only Storage block (` ```cornell `) and
  Summary callout type (`> [!summary]`) badges were dropped — they documented internals the user
  doesn't act on. (The `renderReadOnlyBadge` helper + `.cuecraft-code-badge` CSS went with them.)
- **Settings home + dedicated subpages.** CueCraft settings now open on a lighter home screen with
  three clear entry points: **AI model**, **Cue generation**, and **Appearance**. Those larger
  sections moved into their own subpages with compact summaries on the home page, while lighter
  settings like **Note format** and **Study Mode** stay inline so the main settings screen is much
  easier to scan.
- **Searchable model combobox.** Fetched model selection now uses a reusable provider-aware
  combobox for Ollama, OpenRouter, OpenAI, Gemini, and xAI instead of switching between a native
  dropdown and a separate custom text field. The control filters locally by model ID, label,
  provider, and badges; supports mouse, arrow keys, `Enter`, `Escape`, and blur commits; shows a
  clear empty state; and keeps custom or stale saved IDs visible as selectable values. Anthropic
  keeps its specialized account-model picker for this slice because its provider display-name
  metadata and custom selection state are separate from the shared fetched-list path.
- **Model compatibility badges and warnings.** OpenRouter model metadata now powers restrained
  picker badges for structured-output-friendly, large-context, and low-cost models.
  Metadata-backed compatibility signals sort above less-compatible choices without hiding them, and a
  non-blocking warning appears when the selected OpenRouter model lacks or does not expose
  structured-output metadata.
- **Exact selected-model verification.** Cloud providers now run the provider generation probe
  whenever a model is selected, so a successful setup check verifies the current key and model
  together. If no model is selected yet, `Test connection` keeps the lighter provider-access /
  model-list check so users can validate a key first. This applies to all cloud providers, not only
  OpenRouter, because the exact-model probe follows the shared AI SDK provider path.

### Study Area Autopilot — managed folder generation (shipped)
- **Parent-folder study areas.** CueCraft settings now include a Study areas subpage where a user
  can create a managed study area from a parent folder path. Descendant Markdown notes are included;
  sibling folders and non-Markdown files are ignored. Explicit excluded notes or subfolders, plus
  existing per-note hidden state, are treated as skipped instead of generated.
- **Previewed initial backfill.** The management modal previews ready, uncued, stale, failed, and
  skipped counts before any provider call. The first broad backfill requires confirmation, then runs
  uncued notes through full-note generation, refreshes safely editable stale sections, and falls
  back to full-note generation for structural stale cases such as added or removed sections.
- **Pause, cancel, retry, and summaries.** Each study area starts paused. Users can switch an area to
  maintain on save, exclude paths, retry failed work, or remove the area while preserving generated
  caches. Study-area runs share CueCraft's single active generation guard; cancelling a broad run
  preserves caches already written and reports completed, failed, skipped, and remaining work.
- **Opt-in maintenance.** Global study-area automation is off by default, and each study area's
  maintenance mode is paused by default. When both are enabled, saving an edited note inside that
  area schedules only that note for stale-section or failed-section refresh. Notes outside the area,
  paused areas, hidden notes, and excluded paths do not schedule study-area generation. The existing
  global `Auto-generate on save` toggle remains separate and continues to work independently.
- **Non-destructive scope boundary.** Study Area Autopilot writes only CueCraft cache data and
  visibility/settings metadata. It never modifies source Markdown, and it deliberately defers
  cross-note synthesis, spaced-review scheduling, tag/query based rules, and full-vault automation.

#### Study Area Autopilot QA checklist
- Provider setup: verify the selected provider/key/model before running a broad backfill.
- Small-folder backfill: create a study area for a folder with one uncued note, one stale note, one
  failed-cache note, one hidden note, and one explicitly excluded note.
- Confirmation: confirm the setup preview shows eligible/readiness counts before generation starts.
- Cancel mid-run: start a backfill, invoke generation again to cancel, and confirm completed note
  caches remain while remaining work is reported.
- Retry failures: retry failed work and confirm successful notes are not regenerated.
- Maintain on save: enable global study-area automation and an area's maintain-on-save mode, edit a
  note inside the folder, and confirm only that note is scheduled.
- Skip behavior: edit notes outside the area, in paused areas, hidden notes, and excluded paths; no
  study-area maintenance should run.
- Study surfaces: open ready notes in editor, Reading mode, and Cornell view to confirm cached cues
  render without modifying Markdown.

### Beyond the original v1.0 slice
- **Cornell view** — dedicated pane: Title → left cue column | main notes → Summary, from cache;
  **Study Mode** blur/reveal lives on the note-side answer text (#16).
- **Cornell restart fix** — keep the view populated after an Obsidian restart by falling back to the
  last/most-recent note instead of rendering empty (#20).
- **Cues render on startup / tab-restore** — push cached cues into the editor via
  `workspace.onLayoutReady` + `active-leaf-change`, so a restored note shows its cues immediately
  instead of coming up blank (#24).
- **Actionable failed-cue state** — errored sections render `⚠ Generation failed` + a Regenerate
  action (Cornell view banner + per-cue button; editor marker) instead of a silent blank; restart
  fallback prefers notes with *usable* cues (#25).

### V1.3 — Hard providers
- **Local Codex / Claude CLI providers.** CueCraft can now call installed `codex` and `claude`
  commands as desktop-only local process providers. They use the user's existing CLI login instead
  of storing another API key, keep model override optional so CLI defaults work, run non-interactive
  cue/summary generation through the same schema validation and one-repair flow as other providers,
  record setup status against command + model settings, and cap CLI-backed section generation to one
  request at a time. Settings copy and README docs call out that "local CLI" does not mean local
  model: note text may still travel through the selected CLI's account/service path.

---

## Remaining work (prioritized)

### P1 — V1.2 Expression & presets (mostly shipped: visual presets #23, typography/layout #28, in-view controls #29)
1. **Faster vs. Better generation** — the only remaining P1 knob: a generation-quality toggle
   (content presets + tone variants already shipped in #27). _(Optional / lower value.)_

### P3 — V1.5 Reading & Review (shipped in #31)
- Reading-mode cues, Markdown/Anki export, and "Review this note" are all done (see Completed work).
- _Optional follow-up:_ review history in plugin data (e.g. last-reviewed timestamps + a stale queue).

### P4 — V1.3 Hard providers
8. **Local VM / Transformers.js** provider (explicit download consent). Most brittle / highest
   support burden — intentionally last.

### P5 — V2 Knowledge-base workflows
9. **Cross-note synthesis** — recurring concepts across a set of notes.
10. **Study queue** — stale / unreviewed / weak; integrate with existing spaced-repetition plugins
    rather than building a scheduler.

### Cross-cutting / nice-to-haves
- **Live end-to-end provider testing.** The cloud/router providers are built + unit-tested against
  mocks but not yet verified against the real APIs (needs keys). CLI providers are also covered by
  mocked process tests, but should still be smoke-tested against real installed/authenticated CLIs.
  Anthropic key was requested for org-wide save but not yet provided.
- **Ollama hardening (optional).** Small local models occasionally emit non-JSON. The provider
  already sends `format: "json"`; could add one auto-retry on non-JSON and/or send Ollama a JSON
  *schema* (structured outputs). Use a capable model (e.g. `llama3.1:8b`) meanwhile.

---

## Manual Obsidian Test Instructions

For the local CLI provider slice:

1. Reload CueCraft in Obsidian so the latest code is active.
2. In a terminal, confirm `codex login status` succeeds, or run `codex login` first.
3. Open CueCraft settings, go to AI model, select `Codex CLI`, and keep the command as `codex` or enter the absolute command path.
4. Leave the model override blank, click `Test connection`, and confirm setup status shows command saved, CLI default, and connection verified.
5. Set a Codex model override your installed CLI supports, confirm setup status becomes stale, then click `Test connection` again.
6. Generate cues for a short note and confirm generation completes sequentially even if the Parallel requests slider is higher than 1.
7. Repeat the same flow with `Claude CLI` after confirming `claude auth status --json` succeeds, or after logging in with the Claude CLI.
8. Temporarily set either command to a missing path and confirm `Test connection` reports command-path guidance without changing Markdown content.

For the OpenRouter and searchable model-picker final QA slice:

1. Reload CueCraft in Obsidian so the latest code is active.
2. Open CueCraft settings, go to AI model, select `OpenRouter`, and enter a valid OpenRouter API key.
3. Click `Fetch OpenRouter models`, search by provider or model text, and select a recommended or structured-output-friendly model.
4. Confirm badges stay visually restrained and unsupported or unknown OpenRouter models show a non-blocking warning.
5. Click `Test connection` and confirm the success notice/status verifies the selected model.
6. Change the selected OpenRouter model and confirm setup status becomes stale until `Test connection` is run again.
7. Type a custom model ID, close and reopen settings, and confirm the custom ID persists.
8. Generate cues for a short note and spot-check one existing direct provider to confirm the picker and connection flow still work.

For the Reading-mode display and Cornell entry slice:

1. Reload CueCraft in Obsidian so the latest code is active.
2. Open CueCraft settings, go to Note format, and confirm `Reading mode display` defaults to `Review button`.
3. Open Reading mode on a note with usable cached cues and confirm only the compact `Review in Cornell` button appears.
4. Change the display to `Inline cues`, reload Reading mode, and confirm cue cards appear beneath headings without the review button.
5. From editing mode, click the new Cornell ribbon button and confirm the active note opens in the dedicated Cornell view without entering Study Mode.
6. Run the `Open Active Note in Cornell View` command from the command palette and confirm it uses the active note.
7. Click `Review in Cornell` from Reading mode and confirm it still opens the dedicated Cornell view with Study Mode/reveal behavior.
8. Hide cues for the note or use a note with no cache and confirm no Reading-mode surface appears.

For the Anthropic connection-copy slice:

1. Open CueCraft settings and select `Anthropic (Claude)`.
2. With a valid Anthropic key, click `Test connection`.
3. Confirm the success notice names the friendly Claude model and raw model ID together.
4. Switch to a model your key cannot access, if you have one, and click `Test connection` again.
5. Confirm the error notice says the key cannot access the selected model and suggests choosing another model or checking the Anthropic account.
6. Try a custom model ID and confirm the same style of success/error wording still includes the raw ID.

For the Anthropic model-hint slice:

1. Open CueCraft settings and select `Anthropic (Claude)`.
2. Confirm the model picker shows a concise CueCraft-specific hint under the dropdown.
3. Switch between `Claude Sonnet 4.6`, `Claude Haiku 4.5`, and a custom model ID.
4. Confirm the hint updates to reflect the selected model's practical tradeoffs.
5. Confirm the custom-model fallback keeps the hint useful even when the model is not in the catalog.

For the Anthropic model-refresh slice:

1. Open CueCraft settings and select `Anthropic (Claude)`.
2. Enter a valid Anthropic API key if one is not already saved.
3. Click `Refresh models`.
4. Confirm the curated Claude options remain available and any account-specific models are merged into the dropdown using their Anthropic `display_name` values.
5. Switch to a custom model ID, refresh again, and confirm the custom text field still preserves the saved model when the provider does not return it.
6. Temporarily use an invalid key or otherwise force refresh to fail, then confirm CueCraft shows the curated fallback list plus a clear refresh-failure message.

For the parallel-request guidance slice:

1. Open CueCraft settings and look at the `Parallel requests` slider description.
2. Select `Anthropic (Claude)` with `Claude Haiku 4.5` and confirm the hint says faster parallel generation is usually safe.
3. Switch to a premium/rate-limit-prone cloud model such as `Claude Opus 4.8` and confirm the hint suggests fewer parallel requests if generation fails.
4. Switch the provider to `Ollama (local)` and confirm the hint changes to local machine/model performance guidance.
5. Switch to a balanced cloud model such as `Claude Sonnet 4.6` and confirm the fallback rate-limit guidance appears.
6. Move the slider and confirm the description still updates the request count while keeping the provider/model-specific guidance.

For the cleaner AI setup layout slice:

1. Reload CueCraft in Obsidian so the updated settings layout is active.
2. Open CueCraft settings and confirm the AI model area reads as a single setup flow with step labels for provider, credentials/model, test connection, speed, and optional automation.
3. Switch between `Anthropic (Claude)`, `OpenAI (ChatGPT)`, and `Ollama (local)` and confirm the provider-specific controls stay inside that grouped setup area in the same order.
4. Confirm `Test connection` appears before `Parallel requests`, and `Auto-generate on save` appears after the speed controls as a separate optional step.
5. Narrow the settings pane if convenient and confirm dropdowns, text inputs, eye buttons, and badges do not overlap or wrap awkwardly.
6. Confirm the grouped AI controls still feel native to Obsidian rather than looking like a custom modal or separate screen.

For the per-provider setup status slice:

1. Open CueCraft settings and look at the `Setup status` row in the AI setup flow.
2. Confirm a configured provider shows `Key saved` and `Model selected` immediately, even before testing.
3. Click `Test connection` for a working provider and confirm the status changes to `Connection verified` with a recent verification timestamp.
4. Change the current model or API key and confirm the status changes to `Connection stale`.
5. Run `Test connection` again and confirm the stale status returns to `Connection verified`.
6. Switch to another provider that has not been tested yet and confirm its setup status shows `Connection untested` independently of the first provider.

For the provider model-list discovery slice:

1. Reload CueCraft in Obsidian so the latest provider code is active.
2. Open CueCraft settings and choose `OpenAI (ChatGPT)`, enter a valid API key, clear the model field, and click `Test connection`.
3. Confirm the success notice says CueCraft connected and reports how many OpenAI models are available.
4. Repeat with `Google (Gemini)` and `xAI (Grok)` using valid keys and an empty model field, and confirm each notice reports discoverable model counts.
5. Switch to `Ollama (local)`, clear the model field if needed, click `Test connection`, and confirm CueCraft reports locally available models instead of requiring a model name first.
6. Re-enter or choose a specific model afterward and confirm normal exact-model testing still works as before.

## How to resume / dev quickstart

```sh
bun install
bun run build      # tsc -noEmit + esbuild -> main.js
bun run test       # vitest (389 tests)
```


Key source layout: `src/providers/` (provider interface + Ollama + `AiSdkProvider` base, the
five AI-SDK vendors incl. OpenRouter, local CLI runner, and Codex/Claude CLI providers),
`src/generator.ts` (generation + per-section/stale regen),
`src/cache.ts` (per-note cache + stale detection), `src/cue-extension.ts` (editor decorations),
`src/cornell*.ts` (Cornell view + model), `src/settings.ts` (provider settings),
`src/model-options.ts` (normalized model metadata + helpers),
`src/model-combobox.ts` (searchable model picker),
`src/model-compatibility.ts` (compatibility badges/warnings),
`src/model-refresh.ts` (model-refresh description logic).
