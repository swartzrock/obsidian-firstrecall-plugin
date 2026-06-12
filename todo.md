# Settings Navigation TODO

## Goal

Break the oversized CueCraft settings screen into smaller, more intentional settings subpages, starting with the heaviest sections: AI model, cue generation, and appearance.

## Phase 1: Settings Home + Subpage Navigation

- [x] Design a top-level CueCraft settings home page instead of rendering every section inline
- [x] Add clear entry rows/cards for `AI model`, `Cue generation`, and `Appearance`
- [x] Keep lighter sections like `Note format` and `Study Mode` on the main settings page unless they still feel too heavy after the split
- [x] Make subpage navigation feel native to Obsidian settings rather than like an in-plugin modal
- [x] Preserve current settings behavior and saved values while changing only the navigation structure
- [x] Add tests only if shared settings navigation helpers are introduced
- [x] Update docs/CueCraft-Progress.md if this phase ships
- [x] Manual Obsidian test instructions

## Phase 2: Move Large Sections Into Dedicated Subpages

- [x] Move the full AI model setup flow into its own subpage
- [x] Move cue generation controls into their own subpage
- [x] Move appearance controls into their own subpage
- [x] Add concise subpage summaries on the settings home page so users can tell what lives where
- [x] Re-check layout density and hierarchy after the split so the main settings page feels much smaller and easier to scan
- [x] Add or update tests only where rendering helpers or state-preservation logic change
- [x] Update docs/CueCraft-Progress.md and test counts if needed
- [x] Manual Obsidian test instructions
