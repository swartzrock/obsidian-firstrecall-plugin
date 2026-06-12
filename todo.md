# Cornell View Polish TODO

Source plan: "docs/plans/2026-06-12-001-feat-cornell-view-polish-plan.md"

## Goal

Implement the Cornell View polish plan phase by phase, preserving existing CueCraft behavior and updating tests/progress docs after each phase.

## Goal Mode Instructions

If this file is used with `/goal`, the goal for a single run is NOT to finish this whole file. The goal for a single run is:

> Complete all unchecked tasks in exactly one phase, report manual test instructions, and stop.

Stopping after one phase is a successful completion of that run. Do not continue just because there are more unchecked phases below.

## Phase 1: Reading-Mode Entry Point To Cornell Review
- [x] Add a lightweight Reading-mode affordance for notes with usable cached cues
- [x] Route the affordance through the existing Cornell review path so Study Mode behavior stays centralized
- [x] Hide the affordance when cues are hidden, missing, or unusable
- [x] Keep the affordance compact so Reading mode does not feel noisy
- [x] Add or update tests for Reading-mode visibility and routing behavior
- [x] Update docs/CueCraft-Progress.md and test counts if needed
- [x] Manual Obsidian test instructions

## Phase 2: Softer Cornell Structure And Visual Direction
- [x] Soften the title, cue-column divider, and summary rules so they use quiet theme borders instead of harsh lines
- [x] Improve cue rail spacing so cue cards feel intentional and questions align cleanly
- [x] Decide whether to refine Cornell Classic directly or add a new "Soft Sheet" visual preset
- [x] Preserve existing Cornell style presets and display controls
- [x] Add or update style tests if a new preset or style id is introduced
- [x] Update docs/CueCraft-Progress.md and test counts if needed
- [x] Manual Obsidian test instructions

## Phase 3: Short Study Takeaway Summary
- [ ] Change Cornell summary rendering toward a concise "Takeaway" or "Study takeaway" presentation
- [ ] Constrain summary reading width so it does not become a full-width AI paragraph
- [ ] Keep the learning objective available but visually secondary
- [ ] Update summary prompt guidance so providers prefer one-sentence study takeaways
- [ ] Preserve compatibility with existing cached summaries
- [ ] Add or update tests for rendering, prompt/schema behavior, and cache compatibility
- [ ] Update docs/CueCraft-Progress.md and test counts if needed
- [ ] Manual Obsidian test instructions

## Phase 4: Better Question Supports Instead Of Keyword Chip Piles
- [ ] Reduce visible supports to a small, useful set such as top three evidence terms
- [ ] Render supports as subtle hint/evidence text instead of many rounded buttons by default
- [ ] Preserve Study Mode hide/reveal behavior for supports
- [ ] Preserve compatibility with existing cached keyword arrays
- [ ] Decide whether richer fields such as hint, evidence, or answerCheck are needed now or deferred
- [ ] Add or update tests for support limiting, reveal behavior, and old-cache compatibility
- [ ] Update docs/CueCraft-Progress.md and test counts if needed
- [ ] Manual Obsidian test instructions

## Phase 5: Cornell Appearance Settings For Summary And Supports
- [ ] Add only the highest-value Cornell appearance controls needed by the polished defaults
- [ ] If applicable, add settings for Cornell appearance, summary style, and support style
- [ ] Keep current behavior available where reasonable for users who like keyword chips
- [ ] Ensure changing these settings refreshes open Cornell views live
- [ ] Avoid cluttering the Appearance subpage with low-value controls
- [ ] Add or update tests for defaults, setting persistence, and rendering-class behavior
- [ ] Update docs/CueCraft-Progress.md and test counts if needed
- [ ] Manual Obsidian test instructions

## Phase 6: Final Cornell Review And Regression Pass
- [ ] Review implementation against every requirement in the Cornell polish plan
- [ ] Run the full automated test suite and build
- [ ] Update docs/CueCraft-Progress.md with final Cornell polish status and test count
- [ ] Confirm manual Obsidian coverage for Reading entry, Cornell open/focus, Study Mode, reveal supports, Refresh stale, per-cue regenerate, appearance settings, and summary readability
- [ ] Provide a full manual Obsidian regression checklist

## Rules
1. Only work on ONE incomplete phase at a time.
2. Before editing code, identify the single phase you are about to complete.
3. Complete all unchecked tasks in the selected phase.
4. Do not inspect or implement later phases except to understand dependencies for the selected phase.
5. When the selected phase is fully coded and verified, mark only that phase's completed tasks as [x].
6. After finishing the selected phase, STOP immediately and report:
   - what changed
   - tests/build results
   - whether docs/CueCraft-Progress.md and test counts were updated
   - manual Obsidian test instructions
7. Do not commit immediately after finishing a phase.
8. Wait for the user to manually test in Obsidian.
9. Only create a git commit after the user explicitly says `continue`.
10. When the user says `continue`, first commit the completed phase with a descriptive commit message, then begin exactly one next incomplete phase.
11. Never include unfinished phase work in the commit.
12. If there are still incomplete phases after the selected phase is complete, leave them incomplete and stop anyway.
