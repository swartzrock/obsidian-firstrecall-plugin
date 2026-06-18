# Cornell View Polish TODO

Source plan: "docs/plans/2026-06-12-001-feat-cornell-view-polish-plan.md"

## Goal

Implement the Cornell View polish plan phase by phase, preserving existing CueCraft behavior and updating tests/progress docs after each phase.

## Goal Mode Instructions

If this file is used with `/goal`, the goal for a single run is NOT to finish this whole file. The goal for a single run is:

> Complete all unchecked tasks in exactly one phase, report manual test instructions, and stop.

Stopping after one phase is a successful completion of that run. Do not continue just because there are more unchecked phases below.

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
