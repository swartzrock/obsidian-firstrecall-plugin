# firstrecall

## 0.7.4

### Patch Changes

- 3179cc9: Add an opt-in developer console flag to log the next Simonides request and raw response, including transport errors and the automatic rate-limit retry. The flag is consumed when the call starts and adds no settings UI.
- 4da8c46: Fix Study mode in Reading view so answers blur like Editing view, including when headings and answers render in separate blocks.
  
  Center the reveal button on the bottom border of inline study cards in Editing and Reading, with space before the answer. Side-rail cards keep the button on the right edge.
  
  Preserve the Reading view viewport and focused eye button when revealing or hiding answers by updating study state without rebuilding the note.
- 3179cc9: Keep FirstRecall's interactive side-rail cards accessible in CodeMirror so focusing the Study eye button no longer conflicts with the gutter's aria-hidden attribute. Preserve neighboring gutters' hidden state and restore original attributes when the cards or extension are removed.

## 0.7.3

### Patch Changes

- 96de9f0: Prioritize Study in the note menu when material is current and Generate when it needs attention. Group Generate, Hide, and Clear together, with exports in their own section.

## 0.7.2

### Patch Changes

- 76a59e0: Preserve existing Markdown and Anki exports by adding a number to the filename when a file already exists.
- 76a59e0: Remove model response previews from diagnostic logs, clarify provider privacy and export documentation, and publish release tags that match the Obsidian manifest version.

## 0.7.1

### Patch Changes

- 0f38b23: Add Clear Generated Study Material to the note dropdown menu and group related actions with separators.
- 0f38b23: Generate and display a Note Brief and whole-note study card for notes without headings, including notes with Properties. Support hiding and revealing the whole note body in Study mode.
- 0f38b23: Keep the Note Brief visible below Properties in Live Preview.

## 0.7.0

### Minor Changes

- ef470ca: Add the included FirstRecall hosted AI trial, connection-based provider setup, provider-wide request pacing, and hosted-trial limit handling.

## 0.6.1

### Patch Changes

- 8523299: Use Editing View's inline section cards in Reading View and simplify section summaries to a single string.

## 0.6.0

### Minor Changes

- e6dedbe: Add provider-specific API key setup links and documentation to AI model settings.

## 0.5.0

### Minor Changes

- 7e63eb0: Replaced the AI provider icons in Settings → AI model with colored logos from the `@lobehub/icons-static-svg` package (imported directly rather than hand-copied), matching each provider's real brand color where one exists. Providers whose official mark is monochrome (OpenAI, xAI, Groq, Ollama, LM Studio) keep an accurate black/white icon since there's no official colored version. Added a subtle outline to the OpenRouter icon so its bright brand color stays legible in light mode.
- 05f54af: Updated the BYOK runtime to v3.1.0, adding support for Together AI and Fireworks AI as cloud providers with their own logos in the AI settings.

### Patch Changes

- 05f54af: Fireworks AI's model dropdown now shows the short model name (e.g. "llama-v3p1-70b-instruct") instead of the full "accounts/.../models/..." ID. The full ID is still used as the underlying model value and appears as a detail line under the selected option.

## 0.4.3

### Patch Changes

- ddf620c: Added a note to the AI settings that the API keys are stored in Obsidian's secret storage, with a link to the Obsidian page for more details.

## 0.4.2

### Patch Changes

- e381f7e: another version bump

## 0.4.1

### Patch Changes

- b58127b: updating manifest to match

## 0.4.0

### Minor Changes

- 0e2a0fb: fixing release assets for obsidian plugins

## 0.3.0

### Minor Changes

- 2f2ccc6: Working github version bumps now

## 0.2.0

### Minor Changes

- 72162f4: Add Changesets-based release management.
