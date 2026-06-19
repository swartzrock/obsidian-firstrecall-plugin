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

- **Providers:** Ollama (local, free) or a frontier model — Anthropic (Claude), OpenAI (ChatGPT), Google (Gemini), or xAI (Grok) — via the Vercel AI SDK. Choose one in Settings; cloud providers need an API key (stored locally in the vault's plugin data).
- **Editor-mode** cue questions + keywords per section, and a whole-note summary.
- **Cornell view** — a dedicated pane laying the note out as Title → left cue column | main notes → Summary, rendered from the cache (command: *Open Cornell View*).
- **Study Mode** (in the Cornell view) blurs the left keyword hints until you reveal each cue.
- **Cornell view styles** — pick a visual preset in settings: Cornell Classic, Exam Prep, Legal Pad, Minimal, or Handwritten.
- **Per-note** enable / hide / clear.
- **JSON cache** with stale detection; strict typed validation of model output.
- **Desktop-only** (`isDesktopOnly: true`).

## Development

Requirements: [Bun](https://bun.sh) and an Obsidian vault for manual testing.

```bash
bun install      # install dependencies
bun run dev      # esbuild watch -> main.js
bun run build    # typecheck + production bundle
bun run test     # run the vitest suite
bun run typecheck
```

CI (GitHub Actions) runs `bun install`, `bun run build`, and `bun run test` on every pull
request — see [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).


## License

MIT
