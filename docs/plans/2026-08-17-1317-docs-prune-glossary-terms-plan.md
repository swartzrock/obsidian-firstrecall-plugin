---
title: CueCraft Glossary Cleanup - Plan
type: docs
date: 2026-08-17
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# CueCraft Glossary Cleanup - Plan

## Goal Capsule

- **Objective:** Make the CueCraft glossary describe the shipped interface and retain only terminology guidance that still protects current or migrated behavior.
- **Authority:** The user's approved recommendations, current production source, and active compatibility migrations override historical glossary prose.
- **Execution profile:** One docs-only implementation unit on the existing README refresh branch and pull request.
- **Stop condition:** Stop if production code shows that any proposed removal is still a current user-facing term.
- **Tail ownership:** LFG reviews, commits, pushes, updates the existing pull request, and verifies CI.

## Product Contract

### Summary

Remove obsolete terminology guidance, repair the stale introduction, and align the auto-generation entry with the current settings label.

### Problem Frame

The glossary still frames a completed settings redesign as future work, links to a deleted plan, and preserves retired labels that no longer need documentation guidance.

### Key Decisions

- **Targeted cleanup** (session-settled: user-approved — chosen over removing every retired row: migration-relevant and still-ambiguous terms retain value.) Governs R1, R2, R3, R4.

### Requirements

- R1. Replace the opening paragraph with a timeless statement of the glossary's purpose and remove the deleted plan link.
- R2. Rename **Auto-generation** to the shipped setting label **Auto-generate on save** without changing its behavioral meaning.
- R3. Remove the retired entries **Review artifact**, **Whole-note summary**, **Cue focus**, **Generate cue supports**, **System prompt**, and **Cornell View**.
- R4. Preserve **Cue**, **Cue supports / support terms**, **Keywords**, **Section Lens**, **Cue preset / Cue density / Question style**, and **Editing View** because current code, migrations, or ambiguity guidance still justify them.
- R5. Preserve the active standalone **Cornell** layout terminology.

### Scope Boundaries

- Change only `docs/CueCraft-Glossary.md` plus this plan artifact.
- Do not alter production code, migrations, tests, or the README.
- Do not broaden the cleanup into a rewrite of otherwise current glossary definitions.

## Planning Contract

### Key Technical Decisions

- KTD1. Treat current user-facing settings copy and active migration identifiers as the source of truth for glossary retention; avoid adding documentation-specific code tests for a one-time prose cleanup.

### Assumptions

- The existing pull request for the README refresh is the correct shipping vehicle for this related glossary update.
- Markdown source inspection is sufficient visual verification because the change preserves the existing table structure and introduces no custom rendering.

## Implementation Units

### U1. Prune and align the glossary

- **Goal:** Apply the approved terminology cleanup without disturbing current terms.
- **Requirements:** R1, R2, R3, R4, R5; KTD1.
- **Dependencies:** None.
- **Files:** `docs/CueCraft-Glossary.md`, `docs/plans/2026-08-17-1317-docs-prune-glossary-terms-plan.md`.
- **Approach:** Update the introduction, rename the auto-generation entry, and delete only the six approved retired rows while preserving the surrounding Markdown tables.
- **Patterns to follow:** Match the glossary's existing capitalization and table formatting; use exact labels from `src/settings.ts` and compatibility evidence from `src/main.ts`, `src/cache.ts`, and `src/cue-generation.ts`.
- **Test scenarios:** Test expectation: none -- this unit changes documentation only and does not change application behavior.
- **Verification:** The Markdown diff is clean; the deleted link and six removed rows are absent; retained migration-relevant rows and standalone Cornell terminology remain; the README's glossary link still resolves.

## Verification Contract

| Gate | Applicability | Done signal |
| --- | --- | --- |
| Markdown integrity | U1 | `git diff --check` succeeds and both glossary tables remain structurally valid. |
| Terminology audit | U1 | The six approved retired rows are gone, retained rows remain, and **Auto-generate on save** matches `src/settings.ts`. |
| Link integrity | U1 | The glossary contains no deleted-plan link and the README still points to the existing glossary file. |
| Repository checks | Branch | Existing lint, test, typecheck, and build checks remain green if the pipeline runs them. |

## Definition of Done

- U1 satisfies R1 through R5.
- Only the glossary and plan artifact change beyond the branch's existing README commit.
- Review reports no actionable documentation defects.
- The existing pull request includes the committed glossary and plan changes.
- CI passes, or any unresolved external CI failure is recorded durably by the LFG pipeline.
- No abandoned or experimental content remains in the diff.
