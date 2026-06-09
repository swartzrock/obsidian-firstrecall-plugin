# Cornell AI — Obsidian Plugin Implementation Plan

A complete, build-ready plan for an Obsidian plugin that uses AI to generate
Cornell-style notes. The plugin renders a custom `cornell` code block into a
two-column Cornell layout (cue column + notes) with an AI-generated summary,
and exposes generation controls plus a settings tab.

> **Architecture decision:** Rendering is built on
> `registerMarkdownCodeBlockProcessor("cornell", …)` — **not** raw CodeMirror 6
> editor extensions. The code-block processor runs in both Live Preview and
> Reading view, keeps notes as portable plain-text markdown, and avoids the
> CM6 widget-budget / block-decoration pitfalls described at the end of this
> document. Treat in-place CM6 widget editing as a future enhancement only.

---

## 0. For your coding agent (handoff)

This document is the **primary source of truth** for the build. The mockup
files are visual/structural references — translate their layout into Obsidian
DOM calls (`el.createEl(...)`), do not copy React/JSX or Tailwind directly.

### Files to read, in order

| File | Purpose | How to use it |
| --- | --- | --- |
| `IMPLEMENTATION_PLAN.md` (this file) | The build spec | Implement against this. Section numbers map to build order. |
| `components/cornell-source-view.tsx` | On-disk `cornell` block grammar | Defines the exact text format the processor must parse. |
| `components/cornell-live-preview.tsx` | Rendered Cornell layout | Target structure for the code-block processor output (cue column, notes, summary). |
| `components/plugin-settings.tsx` | Settings rows | Maps 1:1 to `Setting` API calls in §5. Already restructured to Obsidian's single-pane reality. |
| `public/cornell-ai-mockups.pdf` | Human design reference | For visual review only — not an input for code generation. |

### What NOT to do

- Do not render the UI with React, Tailwind, or any web framework. Obsidian
  plugins build DOM imperatively and style with CSS variables + `styles.css`.
- Do not treat screenshots/PDF as the spec — they show intent, this doc states it.
- Do not build a custom tabbed settings layout; use the flat `PluginSettingTab`
  pane described in §5.

### Kickoff prompt (paste this to your agent)

> Implement the Obsidian plugin described in `IMPLEMENTATION_PLAN.md`. It uses
> `registerMarkdownCodeBlockProcessor("cornell", …)` to render a custom code
> block into a Cornell-notes layout, with an AI client that generates cue
> questions, keywords, and a summary. Use the files in `/components` as the
> visual and structural reference only — translate their layout into native
> Obsidian DOM (`el.createEl`) and CSS variables, not React/Tailwind. Follow
> the build order in §8. Start with the project scaffold (§1) and the block
> grammar + processor (§2–3) before wiring AI (§6) or settings (§5). Ask me
> before adding any auth method or telemetry.

---

## 1. Project setup

### 1.1 Tooling

- Language: **TypeScript**, bundled with **esbuild** (the standard Obsidian
  sample-plugin setup).
- Target: `ES2018`, module `ESNext`. Mark `obsidian`, `@codemirror/*`, and
  `electron` as **external** in the esbuild config (Obsidian provides them at
  runtime).
- Minimum Obsidian API: declare `minAppVersion` in `manifest.json`.

### 1.2 File layout

```
cornell-ai/
├── manifest.json
├── package.json
├── esbuild.config.mjs
├── styles.css                 # all plugin styles (no inline CSS)
├── src/
│   ├── main.ts                # plugin entry: lifecycle + registration
│   ├── settings.ts            # CornellSettingTab + DEFAULT_SETTINGS + types
│   ├── processor.ts           # registerMarkdownCodeBlockProcessor handler
│   ├── parser.ts              # parse/serialize the cornell block payload
│   ├── ai/
│   │   ├── client.ts          # AI Gateway request wrapper
│   │   └── prompt.ts          # prompt templates per question style
│   ├── render/
│   │   ├── cornell-view.ts     # builds the DOM for one cornell block
│   │   └── render-child.ts     # MarkdownRenderChild for lifecycle/cleanup
│   └── commands.ts            # "Generate Cornell cues" command + ribbon
└── README.md
```

### 1.3 `manifest.json` (shape)

```json
{
  "id": "cornell-ai",
  "name": "Cornell AI",
  "version": "1.2.0",
  "minAppVersion": "1.5.0",
  "description": "AI-generated Cornell-style notes: cue questions, keywords, and summaries.",
  "isDesktopOnly": false
}
```

> `isDesktopOnly: false` is allowed because everything here uses standard DOM +
> the network. Keep it `false` only if the AI request path works on mobile;
> otherwise set `true`.

---

## 2. Data model & on-disk format

The note stays portable markdown. Each Cornell section is one fenced block with
a small, line-based payload (no JSON in the note — easier to diff and hand-edit).

````markdown
```cornell
## Glycolysis
q: What happens to glucose during glycolysis?
q: How many net ATP are produced?
keywords: glucose, pyruvate, net 2 ATP, cytoplasm
---
Glycolysis splits one glucose molecule into two pyruvate molecules in the
cytoplasm, producing a net of 2 ATP and 2 NADH.
```

> [!summary] Section summary
> Glycolysis is the cytoplasmic breakdown of glucose into pyruvate, yielding a
> small net amount of ATP and NADH.
````

### 2.1 Block grammar

- Optional first line `## Heading` → section title.
- Zero or more `q:` lines → cue questions.
- Optional `keywords:` line → comma-separated chips.
- A `---` line separates the **cue metadata** from the **note body**.
- Everything after `---` is the note body (rendered as markdown).
- The `> [!summary]` callout lives **outside** the block (native Obsidian
  callout) so it renders even if the plugin is disabled.

### 2.2 Parser contract (`parser.ts`)

```ts
export interface CornellBlock {
  title?: string
  questions: string[]
  keywords: string[]
  body: string        // raw markdown after the --- separator
}

export function parseCornell(source: string): CornellBlock
export function serializeCornell(block: CornellBlock): string
```

- `parseCornell` must be **total** — never throw. On malformed input, return a
  best-effort object and render a small inline notice instead of failing.
- `serializeCornell` is used when the AI writes cues back into the block.

---

## 3. The code block processor (core rendering)

### 3.1 Registration (`main.ts`)

```ts
this.registerMarkdownCodeBlockProcessor("cornell", (source, el, ctx) => {
  const block = parseCornell(source)
  const child = new CornellRenderChild(el, this, block, ctx)
  ctx.addChild(child)   // ties lifecycle to the rendered section
  child.render()
})
```

- `ctx.addChild(renderChild)` is **required** so event listeners and async work
  are cleaned up when the section re-renders or the leaf closes.
- This single registration covers **Reading view and Live Preview**. When the
  cursor enters the block in Live Preview, Obsidian shows the raw source; when
  it leaves, your rendered layout returns. No extra work needed.

### 3.2 Render child (`render/render-child.ts`)

```ts
import { MarkdownRenderChild, MarkdownRenderer } from "obsidian"

export class CornellRenderChild extends MarkdownRenderChild {
  constructor(
    containerEl: HTMLElement,
    private plugin: CornellPlugin,
    private block: CornellBlock,
    private ctx: MarkdownPostProcessorContext,
  ) {
    super(containerEl)
  }

  render() {
    buildCornellView(this.containerEl, this.plugin, this.block, this)
  }
}
```

- Use `this.registerDomEvent(...)` (inherited from `MarkdownRenderChild`) for
  all click/hover handlers so they auto-dispose.
- Render the note body markdown with
  `MarkdownRenderer.render(app, block.body, bodyEl, ctx.sourcePath, this)`.
  Interactive elements rendered this way are **not** wired up automatically —
  attach handlers yourself.

### 3.3 DOM structure (`render/cornell-view.ts`)

Build with `createEl`/`createDiv` (never `innerHTML`). Target structure:

```
.cornell-note
├── .cornell-title            (section heading, optional)
├── .cornell-grid             (CSS grid: cue column | note column)
│   ├── .cornell-cues
│   │   ├── .cornell-question (× n)  → "?" icon + question text + regenerate btn
│   │   └── .cornell-keywords        → .cornell-chip (× n)
│   └── .cornell-body         (MarkdownRenderer output)
└── .cornell-actions          → "Regenerate cues" button (hover-revealed)
```

- Icons: use the bundled `setIcon(el, "help-circle")`, `setIcon(el, "refresh-cw")`
  — do **not** import lucide-react or ship SVGs; Obsidian includes the icon set.
- The regenerate button calls the AI client (Section 5) and, on success, calls
  `serializeCornell` + `editor.replaceRange(...)` / vault modify to persist.

### 3.4 Styling (`styles.css`)

- All layout via CSS classes in `styles.css` (Obsidian forbids heavy inline
  styles in community plugins). Load is automatic from the plugin root.
- **Always use Obsidian CSS variables** so the plugin matches every theme:
  - `var(--background-primary)`, `var(--background-secondary)`
  - `var(--text-normal)`, `var(--text-muted)`, `var(--text-accent)`
  - `var(--interactive-accent)` for the cue accent
  - `var(--background-modifier-border)` for dividers
- Cornell grid:

```css
.cornell-grid {
  display: grid;
  grid-template-columns: minmax(160px, 30%) 1fr;
  gap: var(--size-4-4);
}
.cornell-cues {
  border-right: 1px solid var(--background-modifier-border);
  padding-right: var(--size-4-3);
}
.cornell-chip {
  background: var(--background-modifier-hover);
  color: var(--text-accent);
  border-radius: var(--radius-s);
  padding: 2px 8px;
  font-size: var(--font-ui-smaller);
}
/* Fold the cue column on narrow leaves / mobile */
@media (max-width: 480px) {
  .cornell-grid { grid-template-columns: 1fr; }
}
```

- Respect the "Cue accent color", "Show cue column border", and "Compact chips"
  settings by toggling body classes (e.g. `cornell-accent-blue`,
  `cornell-no-border`, `cornell-compact`) on the container.

---

## 4. Settings tab

Obsidian renders **one flat scrolling pane** per plugin — there is **no built-in
left-rail tab system inside a plugin's settings**. Use `setHeading()` to create
visual sections, and standard `Setting` rows for every control. (The mockup's
left rail is Obsidian's *global* settings rail, which you do not build.)

### 4.1 Settings types & defaults (`settings.ts`)

```ts
export interface CornellSettings {
  apiKey: string
  model: "gpt-5-mini" | "claude-opus" | "gemini-flash"
  autoGenerateOnSave: boolean
  cueDensity: 1 | 2 | 3
  questionStyle: "recall" | "socratic" | "exam"
  generateKeywords: boolean
  autoSummary: boolean
  renderInReadingMode: boolean
  foldCueColumnOnMobile: boolean
  accentColor: "violet" | "blue" | "amber" | "rose"
  showCueBorder: boolean
  compactChips: boolean
}

export const DEFAULT_SETTINGS: CornellSettings = {
  apiKey: "",
  model: "gpt-5-mini",
  autoGenerateOnSave: true,
  cueDensity: 2,
  questionStyle: "recall",
  generateKeywords: true,
  autoSummary: true,
  renderInReadingMode: true,
  foldCueColumnOnMobile: true,
  accentColor: "violet",
  showCueBorder: true,
  compactChips: false,
}
```

- Load with `Object.assign({}, DEFAULT_SETTINGS, await this.loadData())`.
- Persist with `await this.saveData(this.settings)`. There is **no Save button** —
  Obsidian settings save on change. Call `saveSettings()` inside each control's
  `onChange`.

### 4.2 `CornellSettingTab.display()` mapping

Each mockup control maps 1:1 to an Obsidian API call:

```ts
import { App, PluginSettingTab, Setting } from "obsidian"

export class CornellSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: CornellPlugin) { super(app, plugin) }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    // ── AI model ──
    new Setting(containerEl).setName("AI model").setHeading()

    new Setting(containerEl)
      .setName("AI Gateway API key")
      .setDesc("Used to generate cues. Stored in this vault's data.json.")
      .addText((t) => {
        t.inputEl.type = "password"
        t.setPlaceholder("sk-…")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (v) => {
            this.plugin.settings.apiKey = v.trim()
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Which model drafts the cues and summary.")
      .addDropdown((d) =>
        d.addOptions({
          "gpt-5-mini": "GPT-5 Mini (fast, recommended)",
          "claude-opus": "Claude Opus 4.6 (deep reasoning)",
          "gemini-flash": "Gemini 3 Flash (cheapest)",
        })
          .setValue(this.plugin.settings.model)
          .onChange(async (v) => {
            this.plugin.settings.model = v as CornellSettings["model"]
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl)
      .setName("Auto-generate on save")
      .setDesc("Draft cues and a summary automatically whenever a note is saved.")
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.autoGenerateOnSave).onChange(async (v) => {
          this.plugin.settings.autoGenerateOnSave = v
          await this.plugin.saveSettings()
        }),
      )

    // ── Cue generation ──
    new Setting(containerEl).setName("Cue generation").setHeading()

    new Setting(containerEl)
      .setName("Cue density")
      .setDesc("How many recall questions to generate per section.")
      .addSlider((s) =>
        s.setLimits(1, 3, 1)
          .setValue(this.plugin.settings.cueDensity)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.cueDensity = v as 1 | 2 | 3
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl)
      .setName("Question style")
      .addDropdown((d) =>
        d.addOptions({ recall: "Recall", socratic: "Socratic", exam: "Exam-style" })
          .setValue(this.plugin.settings.questionStyle)
          .onChange(async (v) => {
            this.plugin.settings.questionStyle = v as CornellSettings["questionStyle"]
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl)
      .setName("Generate keyword chips")
      .addToggle(/* → generateKeywords */)

    new Setting(containerEl)
      .setName("Auto-write section summary")
      .addToggle(/* → autoSummary */)

    // ── Note format ──
    new Setting(containerEl).setName("Note format").setHeading()
    // renderInReadingMode → toggle
    // foldCueColumnOnMobile → toggle

    // ── Appearance ──
    new Setting(containerEl).setName("Appearance").setHeading()
    // accentColor → addDropdown (Obsidian has no native swatch control;
    //   either use a dropdown, or build custom swatch DOM via setting.controlEl)
    // showCueBorder → toggle
    // compactChips → toggle
  }
}
```

> **Mockup → reality notes**
> - The 4 tabbed sections become 4 `setHeading()` groups in one scroll view.
> - The styled "model picker cards" become a single `addDropdown`. If you want
>   the card look, append custom DOM to `setting.settingEl` / `controlEl`.
> - The accent **color swatches** have no native control — render custom buttons
>   into `controlEl` (allowed) or fall back to a dropdown.
> - The "Valid" API-key badge is custom: validate on change and append a status
>   `<span>` to the setting's `controlEl`.
> - **Remove the Cancel/Save footer** — it does not exist in Obsidian settings.

### 4.3 Register the tab (`main.ts`)

```ts
this.addSettingTab(new CornellSettingTab(this.app, this))
```

---

## 5. AI generation

### 5.1 Client (`ai/client.ts`)

- POST to the AI Gateway endpoint with `settings.apiKey` and `settings.model`.
- Build the prompt from `settings.questionStyle` + `settings.cueDensity` and the
  section body text.
- Request **structured output**: `{ questions: string[], keywords: string[],
  summary: string }`. Validate the shape before writing back.
- Wrap network calls in try/catch; on failure show `new Notice("Cornell AI: …")`
  and leave the note untouched.

### 5.2 Writing results back

- For a single section: parse the active block, merge AI fields, re-serialize,
  and replace the block's text range via the editor (Live Preview) or
  `vault.process(file, …)` (background/auto-save).
- Always update the `> [!summary]` callout that follows the block when
  `autoSummary` is on.
- Debounce `autoGenerateOnSave` and **skip** sections whose body is unchanged to
  avoid runaway API calls.

---

## 6. Commands, ribbon & lifecycle

### 6.1 Command + ribbon (`commands.ts`)

```ts
this.addCommand({
  id: "generate-cornell-cues",
  name: "Generate Cornell cues for current note",
  editorCallback: (editor, view) => this.generateForActiveNote(editor, view),
})

this.addRibbonIcon("sparkles", "Generate Cornell cues", () =>
  this.generateForActiveNote(),
)
```

- The header "Generate Cornell cues" button in the mockup = this command,
  optionally surfaced as a view action via `addAction` on the markdown view.

### 6.2 `onload` checklist

1. `await this.loadSettings()`
2. `this.addSettingTab(...)`
3. `this.registerMarkdownCodeBlockProcessor("cornell", …)`
4. `this.addCommand(...)` + `this.addRibbonIcon(...)`
5. If `autoGenerateOnSave`: `this.registerEvent(this.app.vault.on("modify", debouncedHandler))`

### 6.3 `onunload`

- Nothing manual needed for items registered via `register*`/`addChild` — Obsidian
  disposes them. Only clear your own timers/debounces.

---

## 7. CodeMirror 6 constraints (why we avoid editor extensions for v1)

These bite **only** if you later replace the code-block processor with raw CM6
editor extensions. Documented here so the decision is not relitigated:

1. **Widget budget (~25–30 per document).** Beyond it, CM6 stops processing
   widget/inline decorations and raw formatting markers leak through. The
   code-block processor renders each block as one target and is not subject to
   this.
2. **Block-level layout widgets must come from a `StateField`,** not a
   `ViewPlugin` (view-plugin decorations are computed after the viewport is
   finalized and cannot safely change vertical layout).
3. **View-plugin widgets cannot replace line breaks** — attempting to throws a
   `RangeError`.

If in-place editable widgets become a requirement, introduce a `StateField`-based
extension scoped to the `cornell` block only, keep total widgets well under the
budget, and feature-flag it behind a setting.

---

## 8. Build order (suggested)

1. Scaffold (`manifest.json`, esbuild, `main.ts` skeleton) and confirm it loads.
2. `parser.ts` + unit-test `parseCornell`/`serializeCornell` round-trips.
3. `registerMarkdownCodeBlockProcessor` + static render (no AI) → verify it shows
   in Live Preview and Reading view.
4. `styles.css` with Obsidian CSS variables → verify against light & dark themes.
5. `CornellSettingTab` with all rows wired to `saveSettings()`.
6. AI client + "Generate Cornell cues" command (manual trigger first).
7. Per-section regenerate button + write-back.
8. `autoGenerateOnSave` (debounced) last, once write-back is proven safe.

---

## 9. Submission checklist (community plugin)

- No inline styles; all CSS in `styles.css` using theme variables.
- No `innerHTML` with untrusted/AI content — build DOM with `createEl`.
- All events via `registerDomEvent`/`registerEvent`; all render targets via
  `addChild`.
- Settings save on change (no Save button); secrets live in `data.json`.
- `manifest.json` `id`/`name`/`minAppVersion` correct; `isDesktopOnly` accurate.
- Graceful failure: malformed blocks and AI errors never crash the note.
