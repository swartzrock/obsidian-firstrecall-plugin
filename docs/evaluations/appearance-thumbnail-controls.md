# Appearance Thumbnail Controls Evaluation

Created: 2026-06-24

## Scope

Use this checklist when reviewing the Appearance thumbnail-button redesign inside Obsidian. The automated tests verify option coverage and DOM state; this pass verifies the settings pane visually.

## Checklist

- Light theme: Cornell display mode, style, width, font size, and accent groups render without clipped labels, clipped selected badges, or overlapping previews.
- Dark theme: all preview cards keep readable text, visible borders, and clear accent tint.
- Narrow pane under 700px: each thumbnail group stacks to one column and the longest labels remain inside their buttons.
- Display mode: Cornell preview resembles a pale left-rail cue card; Hook rail preview resembles a rounded teal hook card.
- Style: Classic, Exam Prep, Legal Pad, Minimal, and Handwritten are visually distinct before selection.
- Width and font size: Narrow/Medium/Wide and Small/Medium/Large show visible differences from the same sample cue.
- Accent: Violet, Teal, Amber, and Rose tint both the rail and support text in the preview.
- Keyboard: tab focus is visible, and the selected state is still clear without relying only on color.
