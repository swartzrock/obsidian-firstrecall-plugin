"use client"

import { useState } from "react"
import { Sparkles, X, Check, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"

function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  id: string
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted-foreground/40",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-background shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  )
}

/** Mirrors Obsidian's `new Setting(containerEl).setName().setDesc().addX()` row. */
function SettingItem({
  name,
  desc,
  children,
}: {
  name: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border py-3">
      <div className="min-w-0">
        <div className="text-sm text-foreground">{name}</div>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

/** Mirrors Obsidian's `new Setting(containerEl).setHeading()`. */
function SettingHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 border-b border-border pb-1.5 text-base font-semibold text-foreground first:mt-1">
      {children}
    </h3>
  )
}

const models = [
  { id: "gpt-5-mini", label: "GPT-5 Mini (fast, recommended)" },
  { id: "claude-opus", label: "Claude Opus 4.6 (deep reasoning)" },
  { id: "gemini-flash", label: "Gemini 3 Flash (cheapest)" },
]

export function PluginSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [showKey, setShowKey] = useState(false)
  const [model, setModel] = useState("gpt-5-mini")
  const [density, setDensity] = useState(2)
  const [autoGen, setAutoGen] = useState(true)
  const [includeKeywords, setIncludeKeywords] = useState(true)
  const [autoSummary, setAutoSummary] = useState(true)
  const [questionStyle, setQuestionStyle] = useState("recall")
  const [accent, setAccent] = useState("violet")
  const [readingMode, setReadingMode] = useState(true)
  const [foldMobile, setFoldMobile] = useState(true)
  const [showBorder, setShowBorder] = useState(true)
  const [compactChips, setCompactChips] = useState(false)

  if (!open) return null

  const densityLabels = ["Minimal", "Balanced", "Thorough"]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label="Close settings" onClick={onClose} className="absolute inset-0 bg-black/60" />

      {/* Obsidian settings modal: left rail lists all settings sections, right pane is a single scroll */}
      <div className="relative flex h-[600px] w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
        {/* Obsidian's global settings rail (community plugins live at the bottom) */}
        <div className="hidden w-56 shrink-0 flex-col border-r border-border bg-sidebar sm:flex">
          <div className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Options
          </div>
          <nav className="px-2 text-sm">
            {["Editor", "Files and links", "Appearance", "Hotkeys"].map((s) => (
              <div key={s} className="rounded-md px-2.5 py-1.5 text-sidebar-foreground/70">
                {s}
              </div>
            ))}
          </nav>
          <div className="mt-3 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Community plugins
          </div>
          <nav className="px-2 text-sm">
            <div className="flex items-center gap-2 rounded-md bg-sidebar-accent px-2.5 py-1.5 text-foreground">
              <Sparkles className="size-3.5 text-primary" />
              Cornell AI
            </div>
          </nav>
          <div className="mt-auto px-4 py-3 text-[11px] text-muted-foreground">v1.2.0</div>
        </div>

        {/* Single scrolling settings pane — this is the PluginSettingTab.display() output */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Cornell AI</h2>
            <button
              aria-label="Close"
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-6">
            {/* ── AI model ── */}
            <SettingHeading>AI model</SettingHeading>

            <SettingItem
              name="AI Gateway API key"
              desc="Used to generate cues. Stored in your vault's plugin data (data.json)."
            >
              <div className="relative w-56">
                <input
                  type={showKey ? "text" : "password"}
                  defaultValue="sk-ai-gw-9f3a2c8e1b7d4f60"
                  className="w-full rounded-md border border-border bg-input px-3 py-1.5 pr-9 font-mono text-xs text-foreground outline-none focus:border-primary"
                />
                <button
                  aria-label={showKey ? "Hide key" : "Show key"}
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
              <span className="flex items-center gap-1 rounded-md bg-chart-2/15 px-2 py-1 text-[11px] font-medium text-chart-2">
                <Check className="size-3" />
                Valid
              </span>
            </SettingItem>

            <SettingItem name="Model" desc="Which model drafts the cues and summary.">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-56 rounded-md border border-border bg-input px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </SettingItem>

            <SettingItem
              name="Auto-generate on save"
              desc="Draft cues and a summary automatically whenever a note is saved."
            >
              <Toggle id="autogen" checked={autoGen} onChange={setAutoGen} />
            </SettingItem>

            {/* ── Cue generation ── */}
            <SettingHeading>Cue generation</SettingHeading>

            <SettingItem
              name="Cue density"
              desc={`How many recall questions to generate per section — ${densityLabels[density - 1]}.`}
            >
              <div className="flex w-56 items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={3}
                  value={density}
                  onChange={(e) => setDensity(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <span className="w-4 text-right text-xs text-foreground">{density}</span>
              </div>
            </SettingItem>

            <SettingItem name="Question style" desc="Tone of the generated questions.">
              <select
                value={questionStyle}
                onChange={(e) => setQuestionStyle(e.target.value)}
                className="w-56 rounded-md border border-border bg-input px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
              >
                <option value="recall">Recall</option>
                <option value="socratic">Socratic</option>
                <option value="exam">Exam-style</option>
              </select>
            </SettingItem>

            <SettingItem
              name="Generate keyword chips"
              desc="Add short keyword/phrase tags to the cue column for each section."
            >
              <Toggle id="kw" checked={includeKeywords} onChange={setIncludeKeywords} />
            </SettingItem>

            <SettingItem
              name="Auto-write section summary"
              desc="Produce the bottom summary callout from the section content."
            >
              <Toggle id="sum" checked={autoSummary} onChange={setAutoSummary} />
            </SettingItem>

            {/* ── Note format ── */}
            <SettingHeading>Note format</SettingHeading>

            <SettingItem
              name="Storage block"
              desc="Cues are stored in a fenced code block so notes stay portable markdown."
            >
              <code className="rounded bg-muted px-2 py-1 font-mono text-[11px] text-foreground">```cornell</code>
            </SettingItem>

            <SettingItem name="Summary callout type" desc="Obsidian callout used for the bottom summary section.">
              <code className="rounded bg-muted px-2 py-1 font-mono text-[11px] text-foreground">{"> [!summary]"}</code>
            </SettingItem>

            <SettingItem
              name="Render in Reading mode"
              desc="Process the cornell block in both Live Preview and Reading view."
            >
              <Toggle id="reading" checked={readingMode} onChange={setReadingMode} />
            </SettingItem>

            <SettingItem
              name="Fold cue column on mobile"
              desc="Collapse the left cue column into a tap-to-expand panel on narrow screens."
            >
              <Toggle id="fold" checked={foldMobile} onChange={setFoldMobile} />
            </SettingItem>

            {/* ── Appearance ── */}
            <SettingHeading>Appearance</SettingHeading>

            <SettingItem name="Cue accent color" desc="Accent used for cue questions and chips.">
              <div className="flex gap-2">
                {[
                  { id: "violet", cls: "bg-primary" },
                  { id: "blue", cls: "bg-chart-2" },
                  { id: "amber", cls: "bg-chart-3" },
                  { id: "rose", cls: "bg-destructive" },
                ].map((c) => (
                  <button
                    key={c.id}
                    aria-label={c.id}
                    onClick={() => setAccent(c.id)}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full transition-transform",
                      c.cls,
                      accent === c.id ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "",
                    )}
                  >
                    {accent === c.id && <Check className="size-3.5 text-background" />}
                  </button>
                ))}
              </div>
            </SettingItem>

            <SettingItem name="Show cue column border" desc="Draw a divider between the cue column and note content.">
              <Toggle id="border" checked={showBorder} onChange={setShowBorder} />
            </SettingItem>

            <SettingItem name="Compact chips" desc="Use smaller keyword chips with tighter spacing.">
              <Toggle id="compact" checked={compactChips} onChange={setCompactChips} />
            </SettingItem>
          </div>
        </div>
      </div>
    </div>
  )
}
