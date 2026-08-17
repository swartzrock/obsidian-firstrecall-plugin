---
title: CueCraft Release Vocabulary Baseline - Plan
type: implementation
date: 2026-08-17
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: user-direction
execution: code
---

# CueCraft Release Vocabulary Baseline - Plan

## Goal Capsule

- **Objective:** Ship the first public release with one current vocabulary and one supported persisted-data shape.
- **Authority:** The current interface, current schemas, and the user's approval to remove all pre-release compatibility.
- **Execution profile:** One implementation unit on the existing documentation pull request.
- **Stop condition:** Stop if removing compatibility would weaken current credential security or current-data validation.
- **Tail ownership:** Review, commit, push, update the pull request, and verify CI.

## Product Contract

### Summary

Establish the current product model as the initial supported release baseline. Remove compatibility code, fixtures, and documentation that exist only for development-era data shapes or vocabulary.

### Requirements

- R1. Load only the current cache schema; invalid cache data remains recoverable but is not translated.
- R2. Persist only the current settings schema and discard unknown settings without enumerating old keys.
- R3. Normalize only the current nested provider settings shape while retaining secure credential storage behavior.
- R4. Export only to the current Questions-and-Terms filenames.
- R5. Remove development-era workspace cleanup and terminology guidance.
- R6. Rebuild the release artifact and prove it contains no superseded product identifiers.

### Scope Boundaries

- Preserve current settings, caches, provider configuration, and Secret Storage behavior.
- Do not rewrite Git history; release packages do not include repository history.
- Do not change current user-facing behavior beyond dropping development-build compatibility.

## Implementation Unit

### U1. Establish the release baseline

- **Requirements:** R1-R6.
- **Approach:** Replace translation paths with current-schema validation and allowlist-based loading, remove compatibility-only branches and fixtures, simplify exports, and prune glossary guidance that discusses superseded vocabulary.
- **Behavioral seams:** Cache loading and plugin startup from persisted data.
- **Verification:** Focused cache, settings, provider, and export tests; then typecheck, lint, full tests, production build, and tracked-source plus bundle terminology scans.

## Definition of Done

- Current persisted data loads unchanged.
- Development-era persisted data is not translated.
- Unknown settings cannot survive a load-and-save cycle.
- Secure credential storage remains covered.
- The production bundle and current tracked tree contain no superseded product identifiers.
- Review and CI report no actionable failures.
