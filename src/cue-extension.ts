import { StateEffect, StateField } from "@codemirror/state";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import type { NoteCache } from "./cache";
import type { Section } from "./parser";

export type Confidence = "high" | "medium" | "low";

/** One renderable cue, resolved to a current document line. */
export interface CueLineData {
	/** 1-based line of the heading the cue belongs to. */
	line: number;
	heading: string;
	question: string;
	keywords: string[];
	confidence: Confidence | null;
	/** Generation error message, when this section failed. */
	error: string | null;
}

export interface CueLineDataOptions {
	showKeywords?: boolean;
}

/**
 * Resolve a cache's cues to current document lines. Cues are matched to the
 * freshly parsed sections by stable id (falling back to the cached line),
 * so they stay attached to the right heading even after edits elsewhere.
 * Usable cues render their question; sections that errored render a compact
 * warning marker (instead of nothing) so a failed generation isn't silent.
 * Sections that were never generated (no question and no error) are skipped.
 */
export function buildCueLineData(
	cache: NoteCache,
	currentSections: Section[],
	options: CueLineDataOptions = {}
): CueLineData[] {
	const showKeywords = options.showKeywords ?? true;
	const byId = new Map<string, Section>();
	for (const s of currentSections) byId.set(s.id, s);

	const out: CueLineData[] = [];
	for (const sec of cache.sections) {
		if (!sec.question && !sec.error) continue;
		const current = byId.get(sec.id);
		const line = current ? current.lineNumber : sec.lineNumber;
		const failed = Boolean(sec.error) || !sec.question;
		out.push({
			line,
			heading: sec.heading,
			question: failed ? "" : (sec.question ?? ""),
			keywords: failed || !showKeywords ? [] : sec.keywords ?? [],
			confidence: failed ? null : sec.confidence,
			error: failed ? sec.error ?? "Generation failed" : null,
		});
	}
	// Render top-to-bottom.
	out.sort((a, b) => a.line - b.line);
	return out;
}

class CueWidget extends WidgetType {
	constructor(private readonly cue: CueLineData) {
		super();
	}

	eq(other: CueWidget): boolean {
		return (
			other.cue.question === this.cue.question &&
			other.cue.keywords.join("\u0001") === this.cue.keywords.join("\u0001") &&
			other.cue.confidence === this.cue.confidence &&
			other.cue.error === this.cue.error
		);
	}

	toDOM(): HTMLElement {
		const root = document.createElement("div");
		root.className = "cuecraft-cue";

		if (this.cue.error) {
			root.classList.add("cuecraft-cue-error");
			root.title = this.cue.error;
			const q = document.createElement("div");
			q.className = "cuecraft-cue-question";
			q.textContent = "\u26a0 Generation failed \u2014 regenerate";
			root.appendChild(q);
			return root;
		}

		if (this.cue.confidence) {
			root.dataset.confidence = this.cue.confidence;
		}

		const q = document.createElement("div");
		q.className = "cuecraft-cue-question";
		q.textContent = this.cue.question;
		root.appendChild(q);

		if (this.cue.keywords.length) {
			const kw = document.createElement("div");
			kw.className = "cuecraft-cue-keywords";
			kw.textContent = this.cue.keywords.join(" · ");
			root.appendChild(kw);
		}
		return root;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

/** Replace all cues currently rendered in the editor. */
export const setCuesEffect = StateEffect.define<CueLineData[]>();

function buildDecorations(state: EditorState, cues: CueLineData[]): DecorationSet {
	const ranges: Range<Decoration>[] = [];
	const doc = state.doc;
	for (const cue of cues) {
		if (cue.line < 1 || cue.line > doc.lines) continue;
		const headingLine = doc.line(cue.line);
		// Block widget rendered on its own line just after the heading.
		ranges.push(
			Decoration.widget({
				widget: new CueWidget(cue),
				block: true,
				side: 1,
			}).range(headingLine.to)
		);
	}
	return Decoration.set(ranges, true);
}

export const cueField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(deco, tr) {
		let next = deco.map(tr.changes);
		for (const effect of tr.effects) {
			if (effect.is(setCuesEffect)) {
				// `tr.state` reflects the post-change doc for placement.
				next = buildDecorations(tr.state, effect.value);
			}
		}
		return next;
	},
	provide: (f) => EditorView.decorations.from(f),
});

/** Editor extension that renders CueCraft cues. Register via registerEditorExtension. */
export const cueEditorExtension = [cueField];
