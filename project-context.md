# FirstRecall Obsidian Plugin — Project Context

Last verified: September 6, 2026, against the current working tree. This is a durable context document for product, design, engineering, testing, and positioning work on the **Obsidian plugin in this repository**. It is descriptive, not an implementation plan.

## Scope boundary

This document covers FirstRecall's plugin experience and implementation. It does **not** document the separately hosted AI service, its architecture, policies, operations, ownership, roadmap, or branding.

The plugin includes an optional hosted-trial provider alongside API-key, local-server, and terminal providers. That integration is mentioned only where it affects plugin behavior. Treat the service behind it as an external provider and consult that project's own sources for service-specific facts.

## At a glance

FirstRecall is a desktop Obsidian plugin that turns existing Markdown notes into active-recall study material without inserting generated text into the source notes.

For each eligible note it can create:

- one whole-note **Note Brief**; and
- one **section study card** for each eligible headed section.

The material appears beside or beneath the original note in Obsidian's Editing and Reading views. **Study Mode** hides source-section answers until the learner reveals them. Generated material can be maintained as notes change, hidden without being deleted, and exported for use outside the plugin.

The core product idea is: **help people retrieve and retain knowledge from notes they already have, inside their existing Obsidian workflow.** The plugin is built around recall-before-reveal, not passive summarization.

## Product identity

- Product and plugin name: **FirstRecall**.
- Repository: <https://github.com/swartzrock/obsidian-firstrecall-plugin>
- Plugin ID: `first-recall`.
- Author: `swartzrock`.
- License: [PolyForm Perimeter 1.0.1](LICENSE) (source-available; personal and workplace use allowed, providing competing products prohibited).
- Current manifest/package version: `0.6.1`.
- Minimum supported Obsidian version: `1.11.4`.
- Platform: Obsidian Desktop only (`isDesktopOnly: true`).

The current branch contains work newer than the published `0.6.1` metadata, so do not assume every behavior described here is in the latest public release.

## Problem, audience, and positioning

Rereading can create familiarity without reliable retrieval. FirstRecall adds retrieval practice directly to a user's notes so they can test what they know before revealing the source.

The natural audience is people who already use structured Obsidian notes to learn: students, self-directed learners, researchers, and professionals. This is a workflow-based audience description, not a formal market-segmentation decision.

FirstRecall's distinguishing combination is:

- study material follows the note's existing headings and content;
- practice happens in the note rather than in a separate study database;
- generated material stays separate from source Markdown;
- freshness is tracked as notes change;
- unchanged cards are preserved during incremental updates;
- the user can choose where AI generation runs; and
- exports support moving recall prompts into another study workflow.

FirstRecall is not a general-purpose chat interface, a note writer, or a full spaced-repetition scheduler. It can export Anki-compatible data, but scheduling and long-term review algorithms belong to dedicated SRS tools.

## Established product language

| Term | Meaning |
| --- | --- |
| **Note** | The Markdown document FirstRecall reads as source material. |
| **Note Brief** | One whole-note overview and three content-specific review cards: **core idea**, **review first**, and **self-test**. |
| **Section study card** | Generated material for one eligible headed section: a summary, recall question, and key terms. |
| **Summary** | One short sentence stating the section's most important idea. |
| **Recall question** | A prompt whose answer must be recoverable from the corresponding section. |
| **Key terms** | Two to five short terms that anchor important evidence or vocabulary. |
| **Study Mode** | A temporary recall-before-reveal view that conceals source-section bodies until the user reveals them. |
| **Managed folder** | A folder—or the entire vault—whose notes can be scanned, bulk-updated, and optionally maintained after edits. |
| **Provider** | The hosted trial, cloud API, local model server, or terminal tool through which FirstRecall accesses an AI model. |
| **Study material** | The Note Brief and section study cards collectively. Internal code often uses `cue` for section-card concepts. |

Use these terms in user-facing work. In particular, prefer **section study card** over the internal term **cue**.

## Core user workflow

1. Install and enable the plugin in Obsidian Desktop. The README currently recommends BRAT for prerelease installation and GitHub-based updates.
2. Open **Settings → FirstRecall → AI model**.
3. Select a connection type and provider, configure any required URL, command, API key, or model, and test the connection where applicable.
4. Open a Markdown note containing headed sections with textual content.
5. Choose **Generate study material for this note** from the FirstRecall note-header menu or command palette.
6. Review the Note Brief and section study cards in Editing or Reading view.
7. Choose **Study this note** and attempt each answer before revealing the corresponding section body.
8. Optionally enable managed-folder maintenance or export recall questions and key terms.

If a note has no usable generated section cards, Study Mode directs the user to generate study material first.

## What the plugin generates

### Note Brief

The Note Brief appears near the top of the note and contains:

- a two-sentence overview;
- a content-specific **core idea** title and detail;
- a content-specific **review first** title and detail; and
- a **self-test** whose title is itself the recall question, plus a detail.

The internal schema names the three cards `whatMatters`, `reviewFirst`, and `sayItBack`. Those are implementation names, not preferred user-facing labels.

A Note Brief is generated from the note text and the successfully generated section questions and key terms. For ordinary providers it is skipped when there are no successful section questions. A provider may instead support an atomic whole-note bundle that returns the Brief and section cards together.

### Section study cards

Each eligible headed section can produce:

- one concise summary;
- one recall question; and
- two to five deduplicated key terms.

The model may report that the source is insufficient for a faithful card. Generation and validation failures are isolated per section where the provider route permits it, allowing other cards to remain usable.

### Recall-question styles

The user can choose among five styles:

- **Conceptual question** — main idea plus a relationship or implication.
- **Direct recall** — the single most important fact or idea.
- **Exam practice** — precise exam-like wording; this is the default.
- **Vocabulary check** — a key term's meaning or use in context.
- **Socratic reasoning** — why or how the idea works.

Changing the style affects future regeneration; it does not rewrite existing cached cards immediately.

## How notes become generation inputs

The Markdown parser recognizes ATX headings from level 1 through 6 and ignores heading-like text inside fenced code blocks.

Important eligibility rules:

- A generated section card requires both a non-empty heading and studyable body text.
- Content before the first heading is parsed as an intro section but is not eligible for a section card because it has no heading.
- A note with no headings therefore does not produce section cards, even if it contains prose.
- Image markup is removed before text-only generation. Meaningful image alt text or captions can remain; filenames, dimensions, and image-only sections do not count as studyable text.
- Section identity is based on a slug of the heading plus its duplicate-heading ordinal. It normally survives body edits but can change when headings or their ordering change.
- A content hash covers the written heading line and body, enabling stale detection.

Generation prompts explicitly instruct models to treat note text as source data rather than instructions and to ground cards in explicit section content. Whole-note context and headings help judge relevance but are not supposed to substitute for evidence in the section.

The default text budget is 8,000 characters per prompt. Longer note context and section content may be truncated with a visible marker. Provider-specific bundle paths apply their own bounded title, context, section, and total-content limits.

## Generation and provider choices

The provider abstraction supports four user-facing connection types:

| Connection type | Plugin options | Credential/model behavior |
| --- | --- | --- |
| Included trial | Simonides hosted AI trial | No API key or model selection; usage and capacity limits can apply. |
| API key | Anthropic, OpenAI, Google/Gemini, xAI, OpenRouter, Groq, Mistral, DeepSeek, DeepInfra, Together AI, Fireworks AI | Provider-specific API key and model; supported providers can fetch available models. |
| Local server | Ollama, LM Studio | Local server URL plus an installed model. |
| Terminal app | Codex CLI, Claude Code CLI | Configurable command; model is optional and can use the CLI default. |

The hosted trial is one external provider integration, not the identity or architecture of the plugin.

The plugin's runtime can accommodate providers that generate:

- one section at a time;
- a batch of section cards;
- a Note Brief separately; or
- an atomic bundle of cards plus Note Brief.

For text-returning providers, responses are extracted from JSON or fenced JSON, normalized, and validated with Zod. Invalid responses receive one corrective retry before surfacing a validation failure. Structured-output providers validate returned objects directly.

### Performance controls

- Parallel section requests: integer from 1 to 5; default 5. A provider may impose a lower concurrency ceiling.
- API request rate: 1, 5, 10, or 20 request starts per ten seconds; default 5.
- Provider-specific per-note card caps are represented as explicit unavailable-card placeholders rather than silent omission. Switching providers can make those sections eligible again.

## Data and privacy boundaries inside the plugin

FirstRecall does not insert generated material into the source Markdown file. Its persisted plugin data includes:

- normalized settings and non-secret provider configuration;
- per-note generated caches;
- per-note maintenance/freshness state;
- per-note visibility state;
- per-card collapsed-component state; and
- a generated installation identifier used by the optional trial integration.

Each note cache records the generation timestamp, source modification time, provider, model, generation mode, question preset, section identities and hashes, generated card fields, failures or provider-limit placeholders, and Note Brief.

Cloud API keys are stored through Obsidian Secret Storage rather than ordinary plugin settings. Secret Storage is why the plugin requires Obsidian 1.11.4 or newer. Local URLs and terminal commands are normal provider configuration, not cloud secrets.

Privacy claims must remain provider-specific:

- Ollama and LM Studio can keep generation local when pointed at a local server.
- Cloud APIs, the included trial, and terminal tools backed by online accounts send the note content required for generation to their respective provider paths.
- “Source Markdown is unchanged” does not mean “note content never leaves the device.”

This document makes no claims about an external provider's retention, logging, model training, security, or service availability.

## Display and interaction surfaces

### Editing view

The default section-card layout is **Cornell**, which places cards beside their source sections. Users can switch Editing view to **Inline section cards**, which places cards beneath headings.

The editor layout code accounts for dock state, page width, card overlap, gutter placement, and a configurable custom card width. Study text has small, medium, and large sizes; medium is the default.

### Reading view

Reading view renders section cards inline beneath their matching headings. The Editing-view layout choice does not change Reading view.

### Visibility and collapsing

Global display settings independently control the Note Brief, summaries, recall questions, and key terms in both Editing and Reading views. Each summary, question, or terms block can also be collapsed per note and section.

A note-level action can hide all generated content for that note. Hiding does not delete the cache or disable maintenance, so showing it again restores the existing material without regeneration.

### Status and controls

The plugin exposes:

- a FirstRecall menu in a Markdown note's header;
- command-palette commands;
- file/editor context-menu actions;
- a clickable status-bar item;
- freshness badges on affected cards and the Note Brief; and
- outdated/failed banners with update, retry, and dismiss actions.

The note-header menu provides generation, Study Mode, note visibility, Markdown export, and Anki export. Context menus provide note visibility and, when usable cards exist, a Study Mode entry.

## Study Mode

Study Mode is synchronous, temporary state scoped to one note. It does not change saved visibility, managed-folder coverage, or automatic-update settings.

Only a fresh, unambiguous cached card can conceal a source body. Before hiding content, the plugin verifies the section ID, heading line, body range, body content, content hash, and usable recall question against the live note. If identity or freshness cannot be proven, it fails open and does not hide that section.

The user can reveal or conceal sections individually, show all, hide all, and exit. The hide style is configurable:

- **Blur** — obscures the section body; default.
- **Collapse** — collapses the section body.

Study Mode works in both Editing and Reading views and reconciles or exits when the active note or document changes.

## Managed folders and freshness

Users can manage one or more non-overlapping folders, or the entire vault. Entire-vault coverage and folder coverage are mutually exclusive. New managed areas start paused: automatic updating is off until explicitly enabled.

Adding or rescanning an area is read-only and makes no provider requests. The scan classifies notes as:

- ready;
- missing study material;
- outdated;
- failed; or
- skipped/ineligible.

**Bring study material up to date** explicitly generates missing material and refreshes stale material. **Retry update** targets failed work.

When **Update automatically** is enabled, the plugin watches Markdown file creation and modification within that managed area. It waits until editing has paused, then updates affected work. The delay options are 1, 5, 10, 25, or 60 seconds; default 10 seconds.

Incremental maintenance:

- generates cards for new eligible sections;
- regenerates changed or previously failed sections;
- updates the Note Brief when source inputs change;
- removes cached cards for deleted sections;
- reconciles reordered sections without unnecessary provider calls; and
- preserves unchanged cards.

Freshness is tracked per component as missing, current, outdated, updating, or failed, then projected to note-level Current/Outdated/Updating/Failed behavior. Source revisions exclude provider and generation settings, so changing a provider or question style does not itself mark source content stale.

If generation fails, the last successful material remains visible. Failed components remain retryable. Stale completions cannot overwrite state for a newer source revision. Rename and delete events move or remove the relevant cache and maintenance state.

Coverage and presentation are independent: hiding a note, collapsing a card component, or entering Study Mode does not pause automatic maintenance.

The data model supports exclusions for nested paths, but the current settings implementation has the exclusions UI disabled behind `SHOW_STUDY_AREA_EXCLUSIONS = false`. Do not present exclusions as a generally available UI feature until that flag and the intended product state are verified.

## Commands and exports

Registered command-palette commands are:

- **Generate study material for this note**
- **Update a section card and Note Brief…**
- **Clear Generated Study Material**
- **Export Recall Questions and Key Terms to Markdown**
- **Export Recall Questions and Key Terms to Anki (TSV)**

Exports include only usable recall questions and key terms, in document order. They skip errored or questionless sections.

- Markdown export creates or overwrites a sibling study sheet and opens it in Obsidian.
- Anki export creates or overwrites a sibling TSV. Each row uses the recall question as the front and key terms as the back, falling back to the section heading when terms are absent.

The current export implementation does **not** export Note Brief content, source-section answers, or section summaries. It does not modify the source note.

## Failure and safety model

Important behavioral invariants are:

- Source Markdown is never modified by generation, rendering, maintenance, Study Mode, visibility changes, or export.
- A failed incremental update does not replace a last-good card with an error result.
- Per-section failures are isolated where possible.
- Cached sections are matched to live sections by stable identity and verified content before Study Mode hides source text.
- Provider-limit omissions remain visible and explanatory.
- Invalid persisted settings and cache data are normalized or excluded at load boundaries rather than trusted directly.
- Asynchronous writes are serialized, and stale maintenance completions are rejected by revision checks.
- Generation can be canceled; completed partial work is handled without treating an old result as current for a newer note revision.

## Settings map and defaults

| Area | Setting | Default |
| --- | --- | --- |
| AI model | Selected provider | None; setup required |
| Performance | Parallel requests | 5 |
| Performance | API rate limit | 5 requests per 10 seconds |
| Generation | Recall question style | Exam practice |
| Managed folders | Covered areas | None |
| Managed folders | Automatic updates | Off for new areas |
| Managed folders | Automatic update delay | 10 seconds |
| Display | Show Note Brief | On |
| Display | Show summary | On |
| Display | Show recall question | On |
| Display | Show key terms | On |
| Appearance | Editing section-card layout | Cornell |
| Appearance | Study text size | Medium |
| Study Mode | Hide style | Blur |

The Generation settings also expose read-only Advanced views of the effective section-card and Note Brief instruction templates. These are inspectors, not editable custom prompts.

## Technical architecture

The plugin is TypeScript using Obsidian APIs, CodeMirror 6, Zod validation, and `@swartzrock/byok-runtime`. It has one main plugin class that wires together smaller pure modules and stateful stores.

### Main responsibility map

| Area | Primary files |
| --- | --- |
| Plugin lifecycle, Obsidian events, commands, menus, persistence wiring | `src/main.ts` |
| Settings UI and defaults | `src/settings.ts`, `src/persisted-settings.ts` |
| Markdown section parsing and eligibility | `src/parser.ts` |
| Generation orchestration and provider contracts | `src/generator.ts`, `src/cue-provider.ts` |
| Provider adapters, metadata, models, and credentials | `src/byok-firstrecall-adapter.ts`, `src/byok-provider-metadata.ts`, `src/secure-credential-store.ts` |
| Prompt ownership and output validation | `src/cue-instructions.ts`, `src/note-brief-instructions.ts`, `src/study-material-instructions.ts`, `src/schemas.ts` |
| Cache and incremental reconciliation | `src/cache.ts` |
| Freshness and maintenance state machine | `src/study-material-state.ts`, `src/study-material-maintenance.ts`, `src/study-area.ts` |
| Editing-view cards and Note Brief | `src/cue-extension.ts` |
| Reading-view cards and Study projections | `src/reading-cues.ts` |
| Study-session state | `src/study-session.ts` |
| Visibility and component collapsing | `src/visibility.ts`, `src/cue-section-collapse.ts` |
| Status and maintenance banners | `src/status.ts`, `src/study-material-banner.ts` |
| Export formatting | `src/export.ts` |
| Plugin styling | `styles.css` |

The central runtime flow is:

```text
Markdown note
  → parse and select eligible headed sections
  → selected provider runtime
  → validate and normalize generated JSON
  → build/reconcile per-note cache and freshness state
  → render Note Brief and cards in Editing/Reading
  → optionally project Study Mode or export questions/terms
```

## Development, verification, and release

- Package manager: Bun 1.3.14.
- Build: TypeScript no-emit check plus esbuild production bundle.
- Lint: ESLint.
- Tests: Vitest with jsdom and Obsidian mocks.
- Full repository check: `bun run check`.
- Development bundle: `bun run dev` (this builds; it is not a long-running dev server).
- Versioning: Changesets plus `version-bump.mjs`, which keeps plugin release metadata aligned.

The test suite is organized by behavior and mirrors the module boundaries above. Particularly high-coverage areas include generation, caching, editor rendering, managed folders, settings, schemas, Study Mode, provider adapters, credentials, and maintenance.

Release artifacts for an Obsidian plugin must keep `manifest.json`, package versioning, generated `main.js`, and `styles.css` consistent. Verify current release procedures before publishing; this document does not authorize a release.

## Product and engineering guardrails

Future work should preserve these decisions unless an explicit product change supersedes them:

- Keep the source note canonical and untouched.
- Ground generated content in the user's note; do not turn the plugin into generic chat.
- Prefer recall practice over passive summary features.
- Keep provider choice broad and privacy language precise.
- Treat freshness/maintenance separately from display/visibility.
- Preserve last-good material through failures.
- Update only affected study material when possible.
- Keep Study Mode temporary and fail open when live source identity is uncertain.
- Use established user-facing terminology even when internal modules still say “cue.”
- Describe implemented behavior accurately; do not infer external-service guarantees from plugin code.

## Known context gaps and cautions

- The manifest still reports `0.6.1` while the active branch contains later hosted-trial and documentation work. Reconfirm the release version before making release claims.
- The README's broad export wording can imply that full Note Briefs or full cards are exported; the implementation currently exports recall questions and key terms only.
- Managed-area exclusions exist in the data model but are hidden in the current settings UI.
- No end-to-end Obsidian desktop session was run while refreshing this document. The repository's unit and integration tests are the implementation evidence; visual behavior should still be verified in Obsidian before release.
- Provider catalogs and model availability can change through the runtime dependency and provider APIs. Recheck the current code before publishing an exact provider list.

## Repository sources of truth

Prefer current local code over this summary when they diverge. Start with:

- [README](./README.md) — user-facing purpose, installation, and workflows.
- [Glossary](./docs/FirstRecall-Glossary.md) — approved terminology and freshness concepts.
- [Plugin manifest](./manifest.json) — plugin identity, version, compatibility, and platform.
- [Package metadata](./package.json) — scripts, dependencies, tooling, and license.
- [`src/main.ts`](./src/main.ts) — actual Obsidian integration and command behavior.
- [`src/settings.ts`](./src/settings.ts) — exposed settings, labels, and defaults.
- [`src/generator.ts`](./src/generator.ts) and [`src/parser.ts`](./src/parser.ts) — generation and note-eligibility behavior.
- [`src/study-material-maintenance.ts`](./src/study-material-maintenance.ts) and [`src/study-material-state.ts`](./src/study-material-state.ts) — update and failure semantics.
- [`tests/`](./tests/) — executable behavior specifications.

For facts about the separately hosted provider service, use that service's own repository and documentation rather than extending this file.
