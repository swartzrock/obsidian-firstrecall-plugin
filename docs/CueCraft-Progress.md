# CueCraft — Progress & Remaining Work

A living snapshot of what's shipped and what's next, so work can be picked back up easily.
See [`CueCraft-MVP-Scope.md`](./CueCraft-MVP-Scope.md) for the full vision/roadmap and
[`CueCraft-v1-User-Stories.md`](./CueCraft-v1-User-Stories.md) for acceptance criteria.

_Last updated: 2026-06 (after PR #21). 123 unit tests passing; `bun run build` + `bun run test` green._

---

## Where we are

**The full core loop is shipped and proven end-to-end** (note → parse → generate → cache →
display → study), the two biggest risks are retired (theme-safe CM6 cue rendering; a provider
producing reliable validated structured cues), and provider breadth now covers a local model
plus four frontier models. What remains is mostly **breadth and UX polish**, not core risk.

Rough completion against the full V1.0 → V2 vision: **~55%**, with 100% of the MVP core loop
and most of V1.1 done.

---

## Completed work

Each item links to the PR that delivered it.

### V1.0 — Study Layer MVP (complete)
- **Docs / scope** — MVP scope + phased roadmap (#1), v1.0 user stories & acceptance criteria (#2).
- **Plugin scaffold** — build, ribbon, command palette, settings skeleton (#3).
- **Parser + Ollama provider + generator** — heading-section parser, Ollama provider, sequential
  generation with validation + tests (#4).
- **Tooling/CI** — switch to Bun + GitHub Actions (build & test on PRs) (#5).
- **Per-note cache** — per-note JSON cache with `contentHash` stale detection + schema migration (#6).
- **Editor rendering** — cues rendered in the editor via CodeMirror 6 decorations (#8).
- **Ollama robustness** — surface Ollama server errors clearly + cap whole-note context (#9).
- **Lenient validation** — coerce benign model quirks (extra keywords, odd casing) instead of failing (#11).
- **Per-note enable/hide** — hide/enable the cue layer per note, cache kept (#12).
- **Clickable enable/hide** — status-pill click + file/editor context menu toggle (#13, re-landed as #14).
- **Ribbon tooltip** — make the ribbon tooltip describe its (state-dependent) action (#15).

### V1.1 — Provider breadth + control (mostly complete)
- **Per-section regenerate** — regenerate a single section's cue (command + Cornell button) (#17).
- **Refresh stale sections** — regenerate only changed/errored sections (command + toolbar) (#18).
- **Anthropic (Claude) provider** — first frontier provider via the Vercel AI SDK `generateObject`,
  CORS-safe via Obsidian `requestUrl` (#19).
- **OpenAI / Gemini / Grok providers** — shared `AiSdkProvider` base + three vendor subclasses;
  per-provider key/model settings + Test connection (#21).
- Context menus + clickable toggle (delivered with #13/#14).

### Beyond the original v1.0 slice
- **Cornell view** — dedicated pane: Title → left cue column | main notes → Summary, from cache;
  **Study Mode** blur/reveal lives on the left keyword hints (#16).
- **Cornell restart fix** — keep the view populated after an Obsidian restart by falling back to the
  last/most-recent note instead of rendering empty (#20).

---

## Remaining work (prioritized)

### P1 — Finish V1.1 control
1. **Regenerate tone variants.** Add tone/intent options to per-section regenerate
   ("More conceptual", "Exam prep", "Simpler", "Vocabulary"). Builds directly on #17; pass the
   chosen tone into the existing cue prompt. Small, high-value. _(Next planned PR.)_

### P2 — V1.2 Expression & presets (the big visible upgrade)
2. **Visual style presets** — Cornell Classic, Exam Prep, Legal Pad, Minimal, Handwritten
   (mockups already explored in `cuecraft-mockups/`). Selectable in settings; applies to the
   Cornell view (and editor where feasible).
3. **Typography / layout controls** — cue-column width, font, under-heading vs. left-rail placement
   in the editor.
4. **Cue content presets** — Vocabulary-heavy / Minimal content modes + Faster vs. Better generation.

### P3 — V1.5 Reading & Review
5. **Reading-mode cues** — render cues in Obsidian reading view, reusing the existing cache.
6. **Export** — dump questions → Markdown / Anki-compatible text for external study.
7. **"Review this note"** entry that opens Study Mode directly; optional review history in plugin data.

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
bun run test       # vitest (123 tests)
```

Install into a vault by copying `main.js`, `manifest.json`, `styles.css` into
`<vault>/.obsidian/plugins/cuecraft-devin/`, then enable CueCraft in Community plugins.
Set a provider in Settings (Ollama needs a running local server + model; cloud providers need an API key).

Key source layout: `src/providers/` (provider interface + Ollama + `AiSdkProvider` base and the
four AI-SDK vendors), `src/generator.ts` (generation + per-section/stale regen), `src/cache.ts`
(per-note cache + stale detection), `src/cue-extension.ts` (editor decorations), `src/cornell*.ts`
(Cornell view + model), `src/settings.ts` (provider settings).
