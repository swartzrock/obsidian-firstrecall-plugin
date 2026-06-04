# CueCraft

> AI-powered active-recall study cues for [Obsidian](https://obsidian.md).

CueCraft turns ordinary notes into interactive study sessions. It reads the current note,
generates Cornell-style cue questions, keywords, and a summary, and shows them as a
**non-destructive** study layer beside the note — your Markdown file is never modified.

The goal is retention, not prettier summaries: see a question, try to recall the answer,
reveal the source, then use the summary to check the big picture.

## Status

Early scaffold (v0.1.0). This repo currently contains a runnable plugin skeleton — ribbon
icon, command palette entries, status-bar pill, and an Ollama settings tab with a working
**Test connection** — plus the planning docs in [`docs/`](./docs). Cue generation, the editor
cue layer, Study Mode, and caching are being built out against the v1.0 spec.

- [MVP scope & roadmap](./docs/CueCraft-MVP-Scope.md)
- [v1.0 user stories & acceptance criteria](./docs/CueCraft-v1-User-Stories.md)

## v1.0 at a glance

- **Provider:** Ollama (local, free). Other providers (OpenAI, Claude Code, Local VM) come later.
- **Editor-mode** cue questions + keywords per section, and a whole-note summary.
- **Study Mode** hides section bodies (blur) while questions stay visible.
- **Per-note** enable / hide / clear.
- **JSON cache** with stale detection; strict typed validation of model output.
- **Desktop-only** (`isDesktopOnly: true`) — relies on a local Ollama server.

## Development

Requirements: Node 18+ and an Obsidian vault for manual testing.

```bash
npm install      # install dependencies
npm run dev      # esbuild watch -> main.js
npm run build    # typecheck + production bundle
npm run typecheck
```

To try it in Obsidian, symlink or copy `manifest.json`, `main.js`, and `styles.css` into
`<your-vault>/.obsidian/plugins/cuecraft/`, then enable the plugin in
**Settings → Community plugins**.

## License

MIT
