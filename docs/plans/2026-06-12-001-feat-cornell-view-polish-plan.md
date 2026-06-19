---
title: "feat: Polish Cornell view study experience"
type: feat
date: 2026-06-12
origin: user request and screenshots
target: cuecraft
---

# feat: Polish Cornell view study experience

## Summary

Improve CueCraft's Cornell view so it feels like the natural reading/review surface rather than a hidden alternate pane. The plan focuses on discoverability, softer visual design, shorter summary output, and more useful supports for recall questions.

The work should preserve the existing cache model and commands. It should make the Cornell surface easier to enter, easier to read, and more aligned with active recall.

---

## Problem Frame

The current Cornell view is promising, but four issues make it feel rough:

1. It is too hard to open. The user wonders whether this should become the Reading view appearance, since Reading view already has its own Obsidian icon and mental model.
2. The structural lines are harsh. The title rule, cue divider, and summary rule make the page feel rigid and spreadsheet-like.
3. The summary is too wide and verbose. It reads like AI output instead of a short human study takeaway.
4. The rounded keyword buttons are numerous and not especially helpful. They show terms, but they do not clearly help the user answer the recall question.

The goal is not to abandon Cornell. The goal is to make the Cornell reading experience feel calmer, easier to discover, and more useful for studying.

---

## Requirements

### R1. Easier Cornell Entry

Users should be able to reach the Cornell/study surface from their normal reading workflow without having to remember a command named "Open Cornell View."

### R2. Softer Cornell Visual Treatment

The Cornell layout should preserve the cue-column / notes-column relationship, but reduce harsh borders and make the surface feel like a readable study document.

### R3. Shorter Summary

The summary area should favor a short study takeaway, ideally one sentence, rather than a full-width AI paragraph.

### R4. More Useful Cue Supports

Replace or reduce the current keyword-chip pile with supports that help the user answer the question: compact answer hints, key evidence, source anchors, or a revealable answer check.

### R5. Preserve Existing Behavior

Existing cue generation, cache migration, Study Mode reveal behavior, stale refresh, failed-cue retry, and per-section regenerate should keep working.

---

## Key Technical Decisions

### KTD1. Keep Cornell as a view first; add Reading-mode entry rather than replacing Reading view immediately.

Obsidian Reading view is a core Markdown preview surface. Replacing it wholesale with Cornell layout would be higher risk because the current Reading post-processor already inserts lightweight cues beneath headings. The safer first step is to make Cornell discoverable from Reading view and optionally add a setting for "Review opens Cornell view."

Later, CueCraft can explore a true Reading-mode Cornell renderer if the dedicated view proves valuable enough.

### KTD2. Soften the grid through CSS first.

The harshness is mostly visual: `styles.css` uses 2px rules with `var(--text-muted)`. A CSS-first pass can reduce risk by changing borders to faint theme borders, adding row rhythm, and moving from hard divider lines to soft gutters.

### KTD3. Treat the summary as a study takeaway.

The plugin already stores `summary` and `learningObjective` in the cache. The plan should first change rendering and prompt guidance toward concise output, then consider a cache schema addition only if a separate "takeaway" field is needed.

### KTD4. Do not make keyword chips the default study support.

Keywords are useful raw material, but a long chip list does not answer "what should I recall?" The better default is a compact hint system that supports the question without giving the whole answer away.

---

## Design Concepts

These are conceptual HTML/CSS sketches for direction, not implementation code. The final implementation should use existing CueCraft class names and Obsidian theme variables.

### Concept A: Soft Cornell Sheet

Purpose: preserve the classic cue rail, but make borders quieter and improve reading flow.

```html
<section class="cornell-sheet soft">
  <header class="sheet-title">Claude for Execs</header>
  <div class="sheet-grid">
    <aside class="cue-rail">
      <article class="cue-card">
        <div class="cue-question">What is the key difference between an Agent and a Chatbot?</div>
        <button class="hint-toggle">Show hint</button>
      </article>
    </aside>
    <main class="notes-column">
      <h2>Terms</h2>
      <p>Agent - Independent AI that can plan, decide, and use tools...</p>
    </main>
  </div>
  <footer class="study-takeaway">
    <strong>Takeaway</strong>
    <span>Agents become useful at work when they can act through trusted tools and organizational knowledge.</span>
  </footer>
</section>
```

Visual notes:

- Replace hard black/gray rules with `var(--background-modifier-border)`.
- Use a subtle gutter between cue rail and notes instead of a heavy divider.
- Put summary/takeaway in a narrower measure, not full-width paragraph text.

### Concept B: Reading View Review Strip

Purpose: make Cornell discoverable from normal Reading mode without replacing the whole preview renderer.

```html
<div class="cuecraft-reading-review-strip">
  <span>Study this note with CueCraft</span>
  <button>Open Cornell Review</button>
</div>
```

Placement options:

- Top of Reading view when a note has usable cues.
- Near the first rendered cue.
- As a compact icon button beside Reading-mode cues.

### Concept C: Question Support Instead Of Chips

Purpose: make the left column more useful for recall.

```html
<article class="cue-card">
  <div class="cue-question">Why does feedback improve AI systems over time?</div>
  <details class="cue-support">
    <summary>Hint</summary>
    <p>Think about how repeated expert review changes future outputs.</p>
  </details>
  <details class="cue-support">
    <summary>Evidence</summary>
    <ul>
      <li>feedback loops</li>
      <li>expert review</li>
      <li>compounding accuracy</li>
    </ul>
  </details>
</article>
```

Alternative supports to evaluate:

- One short hint phrase instead of many chips.
- Three "evidence words" max, shown as plain text rather than pills.
- "Answer check" reveal that shows a model-drafted one-sentence answer.
- Source anchor like "From: Accelerating Progress" to reconnect the question to the note section.

---

## Implementation Units

### U1. Add Reading-Mode Entry Point To Cornell Review

**Goal:** Make the Cornell view easier to discover from the reading workflow.

**Requirements:** R1, R5

**Dependencies:** None

**Files:**

- `src/main.ts`
- `src/reading-cues.ts`
- `styles.css`
- `tests/reading-cues.test.ts`

**Approach:**

Add a lightweight Reading-mode affordance when the current note has usable cached cues. The first implementation should be conservative: a small "Open Cornell Review" action near rendered Reading-mode cues or at the top of the rendered note. It should call the existing `reviewThisNote` or `activateCornellView` path so Study Mode behavior remains centralized.

The plan should avoid replacing Obsidian's Reading view with a full Cornell layout in this unit. That larger decision is deferred until the dedicated view is more polished.

**Patterns to follow:**

- Existing `renderReadingCues` and `buildReadingCueEl` in `src/main.ts`.
- Existing `reviewThisNote` command path in `src/main.ts`.
- Existing Reading-mode cue map tests in `tests/reading-cues.test.ts`.

**Test scenarios:**

- A note with usable cues renders a Cornell review entry action in Reading mode.
- A note with hidden cues does not render the review entry action.
- A note with no usable cues does not render the review entry action.
- Activating the action routes through the same review/Cornell view path as the command.

**Verification:**

The user can open a note in Reading mode, see an obvious CueCraft review entry point, and land in Cornell Study Mode without using the command palette.

### U2. Soften Cornell Structure And Add New Visual Preset Direction

**Goal:** Reduce harsh lines and make the Cornell surface feel more like a readable study sheet.

**Requirements:** R2, R5

**Dependencies:** None

**Files:**

- `styles.css`
- `src/cornell-style.ts`
- `tests/cornell-style.test.ts`

**Approach:**

Refine the default Cornell Classic styling or introduce a new default candidate such as "Soft Sheet." The core changes should use existing CSS class architecture: `cuecraft-cornell`, `cuecraft-cornell-grid`, `cuecraft-cornell-cuecell`, `cuecraft-cornell-title`, and `cuecraft-cornell-summary`.

The first pass should:

- Change title and summary rules from heavy `var(--text-muted)` lines to softer theme borders.
- Reduce cue-column divider weight from a hard rule to a soft gutter.
- Improve cue-card spacing so the left rail looks intentional, not cramped.
- Keep accent rails available, but soften their thickness or opacity.
- Keep current style presets working.

**Patterns to follow:**

- Existing preset classes in `styles.css`.
- `CORNELL_STYLES` registration in `src/cornell-style.ts`.
- Display-only settings pattern from `cornell-layout.ts` and `cornell-accent.ts`.

**Test scenarios:**

- If a new preset is introduced, `isCornellStyle` accepts it.
- `cornellStyleClass` maps the new preset to the expected CSS class.
- Existing presets continue to validate and fall back correctly.

**Verification:**

In Obsidian, Cornell Classic or the new default candidate should look softer: less visual weight on dividers, calmer title/summary boundaries, and better cue rail rhythm.

### U3. Render Summary As A Short Study Takeaway

**Goal:** Make the bottom summary easier to read and less AI-written.

**Requirements:** R3, R5

**Dependencies:** None

**Files:**

- `src/cornell-view.ts`
- `src/providers/ai-sdk-provider.ts`
- `src/providers/ollama-provider.ts`
- `src/schemas.ts`
- `tests/anthropic-provider.test.ts`
- `tests/ollama-provider.test.ts`
- `tests/schemas.test.ts`

**Approach:**

Start with rendering and prompt guidance before adding schema complexity. The Cornell view should label the section as "Takeaway" or "Study takeaway" and constrain the visual measure so it reads as one concise thought rather than a full-width essay.

Generation prompts should ask for a one-sentence study takeaway and a short learning objective. If existing cached summaries are long, rendering may clamp or visually constrain them without destructive cache migration.

If prompt-only changes are not enough, consider a later cache/schema field such as `takeaway`, but do not add it unless the current `summary` field cannot carry the behavior cleanly.

**Patterns to follow:**

- Existing `renderSummary` in `src/cornell-view.ts`.
- Existing summary validation in `src/schemas.ts`.
- Existing provider summary tests.

**Test scenarios:**

- Summary rendering uses the new label and constrained container class.
- Provider summary prompt asks for concise, study-oriented output.
- Summary schema still accepts existing cached summaries.
- Learning objective rendering remains available but visually secondary.

**Verification:**

A generated note should show a short bottom takeaway that is easy to scan and does not stretch into a hard-to-read full-width paragraph.

### U4. Replace Keyword Chip Pile With Better Question Supports

**Goal:** Make cue supports help the user answer questions instead of showing too many rounded chips.

**Requirements:** R4, R5

**Dependencies:** U3 optional but not required.

**Files:**

- `src/cornell-view.ts`
- `src/cue-extension.ts`
- `src/providers/ai-sdk-provider.ts`
- `src/providers/ollama-provider.ts`
- `src/schemas.ts`
- `styles.css`
- `tests/cornell.test.ts`
- `tests/schemas.test.ts`
- `tests/generator.test.ts`

**Approach:**

Start by changing display behavior before changing generated data shape:

- Limit visible supports to the top three keyword/evidence terms.
- Render them as subtle "Evidence:" text or compact inline supports, not large pill buttons.
- In Study Mode, keep supports revealable so the cue still prompts active recall.
- Consider a setting later for "Support style: Hidden hint / Evidence terms / Chips."

If better generated data is needed, evolve the schema from `keywords` toward richer optional fields such as `hint`, `evidence`, or `answerCheck`. That should be a deliberate cache-compatible migration, not a quick rename.

**Patterns to follow:**

- Existing keyword rendering in `renderCueCell`.
- Existing settings toggles `generateKeywords` and `compactChips`.
- Low-confidence tooltip pattern for compact secondary metadata.

**Test scenarios:**

- Cornell view limits supports to a small number when many keywords exist.
- Study Mode hides/reveals supports using the existing reveal state.
- Existing caches with `keywords` still render correctly.
- If schema changes are introduced, old caches remain readable.

**Verification:**

The left column should read as a question plus a small, useful support area. It should not look like a stack of decorative tags.

### U5. Add Cornell Appearance Settings For Summary And Supports

**Goal:** Give users lightweight control over the polished Cornell defaults without overloading the settings page.

**Requirements:** R2, R3, R4, R5

**Dependencies:** U2, U3, U4

**Files:**

- `src/settings.ts`
- `src/cornell-layout.ts`
- `src/cornell-style.ts`
- `src/cornell-view.ts`
- `styles.css`
- `tests/cornell-layout.test.ts`
- `tests/cornell-style.test.ts`

**Approach:**

If U2-U4 introduce choices, expose only the highest-value controls in the Appearance subpage. Avoid adding a dense control panel. Candidate controls:

- Cornell appearance: Classic / Soft Sheet / Minimal.
- Summary style: Takeaway only / Takeaway + objective.
- Support style: Hint / Evidence terms / Chips.

Default toward the polished version. Keep current behavior available where possible for users who like visible keyword chips.

**Patterns to follow:**

- Existing Appearance subpage in `src/settings.ts`.
- Existing live re-render behavior for display settings.
- Existing `CORNELL_STYLES`, `CUE_COLUMN_WIDTHS`, and `CUE_FONT_SIZES` modules.

**Test scenarios:**

- New setting defaults are applied when settings are missing.
- Changing Cornell appearance settings refreshes open Cornell views.
- Support style setting affects Cornell rendering without changing cached cue content.

**Verification:**

The user can tune the Cornell surface from CueCraft Appearance settings, then immediately see the open Cornell view update.

### U6. Manual Review And Regression Pass

**Goal:** Validate that Cornell still works as a study surface after the polish.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** U1, U2, U3, U4, U5

**Files:**

- `docs/CueCraft-Progress.md`
- `tests/cornell.test.ts`
- `tests/cornell-style.test.ts`
- `tests/reading-cues.test.ts`

**Approach:**

After implementation, update progress documentation and run a focused manual Obsidian review across the main Cornell flows:

- Generate cues for a multi-heading note.
- Open Reading mode and use the new review entry point.
- Confirm Cornell view opens/focuses the correct note.
- Toggle Study Mode.
- Reveal supports one cue at a time.
- Refresh stale sections.
- Regenerate one section.
- Switch appearance/style settings.
- Verify the summary/takeaway is readable.

**Patterns to follow:**

- Existing `docs/CueCraft-Progress.md` style.
- Existing instruction from the user to include manual Obsidian test instructions after changes.

**Test scenarios:**

- Automated test suite remains green.
- Build remains green.
- Manual Obsidian checklist passes on a note with many headings and a generated summary.

**Verification:**

The feature is ready when the Cornell view feels easier to enter, softer to read, and more useful for active recall without breaking existing generation, cache, or review commands.

---

## Scope Boundaries

### In Scope

- Cornell view discoverability from Reading mode.
- CSS polish for harsh lines and layout readability.
- Summary/takeaway rendering and prompt guidance.
- Better display of question supports.
- Small settings additions only if they support the polished defaults.

### Deferred To Follow-Up Work

- Replacing Obsidian Reading view with a full Cornell layout.
- Full schema migration from `keywords` to richer answer-support fields unless display-only changes are insufficient.
- Review history, spaced repetition scheduling, and study queues.
- Large AI prompt redesign beyond summary/support output needed for this polish.

### Out Of Scope

- Modifying source Markdown files.
- Removing the dedicated Cornell view.
- Reworking the provider/model settings project.

---

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Reading-mode entry point feels noisy | Render only when usable cues exist and keep the action compact. |
| CSS polish breaks existing presets | Keep changes scoped to base classes or add a new preset; test style class mapping. |
| Summary prompt changes alter cache expectations | Keep the existing `summary` field valid and avoid destructive migration. |
| Better supports require data the cache does not have | Start with display treatment of existing keywords; defer schema expansion until proven necessary. |
| Too many appearance controls clutter settings | Default to polished behavior and expose only the few controls users actually need. |

---

## Manual Obsidian Test Plan

After each implementation phase:

1. Keep `bun run dev` running.
2. Hot reload CueCraft in Obsidian.
3. Open a note with several headings and generated cues.
4. Test the changed Cornell/Reading behavior described by that phase.
5. Confirm existing actions still work: Review This Note, Open Cornell View, Study Mode, Refresh stale, and per-cue regenerate.
6. Confirm the source Markdown file is not modified by display-only Cornell changes.

For the final pass, use both a short note and a 30+ heading note to check layout density, summary readability, and cue support usefulness.
