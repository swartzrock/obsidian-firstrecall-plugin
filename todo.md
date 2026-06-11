# AI Model Settings TODO

Source brief: "docs/AI Model Settings Improvements.md"

## Goal

Implement all AI model settings improvements from the brief, preserving current CueCraft behavior and updating tests/progress docs after each change.

## Goal Mode Instructions

If this file is used with `/goal`, the goal for a single run is NOT to finish this whole file. The goal for a single run is:

> Complete exactly one unchecked task, report manual test instructions, and stop.

Stopping after one task is a successful completion of that run. Do not continue just because there are more unchecked tasks below.

## Phase 1: Anthropic Picker
- [x] Add curated Anthropic model catalog
- [x] Replace Anthropic free-text field with dropdown
- [x] Add custom model ID fallback
- [x] Preserve existing saved model IDs
- [x] Default Anthropic to Claude Sonnet 4.6
- [x] Add tests
- [x] Update docs/CueCraft-Progress.md
- [x] Manual Obsidian test instructions

## Phase 2: Connection Test Copy
- [x] Show friendly model name and raw ID on success
- [x] Improve unavailable-model error copy
- [x] Add tests
- [x] Update progress docs
- [x] Manual Obsidian test instructions

## Rules
1. Only work on ONE unchecked task at a time.
2. Before editing code, identify the single unchecked task you are about to work on.
3. Do not inspect or implement later unchecked tasks except to understand dependencies for the current task.
4. When the selected task is fully coded and verified, mark only that task as [x].
5. After finishing the selected task, STOP immediately and report:
   - what changed
   - tests/build results
   - whether docs/CueCraft-Progress.md and test counts were updated
   - manual Obsidian test instructions
6. Do not commit immediately after finishing a task.
7. Wait for the user to manually test in Obsidian.
8. Only create a git commit after the user explicitly says `continue`.
9. When the user says `continue`, first commit the completed task with a descriptive commit message, then begin exactly one next unchecked task.
10. Never include unfinished work in the commit.
11. If there are still unchecked tasks after the selected task is complete, leave them unchecked and stop anyway.
