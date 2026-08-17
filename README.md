# CueCraft

> AI-powered active-recall Section cues for [Obsidian](https://obsidian.md).

CueCraft turns ordinary notes into interactive study sessions. It reads the current note,
generates a Section cue with Summary, Question, and Terms for each eligible section, plus an
optional Note Brief, and shows them as a **non-destructive** study layer in Editing and Reading
views — your Markdown file is never modified.

The goal is retention, not prettier prose: see a Question, try to recall the answer, reveal the
source, then use the Summary and optional Note Brief to check the big picture.

## Status

CueCraft ships the full note → generate → cache → display → study loop, with multiple local,
cloud, router, and desktop CLI provider options. Current implementation progress is tracked in
the [progress log](./docs/CueCraft-Progress.md).

- [Historical MVP scope & roadmap](./docs/CueCraft-MVP-Scope.md)
- [Historical v1.0 user stories & acceptance criteria](./docs/CueCraft-v1-User-Stories.md)

## v1.0 at a glance

- **Providers:** Ollama (local, free), direct cloud providers — Anthropic (Claude), OpenAI (ChatGPT), Google (Gemini), and xAI (Grok) — OpenRouter for one-key access to many hosted models, or local Codex / Claude CLI commands. Choose one in Settings; cloud providers and OpenRouter need an API key (stored locally in the vault's plugin data), while CLI providers use your existing local CLI login.
- **Section cues** — each eligible section gets a Summary, Question, and Terms, plus an optional
  whole-note Note Brief.
- **Editing and Reading surfaces** — cached Section cues and Note Brief stay attached to the
  active note.
- **In-note Study Mode** — start or exit Study from the active note in Editing or Reading view,
  then reveal section answers without navigating to another pane.
- **Section cue displays** — choose Inline Section cues or the retained Cornell card presentation in
  Editing View. Cornell is a card layout option, not a separate view.
- **Study areas** — preview and generate Section cues across managed vault or folder scopes, with
  pause, cancel, retry, and optional maintain-on-save behavior.
- **Per-note** enable / hide / clear.
- **JSON cache** with stale detection; strict typed validation of model output.
- **Desktop-only** (`isDesktopOnly: true`).

## Generated study material

Summary captures the most important idea in each Section cue. Note Brief adds a whole-note
Overview with Core idea, Review first, and Self-test cards. Summary is generated with each
Section cue; Note Brief is generated when the selected provider supports it. Both are stored in
CueCraft's cache even when their displays are turned off.

Use **Settings → CueCraft → Study aids** to control whether Summary, Question, Terms, and Note
Brief are shown. Turning a display off only hides cached study material; it does not delete
cached data or stop future generation from creating it.

Manual verification checklist for generated-study-material changes:

1. Turn all study-aid displays on, generate Section cues for a note with at least two headings,
   and confirm the editor shows one Note Brief near the top plus Summary, Question, and Terms
   content attached to each Section cue. Switch to Reading mode and confirm the same cached
   study material appears without
   changing the Markdown file. In Editing View, select the Cornell card display and confirm
   it presents those same artifacts beside their sections.
2. Turn **Show Summary** off, clear or regenerate Section cues for a test note, and confirm
   Section cues still generate but Summary blocks are hidden. Turn it back on and confirm the
   cached Summary appears without regenerating the note.
3. Turn **Show Note Brief** off, clear or regenerate Section cues, and confirm no Note Brief
   appears in Editing or Reading view. Turn it back on and confirm the
   cached Note Brief appears without regenerating the note.
4. Add a new heading with body text to a note that already has generated Section cues, then run
   **Refresh stale**. Confirm CueCraft regenerates only the new or changed section, keeps
   existing Summary content for unchanged sections, refreshes the Note Brief, and keeps
   Section cue placement aligned after typing or inserting blank lines above headings.

## Studying a note

Open a note in Editing or Reading view and use its **Study** action or the **Toggle Study
Mode** command. Study stays in that note: questions remain visible, answers can be revealed
section by section, and the same session follows the note when you switch between Editing and
Reading. There is no separate study pane.

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

Local CLI providers are desktop-only local process integrations, not local models. Note text is still sent through the selected CLI's own account/service path. To avoid interactive prompts and file access during Section cue generation, CueCraft runs the CLIs non-interactively, disables/denies tools where the CLI supports it, and limits CLI-backed section generation to one request at a time.

Not included in this first CLI provider slice: interactive coding-agent sessions, TTY handoff, long-lived session resume, SDK bundling, mobile support, or CLI-managed install/login flows.


## License

MIT
