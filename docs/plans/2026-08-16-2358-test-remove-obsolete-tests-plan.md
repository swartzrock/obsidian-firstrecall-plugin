---
title: Remove Obsolete Tests - Plan
type: test
date: 2026-08-16
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Remove Obsolete Tests - Plan

## Goal Capsule

- **Objective:** Remove tests that only duplicate stronger current coverage or guard deleted product surfaces.
- **Authority:** The user's cleanup request defines scope; the validated test audit defines the safe deletion set; current runtime reachability defines compatibility coverage that must remain.
- **Execution profile:** One test-only implementation phase and one pull request.
- **Stop conditions:** Stop if a deletion removes the only test for a current behavior, migration boundary, or persisted editor display value.
- **Tail ownership:** The LFG pipeline owns implementation, verification, review fixes, publication, pull-request creation, and CI follow-through.

## Product Contract

### Summary

The test suite will remove redundant and tombstone coverage left behind by recent feature simplification.
Stronger schema, migration, rendered-DOM, positive CSS, workspace-cleanup, and persisted-display tests will remain authoritative.

### Problem Frame

Recent feature removal left tests that prohibit deleted selectors, assert constants already exercised through production rendering, or repeat compatibility behavior after the owning boundary has already normalized the data.
These tests increase maintenance cost and can make removed concepts look like supported contracts.

### Requirements

**Remove redundant coverage**

- R1. Delete standalone Cornell style tests whose assertions are already covered by production render and current CSS tests.
- R2. Delete legacy-category assertions that bypass or repeat the schema and cache migration boundaries.
- R3. Delete dedicated Cornell pane CSS tombstones and duplicate settings tests when stronger current tests assert the same contract.

**Preserve current contracts**

- R4. Retain the migrated-v5 rendering test, schema-level category stripping, positive Cornell render and CSS assertions, and runtime legacy-workspace cleanup.
- R5. Retain all behavior tests for `collapsed-tabs`, `active-section-composer`, and `hook-minimap` because persisted values still reach their production renderers.
- R6. Make no production code or stylesheet changes.

### Scope Boundaries

- The persisted editor display migration and removal of hidden display branches are deferred to separate production work.
- Historical cache migrations and legacy settings normalization remain supported compatibility contracts.
- No adjacent test refactor, naming cleanup, fixture redesign, or production simplification is included.

## Planning Contract

### Key Technical Decisions

- KTD1. **Keep one owning test per compatibility rule.** Schema normalization owns stray category stripping, cache migration owns legacy cache compatibility, and plugin-data migration owns persisted settings cleanup. Supports R2 and R4.
- KTD2. **Prefer behavioral coverage over constant and selector tombstones.** Retained DOM and positive CSS tests prove current Cornell behavior through production paths. Supports R1, R3, and R4.
- KTD3. **Treat hidden editor modes as reachable compatibility behavior.** Their tests remain until production code migrates saved values and removes the branches. Supports R5.

### Assumptions

- The eight-item independent validation from the preceding audit correctly identifies seven mechanical cleanup findings and one production-migration decision gate.
- Removing deleted-surface tombstones does not weaken the current product contract because positive current-surface tests and runtime legacy-leaf cleanup remain.
- The expected test-count reduction is evidence of deleted duplication, not lost supported behavior.

### Sources and Research

- `docs/plans/2026-08-07-001-refactor-remove-cue-categories-plan.md` identifies schema and cache migration as the owners of category compatibility.
- `docs/plans/2026-08-15-2221-refactor-remove-cornell-view-legacy-review-metadata-plan.md` records the dedicated-pane removal and the retained editor Cornell surface.
- Current coverage in `tests/schemas.test.ts`, `tests/plugin-data-migration.test.ts`, `tests/cue-extension.test.ts`, `tests/settings-css.test.ts`, and `tests/study-plugin-integration.test.ts` supplies the stronger contracts.
- No `docs/solutions/` corpus or `CONCEPTS.md` exists, so no institutional learning changes this plan.

### Validated Audit Trace

| Audit item | Remove | Retained owner or disposition |
|---|---|---|
| Cornell CSS tombstone file | Delete `tests/cornell-style-css.test.ts`. | Current Cornell cue, term, section, width, and padding rules remain covered in `tests/settings-css.test.ts`. |
| Cornell constant test file | Delete `tests/cornell-style.test.ts`. | Production rendering through `tests/cue-extension.test.ts` still asserts the classic Cornell style and editor-card DOM. |
| Fabricated legacy-category renderer cases | Remove the two direct category-bearing fixtures and their broad helper from `tests/cue-extension.test.ts`. | The migrated-v5 cache test in the same file remains the production-path owner for Terms preservation and absence of legacy category presentation. |
| Editor-hook category absence details | Remove only the two `category` property assertions from `tests/editor-hook-rail.test.ts`. | The surrounding card-construction, display, state, density, and failure assertions remain; category normalization stays owned by schema and migration tests. |
| Duplicate local CLI normalization case | Remove the stray-category parsing test and its now-unused `parseCueBatch` import from `tests/local-cli-cue-batch.test.ts`. | `tests/schemas.test.ts` remains the owning test for category stripping; the local CLI prompt and schema tests remain. |
| Dedicated-pane CSS tombstones | Remove `retiredDedicatedViewSelector`, its dedicated test block, and its width-scope negative assertion from `tests/settings-css.test.ts`. | Positive editor-card CSS remains in that suite, and runtime legacy workspace cleanup remains in `tests/study-plugin-integration.test.ts`. |
| Duplicate settings cases | Remove `discards legacy custom instruction overrides` and `shows every Section cue component by default` from `tests/settings.test.ts`. | `tests/plugin-data-migration.test.ts` owns persisted instruction cleanup; `uses one Question type and canonical artifact visibility defaults` owns the three visibility defaults. |
| Hidden editor-mode removal | Do not remove tests for `collapsed-tabs`, `active-section-composer`, or `hook-minimap`. | Deferred until production migrates saved values and removes the currently reachable render branches. |

## Implementation Units

### U1. Remove obsolete and duplicate tests

- **Goal:** Delete the validated redundant test surface without changing production behavior or current compatibility coverage.
- **Requirements:** R1-R6; KTD1-KTD3.
- **Dependencies:** None.
- **Files:** Delete `tests/cornell-style-css.test.ts` and `tests/cornell-style.test.ts`; modify `tests/cue-extension.test.ts`, `tests/editor-hook-rail.test.ts`, `tests/local-cli-cue-batch.test.ts`, `tests/settings-css.test.ts`, and `tests/settings.test.ts`.
- **Approach:** Remove the two direct category-bearing renderer fixtures and replace their shared broad helper with focused assertions in the migrated-v5 test. Remove only the two category assertions from the editor-hook suite. Remove the duplicate local CLI category test and its now-unused import. Remove the dedicated-pane CSS selector helper, tombstone block, and related width assertion. Remove `discards legacy custom instruction overrides` and `shows every Section cue component by default` from the settings suite. Preserve all surrounding behavior assertions.
- **Patterns to follow:** Keep compatibility checks at their owning boundary. Keep production rendering assertions in the existing JSDOM suites and current CSS assertions in `tests/settings-css.test.ts`.
- **Test scenarios:**
  - Run the five surviving edited suites and confirm every retained assertion passes after helper and import cleanup.
  - Run the complete Vitest suite and confirm no failures or orphaned test imports remain.
  - Confirm the migrated-v5 test still proves Terms survive migration and legacy category presentation is absent.
  - Confirm schema-level category stripping and plugin-data instruction migration tests remain unchanged and pass.
  - Confirm the Cornell production render test still asserts the fixed classic style and current editor-card structure.
  - Confirm hidden editor-mode validation, renderer, gutter, and hook-card tests remain present and pass.
- **Verification:** Focused tests, the full suite, typecheck, lint, and production build pass with no production file changes.

## Verification Contract

| Gate | Scope | Done signal |
|---|---|---|
| Focused Vitest suites | U1 | The five surviving edited test files pass. |
| `bun run test` | U1 | The complete Vitest suite passes with exactly eight fewer test cases than the 486-test baseline. |
| `bun run typecheck` | U1 | Production source TypeScript remains valid. |
| `bun run lint` | U1 | ESLint reports no unused test imports, stale helpers, or formatting errors. |
| `bun run build` | U1 | The production plugin bundle builds without changes to runtime sources. |
| Repository diff inspection | U1 | Only the plan and the seven named test files changed; no hidden-mode compatibility test was removed. |

## Definition of Done

- R1-R6 and U1 are satisfied.
- The two obsolete standalone test files are deleted.
- The five surviving suites contain no validated duplicate or tombstone assertions from this scope.
- Stronger schema, migration, DOM, CSS, workspace-cleanup, and hidden-mode tests remain.
- Focused tests, the full suite, typecheck, lint, and production build pass.
- The branch diff contains no production changes, abandoned helpers, unused imports, or unrelated cleanup.
- The plan and implementation are committed on one `codex/` feature branch, pushed, and opened as one pull request.
