# Editor Cue Displays Evaluation

Use this checklist to compare CueCraft's normal-editor Section cue displays in an Obsidian note page. Check the same cached note in each display mode so differences are visual and behavioral, not content-driven.

## Test Note Shape

Use a note with at least five eligible sections:

- A short section with a high-confidence Question and 2-4 Terms.
- A section with a long generated question.
- A section with no Terms when `Show Terms` is off.
- A section whose cached Section cue failed generation.
- A later section far enough down the note to require scrolling.

## Display Modes

Check these settings under Cue Generation -> Cue display:

- Inline Section cues
- Cornell

## Required Checks

- Default upgrade: Inline Section cues remain selected when the new setting is absent.
- Settings persistence: Changing the display rerenders the active editor and survives plugin reload.
- Markdown safety: Switching modes does not change the note's Markdown source.
- Placement: Inline cues appear beneath their headings; Cornell cards appear in the editor gutter beside their sections.
- Terms visibility: Turning `Show Terms` off hides Terms in both display modes.
- Failed Section cues: Failed sections remain visible as failed states in both display modes.
- Long questions: Long question text remains readable without overlapping note text.
- Light theme: Cue text, borders, and backgrounds meet normal Obsidian light-theme contrast.
- Dark theme: Cue text, borders, and backgrounds remain legible without hard-coded light colors.
- Narrow pane: Inline cues remain in flow and Cornell cards do not cover editor text.
- Cornell width: Dragging or using the keyboard on the Cornell width separator updates all visible cards and survives reload.
- Reduced motion: Cornell disclosure and layout changes remain understandable when motion is reduced.

## Known Manual Gap

Automated tests cover setting options, persisted-value cleanup, DOM classes, hidden Terms, failed states, Cornell width controls, and TypeScript safety. Visual overlap, theme contrast, and real CodeMirror gutter interaction still need manual review inside Obsidian because they depend on editor pane width and active community theme CSS.
