---
"firstrecall": major
---

# FirstRecall 1.0 - first official release

FirstRecall turns your Obsidian notes into recall questions beside your text. Try answering from memory, then reveal the source to check your answer.

### ✨ What’s included

- Get an overview with a Note Brief: the big picture, core idea, what to review first, and a whole-note self-test.
- Generate study cards with a summary, recall question, and key terms for each section. FirstRecall also works with notes that have no headings.
- Generate and study material without changing your source Markdown. Study material is cached separately in your vault.
- Use Study Mode in Editing or Reading view. Hide the source with Blur or Collapse, try the recall question, then reveal the section to check your answer.
- Scan managed folders for missing or outdated study material. Update on demand or enable automatic updates after editing. If an update fails, the last successful material stays available.
- Choose Cornell cards beside your notes or Inline cards in Editing view. Resize Cornell cards and choose which summaries, questions, and key terms appear.
- Generate material with the Simonides hosted trial, one of 11 cloud API providers, Ollama, LM Studio, or your installed Codex or Claude Code terminal app. Cloud-backed generation sends content to the selected service. A local server and model can keep generation on your machine.
- Export recall questions and key terms to Markdown or Anki-compatible TSV. Exports use numbered copies when files already exist, preserving your edits.
- Store cloud API credentials in Obsidian’s Secret Storage. Diagnostic logs omit model response previews.

### 🔨Installation

FirstRecall is free and open source. It requires Obsidian Desktop 1.11.4 or later.

Until FirstRecall is available in the Community Plugins directory, install [BRAT](https://github.com/TfTHacker/obsidian42-brat), choose Add Beta plugin, and paste:

```text
https://github.com/swartzrock/obsidian-firstrecall-plugin
```

### 🏎️ Start studying

Open Settings → FirstRecall → AI model and choose a provider. Then open a note and select Generate study material for this note from the FirstRecall menu.

Choose Study this note, try answering the question, and reveal the source when you’re ready.

The hosted trial needs no account or API key; usage and capacity limits apply. Other online providers may require an account and charge for usage. See the [guide](https://www.firstrecall.ai/guide) for setup help and the [Simonides privacy policy](https://simonides.ai/privacy) for hosted-trial data handling.

### 🗣️ Feedback

If you find a bug, have an idea, or get study material that doesn’t work for your note, [open an issue](https://github.com/swartzrock/obsidian-firstrecall-plugin/issues). Tell us what you expected and what happened. Please leave out private note content and API keys.
