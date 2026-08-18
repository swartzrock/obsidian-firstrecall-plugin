# CueCraft

CueCraft is a desktop [Obsidian](https://obsidian.md) plugin that turns notes into
active-recall study material. It creates one **Note Brief** for the whole note and one
**section study card** for each eligible section. Every section card contains a
**Summary**, **Recall question**, and **Key terms**.

Study material appears beside the source in Editing and Reading views. Study Mode lets
you attempt each recall question before revealing the answer. CueCraft saves generated
material in Obsidian's plugin data and never modifies your source Markdown.

## Quick start

1. Open **Settings → CueCraft → AI model**.
2. Choose a provider, complete its setup, select a model, and run **Test connection**.
3. Open a note with headings and run **CueCraft: Generate study material for this note**
   from the command palette.
4. Run **CueCraft: Toggle Study Mode** to practice recalling each section before revealing
   its answer.

## Managed folders

Use **Managed folders** to generate and refresh study material in bulk for selected folders
or **Entire vault**. Turn on automatic updates for the folders you want CueCraft to keep
current. Folder choices and Entire vault are mutually exclusive.

Adding a managed folder runs a read-only, provider-free scan. The scan reports
missing, outdated, ready, and failed study material. Choose **Bring study material
up to date** to explicitly generate missing material and refresh outdated material.

**Update automatically** is off for every new managed folder. When enabled, CueCraft waits until
editing pauses, then creates study material for new content and refreshes only the affected
section cards plus the Note Brief.

Coverage and freshness are separate:

- **Automatic** coverage means enabled managed folders stay current.
- **Manual** coverage means updates happen only when you request them.
- Generated material can be **Current**, **Outdated**, **Updating**, or **Failed**.

Hiding generated material, collapsing a card, or using Study Mode never changes automatic
coverage. If an update fails, CueCraft keeps the last successful material visible, marks it
outdated, and offers **Retry update**. Scanning, generation, automatic updates, and retries
never write to the source note; neither do rendering or export.

## Content shown in notes

Visibility settings control whether the Note Brief, section cards, and their
components appear in Editing and Reading. Hidden material remains cached and, when
covered by a managed folder, continues to receive automatic updates.

CueCraft supports inline and Cornell-style section card layouts, plus Markdown and
Anki-compatible TSV exports.

## Providers

CueCraft supports:

- **Local servers:** Ollama and LM Studio
- **Cloud APIs:** Anthropic, OpenAI, Google, xAI, OpenRouter, Groq, Mistral, DeepSeek,
  and DeepInfra
- **Desktop CLIs:** Codex CLI and Claude CLI

Cloud API keys are stored with Obsidian's Secret Storage API. When using a cloud API or a
desktop CLI backed by an online account, the selected provider receives note content needed
for generation. Ollama and LM Studio can keep generation local when connected to a local
server.

## Install from source

CueCraft requires Obsidian 1.11.4 or newer and is desktop-only. To install a development
build, clone the repository into your vault's plugin directory:

```bash
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/swartzrock/obsidian-cuecraft-plugin.git cuecraft
cd cuecraft
bun install --frozen-lockfile
bun run build
```

Reload Obsidian, then enable CueCraft under **Settings → Community plugins**.

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
[CueCraft glossary](./docs/CueCraft-Glossary.md).

## License

MIT
