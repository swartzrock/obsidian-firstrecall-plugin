# CueCraft

CueCraft is a desktop [Obsidian](https://obsidian.md) plugin that turns notes into
active-recall study sessions without changing the source Markdown.

For each section with a heading and body, CueCraft generates a **Summary**, **Question**,
and **Terms**. It can also create a whole-note **Note Brief**. The results appear beside
your notes in Editing and Reading views, where Study Mode lets you reveal answers one
section at a time.

Other useful features include:

- generation across a note, selected folders, or the entire vault;
- automatic refresh when studied notes change;
- inline and Cornell-style Section cue layouts; and
- Markdown and Anki-compatible TSV exports.

## Quick start

1. Open **Settings → CueCraft → AI Provider & Settings**.
2. Choose a provider, complete its setup, select a model, and run **Test connection**.
3. Open a note with headings and run **CueCraft: Generate Study Material for This Note**
   from the command palette.
4. Run **CueCraft: Toggle Study Mode** to practice recalling each section before revealing
   its answer.

Generated material is cached in Obsidian's plugin data. Visibility settings hide or show
cached material without regenerating it, and CueCraft never writes generated content into
the source note.

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
```

Terminology and product language are defined in the
[CueCraft glossary](./docs/CueCraft-Glossary.md).

## License

MIT
