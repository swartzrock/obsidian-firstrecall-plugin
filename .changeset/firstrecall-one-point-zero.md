---
"firstrecall": major
---

🎉 FirstRecall 1.0 — your notes are ready for a pop quiz!

You highlighted it. You reread it. Now see what you can remember. FirstRecall turns your Obsidian notes into active-recall practice, with questions beside your text and answers waiting until you're ready to reveal them.

### ✨ Highlights

- 🧠 **Study Mode: try, then reveal.** Hide the source with Blur or Collapse, attempt the recall question, and reveal the section to check your answer. Practice in Editing or Reading view.
- 🗂️ **A study card for each section.** Generate a summary, recall question, and key terms from your note's headings. No headings? FirstRecall can work with those notes too.
- 🧭 **Get your bearings with a Note Brief.** See the big picture, core idea, what to review first, and a whole-note self-test before diving into the details.
- ✍️ **Your notes stay your notes.** Generating and studying material leaves your source Markdown unchanged. Study material is cached separately in your vault.
- 🔄 **Keep practice material current.** Managed folders scan for missing or outdated material. Update on demand, or opt into automatic updates after you finish editing. Failed updates keep the last successful material available.
- 🎛️ **Make room for your way of studying.** Choose Cornell cards beside your notes or Inline cards in Editing view, resize Cornell cards, and adjust which summaries, questions, and key terms you see.
- 🤖 **Choose your AI.** Start with the Simonides hosted trial, connect one of 11 cloud API providers, use Ollama or LM Studio, or connect your installed Codex or Claude Code terminal app. Cloud-backed generation sends content to the selected service; a local server and model can keep generation on your machine.
- 📤 **Take your questions with you.** Export recall questions and key terms to Markdown or Anki-compatible TSV. Existing files are preserved with numbered copies, so your edits survive the next export.
- 🔑 **Keep API keys in Secret Storage.** Cloud credentials use Obsidian's Secret Storage, and diagnostic logs omit model response previews.

### 📦 Installation

FirstRecall is free, open source, and built for **Obsidian Desktop 1.11.4 or later**.

Until FirstRecall is available in the Community Plugins directory, install [BRAT](https://github.com/TfTHacker/obsidian42-brat), choose **Add Beta plugin**, and paste:

```text
https://github.com/swartzrock/obsidian-firstrecall-plugin
```

Prefer manual installation? Download `main.js`, `manifest.json`, and `styles.css` from this release into your vault's plugin folder (by default, `<your vault>/.obsidian/plugins/first-recall/`), then enable FirstRecall in **Settings → Community plugins**.

💡 **Your first session:** open **Settings → FirstRecall → AI model**, choose a provider, then open a note and select **Generate study material for this note** from the FirstRecall menu. Choose **Study this note**, give the question a try, and reveal the source when you're ready.

The hosted trial needs no account or API key; usage and capacity limits apply. Other online providers may require an account and charge for usage. See the [guide](https://www.firstrecall.ai/guide) for setup help and the [Simonides privacy policy](https://simonides.ai/privacy) for hosted-trial data handling.

### 🐛 Feedback welcome!

Found a bug, have an idea, or hit a note that doesn't study quite right? [Open an issue](https://github.com/swartzrock/obsidian-firstrecall-plugin/issues). Tell us what you expected and what happened; please leave out private note content and API keys.

Thanks for giving FirstRecall a place in your vault. Happy recalling! 🧠✨
