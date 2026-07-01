# CueCraft

> AI-powered active-recall study cues for [Obsidian](https://obsidian.md).

CueCraft turns ordinary notes into interactive study sessions. It reads the current note,
generates Cornell-style cue questions, keywords, Section Lens notes, and a Note Brief, and
shows them as a **non-destructive** study layer beside the note — your Markdown file is
never modified.

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

- **Providers:** Ollama (local, free), direct cloud providers — Anthropic (Claude), OpenAI (ChatGPT), Google (Gemini), and xAI (Grok) — OpenRouter for one-key access to many hosted models, or local Codex / Claude CLI commands. Choose one in Settings; cloud providers and OpenRouter need an API key (stored locally in the vault's plugin data), while CLI providers use your existing local CLI login.
- **Editor-mode** cue questions + keywords per section, plus AI-native review surfaces:
  Section Lens per section and a whole-note Note Brief.
- **Cornell view** — a dedicated pane laying the note out as Title → left cue column | main notes → Summary, rendered from the cache (command: *Open Cornell View*).
- **Study Mode** (in the Cornell view) blurs the left keyword hints until you reveal each cue.
- **Cornell view styles** — pick a visual preset in settings: Cornell Classic, Exam Prep, Legal Pad, Minimal, or Handwritten.
- **Per-note** enable / hide / clear.
- **JSON cache** with stale detection; strict typed validation of model output.
- **Desktop-only** (`isDesktopOnly: true`).

## Review surfaces

Section Lens adds a compact key phrase, takeaway, and explanation to each generated cue.
Note Brief adds a whole-note overview with three review cards: what matters, review first,
and say it back. Both artifacts are generated with cues and stored in CueCraft's cache even
when their displays are turned off.

Use **Settings → CueCraft → Note format** to toggle **Show Section Lens** and
**Show Note Brief**. Turning a display off only hides cached review content; it does not
delete cached data or stop future cue generation from creating it.

Manual verification checklist for review-surface changes:

1. Turn both toggles on, generate cues for a note with at least two headings, and confirm
   the editor shows one Note Brief near the top plus Section Lens content attached to each
   cue. Switch to Reading mode and Cornell/review views and confirm the same cached review
   content appears without changing the Markdown file.
2. Turn **Show Section Lens** off, clear or regenerate cues for a test note, and confirm
   cues still generate but Section Lens blocks are hidden. Turn it back on and confirm the
   cached Section Lens appears without regenerating the note.
3. Turn **Show Note Brief** off, clear or regenerate cues, and confirm no note-level brief
   appears in editor, Reading mode, or Cornell/review views. Turn it back on and confirm the
   cached Note Brief appears without regenerating the note.
4. Add a new heading with body text to a note that already has generated cues, then run
   **Refresh stale**. Confirm CueCraft regenerates only the new or changed section, keeps
   existing Section Lens content for unchanged sections, refreshes the Note Brief, and keeps
   cue/Section Lens placement aligned after typing or inserting blank lines above headings.

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

## Local CLI providers

CueCraft can call installed desktop CLI tools instead of storing another API key:

- **Codex CLI** — select `Codex CLI`, keep the command as `codex` or enter an absolute path, then run **Test connection**. Leave the model override blank to use your Codex CLI default, or enter a model supported by your installed CLI.
- **Claude CLI** — select `Claude CLI`, keep the command as `claude` or enter an absolute path, then run **Test connection**. Leave the model override blank to use your Claude CLI default, or enter an alias/model such as `sonnet`.

CueCraft does not install the CLIs, log in for you, or manage CLI tokens. Run the relevant login/setup command in your terminal first (`codex login` or `claude login`), then use CueCraft's connection check.

Local CLI providers are desktop-only local process integrations, not local models. Note text is still sent through the selected CLI's own account/service path. To avoid interactive prompts and file access during cue generation, CueCraft runs the CLIs non-interactively, disables/denies tools where the CLI supports it, and limits CLI-backed section generation to one request at a time.

Not included in this first CLI provider slice: interactive coding-agent sessions, TTY handoff, long-lived session resume, SDK bundling, mobile support, or CLI-managed install/login flows.


## License

MIT
