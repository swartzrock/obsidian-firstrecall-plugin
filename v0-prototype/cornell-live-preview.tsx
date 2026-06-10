"use client"

import { useState } from "react"
import { RefreshCw, Sparkles, HelpCircle, Tag } from "lucide-react"
import type { CornellNote } from "@/lib/cornell-data"
import { cn } from "@/lib/utils"

export function CornellLivePreview({ note }: { note: CornellNote }) {
  const [regenerating, setRegenerating] = useState<string | null>(null)

  const handleRegenerate = (id: string) => {
    setRegenerating(id)
    setTimeout(() => setRegenerating(null), 1200)
  }

  return (
    <article className="mx-auto max-w-3xl px-6 py-8">
      {/* Note title + frontmatter chips */}
      <header className="mb-6">
        <h1 className="text-pretty text-3xl font-bold tracking-tight text-foreground">{note.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"
            >
              <Tag className="size-3" />
              {tag}
            </span>
          ))}
        </div>
      </header>

      {/* Cornell sections */}
      <div className="overflow-hidden rounded-lg border border-border">
        {note.sections.map((section, i) => (
          <div
            key={section.id}
            className={cn(
              "grid grid-cols-1 sm:grid-cols-[minmax(0,11rem)_1fr] lg:grid-cols-[minmax(0,14rem)_1fr]",
              i !== 0 && "border-t border-border",
            )}
          >
            {/* Cue column (AI generated) */}
            <div className="group relative border-b border-border bg-card/60 p-4 sm:border-b-0 sm:border-r">
              <div className="mb-2 flex items-center gap-1.5">
                <Sparkles className="size-3 text-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">AI cues</span>
                <button
                  onClick={() => handleRegenerate(section.id)}
                  aria-label="Regenerate cues"
                  className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <RefreshCw
                    className={cn(
                      "size-3 text-muted-foreground hover:text-foreground",
                      regenerating === section.id && "animate-spin text-primary",
                    )}
                  />
                </button>
              </div>

              <ul className="space-y-2">
                {section.questions.map((q) => (
                  <li key={q} className="flex gap-1.5 text-[13px] leading-snug text-foreground/90">
                    <HelpCircle className="mt-0.5 size-3.5 shrink-0 text-chart-2" />
                    <span className={cn(regenerating === section.id && "opacity-40")}>{q}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap gap-1">
                {section.keywords.map((kw) => (
                  <span
                    key={kw}
                    className={cn(
                      "rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary",
                      regenerating === section.id && "opacity-40",
                    )}
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>

            {/* Notes column */}
            <div className="p-4">
              <div className="space-y-2.5">
                {section.notes.map((line) => (
                  <p key={line} className="text-[15px] leading-relaxed text-foreground/90">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ))}

        {/* Summary row */}
        <div className="border-t-2 border-primary/30 bg-primary/5 p-4">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Sparkles className="size-3 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">AI summary</span>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">{note.summary}</p>
        </div>
      </div>
    </article>
  )
}
