---
title: Cue Card Rail Hierarchy - Plan
type: feat
date: 2026-07-08
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
origin: docs/ideation/2026-07-08-cue-card-rail-hierarchy-ideation.html
---

# Cue Card Rail Hierarchy - Plan

## Goal Capsule

| Field | Value |
|---|---|
| Objective | Make anchored editor cue cards visually align with the note body under each heading and read as question first, terms second. |
| Authority | User-provided design and current-implementation screenshots, then `docs/ideation/2026-07-08-cue-card-rail-hierarchy-ideation.html`, then current renderer/test patterns. |
| Scope | Anchored card rail rendering, placement, CSS hierarchy, term overflow, and focused tests. |
| Execution profile | Single-phase implementation; one branch and one PR are sufficient. |
| Stop conditions | Stop if body-line placement requires changing parser/cache semantics or if visual QA shows the chosen placement breaks non-anchored hook displays. |
| Tail ownership | Implementation should leave no plan progress markers; completion is derived from git, tests, and PR review. |

---

## Product Contract

### Summary

Anchored cue cards should sit beside the first body text under each note heading, not visually above the section content.
Inside the card, the recall question is the focal text, with muted support terms shown after a divider and capped to four visible chips plus a `+N more` reveal.

### Problem Frame

The current implementation has the right card structure but the wrong visual priority.
Cards attach to heading-line gutter positions, which makes them float above the answer text in the current screenshot.
Term chips can outnumber the question visually, which weakens the active-recall scan path.

### Requirements

**Anchoring**

- R1. Anchored card rail cues align with the first body line beneath their heading when the section has body text.
- R2. The placement change is scoped to `anchored-card-rail`; other hook displays keep their existing heading-line marker behavior.
- R3. Anchored cards remain attached to their section when edits insert lines above or inside the note.

**Card hierarchy**

- R4. The anchored-card question text renders around 15-16px, semibold, and remains the card's focal element.
- R5. A thin divider separates the question block from support terms.
- R6. `QUESTION` and `TERMS` labels stay visible but muted relative to the question.

**Terms**

- R7. Anchored cards show no more than four term chips by default.
- R8. When more than four terms exist, the card exposes a small `+N more` toggle that reveals the hidden chips in place.
- R9. Term chips render smaller and quieter than the question text.

**Safety**

- R10. Existing settings for hiding rail questions or support terms continue to suppress their respective card sections.
- R11. Failed cue cards keep their compact failure behavior and do not render term controls.
- R12. The change does not modify Markdown content, cache data, cue generation, or provider contracts.

### Acceptance Examples

- AE1. Given an anchored-card rail cue on a section with a heading and body text, when the gutter markers are built, then the card marker is positioned at the first body line and remains associated with the original cue line in DOM data.
- AE2. Given five support terms, when the anchored card renders, then four chips are visible and a `+1 more` control reveals the fifth term.
- AE3. Given rail support terms are hidden by settings, when the anchored card renders, then no terms label, chips, or `+N more` control appears.
- AE4. Given an active-section-composer or collapsed-tabs display, when gutter markers are built, then marker positions match the existing heading-line behavior.

### Scope Boundaries

- Keep this limited to anchored editor cue cards.
- Do not redesign Note Brief, Cornell view hook mode, provider prompts, cache shape, or keyword generation.
- Do not add a new persisted setting for term caps; four visible terms is the product behavior for this card.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Use body-line marker targeting for anchored cards, not a CSS-only offset. The repo currently places markers at `headingLine.from`; moving the marker to the next document line for anchored cards is more stable across heading sizes than guessing an offset in CSS.
- KTD2. Preserve `CueLineData.line` as the section heading identity. The data model and cache matching stay heading-based; only the gutter marker target changes for anchored-card rail display.
- KTD3. Implement the term cap inside the renderer rather than changing generated keywords. The card is a presentation surface, and cache/provider output should remain complete.
- KTD4. Make the `+N more` control local DOM state. Revealing hidden chips should not write plugin settings, mutate cache data, or re-render the editor extension payload.
- KTD5. Extend existing focused tests. `tests/cue-extension.test.ts` and `tests/settings-css.test.ts` already pin this surface, so new coverage should live there rather than in a new suite.

### High-Level Technical Design

```mermaid
flowchart TB
  CacheCue["Cached cue identity: heading line"] --> RenderPayload["CueLineData.line remains heading-based"]
  RenderPayload --> DisplayChoice{"Display mode"}
  DisplayChoice -->|"anchored-card-rail"| BodyTarget["Find first body line after heading"]
  DisplayChoice -->|"other hook displays"| HeadingTarget["Use heading line"]
  BodyTarget --> GutterMarker["Gutter marker position"]
  HeadingTarget --> GutterMarker
  GutterMarker --> Card["Card DOM keeps data-line as heading line"]
  Card --> Question["Question focal block"]
  Question --> Terms["Divider, muted chips, +N more"]
```

### Assumptions

- The first body line is the line immediately after the heading when it exists in the document.
- If the heading is the final line or the next line cannot be used, anchored cards may fall back to the heading line rather than disappearing.
- A local button inside the gutter marker is acceptable because `CueGutterMarker.toDOM()` already returns interactive note elements with `tabIndex`.

### Sources & Research

- `docs/ideation/2026-07-08-cue-card-rail-hierarchy-ideation.html` establishes the ranked direction and rejects CSS-only offset as brittle.
- `src/cue-extension.ts` owns `CueLineData`, `renderEditorHookElement()`, `buildCueGutterMarkers()`, and existing card DOM structure.
- `src/editor-hook-rail.ts` owns card presentation data and should not need cache/provider changes for this slice.
- `styles.css` owns anchored-card rail hierarchy, gutter widths, responsive rail sizing, label styling, and term-chip styling.
- `tests/cue-extension.test.ts` already covers anchored-card DOM, hidden settings, and gutter marker positions.
- `tests/settings-css.test.ts` already covers compact rail card CSS and should pin the new visual hierarchy.

---

## Implementation Units

### U1. Anchored-Card Body-Line Placement

- **Goal:** Position anchored-card rail markers at the first body line while preserving heading-line cue identity.
- **Requirements:** R1, R2, R3, R12, AE1, AE4.
- **Dependencies:** None.
- **Files:** `src/cue-extension.ts`, `tests/cue-extension.test.ts`.
- **Approach:** Add a small placement helper used by `buildCueGutterMarkers()`. For `anchored-card-rail`, target the next line after `cue.line` when it exists; otherwise fall back to the heading line. Keep `root.dataset.line` as the original cue line so section identity and existing click/debug semantics remain stable. Leave inline widget placement and other hook displays unchanged.
- **Patterns to follow:** Existing `mapCueLineThroughChanges()` and `buildCueGutterMarkers()` guardrails for bounded line numbers; existing marker-position tests in `tests/cue-extension.test.ts`.
- **Test scenarios:**
  - Covers AE1. Given `# A\nalpha\n# B\nbeta`, when anchored-card rail markers are built for cues on lines 1 and 3, then marker positions are line 2 and line 4 while rendered card `data-line` values remain `1` and `3`.
  - Covers AE4. Given the same note and `active-section-composer`, when markers are built, then positions remain line 1 and line 3.
  - Covers R3. Given lines are inserted above the second heading after cues are set, when the gutter field remaps payload and rebuilds markers, then the second anchored marker follows the section to its new body line.
  - Covers R1. Given a heading at the end of the document, when markers are built, then the marker falls back to the heading line rather than throwing or disappearing.
- **Verification:** Focused marker tests pass and confirm anchored-card placement changed without affecting other display modes.

### U2. Question-First Card Hierarchy

- **Goal:** Tune anchored-card rail CSS so the question is the visual focal point and terms are secondary.
- **Requirements:** R4, R5, R6, R9, R11.
- **Dependencies:** None.
- **Files:** `styles.css`, `tests/settings-css.test.ts`.
- **Approach:** Scope the stronger typography to `.cuecraft-editor-hook-anchored-card-rail .cuecraft-editor-hook-title` so other hook displays keep their current scale. Use 15-16px semibold sizing for normal titles, preserve existing long/dense reductions, mute section labels, and keep a thin divider before the terms section. Shrink and soften chips through anchored-card-specific term styles rather than globally changing all cue terms.
- **Patterns to follow:** Existing scoped `--cc-*` variables, current `.cuecraft-editor-hook-section-label:not(:first-child)` divider rule, and CSS text assertions in `tests/settings-css.test.ts`.
- **Test scenarios:**
  - Read `styles.css` and expect an anchored-card-specific title rule with 15-16px sizing, semibold weight, and readable line-height.
  - Read `styles.css` and expect dense/long anchored-card title rules to preserve reduced sizing for long questions.
  - Read `styles.css` and expect the terms divider to remain a thin border between question and terms.
  - Read `styles.css` and expect anchored-card term chips to be smaller and muted relative to the title.
- **Verification:** CSS assertions prove the hierarchy rules are present and scoped to anchored cards.

### U3. Term Cap and Reveal Control

- **Goal:** Cap anchored-card term chips at four visible chips with an accessible `+N more` reveal.
- **Requirements:** R7, R8, R10, R11, R12, AE2, AE3.
- **Dependencies:** U2.
- **Files:** `src/cue-extension.ts`, `tests/cue-extension.test.ts`, `styles.css`, `tests/settings-css.test.ts`.
- **Approach:** Add an anchored-card-specific keyword rendering path inside `renderEditorHookElement()`. Render the first four keywords normally, render overflow chips hidden by default, and append a small button that reveals them in place. Keep the existing `appendCueTerms()` path for inline, Cornell, and other displays. Ensure hidden support-term settings skip the entire terms section.
- **Patterns to follow:** Existing `appendCueTerms()` and `appendEditorHookSectionLabel()` boundaries; existing hidden-settings tests for `showSupportTerms`; Obsidian-compatible plain DOM event handling used elsewhere in render helpers.
- **Test scenarios:**
  - Covers AE2. Given five keywords, when an anchored card renders, then four `.cuecraft-cue-term` chips are initially visible and the control text is `+1 more`.
  - Covers AE2. Given the overflow control is clicked, then the hidden term becomes visible and the control no longer advertises hidden terms.
  - Covers AE3. Given `showSupportTerms: false`, when an anchored card renders with five keywords, then no terms label, chips, or overflow control appears.
  - Covers R11. Given a failed cue, when an anchored card renders, then no term overflow control appears.
  - Given an inline cue with five keywords, when it renders, then all keywords still render through the existing path.
- **Verification:** DOM tests prove the cap, reveal, hidden-settings behavior, failure behavior, and non-anchored display preservation.

### U4. Focused Verification Pass

- **Goal:** Run the narrow automated gates that prove this UI polish without broad unrelated churn.
- **Requirements:** R1-R12, AE1-AE4.
- **Dependencies:** U1, U2, U3.
- **Files:** `tests/cue-extension.test.ts`, `tests/settings-css.test.ts`.
- **Approach:** Use existing test commands for the changed test files first, then the repo's normal test/build gates if focused tests pass. Record any manual visual gap in the PR body rather than inventing browser automation for an Obsidian-only editor surface.
- **Execution note:** This is UI polish in an Obsidian editor surface; automated DOM/CSS coverage is necessary but not a substitute for a manual screenshot check in Obsidian.
- **Patterns to follow:** README development commands and existing Vitest test layout.
- **Test scenarios:**
  - Focused cue-extension tests cover renderer DOM and marker placement.
  - Focused settings-css tests cover visual hierarchy rules.
  - Full suite confirms no unrelated cue display behavior regressed.
- **Verification:** Focused tests pass, full test/build commands pass or any environment-limited gap is documented with the failing command and reason.

---

## Verification Contract

| Gate | Applies To | Done Signal |
|---|---|---|
| Focused renderer tests | U1, U3 | `tests/cue-extension.test.ts` passes with anchored placement and term overflow coverage. |
| Focused CSS tests | U2, U3 | `tests/settings-css.test.ts` passes with anchored-card hierarchy assertions. |
| Full test suite | U1-U4 | The repo test suite passes after focused tests. |
| Type/build gate | U1-U4 | The production build or typecheck gate passes with no new TypeScript errors. |
| Manual visual check | U1-U3 | Anchored cards visually start beside the body text below headings, question text dominates, and terms read as secondary. |

---

## Definition of Done

- Anchored rail cards use body-line placement without changing cue identity, cache data, or non-anchored hook display placement.
- Anchored card question text is the card focal point with muted labels and a thin divider before terms.
- Anchored card terms show at most four chips by default and reveal overflow through an accessible `+N more` control.
- Focused DOM/CSS tests cover the new contracts and the repo's broader verification gates have been run or their environment gaps documented.
- The diff includes the originating ideation artifact and this plan in the implementation branch.
- No abandoned experiment code, unused imports, or unrelated formatting churn remains in the final diff.
