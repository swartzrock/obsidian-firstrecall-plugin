# FirstRecall

**You highlighted it. You reread it. You still can't recall it.**

Rereading feels like learning, but it isn't — it just makes a note *look* familiar.
FirstRecall turns any note into active-recall practice: it reads your note's own
sections and generates a **Note Brief** plus one **section study card** per section,
each with a summary, a recall question, and key terms. Then it quizzes you with
**Study Mode**, so you find out what you actually know before an exam or a meeting
does it for you.

Your notes are never touched. Everything FirstRecall generates lives beside the
source in Obsidian's own data — delete it, hide it, or export it, and your Markdown
never changes.

![Generate study material, then practice it in Study Mode](docs/media/generate-and-study.gif)

## Why FirstRecall

- **Built for recall, not summaries.** A summary tells you what a section says. A
  recall question makes you retrieve it — the thing that actually moves information
  into long-term memory.
- **Reads your note's structure, not a paragraph you selected.** Point it at a note
  with headings and it produces a full set of section cards automatically — no
  copy-pasting text into a prompt box, one section at a time.
- **Stays current without you remembering to update it.** Turn on automatic updates
  for a folder and FirstRecall regenerates only what changed after you stop editing
  — the rest of your material stays untouched.
- **Never rewrites your notes.** Generated material is cached separately. Uninstall
  the plugin tomorrow and your Markdown is exactly what it was yesterday.
- **Runs on whatever you already have.** Point it at a local model for fully private,
  offline generation, a cloud API, or a coding CLI you're already signed into —
  FirstRecall doesn't lock you into one vendor.

## Quick start

1. Open **Settings → FirstRecall → AI model**.
2. Choose a provider, complete its setup, select a model, and run **Test connection**.
3. Open a note with headings and run **FirstRecall: Generate study material for this
   note** from the command palette.
4. Start **Study Mode** to practice recalling each section before revealing its
   answer.

## What you get

Every generated note carries a **Note Brief** — a whole-note overview and review
guidance — plus one **section study card** per eligible heading:

- **Summary** — a concise statement of what the section actually says
- **Recall question** — a prompt whose answer lives in that section, for you to
  answer *before* you look
- **Key terms** — the vocabulary and evidence worth anchoring in memory

Study material renders beside your source in both Editing and Reading views, in
either an inline layout or a Cornell-style card layout — your choice per vault.

![A note with its Note Brief and section study cards visible beside the source](docs/media/note-and-cards.gif)

## Study Mode: prove it before you trust it

Study Mode hides each recall question's answer until you've attempted it yourself.
It's a temporary practice view — using it never changes what's saved, hidden, or
covered by automatic updates. Start it from the command palette, the note's context
menu, or the ribbon icon, and work through a note's cards one at a time.

## Managed folders: study material that keeps itself current

This is the part that makes FirstRecall useful past the first week. Add a folder (or
your **Entire vault**) as a **managed folder**, and FirstRecall can:

- **Scan first, generate second.** Adding a folder only scans it — read-only, no
  provider calls — and reports what's missing, outdated, ready, or failed. Nothing
  generates until you choose **Bring study material up to date**.
- **Track freshness per note.** Every note's material is **Current**, **Outdated**,
  **Updating**, or **Failed**, so you always know what's safe to trust.
- **Update itself, if you let it.** Turn on **Update automatically** and FirstRecall
  waits until you stop editing, then regenerates only the Note Brief and the section
  cards actually affected by your change — not the whole note, and never the folders
  you didn't enable.
- **Fail safely.** If an update fails, FirstRecall keeps the last successful material
  visible, marks it outdated, and offers **Retry update** — you're never left with a
  broken card mid-study-session.

![Adding a managed folder, scanning it, and turning on automatic updates](docs/media/managed-folders.gif)

## Export, your way

Take your recall questions and key terms out of Obsidian entirely:

- **Markdown** — a plain study sheet you can drop anywhere
- **Anki-compatible TSV** — import straight into Anki (or any tool that reads
  `question<TAB>answer`) if you want scheduled spaced-repetition review on top of
  FirstRecall's material

FirstRecall doesn't try to reinvent spaced-repetition scheduling — it focuses on
generating study material worth scheduling, then gets out of the way.

## Providers

FirstRecall supports:

- **Local servers:** Ollama and LM Studio — fully offline generation, nothing leaves
  your machine
- **Cloud APIs:** Anthropic, OpenAI, Google, xAI, OpenRouter, Groq, Mistral,
  DeepSeek, and DeepInfra
- **Desktop CLIs:** Codex CLI and Claude CLI

Cloud API keys are stored with Obsidian's Secret Storage API. When using a cloud API
or a desktop CLI backed by an online account, the selected provider receives the note
content needed for generation. Ollama and LM Studio can keep generation entirely
local when connected to a local server.

## How FirstRecall is different

There's no shortage of Obsidian AI plugins. Most fall into two camps, and FirstRecall
deliberately isn't either:

| | Generic AI summarizer plugins | Flashcard / spaced-repetition plugins | **FirstRecall** |
| --- | --- | --- | --- |
| What it produces | Free-form summary text | Cards from text *you* select | A Note Brief + section cards, derived automatically from your note's own headings |
| Keeps material current | Manual re-run | Manual re-tag | Managed folders refresh only what changed, automatically |
| Practice mode | None — it's just text to read | Full spaced-repetition scheduling | Study Mode (recall-before-reveal), plus export to a dedicated SRS tool |
| Provider choice | Usually one vendor | Usually one aggregator, or a paid hosted tier | 9 cloud APIs, local models, or a CLI you already use |
| Touches your source note | Often inserts text inline | Stores separately | Never modifies source Markdown — full stop |

## Display

Visibility settings control whether the Note Brief, section cards, and their
components appear in Editing and Reading. Hidden material remains cached and, when
covered by a managed folder, continues to receive automatic updates.

FirstRecall supports inline and Cornell-style section card layouts, plus Markdown and
Anki-compatible TSV exports.

## Install from source

FirstRecall requires Obsidian 1.11.4 or newer and is desktop-only. To install a
development build, clone the repository into your vault's plugin directory:

```bash
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/swartzrock/obsidian-firstrecall-plugin.git firstrecall
cd firstrecall
bun install --frozen-lockfile
bun run build
```

Reload Obsidian, then enable FirstRecall under **Settings → Community plugins**.

## Development

[Bun](https://bun.sh) 1.3.14 is the project package manager.

```bash
bun install --frozen-lockfile
bun run dev        # rebuild on source changes
bun run typecheck
bun run lint
bun run test
bun run build      # typecheck and create a production bundle
bun run check      # run every release check
```

Terminology and product language are defined in the
[FirstRecall glossary](./docs/FirstRecall-Glossary.md).

## License

MIT
