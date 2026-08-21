# firstrecall

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
