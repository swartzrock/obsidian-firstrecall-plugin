# CueCraft — MVP Scope & Phased Roadmap

> **Historical baseline:** This document records the original v1 planning assumptions and is not
> current product guidance. See the [README](../README.md) and
> [current progress entry](./CueCraft-Progress.md#current-product-state--2026-08-15) for the shipped
> generation, display, and in-note Study contract.

A lean v1 spec for proving the core retention loop, plus an explicit plan for what defers and why.

---

## 1. Guiding Principle for the MVP

**Ship the smallest thing that proves the core promise: "see a question → try to recall → reveal the source → check against a summary."**

Everything that does not directly serve that loop is deferred. The MVP is a *walking skeleton*: thin but complete end-to-end (note → parse → generate → display → study → cache), so every architectural seam is exercised early and the riskiest unknowns surface before we invest in breadth.

The two biggest risks we want to retire in v1 are:
1. **Can we render reliable, theme-friendly cue widgets in Obsidian's editor (CodeMirror 6)?** (UI risk)
2. **Can a single provider produce usable, validatable structured cues from real notes?** (quality/contract risk)

We do **not** try to retire "4 providers," "6 visual styles," or "reading mode" risk in v1 — those are breadth, not core-loop, risk.

---

## 2. MVP Definition (v1.0)

### 2.1 In Scope

| Area | v1.0 scope |
|---|---|
| **Provider** | **Ollama only.** Local, free, no API key, easy to dev/test, privacy-friendly. One concrete implementation behind the `AiProvider` interface. |
| **Parsing** | Heading-based section parser (`#`–`######`). Section = heading + body until next heading of equal/higher level. Content before the first heading = an implicit "intro" section. |
| **Generation** | Per section: 1 active-recall **question** + 2–5 **keywords** + **confidence**. Whole note: 1 **summary** (3–5 sentences). Sequential generation with progress + cancellation. |
| **Display** | Editor (Live Preview / source) mode only. Cue question + keywords shown beside each section heading via CM6 decorations. Summary block at the bottom. Markdown file is never modified. |
| **Study Mode** | Toggle. Section bodies are softened/hidden (blur or collapse); questions stay visible. Reveal one section at a time; "hide all answers" resets. Summary acts as final self-check. |
| **Per-note state** | Enable / hide / clear per note, persisted in plugin data. |
| **Cache** | Per-note JSON cache with `schemaVersion`, section `contentHash`, and stable section ids. Stale detection (note edited after generation). No partial *refresh* yet — stale just shows a "regenerate" affordance. |
| **Validation** | Strict typed validation (zod or equivalent) of every model response + one repair/retry attempt; failed sections are cached as errors and shown inline, not silently dropped. |
| **Settings** | Ollama host + model, Test Connection, Generate Sample. One cue preset (default "Conceptual"). |
| **Style** | **Obsidian Native only** (theme variables, no paper texture). |
| **Surfaces** | Ribbon icon, command palette, status bar pill. (Context menus deferred.) |

### 2.2 Commands (v1.0 subset)

- `CueCraft: Generate Cues for This Note`
- `CueCraft: Toggle Study Mode`
- `CueCraft: Enable for This Note`
- `CueCraft: Hide for This Note`
- `CueCraft: Clear Generated Cues`

Deferred commands: `Refresh Changed Sections`, `Reveal Current Section`, `Hide All Answers` (the last two can be in-UI buttons in v1 rather than palette commands).

### 2.3 Status bar states (v1.0)

`setup` · `ready` · `generating N/M` · `stale` · `study`
(Deferred: `hidden` can reuse `ready`/absent for v1.)

### 2.4 Explicit Non-Goals for v1.0

- Multiple providers (OpenAI, Claude Code, Local VM / Transformers.js).
- Reading-mode rendering.
- Visual style presets beyond Obsidian Native.
- Per-section regenerate with tone variants ("More conceptual").
- Partial refresh of only-changed sections.
- Export (Markdown / Anki), review history, spaced repetition.
- Folder/batch generation, cross-note synthesis.
- Mobile support (see §5).

---

## 3. v1.0 Acceptance Criteria (Definition of Done)

The MVP is done when, on desktop with a running Ollama:

1. Installing + enabling the plugin and opening Settings lets me set an Ollama host/model and **Test Connection** reports success/failure clearly.
2. **Generate Sample** runs a tiny generation and shows the structured result (proves the contract before I touch a real note).
3. On a real multi-heading note, `Generate Cues` produces a question + keywords per section and a whole-note summary, with a visible `generating N/M` progress and a working **Cancel**.
4. The **Markdown file on disk is byte-for-byte unchanged** after generation (verifiable via file hash).
5. Cues render beside the correct sections and remain readable in light theme, dark theme, and at least one popular community theme.
6. **Study Mode** hides section bodies, keeps questions visible, and lets me reveal sections one at a time.
7. Editing a section marks the note **stale**; reopening shows the stale state and offers regenerate.
8. A deliberately malformed model response is caught by validation, retried once, and (if still bad) surfaced as an inline section error — never a silent failure or a crash.
9. Closing and reopening the note loads cues from **cache** without regenerating.
10. Automated tests cover: parser, schema validation + migration stub, Ollama provider (mocked), generator progress/cancel, and cache read/write/stale.

---

## 4. Architecture: build for the full vision, implement the MVP slice

Keep the seams from the original plan so deferred work slots in without rewrites, but only implement the MVP slice behind each seam.

```text
src/
  main.ts              # lifecycle, commands, status bar, orchestration   [v1]
  settings.ts          # options tab (Ollama only in v1)                  [v1]
  parser.ts            # heading section parser                           [v1]
  schemas.ts           # zod schemas: Cue, Summary, Cache + validation    [v1]
  providers/
    types.ts           # AiProvider interface (full shape)               [v1]
    ollama-provider.ts # only concrete provider in v1                     [v1]
  provider-registry.ts # trivial in v1 (returns Ollama), real later      [v1]
  generator.ts         # sequential gen, progress, AbortController        [v1]
  cache.ts             # per-note JSON read/write/migrate + stale         [v1]
  note-visibility.ts   # per-note enable/hide                            [v1]
  study-state.ts       # transient Study Mode state                      [v1]
  cue-extension.ts     # CM6 editor decorations (RISKIEST — spike first) [v1]
  styles.css           # Obsidian Native, theme-aware                    [v1]
  # deferred stubs (interfaces only / not built in v1):
  cue-styles.ts        # style presets                                   [v1.1]
  reading-renderer.ts  # reading-mode renderer                           [v1.5]
```

**Design rule:** the full `AiProvider` interface and the cache `schemaVersion` field ship in v1 even though only Ollama and one schema exist — so adding providers and migrating caches later is additive, not a refactor.

### Recommended pre-build spike (1–2 days, do before committing v1 dates)
A throwaway plugin that renders a fixed/dummy cue widget next to headings via CM6 decorations and toggles a blur class on section bodies, tested against 2–3 themes. If this is clean, v1 is low-risk. If it fights themes, we adjust the display approach *before* writing the generator.

---

## 5. Platform decision (lock this now)

**v1 is desktop-only.** Rationale: Ollama, and later Claude Code / Local VM, rely on localhost servers, `child_process`, or large downloads that Obsidian mobile can't do. State this in `manifest.json` (`isDesktopOnly: true`) and in the docs. Mobile (cloud-provider-only) can be revisited at V2 if there's demand.

---

## 6. Phased Roadmap (what defers, and why)

### V1.0 — Study Layer MVP (the slice above)
Proves the retention loop with Ollama, editor mode, Study Mode, cache, validation, Obsidian Native style.

### V1.1 — Provider breadth + control
- **OpenAI / ChatGPT** provider (API key, structured outputs).
- **Per-section regenerate** with tone variants ("More conceptual", "Exam prep").
- **Partial refresh** of only changed sections (uses the `contentHash` already in the v1 cache).
- Context menus (file/editor) + remaining palette commands.
*Why after v1:* needs the stable provider interface and cache to already be proven.

### V1.2 — Expression + presets
- Visual style presets: Cornell Classic, Legal Pad, Exam Prep, Minimal, Handwritten.
- Typography / margin width controls.
- Cue content presets (Vocabulary-heavy, Minimal) + Faster/Better generation modes.
*Why here:* pure UX polish; should not gate the core loop or provider work.

### V1.3 — Hard providers
- **Ollama already shipped (v1.0); add Claude Code** (CLI bridge, opt-in, desktop-only, CLI detection) and **Local VM** (Transformers.js, explicit download consent, `Xenova/distilbart-cnn-6-6` default).
*Why last among providers:* most brittle / highest support burden; benefits from a mature provider abstraction and validation/repair layer.

### V1.5 — Reading & Review
- Reading-mode renderer reusing the v1 cache.
- `Review this note` enters Study Mode in reading view.
- Optional review history in plugin data.
- Export questions → Markdown / Anki-compatible text.

### V2 — Knowledge-base workflows
- Batch-generate cues for a folder.
- Cross-note synthesis ("recurring concepts across these notes").
- Study queue (stale / unreviewed / weak).
- Integrate with existing spaced-repetition plugins rather than building a scheduler.

---

## 7. Sequencing summary

```
Spike (CM6 + theme) ──► V1.0 (Ollama, editor, study, cache) ──► V1.1 (OpenAI, regenerate, partial refresh)
                                                              └► V1.2 (styles/typography)
                                                              └► V1.3 (Claude Code, Local VM)
                                                                     └► V1.5 (reading mode, export)
                                                                            └► V2 (KB workflows)
```

## 8. Open questions to confirm before V1.0 build
1. OK to make **Ollama the sole v1 provider**, or do you want OpenAI first for quality? (Ollama recommended for dev velocity.)
2. OK to lock **desktop-only** for v1 (`isDesktopOnly: true`)?
3. Study Mode default reveal: **blur** vs **collapse** for hidden section bodies?
4. Is a 1–2 day **CM6 decoration spike** acceptable before committing to v1 scope/dates?
5. Default cue preset for v1 = **Conceptual** — agreed?
