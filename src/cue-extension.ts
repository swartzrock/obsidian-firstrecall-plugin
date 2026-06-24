import { StateEffect, StateField } from "@codemirror/state";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import type { NoteCache } from "./cache";
import { buildEditorHookCard, type EditorHookCard } from "./editor-hook-rail";
import type { EditorCueDisplay } from "./editor-cue-display";
import { isCueEligibleSection, type Section } from "./parser";

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

export interface CueEditorRenderState {
	cues: CueLineData[];
	display: EditorCueDisplay;
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
		if (current && !isCueEligibleSection(current)) continue;
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
	constructor(
		private readonly cue: CueLineData,
		private readonly display: EditorCueDisplay,
		private readonly index: number
	) {
		super();
	}

	eq(other: CueWidget): boolean {
		return (
			other.display === this.display &&
			other.index === this.index &&
			other.cue.question === this.cue.question &&
			other.cue.keywords.join("\u0001") === this.cue.keywords.join("\u0001") &&
			other.cue.confidence === this.cue.confidence &&
			other.cue.error === this.cue.error
		);
	}

	toDOM(): HTMLElement {
		return renderCueElement(this.cue, this.display, this.index);
	}

	ignoreEvent(): boolean {
		return false;
	}
}

export function renderCueElement(
	cue: CueLineData,
	display: EditorCueDisplay,
	index = 0
): HTMLElement {
	if (display !== "inline-cues") {
		return renderEditorHookElement(buildEditorHookCard(cue, display, index));
	}
	return renderInlineCueElement(cue);
}

function renderInlineCueElement(cue: CueLineData): HTMLElement {
	const root = cueDocument().createElement("div");
	root.className = "cuecraft-cue";

	if (cue.error) {
		root.classList.add("cuecraft-cue-error");
		root.title = cue.error;
		const q = cueDocument().createElement("div");
		q.className = "cuecraft-cue-question";
		q.textContent = "\u26a0 Generation failed \u2014 regenerate";
		root.appendChild(q);
		return root;
	}

	if (cue.confidence) {
		root.dataset.confidence = cue.confidence;
	}

	const q = cueDocument().createElement("div");
	q.className = "cuecraft-cue-question";
	q.textContent = cue.question;
	root.appendChild(q);

	if (cue.keywords.length) {
		const kw = cueDocument().createElement("div");
		kw.className = "cuecraft-cue-keywords";
		kw.textContent = cue.keywords.join(" · ");
		root.appendChild(kw);
	}
	return root;
}

function renderEditorHookElement(card: EditorHookCard): HTMLElement {
	const root = cueDocument().createElement("div");
	root.className = `cuecraft-editor-hook cuecraft-editor-hook-${card.display}`;
	root.tabIndex = 0;
	root.setAttribute("role", "note");
	root.dataset.display = card.display;
	root.dataset.line = String(card.line);
	root.dataset.state = card.state;
	root.dataset.titleDensity = card.titleDensity;
	root.dataset.tone = card.tone;
	if (card.confidence) root.dataset.confidence = card.confidence;
	if (card.kind === "failed") root.classList.add("cuecraft-editor-hook-failed");

	const eyebrow = cueDocument().createElement("div");
	eyebrow.className = "cuecraft-editor-hook-heading";
	eyebrow.textContent = card.heading;
	root.appendChild(eyebrow);

	const title = cueDocument().createElement("div");
	title.className = "cuecraft-editor-hook-title";
	title.textContent = card.hookTitle;
	root.appendChild(title);

	if (card.error) {
		root.title = card.error;
		const error = cueDocument().createElement("div");
		error.className = "cuecraft-editor-hook-status";
		error.textContent = "Generation failed - regenerate";
		root.appendChild(error);
		return root;
	}

	if (card.keywords.length) {
		const keywords = cueDocument().createElement("div");
		keywords.className = "cuecraft-editor-hook-keywords";
		keywords.textContent = card.keywords.join(" · ");
		root.appendChild(keywords);
	}
	return root;
}

function cueDocument(): Document {
	return typeof activeDocument === "undefined"
		? globalThis.document
		: activeDocument;
}

/** Replace all cues currently rendered in the editor. */
export const setCuesEffect = StateEffect.define<CueEditorRenderState>();

function buildDecorations(
	state: EditorState,
	payload: CueEditorRenderState
): DecorationSet {
	const ranges: Range<Decoration>[] = [];
	const doc = state.doc;
	for (const [index, cue] of payload.cues.entries()) {
		if (cue.line < 1 || cue.line > doc.lines) continue;
		const headingLine = doc.line(cue.line);
		// Block widget rendered on its own line just after the heading.
		ranges.push(
			Decoration.widget({
				widget: new CueWidget(cue, payload.display, index),
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
