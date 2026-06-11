# AI Model Settings TODO

Source brief: "docs/AI Model Settings Improvements.md"

## Goal

Implement all AI model settings improvements from the brief, preserving current CueCraft behavior and updating tests/progress docs after each change.

## Phase 1: Anthropic Picker
- [x] Add curated Anthropic model catalog
- [x] Replace Anthropic free-text field with dropdown
- [x] Add custom model ID fallback
- [ ] Preserve existing saved model IDs
- [ ] Default Anthropic to Claude Sonnet 4.6
- [ ] Add tests
- [ ] Update docs/CueCraft-Progress.md
- [ ] Manual Obsidian test instructions

## Phase 2: Connection Test Copy
- [ ] Show friendly model name and raw ID on success
- [ ] Improve unavailable-model error copy
- [ ] Add tests
- [ ] Update progress docs
- [ ] Manual Obsidian test instructions

## Rules
1. Only work on ONE unchecked task at a time.
2. When a task is fully coded and verified, mark only that task as [x].
3. After finishing a task, STOP immediately and report:
   - what changed
   - tests/build results
   - whether docs/CueCraft-Progress.md and test counts were updated
   - manual Obsidian test instructions
4. Do not commit immediately after finishing a task.
5. Wait for the user to manually test in Obsidian.
6. Only create a git commit after the user explicitly says `continue`.
7. When the user says `continue`, first commit the completed task with a descriptive commit message, then begin the next unchecked task.
8. Never include unfinished work in the commit.
