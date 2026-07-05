---
title: "BYOK Runtime Release Migration - Plan"
type: refactor
date: 2026-07-05
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# BYOK Runtime Release Migration - Plan

## Goal Capsule

| Field | Value |
|---|---|
| Objective | Make CueCraft consume the released `@swartzrock/byok-runtime` v0.1 package from `swartzrock/byok-runtime` instead of the local `packages/byok` workspace module. |
| Authority | User reported the BYOK package was published to `swartzrock/byok-runtime` with a v0.1 release and asked for this repo to use that release in a new branch. |
| Execution profile | Single-phase package migration touching dependency metadata, import specifiers, TypeScript/build/test aliases, local package scripts, and BYOK extraction docs. |
| Stop conditions | Stop if the release does not expose the APIs CueCraft currently imports, if package installation cannot resolve the v0.1 release, or if removing local package wiring would require behavior changes in CueCraft generation or settings. |
| Tail ownership | `ce-work` owns implementation and verification; `lfg` owns simplification, review, commit, push, PR, and CI follow-through. |

---

## Product Contract

### Summary

CueCraft should treat BYOK as an external runtime dependency now that the runtime lives in `swartzrock/byok-runtime`.
The app should preserve existing BYOK settings, model refresh, connection testing, and generation behavior while replacing local workspace-package wiring with the released package.

### Problem Frame

The repo still declares a workspace dependency on `@cuecraft/byok`, aliases `@cuecraft/byok` and `@cuecraft/byok/node` to `packages/byok/src`, and keeps root scripts for testing the local package.
Those choices were right while the runtime was incubating in this repo, but they now hide whether CueCraft actually consumes the published v0.1 surface.

The migration should be surgical: point CueCraft at the release package, update import names only where required, remove workspace-only compile and bundle aliases, and leave the local package directory alone unless it is no longer referenced and can be removed without widening scope.

### Requirements

**Release Consumption**

- R1. The root dependency graph resolves BYOK from `@swartzrock/byok-runtime` v0.1 instead of `@cuecraft/byok` via `workspace:*`.
- R2. App and test imports use the package name and subpath exposed by the released runtime.
- R3. TypeScript, Vitest, and esbuild no longer alias runtime imports to `packages/byok/src`.

**Behavior Preservation**

- R4. CueCraft BYOK generation, including Node runtime and `generateObject` fallback behavior, remains unchanged.
- R5. Settings flows for provider selection, credentials, model refresh, connection testing, setup status, and Anthropic model options remain unchanged.
- R6. Local provider IDs, provider metadata, model option types, setup status types, and runtime types continue to compile against the released v0.1 API.

**Repo Cleanup and Docs**

- R7. Root package scripts no longer advertise local package-only checks as primary repo checks once CueCraft uses the external package.
- R8. Documentation that says BYOK currently lives in `packages/byok` is updated to describe the extracted v0.1 dependency and any remaining local historical artifacts accurately.
- R9. Any removal of `packages/byok` is allowed only after searches prove no root build, tests, docs, or source paths still depend on it.

### Scope Boundaries

#### In Scope

- Updating `package.json`, `bun.lock`, TypeScript paths, Vitest aliases, esbuild aliases, source imports, test imports, and docs needed for CueCraft to consume the release.
- Keeping the dependency pinned to the v0.1 release tag if the package is unavailable from npm during implementation.
- Removing local package scripts and workspace configuration only when they become stale after the migration.

#### Deferred to Follow-Up Work

- Changing BYOK runtime API behavior or publishing a new runtime release.
- Rewriting CueCraft BYOK settings or generation flows beyond import/package migration.
- Adding a compatibility adapter package or alias layer for the old `@cuecraft/byok` name.
- Reorganizing historical BYOK planning docs.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Consume the release under its actual package identity. The v0.1 release package metadata names `@swartzrock/byok-runtime`, so CueCraft imports should move to that name instead of preserving `@cuecraft/byok` locally.
- KTD2. Prefer the GitHub v0.1 tag as the dependency source when npm cannot resolve the package. A registry lookup for `@swartzrock/byok-runtime` returned 404 during planning, while `git ls-remote` found `refs/tags/v0.1`; the implementation should let `bun install` prove the final lockfile shape.
- KTD3. Remove source-level aliases after import migration. Keeping aliases to `packages/byok/src` would make builds pass while still bypassing the release.
- KTD4. Keep behavior tests focused on CueCraft surfaces. The old package-level tests belong to the extracted runtime repo once this repo no longer owns the package implementation.

### Assumptions

- The `swartzrock/byok-runtime` v0.1 tag is the authoritative release the user wants this repo to consume.
- The released main and `./node` entrypoints expose the current CueCraft imports, including `ByokProvider`, provider metadata helpers, model/listing types, `createByokNodeProvider`, and CLI provider helpers.
- If `packages/byok` remains in the working tree after migration, it is historical or follow-up cleanup only and is not part of CueCraft's active dependency path.

### Sources and Research

- `package.json` currently declares workspace `packages/*`, local BYOK scripts, and `@cuecraft/byok: workspace:*`.
- `bun.lock` currently resolves `@cuecraft/byok` to `packages/byok`.
- `tsconfig.json`, `vitest.config.ts`, and `esbuild.config.mjs` currently alias `@cuecraft/byok` imports to local source files.
- `https://raw.githubusercontent.com/swartzrock/byok-runtime/v0.1/package.json` reports package name `@swartzrock/byok-runtime` and version `0.1.0`.
- `git ls-remote --tags https://github.com/swartzrock/byok-runtime.git` reports `refs/tags/v0.1`.

---

## Implementation Units

### U1. Point Package Metadata At The Runtime Release

- **Goal:** Replace workspace dependency resolution with the v0.1 runtime package.
- **Requirements:** R1, R7
- **Dependencies:** None
- **Files:** `package.json`, `bun.lock`
- **Approach:** Remove the root workspace dependency on `@cuecraft/byok` and add `@swartzrock/byok-runtime` pinned to v0.1. If npm resolution is still unavailable, use the GitHub tag dependency form that Bun supports and lock it. Remove or revise root scripts that only typecheck or test `packages/byok` once those scripts no longer point at active repo code.
- **Execution note:** This is mostly packaging/config; prefer install and lockfile smoke verification over adding unit tests.
- **Patterns to follow:** Current root dependency grouping in `package.json`; Bun-generated lockfile edits from `bun install`.
- **Test Scenarios:** Installing dependencies resolves `@swartzrock/byok-runtime` at v0.1; lockfile no longer maps `@cuecraft/byok` to `packages/byok`; package scripts that remain point at active repo checks.
- **Verification:** `bun install` completes and the lockfile reflects the runtime release.

### U2. Migrate CueCraft Imports And Build Resolution

- **Goal:** Make app, tests, TypeScript, Vitest, and esbuild resolve BYOK through the released package entrypoints.
- **Requirements:** R2, R3, R4, R5, R6
- **Dependencies:** U1
- **Files:** `src/**/*.ts`, `tests/**/*.ts`, `tsconfig.json`, `vitest.config.ts`, `esbuild.config.mjs`
- **Approach:** Replace `@cuecraft/byok` and `@cuecraft/byok/node` imports with `@swartzrock/byok-runtime` and `@swartzrock/byok-runtime/node`. Remove TypeScript path mappings and Vitest/esbuild alias plugins that redirect BYOK imports to `packages/byok/src`. Keep `packages/byok` out of root `include` if the app no longer typechecks it.
- **Patterns to follow:** Existing import style in `src/byok-cuecraft-adapter.ts`, `src/cue-provider.ts`, and BYOK-focused app tests; existing esbuild external/bundle configuration.
- **Test Scenarios:** App typecheck resolves the released package declarations; Vitest resolves the released package instead of local source aliases; bundled app build includes or resolves the external package without using `packages/byok/src`; generation tests still compile mocked `ByokProviderStatus` and provider runtime types.
- **Verification:** `bun run typecheck`, `bun test tests/byok-cuecraft-adapter.test.ts`, and `bun run build` complete or expose only release-resolution issues that are fixed in this unit.

### U3. Remove Workspace-Only BYOK Ownership From Active Repo Surfaces

- **Goal:** Ensure the root repo no longer treats `packages/byok` as an active workspace package after CueCraft consumes the release.
- **Requirements:** R7, R8, R9
- **Dependencies:** U1, U2
- **Files:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `docs/byok-extraction.md`, `docs/plans/2026-07-05-001-refactor-byok-runtime-release-plan.md`, optionally `packages/byok/**`
- **Approach:** Search for remaining active references to `packages/byok` and distinguish historical planning/docs references from build/test/runtime references. Remove workspace globs, root package scripts, root TypeScript includes, root Vitest package-test includes, or local package files only when they are no longer referenced by active repo behavior. Update extraction docs to say the runtime has been extracted to `swartzrock/byok-runtime` v0.1 and this repo consumes it as a dependency.
- **Patterns to follow:** Existing docs use concrete package and entrypoint examples; preserve historical plan docs unless they materially mislead current setup docs.
- **Test Scenarios:** No active root config points at `packages/byok`; the root test include no longer runs extracted runtime package tests from this repo; docs no longer describe the local package as the current runtime source; searches for `@cuecraft/byok` find only historical docs or no references.
- **Verification:** `rg '@cuecraft/byok|packages/byok|@swartzrock/byok-runtime' package.json tsconfig.json vitest.config.ts esbuild.config.mjs src tests docs/byok-extraction.md` shows only intentional references.

---

## Verification Contract

| Gate | Command | Done signal |
|---|---|---|
| Dependency install | `bun install` | `@swartzrock/byok-runtime` resolves to v0.1 and lockfile no longer uses local `@cuecraft/byok` workspace resolution. |
| Typecheck | `bun run typecheck` | CueCraft source compiles against the released runtime declarations. |
| Focused BYOK adapter tests | `bun test tests/byok-cuecraft-adapter.test.ts tests/generator.test.ts` | App-facing BYOK adapter and generation behavior still pass. |
| Full test suite | `bun run test` | Root tests pass without local BYOK source aliases. |
| Production build | `bun run build` | esbuild bundles the app without resolving BYOK from `packages/byok/src`. |
| Reference scan | `rg '@cuecraft/byok|packages/byok' package.json tsconfig.json vitest.config.ts esbuild.config.mjs src tests docs/byok-extraction.md` | Remaining references are either removed or intentionally historical. |

---

## Definition of Done

- Root dependency metadata and lockfile consume `@swartzrock/byok-runtime` v0.1 from the released source.
- Source and test imports use the released package name and its `./node` subpath.
- TypeScript, Vitest, and esbuild no longer redirect BYOK imports to `packages/byok/src`.
- Root scripts and workspace configuration no longer present local BYOK package checks as active CueCraft checks.
- Docs that describe current BYOK ownership mention the extracted `swartzrock/byok-runtime` v0.1 release.
- Automated verification in the Verification Contract has been run, with any unresolved external package or CI limitation recorded in the PR.
- The final diff contains no abandoned migration experiments or stale local aliases.
