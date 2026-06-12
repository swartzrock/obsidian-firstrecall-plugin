# Settings Navigation TODO

## Goal

Break the oversized CueCraft settings screen into smaller, more intentional settings subpages, starting with the heaviest sections: AI model, cue generation, and appearance.

## Phase 1: Settings Home + Subpage Navigation

- [ ] Design a top-level CueCraft settings home page instead of rendering every section inline
- [ ] Add clear entry rows/cards for `AI model`, `Cue generation`, and `Appearance`
- [ ] Keep lighter sections like `Note format` and `Study Mode` on the main settings page unless they still feel too heavy after the split
- [ ] Make subpage navigation feel native to Obsidian settings rather than like an in-plugin modal
- [ ] Preserve current settings behavior and saved values while changing only the navigation structure
- [ ] Add tests only if shared settings navigation helpers are introduced
- [ ] Update docs/CueCraft-Progress.md if this phase ships
- [ ] Manual Obsidian test instructions

## Phase 2: Move Large Sections Into Dedicated Subpages

- [ ] Move the full AI model setup flow into its own subpage
- [ ] Move cue generation controls into their own subpage
- [ ] Move appearance controls into their own subpage
- [ ] Add concise subpage summaries on the settings home page so users can tell what lives where
- [ ] Re-check layout density and hierarchy after the split so the main settings page feels much smaller and easier to scan
- [ ] Add or update tests only where rendering helpers or state-preservation logic change
- [ ] Update docs/CueCraft-Progress.md and test counts if needed
- [ ] Manual Obsidian test instructions
