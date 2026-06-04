# CueCraft v1.0 — User Stories & Acceptance Criteria

Formal, testable requirements for the v1.0 MVP defined in
[`CueCraft-MVP-Scope.md`](./CueCraft-MVP-Scope.md).

**Scope reminder (v1.0):** Ollama-only provider · editor-mode cues + whole-note summary ·
Study Mode · per-note enable/hide/clear · JSON cache with stale detection · strict typed
validation · Obsidian Native style · **desktop-only**.

## Conventions

- **Role** is the actor in the story. v1.0 has essentially one persona, the **Learner**
  (student/researcher/professional reviewing their own notes), plus **Plugin Maintainer**
  for testability stories.
- **Priority:** `Must` = required for v1.0 release · `Should` = strongly desired, may slip
  to v1.0.x · `Could` = nice-to-have if cheap. No `Won't` items appear here — those live in
  the roadmap as deferred.
- Acceptance criteria use **Given / When / Then** and are written to be directly
  translatable into automated or manual tests.
- **Definition of Ready** (per story): scope clear, dependencies identified, AC testable.
- **Definition of Done** (per story): AC pass, automated tests where noted, no regression to
  the "file on disk unchanged" invariant, works in light + dark + one community theme.

## Global Invariants (apply to every story)

- **INV-1 Non-destructive:** the note's Markdown file on disk is never modified by CueCraft.
  Verifiable by comparing the file hash before and after any CueCraft action.
- **INV-2 Desktop-only:** `manifest.json` declares `isDesktopOnly: true`; the plugin is not
  offered on Obsidian mobile.
- **INV-3 No silent failure:** every failure path is surfaced in the UI (status bar, notice,
  or inline section error) — never a console-only error or a crash.
- **INV-4 Cancellable & bounded:** any long-running operation can be cancelled and reports
  progress.

---

## Epic A — Provider Setup (Ollama) & Options

### A1 — Configure Ollama connection · `Must`
**As a** Learner, **I want** to set my Ollama host and model in CueCraft's settings, **so that**
CueCraft can generate cues using my local model.

**Acceptance criteria**
- **A1.1** Given the Options tab is open, Then I see an Ollama **host** field (default
  `http://localhost:11434`) and a **model** field/selector.
- **A1.2** Given a reachable Ollama server, When the settings load, Then the model selector is
  populated from `GET /api/tags`; if listing fails, the field falls back to free text and shows
  a non-blocking notice.
- **A1.3** Given I change host or model, When I leave the field, Then the value persists to
  plugin data and survives an Obsidian restart.

### A2 — Test Connection · `Must`
**As a** Learner, **I want** a "Test Connection" button, **so that** I know my setup works before
generating on a real note.

**Acceptance criteria**
- **A2.1** Given a valid host + model, When I click **Test Connection**, Then I see a success
  state naming the reachable model.
- **A2.2** Given an unreachable host, When I click **Test Connection**, Then I see the
  user-readable error `Ollama server unreachable` (not a raw stack trace).
- **A2.3** Given a reachable host but a model that is not pulled, When I test, Then the error
  explains the model is missing and how to pull it.

### A3 — Generate Sample · `Should`
**As a** Learner, **I want** a "Generate Sample" action, **so that** I can see a real structured
cue before committing to a full note.

**Acceptance criteria**
- **A3.1** Given a working connection, When I click **Generate Sample**, Then CueCraft runs a
  tiny generation on built-in sample text and displays a validated question + keywords + summary.
- **A3.2** Given the model returns malformed output, When sample generation runs, Then the
  validation/repair path (see Epic H) is exercised and the outcome is shown — proving the
  contract independently of any vault note.

---

## Epic B — Note Parsing

### B1 — Parse a note into sections · `Must`
**As a** Learner, **I want** CueCraft to split my note by headings, **so that** cues attach to the
right part of the note.

**Acceptance criteria**
- **B1.1** Given a note with `#`–`######` headings, When parsed, Then each section spans from a
  heading to the next heading of equal-or-higher level.
- **B1.2** Given content before the first heading, When parsed, Then it becomes an implicit
  "intro" section.
- **B1.3** Given a note with no headings, When parsed, Then the whole note is one section and
  generation still works.
- **B1.4** Given fenced code blocks or comments containing `#`, When parsed, Then those `#` are
  **not** treated as headings.
- **B1.5** Each section exposes a stable `id`, `heading`, `lineNumber`, and `contentHash`.
- **B1.6** Parser behavior is covered by automated tests including the edge cases above.

---

## Epic C — Cue Generation

### C1 — Generate per-section cues · `Must`
**As a** Learner, **I want** an active-recall question and keywords for each section, **so that** I
can test myself on each part of the note.

**Acceptance criteria**
- **C1.1** Given a parsed note, When I run **Generate Cues**, Then each section receives exactly
  one **question**, **2–5 keywords**, and a **confidence** of `high|medium|low`.
- **C1.2** Questions test understanding/recall, not file trivia (validated by prompt design +
  spot-check during manual testing; enforced structurally by the schema, not graded automatically).
- **C1.3** Sections are generated **sequentially** by default.

### C2 — Generate whole-note summary · `Must`
**As a** Learner, **I want** a 3–5 sentence summary of the whole note, **so that** I have a final
self-check after recall.

**Acceptance criteria**
- **C2.1** When generation runs, Then a single summary of 3–5 sentences is produced **last**,
  using the section outputs plus the original note text.
- **C2.2** The summary is displayed in a bottom block distinct from per-section cues.

### C3 — Progress & cancellation · `Must`
**As a** Learner, **I want** to see progress and cancel generation, **so that** long notes don't
trap me.

**Acceptance criteria**
- **C3.1** Given generation is running, Then the status bar shows `CueCraft: generating N/M`
  updating after each section.
- **C3.2** Given I trigger cancel, When the current section finishes, Then generation stops, no
  further sections are requested, and already-generated sections are kept and cached (partial
  success).
- **C3.3** Cancellation is implemented via `AbortController` and covered by an automated test.

---

## Epic D — Cue Display (Editor Mode)

### D1 — Render cues beside sections · `Must`
**As a** Learner, **I want** cue questions and keywords to appear beside each section in editor
mode, **so that** I see prompts next to the source material.

**Acceptance criteria**
- **D1.1** Given a note with cached cues, When I view it in editor (Live Preview/source) mode,
  Then each section's question + keywords render adjacent to that section via CM6 decorations.
- **D1.2** Cue text is rendered as normal HTML text (wraps, selectable, theme-aware); SVG/CSS is
  used only for decoration, never for primary cue text.
- **D1.3** Cues remain readable in light theme, dark theme, and at least one popular community
  theme (manual verification).
- **D1.4** INV-1 holds: rendering cues does not alter the Markdown file.

### D2 — Display the summary block · `Must`
**As a** Learner, **I want** the whole-note summary shown at the bottom, **so that** I can use it
as a final check.

**Acceptance criteria**
- **D2.1** Given cues exist, Then the summary renders in a clearly delimited block at the end of
  the note's cue layer.
- **D2.2** Given no summary exists yet (e.g. cancelled before C2), Then the block is absent or
  shows an unobtrusive "summary not generated" state.

---

## Epic E — Study Mode

### E1 — Toggle Study Mode · `Must`
**As a** Learner, **I want** to toggle Study Mode, **so that** I can attempt recall before seeing
the source.

**Acceptance criteria**
- **E1.1** Given cues exist, When I toggle Study Mode on, Then section **bodies are hidden via
  blur** while **questions stay visible**, and the status bar shows `CueCraft: study`.
- **E1.2** When I toggle Study Mode off, Then all bodies return to normal and the status bar
  leaves the `study` state.
- **E1.3** Study Mode state is **transient per note** (not written to the Markdown file; resets
  per session unless cached state says otherwise).

### E2 — Reveal one section at a time · `Must`
**As a** Learner, **I want** to reveal a single section, **so that** I can check my answer for that
section without revealing the rest.

**Acceptance criteria**
- **E2.1** Given Study Mode is on, When I reveal a section, Then only that section's body becomes
  visible; others stay hidden.
- **E2.2** Given some sections are revealed, When I choose **Hide all answers**, Then every body
  returns to hidden.
- **E2.3** Reveal/hide-all are available as in-UI controls (palette commands deferred per scope).

---

## Epic F — Per-Note Visibility

### F1 — Enable / Hide / Clear per note · `Must`
**As a** Learner, **I want** to enable, hide, or clear CueCraft on a specific note, **so that** I
control which notes have a study layer.

**Acceptance criteria**
- **F1.1** Given a note, When I **Enable for This Note**, Then its cue layer is shown (generating
  if no cache exists) and the per-note state persists.
- **F1.2** Given an enabled note, When I **Hide for This Note**, Then the cue layer is hidden but
  the cache is retained, and reopening the note respects the hidden state.
- **F1.3** Given a note with cached cues, When I **Clear Generated Cues**, Then the cache for that
  note is deleted and the note returns to a `setup`/`ready` state. INV-1 still holds.

---

## Epic G — Caching & Stale Detection

### G1 — Persist & reload cues from cache · `Must`
**As a** Learner, **I want** generated cues to persist, **so that** reopening a note doesn't
regenerate (cost/time).

**Acceptance criteria**
- **G1.1** Given cues were generated, When I close and reopen the note, Then cues load from cache
  with no new provider calls.
- **G1.2** The cache stores `schemaVersion`, `generatedAt`, `noteModifiedAt`, `provider`,
  `model`, per-section `contentHash`/`id`, and the summary.
- **G1.3** Cache read/write is covered by automated tests, including a `schemaVersion` migration
  stub (older version → current) so future migrations are exercised from day one.

### G2 — Detect stale cues · `Must`
**As a** Learner, **I want** to know when my edits made the cues outdated, **so that** I don't
study against stale prompts.

**Acceptance criteria**
- **G2.1** Given cached cues, When the note is edited after `generatedAt`, Then the status bar
  shows `CueCraft: stale` and the cue layer offers a regenerate affordance.
- **G2.2** v1.0 regenerates the **whole note** on stale (per-section partial refresh is deferred
  to V1.1, but `contentHash` is recorded now to enable it later).

---

## Epic H — Output Validation & Error Handling

### H1 — Validate every model response · `Must`
**As a** Learner, **I want** malformed AI output to be caught, **so that** I never see broken or
empty cues silently.

**Acceptance criteria**
- **H1.1** Given a model response, When it is parsed, Then it is validated against a strict schema
  (question is non-empty string; keywords is a 2–5 length string array; confidence ∈
  {high,medium,low}).
- **H1.2** Given an invalid response, When validation fails, Then CueCraft makes **one** repair/
  retry attempt.
- **H1.3** Given the retry still fails, Then that section is cached as an **error** state and
  displayed inline as `Model output could not be validated` — other sections are unaffected.
- **H1.4** Validation + repair + per-section error isolation are covered by automated tests using
  mocked malformed outputs.

### H2 — User-readable provider errors · `Must`
**As a** Learner, **I want** plain-language errors, **so that** I can fix setup problems myself.

**Acceptance criteria**
- **H2.1** Provider/transport failures map to readable messages, at minimum
  `Ollama server unreachable` and a model-missing message.
- **H2.2** No error path throws an unhandled exception or leaves the status bar stuck in
  `generating` (INV-3, INV-4).

---

## Epic I — Surfaces (Ribbon / Command Palette / Status Bar)

### I1 — Ribbon icon · `Must`
**As a** Learner, **I want** a ribbon icon whose behavior matches the note's state, **so that** the
primary action is one click away.

**Acceptance criteria**
- **I1.1** Unconfigured (no working provider) → clicking the ribbon opens CueCraft Options.
- **I1.2** Ready (provider OK, note has no cues) → clicking generates cues for the active note.
- **I1.3** Active (cues exist) → clicking opens a small show/hide/clear menu.

### I2 — Command palette · `Must`
**As a** Learner, **I want** CueCraft commands in the palette, **so that** I can drive it from the
keyboard.

**Acceptance criteria**
- **I2.1** The palette exposes: `Generate Cues for This Note`, `Toggle Study Mode`,
  `Enable for This Note`, `Hide for This Note`, `Clear Generated Cues`.
- **I2.2** Each command is disabled/no-ops gracefully when not applicable (e.g. Toggle Study Mode
  with no cues shows a notice rather than failing).

### I3 — Status bar pill · `Must`
**As a** Learner, **I want** an always-visible status pill, **so that** I always know CueCraft's
state.

**Acceptance criteria**
- **I3.1** The pill reflects exactly one of: `setup`, `ready`, `generating N/M`, `stale`,
  `study`.
- **I3.2** State transitions are driven by real events (provider configured, generation start/
  progress/finish, note edit, study toggle) — no stale pill after an operation ends.

---

## Epic J — Testability & Quality (Maintainer-facing)

### J1 — Automated test coverage · `Must`
**As a** Plugin Maintainer, **I want** the risky logic under test, **so that** refactors toward
v1.1+ don't regress the core loop.

**Acceptance criteria** (consolidated from the scope's test plan)
- **J1.1** Parser edge cases (B1.6).
- **J1.2** Schema validation + migration stub (G1.3, H1.4).
- **J1.3** Provider registry returns Ollama and routes capability checks (trivial in v1 but
  tested so it stays additive).
- **J1.4** Ollama provider with mocked HTTP for success, unreachable, and malformed-output cases.
- **J1.5** Generator progress + cancellation/partial success (C3.3).
- **J1.6** Cache read/write/stale (G1, G2).
- **J1.7** Note-visibility persistence (F1).

### J2 — Manual Obsidian verification checklist · `Must`
**As a** Plugin Maintainer, **I want** a repeatable manual pass, **so that** UI-bound behavior
(themes, decorations) is verified before release.

**Acceptance criteria**
- **J2.1** Options setup for Ollama incl. unreachable/missing-model states.
- **J2.2** Generate on a short note and a long (15+ section) note; observe progress; cancel
  mid-run and confirm partial success.
- **J2.3** Edit one section → confirm `stale`; regenerate.
- **J2.4** Toggle Study Mode; reveal one section; hide all.
- **J2.5** Enable → Hide → Clear for a note; confirm INV-1 (file hash unchanged) throughout.
- **J2.6** Verify rendering in default light, default dark, and one popular community theme.

---

## v1.0 Release Checklist (rollup)

A v1.0 build is releasable when **all `Must` stories pass their AC**, the global invariants hold,
the Epic J automated tests are green, and the J2 manual checklist passes on desktop with a running
Ollama. `Should`/`Could` items may ship in a fast-follow v1.0.x.
