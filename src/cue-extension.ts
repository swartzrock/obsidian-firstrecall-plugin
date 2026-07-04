import {
	RangeSet,
	RangeSetBuilder,
	StateEffect,
	StateField,
	type Transaction,
} from "@codemirror/state";
import type { EditorState, Range } from "@codemirror/state";
import {
	Decoration,
	EditorView,
	GutterMarker,
	WidgetType,
	gutter,
} from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import type { NoteCache } from "./cache";
import {
	buildEditorHookCard,
	type EditorHookCard,
	type EditorHookCardOptions,
	type EditorHookCardState,
} from "./editor-hook-rail";
import type { EditorCueDisplay } from "./editor-cue-display";
import {
	cueColumnWidthClass,
	cueFontSizeClass,
	type CueColumnWidth,
	type CueFontSize,
} from "./cornell-layout";
import {
	DEFAULT_EDITOR_HOOK_CARD_STYLE,
	type EditorHookCardStyle,
} from "./editor-hook-card-style";
import { isCueEligibleSection, type Section } from "./parser";
import type { NoteBriefOutput, SectionLens } from "./schemas";

export type Confidence = "high" | "medium" | "low";

/** One renderable cue, resolved to a current document line. */
export interface CueLineData {
	/** 1-based line of the heading the cue belongs to. */
	line: number;
	heading: string;
	question: string;
	keywords: string[];
	confidence: Confidence | null;
	sectionLens: SectionLens | null;
	/** Generation error message, when this section failed. */
	error: string | null;
}

export interface CueLineDataOptions {
	showKeywords?: boolean;
	showSectionLens?: boolean;
}

export interface CueEditorRenderState {
	cues: CueLineData[];
	display: EditorCueDisplay;
	noteBrief?: NoteBriefOutput | null;
	showRailQuestions?: boolean;
	showRailSupportTerms?: boolean;
	editorHookCardStyle?: EditorHookCardStyle;
	cueColumnWidth?: CueColumnWidth;
	cueFontSize?: CueFontSize;
}

interface CueRenderOptions extends EditorHookCardOptions {
	cueColumnWidth?: CueColumnWidth;
	cueFontSize?: CueFontSize;
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
	const showSectionLens = options.showSectionLens ?? true;
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
			sectionLens: failed || !showSectionLens ? null : sec.sectionLens ?? null,
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
		private readonly index: number,
		private readonly options: CueRenderOptions = {}
	) {
		super();
	}

	eq(other: CueWidget): boolean {
		return (
			other.display === this.display &&
			other.index === this.index &&
			editorHookCardOptionsKey(other.options) ===
				editorHookCardOptionsKey(this.options) &&
			other.cue.question === this.cue.question &&
			other.cue.keywords.join("\u0001") === this.cue.keywords.join("\u0001") &&
			other.cue.confidence === this.cue.confidence &&
			sectionLensKey(other.cue.sectionLens) === sectionLensKey(this.cue.sectionLens) &&
			other.cue.error === this.cue.error
		);
	}

	toDOM(): HTMLElement {
		const element = renderCueElement(
			this.cue,
			this.display,
			this.index,
			"upcoming",
			this.options
		);
		if (!isInlineEditorDisplay(this.display)) {
			element.classList.add("cuecraft-editor-hook-inline-fallback");
		}
		return element;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

class NoteBriefWidget extends WidgetType {
	constructor(private readonly noteBrief: NoteBriefOutput) {
		super();
	}

	eq(other: NoteBriefWidget): boolean {
		return noteBriefKey(other.noteBrief) === noteBriefKey(this.noteBrief);
	}

	toDOM(): HTMLElement {
		return renderNoteBriefElement(this.noteBrief, "editor");
	}
}

class CueGutterMarker extends GutterMarker {
	constructor(
		private readonly cue: CueLineData,
		private readonly display: EditorCueDisplay,
		private readonly index: number,
		private readonly state: EditorHookCardState = "upcoming",
		private readonly options: CueRenderOptions = {}
	) {
		super();
	}

	eq(other: GutterMarker): boolean {
		return (
			other instanceof CueGutterMarker &&
			other.display === this.display &&
			other.index === this.index &&
			other.state === this.state &&
			editorHookCardOptionsKey(other.options) ===
				editorHookCardOptionsKey(this.options) &&
			other.cue.question === this.cue.question &&
			other.cue.keywords.join("\u0001") === this.cue.keywords.join("\u0001") &&
			other.cue.confidence === this.cue.confidence &&
			sectionLensKey(other.cue.sectionLens) === sectionLensKey(this.cue.sectionLens) &&
			other.cue.error === this.cue.error
		);
	}

	toDOM(): HTMLElement {
		return renderCueElement(
			this.cue,
			this.display,
			this.index,
			this.state,
			this.options
		);
	}
}

export function renderCueElement(
	cue: CueLineData,
	display: EditorCueDisplay,
	index = 0,
	state: EditorHookCardState = "upcoming",
	options: CueRenderOptions = {}
): HTMLElement {
	if (display === "cornell") {
		const element = renderInlineCueElement(cue, options);
		element.classList.add("cuecraft-editor-hook", "cuecraft-editor-cornell-card");
		element.dataset.state = state;
		return element;
	}
	if (!isInlineEditorDisplay(display)) {
		return renderEditorHookElement(
			buildEditorHookCard(cue, display, index, state, options),
			options
		);
	}
	return renderInlineCueElement(cue, options);
}

function renderInlineCueElement(
	cue: CueLineData,
	options: CueRenderOptions = {}
): HTMLElement {
	const root = cueDocument().createElement("div");
	root.className = "cuecraft-cue";
	applyCueLayoutClasses(root, options);

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

	appendSectionLens(root, cue.sectionLens);

	if (cue.keywords.length) {
		const kw = cueDocument().createElement("div");
		kw.className = "cuecraft-cue-keywords";
		kw.textContent = cue.keywords.join(" · ");
		root.appendChild(kw);
	}
	return root;
}

function renderEditorHookElement(
	card: EditorHookCard,
	options: CueRenderOptions = {}
): HTMLElement {
	const root = cueDocument().createElement("div");
	root.className = `cuecraft-editor-hook cuecraft-editor-hook-${card.display}`;
	applyCueLayoutClasses(root, options);
	const showSectionLabels = card.display === "anchored-card-rail" && !card.error;
	root.tabIndex = 0;
	root.setAttribute("role", "note");
	root.dataset.display = card.display;
	root.dataset.line = String(card.line);
	root.dataset.state = card.state;
	root.dataset.titleDensity = card.titleDensity;
	root.dataset.tone = card.tone;
	root.dataset.gradient = String(card.gradientIndex);
	root.dataset.cardStyle = card.cardStyle;
	root.dataset.questionVisible = String(card.showQuestion);
	root.dataset.supportTermsVisible = String(card.showSupportTerms);
	if (card.confidence) root.dataset.confidence = card.confidence;
	if (card.kind === "failed") root.classList.add("cuecraft-editor-hook-failed");

	if (card.showQuestion || card.kind === "failed") {
		if (showSectionLabels) appendEditorHookSectionLabel(root, "Question");
		const title = cueDocument().createElement("div");
		title.className = "cuecraft-editor-hook-title";
		title.textContent =
			(card.display === "active-section-composer" &&
				card.state === "current") ||
			card.display === "hook-minimap"
				? card.originalQuestion
				: card.hookTitle;
		root.appendChild(title);
	}

	if (card.error) {
		root.title = card.error;
		const error = cueDocument().createElement("div");
		error.className = "cuecraft-editor-hook-status";
		error.textContent = "Generation failed - regenerate";
		root.appendChild(error);
		return root;
	}

	if (card.sectionLens && showSectionLabels) {
		appendEditorHookSectionLabel(root, "Lens");
	}
	appendSectionLens(root, card.sectionLens);

	if (card.showSupportTerms && card.keywords.length) {
		if (showSectionLabels) appendEditorHookSectionLabel(root, "Terms");
		const keywords = cueDocument().createElement("div");
		keywords.className = "cuecraft-editor-hook-keywords";
		keywords.textContent = card.keywords.join(" · ");
		root.appendChild(keywords);
	}
	return root;
}

function appendEditorHookSectionLabel(
	parent: HTMLElement,
	label: "Question" | "Lens" | "Terms"
): void {
	const sectionLabel = cueDocument().createElement("div");
	sectionLabel.className = "cuecraft-editor-hook-section-label";
	sectionLabel.dataset.section = label.toLowerCase();
	sectionLabel.textContent = label.toUpperCase();
	parent.appendChild(sectionLabel);
}

const noteBriefCardOrder = [
	"whatMatters",
	"reviewFirst",
	"sayItBack",
] as const;

export function renderNoteBriefElement(
	noteBrief: NoteBriefOutput,
	variant: "editor" | "reading" | "cornell" = "editor"
): HTMLElement {
	const doc = cueDocument();
	const root = doc.createElement("section");
	root.className = `cuecraft-note-brief cuecraft-note-brief-${variant}`;
	root.setAttribute("role", "note");

	const label = doc.createElement("div");
	label.className = "cuecraft-note-brief-label";
	label.textContent = "Note brief";
	root.appendChild(label);

	const overview = doc.createElement("p");
	overview.className = "cuecraft-note-brief-overview";
	overview.textContent = noteBrief.overview;
	root.appendChild(overview);

	const cards = doc.createElement("div");
	cards.className = "cuecraft-note-brief-cards";
	for (const key of noteBriefCardOrder) {
		const card = noteBrief[key];
		const cardEl = doc.createElement("div");
		cardEl.className = "cuecraft-note-brief-card";
		cardEl.dataset.card = key;

		const title = doc.createElement("div");
		title.className = "cuecraft-note-brief-card-title";
		title.textContent = card.title;
		cardEl.appendChild(title);

		const detail = doc.createElement("div");
		detail.className = "cuecraft-note-brief-card-detail";
		detail.textContent = card.detail;
		cardEl.appendChild(detail);

		cards.appendChild(cardEl);
	}
	root.appendChild(cards);
	return root;
}

export function appendSectionLens(
	parent: HTMLElement,
	lens: SectionLens | null
): void {
	if (!lens) return;
	const doc = parent.ownerDocument;
	const root = doc.createElement("div");
	root.className = "cuecraft-section-lens";

	const phrase = doc.createElement("span");
	phrase.className = "cuecraft-section-lens-phrase";
	phrase.textContent = lens.keyPhrase;
	root.appendChild(phrase);

	root.appendChild(doc.createTextNode(" - "));

	const takeaway = doc.createElement("span");
	takeaway.className = "cuecraft-section-lens-takeaway";
	takeaway.textContent = lens.takeaway;
	root.appendChild(takeaway);

	const explanation = doc.createElement("div");
	explanation.className = "cuecraft-section-lens-explanation";
	explanation.textContent = lens.explanation;
	root.appendChild(explanation);

	parent.appendChild(root);
}

function sectionLensKey(lens: SectionLens | null): string {
	return lens
		? [lens.keyPhrase, lens.takeaway, lens.explanation].join("\u0001")
		: "";
}

function noteBriefKey(noteBrief: NoteBriefOutput | null | undefined): string {
	return noteBrief
		? [
				noteBrief.overview,
				noteBrief.whatMatters.title,
				noteBrief.whatMatters.detail,
				noteBrief.reviewFirst.title,
				noteBrief.reviewFirst.detail,
				noteBrief.sayItBack.title,
				noteBrief.sayItBack.detail,
			].join("\u0001")
		: "";
}

function cueDocument(): Document {
	return typeof activeDocument === "undefined"
		? globalThis.document
		: activeDocument;
}

/** Replace all cues currently rendered in the editor. */
export const setCuesEffect = StateEffect.define<CueEditorRenderState>();

const emptyCueGutterMarkers = RangeSet.of<GutterMarker>([]);

export function buildCueWidgetDecorations(
	state: EditorState,
	payload: CueEditorRenderState
): DecorationSet {
	const ranges: Range<Decoration>[] = [];
	const doc = state.doc;
	const options = editorCueRenderOptionsFromPayload(payload);
	if (payload.noteBrief && doc.lines >= 1) {
		ranges.push(
			Decoration.widget({
				widget: new NoteBriefWidget(payload.noteBrief),
				block: true,
				side: 0,
			}).range(doc.line(1).to)
		);
	}

	if (!isInlineEditorDisplay(payload.display)) {
		return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
	}

	for (const [index, cue] of payload.cues.entries()) {
		if (cue.line < 1 || cue.line > doc.lines) continue;
		const headingLine = doc.line(cue.line);
		// Block widget rendered on its own line just after the heading.
		ranges.push(
			Decoration.widget({
				widget: new CueWidget(cue, payload.display, index, options),
				block: true,
				side: 1,
			}).range(headingLine.to)
		);
	}
	return Decoration.set(ranges, true);
}

export function buildCueGutterMarkers(
	state: EditorState,
	payload: CueEditorRenderState
): RangeSet<GutterMarker> {
	if (isInlineEditorDisplay(payload.display)) return emptyCueGutterMarkers;

	const builder = new RangeSetBuilder<GutterMarker>();
	const doc = state.doc;
	const activeLine = doc.lineAt(state.selection.main.head).number;
	const currentCueLine = activeCueLine(payload.display, payload.cues, activeLine);
	const options = editorCueRenderOptionsFromPayload(payload);
	for (const [index, cue] of payload.cues.entries()) {
		if (cue.line < 1 || cue.line > doc.lines) continue;
		const headingLine = doc.line(cue.line);
		const cardState = cue.line === currentCueLine ? "current" : "upcoming";
		builder.add(
			headingLine.from,
			headingLine.from,
			new CueGutterMarker(cue, payload.display, index, cardState, options)
		);
	}
	return builder.finish();
}

function editorCueRenderOptionsFromPayload(
	payload: CueEditorRenderState
): CueRenderOptions {
	return {
		showQuestion: payload.showRailQuestions ?? true,
		showSupportTerms: payload.showRailSupportTerms ?? true,
		cardStyle: payload.editorHookCardStyle ?? DEFAULT_EDITOR_HOOK_CARD_STYLE,
		cueColumnWidth: payload.cueColumnWidth,
		cueFontSize: payload.cueFontSize,
	};
}

function editorHookCardOptionsKey(options: CueRenderOptions): string {
	return [
		options.showQuestion ?? true,
		options.showSupportTerms ?? true,
		options.cardStyle ?? DEFAULT_EDITOR_HOOK_CARD_STYLE,
		options.cueColumnWidth ?? "",
		options.cueFontSize ?? "",
	].join("\u0001");
}

function applyCueLayoutClasses(
	element: HTMLElement,
	options: CueRenderOptions
): void {
	element.classList.add(cueColumnWidthClass(options.cueColumnWidth));
	element.classList.add(cueFontSizeClass(options.cueFontSize));
}

function activeCueLine(
	display: EditorCueDisplay,
	cues: CueLineData[],
	activeLine: number
): number | null {
	if (display !== "active-section-composer" && display !== "hook-minimap") {
		return null;
	}

	let current: number | null = null;
	for (const cue of cues) {
		if (cue.line > activeLine) break;
		current = cue.line;
	}
	return current;
}

function isInlineEditorDisplay(display: EditorCueDisplay): boolean {
	return display === "inline-cues";
}

function mapCuePayloadThroughChanges(
	payload: CueEditorRenderState,
	tr: Transaction
): CueEditorRenderState {
	if (!tr.docChanged) return payload;
	const cues = payload.cues.map((cue) => ({
		...cue,
		line: mapCueLineThroughChanges(cue.line, tr),
	}));
	return { ...payload, cues };
}

function mapCueLineThroughChanges(line: number, tr: Transaction): number {
	const oldDoc = tr.startState.doc;
	if (line < 1 || line > oldDoc.lines) return line;
	const oldLine = oldDoc.line(line);
	const mappedPos = tr.changes.mapPos(oldLine.from, 1);
	const boundedPos = Math.min(mappedPos, tr.state.doc.length);
	return tr.state.doc.lineAt(boundedPos).number;
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
				next = buildCueWidgetDecorations(tr.state, effect.value);
			}
		}
		return next;
	},
	provide: (f) => EditorView.decorations.from(f),
});

interface CueGutterState {
	markers: RangeSet<GutterMarker>;
	payload: CueEditorRenderState | null;
}

export const cueGutterField = StateField.define<CueGutterState>({
	create() {
		return { markers: emptyCueGutterMarkers, payload: null };
	},
	update(value, tr) {
		let payload = value.payload;
		let payloadChanged = false;
		for (const effect of tr.effects) {
			if (effect.is(setCuesEffect)) {
				payload = effect.value;
				payloadChanged = true;
			}
		}
		if (!payload) {
			return { markers: value.markers.map(tr.changes), payload };
		}
		if (!payloadChanged) {
			payload = mapCuePayloadThroughChanges(payload, tr);
		}
		if (
			payloadChanged ||
			tr.selection ||
			tr.docChanged
		) {
			return { markers: buildCueGutterMarkers(tr.state, payload), payload };
		}
		return { markers: value.markers.map(tr.changes), payload };
	},
});

const cueGutter = gutter({
	class: "cuecraft-editor-hook-gutter",
	markers: (view) => view.state.field(cueGutterField).markers,
});

/** Editor extension that renders CueCraft cues. Register via registerEditorExtension. */
export const cueEditorExtension = [cueField, cueGutterField, cueGutter];
