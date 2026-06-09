"use client"

import type { CornellNote } from "@/lib/cornell-data"

type Token = { text: string; cls?: string }

function buildMarkdown(note: CornellNote): Token[][] {
  const lines: Token[][] = []
  const c = (text: string, cls?: string): Token => ({ text, cls })

  // frontmatter
  lines.push([c("---", "text-muted-foreground")])
  lines.push([c("title:", "text-chart-2"), c(` ${note.title}`)])
  lines.push([c("tags:", "text-chart-2"), c(` [${note.tags.join(", ")}]`)])
  lines.push([c("---", "text-muted-foreground")])
  lines.push([])
  lines.push([c("# ", "text-primary"), c(note.title, "text-foreground font-semibold")])
  lines.push([])

  note.sections.forEach((section, i) => {
    // Custom cornell code-fence block that your plugin parses
    lines.push([c("```cornell", "text-chart-3")])
    section.questions.forEach((q) => lines.push([c("q: ", "text-chart-2"), c(q)]))
    lines.push([c("keywords: ", "text-chart-2"), c(section.keywords.join(", "))])
    lines.push([c("---", "text-muted-foreground")])
    section.notes.forEach((n) => lines.push([c(n)]))
    lines.push([c("```", "text-chart-3")])
    if (i !== note.sections.length - 1) lines.push([])
  })

  lines.push([])
  lines.push([c("> [!summary] AI Summary", "text-primary")])
  lines.push([c("> ", "text-primary"), c(note.summary)])

  return lines
}

export function CornellSourceView({ note }: { note: CornellNote }) {
  const lines = buildMarkdown(note)

  return (
    <div className="mx-auto max-w-3xl px-2 py-4 font-mono text-[13px] leading-6">
      <div className="overflow-x-auto">
        {lines.map((tokens, idx) => (
          <div key={idx} className="flex hover:bg-muted/40">
            <span className="w-10 shrink-0 select-none pr-3 text-right text-muted-foreground/50">{idx + 1}</span>
            <span className="whitespace-pre">
              {tokens.length === 0 ? (
                "\u00A0"
              ) : (
                tokens.map((t, i) => (
                  <span key={i} className={t.cls ?? "text-foreground/85"}>
                    {t.text}
                  </span>
                ))
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
