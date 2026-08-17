# Inline Editor Hook Rails Evaluation

Use this checklist to compare CueCraft's normal-editor Section cue displays in an Obsidian light note page. Check the same cached note in each display mode so differences are visual and behavioral, not content-driven.

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
- Anchored card rail
- Collapsed color tabs
- Threaded margin notes
- Active-section composer
- Hook minimap

## Required Checks

- Default upgrade: Inline Section cues remain selected when the new setting is absent.
- Settings persistence: Changing the dropdown rerenders the active editor and survives plugin reload.
- Markdown safety: Switching modes does not change the note's Markdown source.
- Terms visibility: Turning `Show Terms` off hides Terms in every display mode.
- Failed Section cues: Failed sections remain visible as failed states in every display mode.
- Long questions: Long hook text remains readable without overlapping note text.
- Light theme: Hook text, borders, and backgrounds meet normal Obsidian light-theme contrast.
- Dark theme: Hook text, borders, and backgrounds remain legible without hard-coded light colors.
- Narrow pane: Each mode degrades into in-flow blocks or compact tabs without covering editor text.
- Reduced motion: Collapsed tabs and minimap popouts remain understandable when motion is reduced.

## Mode-Specific Notes

- Anchored card rail should feel closest to the colorful Hook Rail review surface while staying attached to normal editor sections.
- Collapsed color tabs should keep most sections compact, with the current or focused section exposing a readable peek.
- Threaded margin notes should be calmer than cards and preserve a visible section-to-hook relationship.
- Active-section composer should emphasize the current hook without suggesting live generation while typing.
- Hook minimap should read as a compact section overview with readable popouts, not a replacement editor.

## Known Manual Gap

Automated tests cover setting options, model output, DOM classes, hidden Terms, failed states, and TypeScript safety. Visual overlap, theme contrast, and real CodeMirror gutter interaction still need manual review inside Obsidian because they depend on editor pane width and active community theme CSS.
