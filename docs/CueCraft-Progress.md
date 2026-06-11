# CueCraft — Progress & Remaining Work

A living snapshot of what's shipped and what's next, so work can be picked back up easily.
See [`CueCraft-MVP-Scope.md`](./CueCraft-MVP-Scope.md) for the full vision/roadmap and
[`CueCraft-v1-User-Stories.md`](./CueCraft-v1-User-Stories.md) for acceptance criteria.

_Last updated: 2026-06 (Cornell cue controls no longer add top spacing). 199 unit tests passing; `bun run build` + `bun run test` green._

---

## Where we are

**The full core loop is shipped and proven end-to-end** (note → parse → generate → cache →
display → study), the two biggest risks are retired (theme-safe CM6 cue rendering; a provider
producing reliable validated structured cues), and provider breadth now covers a local model
plus four frontier models. What remains is mostly **breadth and UX polish**, not core risk.

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
- **Export** — "Export Cues to Markdown" (study sheet) and "Export Cues to Anki (TSV)" commands
  write a sibling file next to the note; pure `export.ts` formatters (`cuesToMarkdown`/`cuesToAnki`,
  TSV-safe) with unit tests. Never modifies the source note (#32).
- **"Review this note"** — command + context-menu entry that enables the note's cues (if hidden),
  opens it in the **Cornell view**, and turns on that view's Study Mode (questions shown, keyword
  hints blurred for active recall) — the surface where Study Mode is actually visible (#32).

### Core UX — settings redesign (in progress)
- **Settings reorganized by section (v0 design).** The settings tab is now grouped under
  `setHeading()` sections — **AI model / Cue generation / Note format / Appearance / Study Mode** —
  mirroring the v0 prototype in PR #33. New persisted controls: Auto-generate on save, Cue density
  (slider, Minimal/Balanced/Thorough), Question style (Recall/Socratic/Exam-style), Generate keyword
  chips, Auto-write section summary, Render in Reading mode, Fold cue column on mobile, Cue accent
  color (swatches), Show cue column border, Compact chips. Provider API-key fields gained a show/hide
  eye + a presence badge. New single-source-of-truth modules `cue-generation.ts` (question style +
  density) and `cornell-accent.ts` (accent → CSS class), with unit tests. The existing multi-provider
  config (Ollama + Anthropic/OpenAI/Gemini/Grok + Test connection) is preserved under "AI model" —
  the v0 single-"AI Gateway" concept was intentionally not adopted.
- **Cue accent color wired (first settings→view feature).** The chosen accent (violet/teal/amber/
  rose) now tints the Cornell view's keyword chips and cue rail via the `--cuecraft-accent` CSS
  variable; the view re-renders live when the swatch changes. Per the v0 design the question text
  stays the normal foreground color (the accent is for chips/rail, not the question copy). Accent
  rules use low specificity so style presets that deliberately recolor (legal-pad, minimal) keep
  their look; failed cues keep their red rail via a `:not(.cuecraft-cornell-cue-error)` guard.
- **Settings controls wired into generation/rendering.** Cue density and question style now feed
  shared prompt guidance for Ollama and all AI SDK providers; "Auto-write section summary" skips
  summary generation when off. "Generate keyword chips" hides keyword hints consistently in editor,
  Cornell, and Reading mode; "Render in Reading mode" gates the post-processor; "Show cue column
  border", "Compact chips", and "Fold cue column on mobile" now apply CSS classes in Cornell view.
  "Auto-generate on save" now debounces Markdown file modifications and refreshes cues when enabled.
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

### Beyond the original v1.0 slice
- **Cornell view** — dedicated pane: Title → left cue column | main notes → Summary, from cache;
  **Study Mode** blur/reveal lives on the left keyword hints (#16).
- **Cornell restart fix** — keep the view populated after an Obsidian restart by falling back to the
  last/most-recent note instead of rendering empty (#20).
- **Cues render on startup / tab-restore** — push cached cues into the editor via
  `workspace.onLayoutReady` + `active-leaf-change`, so a restored note shows its cues immediately
  instead of coming up blank (#24).
- **Actionable failed-cue state** — errored sections render `⚠ Generation failed` + a Regenerate
  action (Cornell view banner + per-cue button; editor marker) instead of a silent blank; restart
  fallback prefers notes with *usable* cues (#25).

---

## Remaining work (prioritized)

### P1 — V1.2 Expression & presets (mostly shipped: visual presets #23, typography/layout #28, in-view controls #29)
1. **Faster vs. Better generation** — the only remaining P1 knob: a generation-quality toggle
   (content presets + tone variants already shipped in #27). _(Optional / lower value.)_

### P3 — V1.5 Reading & Review (shipped in #31)
- Reading-mode cues, Markdown/Anki export, and "Review this note" are all done (see Completed work).
- _Optional follow-up:_ review history in plugin data (e.g. last-reviewed timestamps + a stale queue).

### P4 — V1.3 Hard providers
8. **Claude Code** (CLI bridge, opt-in, desktop-only) and **Local VM / Transformers.js**
   (explicit download consent). Most brittle / highest support burden — intentionally last.

### P5 — V2 Knowledge-base workflows
9. **Batch-generate** cues across a folder.
10. **Cross-note synthesis** — recurring concepts across a set of notes.
11. **Study queue** — stale / unreviewed / weak; integrate with existing spaced-repetition plugins
    rather than building a scheduler.

### Cross-cutting / nice-to-haves
- **Live end-to-end provider testing.** The four cloud providers are built + unit-tested against
  mocks but not yet verified against the real APIs (needs keys). Anthropic key was requested for
  org-wide save but not yet provided.
- **Ollama hardening (optional).** Small local models occasionally emit non-JSON. The provider
  already sends `format: "json"`; could add one auto-retry on non-JSON and/or send Ollama a JSON
  *schema* (structured outputs). Use a capable model (e.g. `llama3.1:8b`) meanwhile.

---

## How to resume / dev quickstart

```sh
bun install
bun run build      # tsc -noEmit + esbuild -> main.js
bun run test       # vitest (199 tests)
```

Install into a vault by copying `main.js`, `manifest.json`, `styles.css` into
`<vault>/.obsidian/plugins/cuecraft-devin/`, then enable CueCraft in Community plugins.
Set a provider in Settings (Ollama needs a running local server + model; cloud providers need an API key).

Key source layout: `src/providers/` (provider interface + Ollama + `AiSdkProvider` base and the
four AI-SDK vendors), `src/generator.ts` (generation + per-section/stale regen), `src/cache.ts`
(per-note cache + stale detection), `src/cue-extension.ts` (editor decorations), `src/cornell*.ts`
(Cornell view + model), `src/settings.ts` (provider settings).
