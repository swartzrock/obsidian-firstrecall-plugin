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
	ViewPlugin,
	WidgetType,
	gutter,
} from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { setIcon, setTooltip } from "obsidian";
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
import { buildCornellSupportPresentation } from "./cornell";
import { cornellStyleClass, type CornellStyle } from "./cornell-style";
import { isCueEligibleSection, type Section } from "./parser";
import type { NoteBriefOutput, SectionLens } from "./schemas";
import type { StudyProjection, StudySessionSnapshot } from "./study-session";
import {
	CUE_SECTION_KINDS,
	type CueSectionCollapseController,
	type CueSectionKind,
} from "./cue-section-collapse";
import {
	clampEditorCueWidthPx,
	editorCueDynamicMaxWidthPx,
	editorCueWidthFromKeyboard,
	editorCueWidthFromLeftEdgeDrag,
	EDITOR_CUE_WIDTH_MAX_PX,
	EDITOR_CUE_WIDTH_MIN_PX,
} from "./editor-cue-width";

export type Confidence = "high" | "medium" | "low";

const QUESTION_ICON_CANDIDATES = [
	"circle-question-mark",
	"circle-help",
	"help-circle",
] as const;
const SUMMARY_ICON_CANDIDATES = ["notebook-text", "file-text"] as const;
const TERMS_ICON_CANDIDATES = ["tags", "tag"] as const;
const CUE_SECTION_ICON_CANDIDATES: Record<
	CueSectionKind,
	readonly string[]
> = {
	summary: SUMMARY_ICON_CANDIDATES,
	question: QUESTION_ICON_CANDIDATES,
	terms: TERMS_ICON_CANDIDATES,
};
let nextEditorHookSectionBodyId = 0;
let nextEditorCueRailCardId = 0;

/** One renderable cue, resolved to a current document line. */
export interface CueLineData {
	/** 1-based line of the heading the cue belongs to. */
	line: number;
	/** Stable cached section identity, independent of the current heading line. */
	sectionId: string;
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
	study?: StudyProjection;
	notePath?: string;
	collapseController?: CueSectionCollapseController;
	noteBrief?: NoteBriefOutput | null;
	showRailSummary?: boolean;
	showRailQuestions?: boolean;
	showRailSupportTerms?: boolean;
	cueColumnWidth?: CueColumnWidth;
	cueFontSize?: CueFontSize;
	editorCueWidthController?: EditorCueWidthController;
}

export interface EditorCueWidthController {
	getCommittedWidthPx(): number | null;
	previewWidthPx(widthPx: number | null): void;
	flushWidthPreview(widthPx: number | null): void;
	commitWidthPx(widthPx: number): void;
}

interface CueRenderOptions extends EditorHookCardOptions {
	cueColumnWidth?: CueColumnWidth;
	cueFontSize?: CueFontSize;
	editorCueWidthController?: EditorCueWidthController;
	collapse?: CueSectionCollapseRenderState;
	study?: CueStudySectionRenderState;
}

interface CueSectionCollapseRenderState {
	notePath: string;
	sectionId: string;
	controller: CueSectionCollapseController;
	collapsed: Record<CueSectionKind, boolean>;
}

interface CueStudySectionRenderState {
	sectionId: string;
	revealed: boolean;
	toggleSection(sectionId: string): void;
}

const RAIL_CARD_SECTION_GAP = 12;
const RAIL_CARD_SPACER_TOLERANCE = 1;
export const RAIL_CARD_LAYOUT_EVENT = "cuecraft-rail-card-layout";
const EDITOR_CUE_WIDTH_PROPERTY = "--cuecraft-editor-cue-width";
const EDITOR_CUE_WIDTH_CUSTOM_CLASS = "cuecraft-editor-cue-width-custom";
const EDITOR_CUE_WIDTH_RESIZING_CLASS = "cuecraft-editor-cue-width-resizing";
const editorCueWidthInteractionCleanup = new WeakMap<HTMLElement, () => void>();
const editorStudyCueInteractionCleanup = new WeakMap<HTMLElement, () => void>();
const editorCueWidthLayoutFrames = new WeakMap<
	HTMLElement,
	{ id: number; kind: "animation-frame" | "timeout" }
>();

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
			sectionId: sec.id,
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
			other.options.collapse?.controller ===
				this.options.collapse?.controller &&
			other.options.study?.toggleSection ===
				this.options.study?.toggleSection &&
			other.cue.sectionId === this.cue.sectionId &&
			other.cue.question === this.cue.question &&
			other.cue.keywords.join("\u0001") === this.cue.keywords.join("\u0001") &&
			other.cue.confidence === this.cue.confidence &&
			sectionLensKey(other.cue.sectionLens) === sectionLensKey(this.cue.sectionLens) &&
			other.cue.error === this.cue.error
		);
	}

	toDOM(): HTMLElement {
		const collapse = this.options.collapse;
		const options = collapse
			? {
					...this.options,
					collapse: {
						...collapse,
						collapsed: cueSectionCollapsedState(
							collapse.controller,
							collapse.notePath,
							collapse.sectionId
						),
					},
				}
			: this.options;
		const element = renderCueElement(
			this.cue,
			this.display,
			this.index,
			"upcoming",
			options
		);
		if (!isInlineEditorDisplay(this.display)) {
			element.classList.add("cuecraft-editor-hook-inline-fallback");
			return element;
		}
		const wrapper = element.ownerDocument.createElement("div");
		wrapper.className = "cuecraft-inline-cue-widget";
		wrapper.appendChild(element);
		return wrapper;
	}

	ignoreEvent(event: Event): boolean {
		const target = event.target as
			| { closest?: (selector: string) => Element | null }
			| null;
		return Boolean(
			this.options.study ||
			target?.closest?.(".cuecraft-editor-hook-section-toggle")
		);
	}

	destroy(dom: Node): void {
		cleanupEditorStudyCueInteractions(dom);
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

class RailSpacerWidget extends WidgetType {
	constructor(private readonly height: number) {
		super();
	}

	eq(other: RailSpacerWidget): boolean {
		return other.height === this.height;
	}

	toDOM(): HTMLElement {
		const element = cueDocument().createElement("div");
		element.className = "cuecraft-editor-rail-spacer";
		element.setAttribute("aria-hidden", "true");
		element.style.height = `${this.height}px`;
		return element;
	}

	ignoreEvent(): boolean {
		return true;
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
			other.options.collapse?.controller ===
				this.options.collapse?.controller &&
			other.options.study?.toggleSection ===
				this.options.study?.toggleSection &&
			other.cue.sectionId === this.cue.sectionId &&
			other.cue.question === this.cue.question &&
			other.cue.keywords.join("\u0001") === this.cue.keywords.join("\u0001") &&
			other.cue.confidence === this.cue.confidence &&
			sectionLensKey(other.cue.sectionLens) === sectionLensKey(this.cue.sectionLens) &&
			other.cue.error === this.cue.error
		);
	}

	toDOM(): HTMLElement {
		const collapse = this.options.collapse;
		const options = collapse
			? {
					...this.options,
					collapse: {
						...collapse,
						collapsed: cueSectionCollapsedState(
							collapse.controller,
							collapse.notePath,
							collapse.sectionId
						),
					},
				}
			: this.options;
		return renderCueElement(
			this.cue,
			this.display,
			this.index,
			this.state,
			options
		);
	}

	destroy(dom: Node): void {
		if (dom.nodeType === dom.ELEMENT_NODE) {
			editorCueWidthInteractionCleanup.get(dom as HTMLElement)?.();
		}
		cleanupEditorStudyCueInteractions(dom);
	}
}

export function renderCueElement(
	cue: CueLineData,
	display: EditorCueDisplay,
	index = 0,
	state: EditorHookCardState = "upcoming",
	options: CueRenderOptions = {}
): HTMLElement {
	const cornellStyle = cornellEditorDisplayStyle(display);
	let element: HTMLElement;
	if (cornellStyle) {
		element = renderCornellCueElement(
			cue,
			display,
			cornellStyle,
			state,
			options
		);
	} else if (!isInlineEditorDisplay(display)) {
		element = renderEditorHookElement(
			buildEditorHookCard(cue, display, index, state, options),
			options
		);
	} else {
		element = renderInlineCueElement(cue, options);
	}
	applyEditorStudyCueInteraction(element, options.study);
	return element;
}

function applyEditorStudyCueInteraction(
	element: HTMLElement,
	study: CueStudySectionRenderState | undefined
): void {
	if (!study) return;
	element.classList.add("cuecraft-editor-study-cue");
	element.dataset.studySectionId = study.sectionId;
	element.dataset.studyState = study.revealed ? "revealed" : "hidden";

	const toggle = element.ownerDocument.createElement("button");
	toggle.type = "button";
	toggle.className = "cuecraft-study-section-toggle";
	toggle.dataset.revealed = String(study.revealed);
	const label = study.revealed ? "Hide section" : "Show section";
	toggle.setAttribute("aria-label", label);
	toggle.setAttribute("aria-pressed", String(study.revealed));
	setIcon(toggle, study.revealed ? "eye-off" : "eye");
	setTooltip(toggle, label, { placement: "right" });
	const onClick = (event: MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		study.toggleSection(study.sectionId);
	};
	toggle.addEventListener("click", onClick);
	element.append(toggle);
	editorStudyCueInteractionCleanup.set(element, () => {
		toggle.removeEventListener("click", onClick);
		toggle.remove();
		editorStudyCueInteractionCleanup.delete(element);
	});
}

function cleanupEditorStudyCueInteractions(dom: Node): void {
	if (dom.nodeType !== dom.ELEMENT_NODE) return;
	const element = dom as HTMLElement;
	if (element.classList.contains("cuecraft-editor-study-cue")) {
		editorStudyCueInteractionCleanup.get(element)?.();
	}
	for (const cue of element.querySelectorAll<HTMLElement>(
		".cuecraft-editor-study-cue"
	)) {
		editorStudyCueInteractionCleanup.get(cue)?.();
	}
}

function renderCornellCueElement(
	cue: CueLineData,
	display: EditorCueDisplay,
	style: CornellStyle,
	state: EditorHookCardState,
	options: CueRenderOptions = {}
): HTMLElement {
	const doc = cueDocument();
	const root = doc.createElement("div");
	root.className = [
		"cuecraft-editor-hook",
		"cuecraft-editor-cornell-card",
		`cuecraft-editor-cornell-card-${style}`,
		"cuecraft-cornell",
		cornellStyleClass(style),
	].join(" ");
	root.tabIndex = 0;
	root.setAttribute("role", "note");
	root.dataset.display = display;
	root.dataset.line = String(cue.line);
	root.dataset.state = state;
	const showSummary = options.showSummary ?? true;
	const showSupportTerms = options.showSupportTerms ?? true;
	const supports = buildCornellSupportPresentation({
		keywords: cue.keywords,
	});
	const showQuestion =
		(options.showQuestion ?? true) ||
		(!cue.error &&
			!(showSummary && cue.sectionLens) &&
			!(showSupportTerms && supports.terms.length));
	root.dataset.summaryVisible = String(showSummary);
	root.dataset.questionVisible = String(showQuestion);
	root.dataset.supportTermsVisible = String(showSupportTerms);
	applyCueLayoutClasses(root, options);

	const card = doc.createElement("div");
	card.className = "cuecraft-cornell-cue";
	root.appendChild(card);

	if (cue.error) {
		card.classList.add("cuecraft-cornell-cue-error");
		card.title = cue.error;
		const q = doc.createElement("div");
		q.className = "cuecraft-cornell-q";
		q.textContent = "\u26a0 Generation failed \u2014 regenerate";
		card.appendChild(q);
		return finalizeRailCard(root, display, options);
	}

	if (cue.confidence) {
		card.dataset.confidence = cue.confidence;
	}
	root.classList.add("cuecraft-editor-hook-sectioned");
	if (showSummary && cue.sectionLens) {
		const summary = doc.createElement("div");
		summary.className = "cuecraft-section-lens";
		const takeaway = doc.createElement("span");
		takeaway.className = "cuecraft-section-lens-takeaway";
		takeaway.textContent = cue.sectionLens.takeaway;
		summary.appendChild(takeaway);
		appendEditorHookDisclosure(
			card,
			"summary",
			cue.sectionLens.takeaway,
			summary,
			options.collapse
		);
	}
	if (showQuestion) {
		const q = doc.createElement("div");
		q.className = "cuecraft-cornell-q";
		q.textContent = cue.question;
		appendEditorHookDisclosure(
			card,
			"question",
			cue.question,
			q,
			options.collapse
		);
	}

	if (showSupportTerms && supports.terms.length) {
		const kw = doc.createElement("div");
		kw.className = "cuecraft-cornell-kw";
		appendCueTerms(kw, supports.terms, "cuecraft-cornell-support-term");
		appendEditorHookDisclosure(
			card,
			"terms",
			supports.terms.join(", "),
			kw,
			options.collapse
		);
	}

	return finalizeRailCard(root, display, options);
}

function renderInlineCueElement(
	cue: CueLineData,
	options: CueRenderOptions = {}
): HTMLElement {
	const root = cueDocument().createElement("div");
	root.className = "cuecraft-cue cuecraft-editor-hook-sectioned";
	root.setAttribute("role", "note");
	const showSummary = options.showSummary ?? true;
	const showSupportTerms = options.showSupportTerms ?? true;
	const showQuestion =
		(options.showQuestion ?? true) ||
		(!cue.error &&
			!(showSummary && cue.sectionLens) &&
			!(showSupportTerms && cue.keywords.length));
	root.dataset.summaryVisible = String(showSummary);
	root.dataset.questionVisible = String(showQuestion);
	root.dataset.supportTermsVisible = String(showSupportTerms);
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
	if (showSummary && cue.sectionLens) {
		const summary = cueDocument().createElement("div");
		summary.className = "cuecraft-section-lens";
		const takeaway = cueDocument().createElement("span");
		takeaway.className = "cuecraft-section-lens-takeaway";
		takeaway.textContent = cue.sectionLens.takeaway;
		summary.appendChild(takeaway);
		appendEditorHookDisclosure(
			root,
			"summary",
			cue.sectionLens.takeaway,
			summary,
			options.collapse
		);
	}
	if (showQuestion) {
		const q = cueDocument().createElement("div");
		q.className = "cuecraft-cue-question cuecraft-editor-hook-title";
		q.textContent = cue.question;
		appendEditorHookDisclosure(
			root,
			"question",
			cue.question,
			q,
			options.collapse
		);
	}

	if (showSupportTerms && cue.keywords.length) {
		const kw = cueDocument().createElement("div");
		kw.className = "cuecraft-cue-keywords cuecraft-editor-hook-keywords";
		appendCueTerms(kw, cue.keywords);
		appendEditorHookDisclosure(
			root,
			"terms",
			cue.keywords.join(", "),
			kw,
			options.collapse
		);
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
	const showSectionLabels =
		sectionDisclosuresApplyToDisplay(card.display) && !card.error;
	if (showSectionLabels) root.classList.add("cuecraft-editor-hook-sectioned");
	root.tabIndex = 0;
	root.setAttribute("role", "note");
	root.dataset.display = card.display;
	root.dataset.line = String(card.line);
	root.dataset.state = card.state;
	root.dataset.titleDensity = card.titleDensity;
	root.dataset.tone = card.tone;
	root.dataset.gradient = String(card.gradientIndex);
	root.dataset.summaryVisible = String(card.showSummary);
	root.dataset.questionVisible = String(card.showQuestion);
	root.dataset.supportTermsVisible = String(card.showSupportTerms);
	if (card.confidence) root.dataset.confidence = card.confidence;
	if (card.kind === "failed") root.classList.add("cuecraft-editor-hook-failed");

	let hasContent = false;
	if (card.showSummary && card.sectionLens && showSectionLabels) {
		const summary = cueDocument().createElement("div");
		summary.className = "cuecraft-section-lens";
		const takeaway = cueDocument().createElement("span");
		takeaway.className = "cuecraft-section-lens-takeaway";
		takeaway.textContent = card.sectionLens.takeaway;
		summary.appendChild(takeaway);
		appendEditorHookDisclosure(
			root,
			"summary",
			card.sectionLens.takeaway,
			summary,
			options.collapse
		);
		hasContent = true;
	}
	if (card.showQuestion || card.kind === "failed") {
		const title = cueDocument().createElement("div");
		title.className = "cuecraft-editor-hook-title";
		title.textContent =
			(card.display === "active-section-composer" &&
				card.state === "current") ||
			card.display === "hook-minimap"
				? card.originalQuestion
				: card.hookTitle;
		if (showSectionLabels) {
			appendEditorHookDisclosure(
				root,
				"question",
				title.textContent,
				title,
				options.collapse
			);
		} else {
			root.appendChild(title);
		}
		hasContent = true;
	}

	if (card.error) {
		root.title = card.error;
		const error = cueDocument().createElement("div");
		error.className = "cuecraft-editor-hook-status";
		error.textContent = "Generation failed - regenerate";
		root.appendChild(error);
		return railLayoutAppliesToDisplay(card.display)
			? finalizeRailCard(root, card.display, options)
			: root;
	}

	if (card.showSummary && card.sectionLens && !showSectionLabels) {
		appendSectionLens(root, card.sectionLens);
		hasContent = true;
	}

	if (card.showSupportTerms && card.keywords.length) {
		const keywords = cueDocument().createElement("div");
		keywords.className = "cuecraft-editor-hook-keywords";
		appendCueTerms(keywords, card.keywords);
		if (showSectionLabels) {
			appendEditorHookDisclosure(
				root,
				"terms",
				card.keywords.join(", "),
				keywords,
				options.collapse
			);
		} else {
			root.appendChild(keywords);
		}
		hasContent = true;
	}
	if (!hasContent) root.classList.add("cuecraft-editor-hook-empty");
	return railLayoutAppliesToDisplay(card.display)
		? finalizeRailCard(root, card.display, options)
		: root;
}

function appendLabelIcon(
	parent: HTMLElement,
	icon: string | readonly string[]
): void {
	const iconEl = parent.ownerDocument.createElement("span");
	iconEl.className = "cuecraft-label-icon";
	iconEl.setAttribute("aria-hidden", "true");
	const icons: readonly string[] = typeof icon === "string" ? [icon] : icon;
	for (const candidate of icons) {
		iconEl.replaceChildren();
		setIcon(iconEl, candidate);
		if (iconEl.childElementCount > 0 || iconEl.dataset.icon) break;
	}
	parent.appendChild(iconEl);
}

function appendLabelText(parent: HTMLElement, label: string): void {
	const labelText = parent.ownerDocument.createElement("span");
	labelText.className = "cuecraft-label-text";
	labelText.textContent = label;
	parent.appendChild(labelText);
}

function appendCueTerms(
	parent: HTMLElement,
	terms: readonly string[],
	chipClass = "cuecraft-cue-term"
): void {
	for (const term of terms) {
		const chip = parent.ownerDocument.createElement("span");
		chip.className = chipClass;
		chip.textContent = term;
		parent.appendChild(chip);
	}
}

export function railLayoutAppliesToDisplay(display: EditorCueDisplay): boolean {
	return cornellEditorDisplayStyle(display) !== null;
}

function sectionDisclosuresApplyToDisplay(display: EditorCueDisplay): boolean {
	return (
		display === "inline-cues" ||
		cornellEditorDisplayStyle(display) !== null
	);
}

function finalizeRailCard(
	root: HTMLElement,
	display: EditorCueDisplay,
	options: CueRenderOptions
): HTMLElement {
	root.classList.add("cuecraft-editor-rail-card");
	const controller = options.editorCueWidthController;
	if (!controller) return root;
	if (!root.id) {
		nextEditorCueRailCardId += 1;
		root.id = `cuecraft-editor-rail-card-${nextEditorCueRailCardId}`;
	}
	const grip = root.ownerDocument.createElement("div");
	grip.className = "cuecraft-editor-cue-width-grip";
	grip.tabIndex = 0;
	grip.setAttribute("role", "separator");
	grip.setAttribute("aria-orientation", "vertical");
	const gripLabel = root.ownerDocument.createElement("span");
	gripLabel.id = `${root.id}-width-grip-label`;
	gripLabel.className = "cuecraft-editor-cue-width-grip-label";
	gripLabel.textContent = `${editorCueDisplayLabel(display)} cue rail width`;
	grip.appendChild(gripLabel);
	grip.setAttribute("aria-labelledby", gripLabel.id);
	grip.setAttribute("aria-valuemin", String(EDITOR_CUE_WIDTH_MIN_PX));
	grip.setAttribute("aria-valuemax", String(EDITOR_CUE_WIDTH_MAX_PX));
	grip.setAttribute(
		"aria-valuenow",
		String(controller.getCommittedWidthPx() ?? EDITOR_CUE_WIDTH_MIN_PX)
	);
	grip.setAttribute("aria-controls", root.id);
	const gripHost = root.querySelector<HTMLElement>(
		":scope > .cuecraft-cornell-cue"
	);
	(gripHost ?? root).prepend(grip);
	applyEditorCueWidthPreview(
		root,
		controller.getCommittedWidthPx()
	);
	installEditorCueWidthInteraction(root, grip, controller);
	return root;
}

function editorCueDisplayLabel(display: EditorCueDisplay): string {
	return display
		.split("-")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export function applyEditorCueWidthPreview(
	root: ParentNode,
	widthPx: number | null
): void {
	const rootElement = root as HTMLElement;
	const editorRoots = rootElement.matches?.(".cm-editor")
		? [rootElement]
		: Array.from(root.querySelectorAll<HTMLElement>(".cm-editor"));
	if (editorRoots.length > 0) {
		for (const editorRoot of editorRoots) {
			applyEditorCueWidthToScope(editorRoot, widthPx);
		}
		return;
	}
	applyEditorCueWidthToScope(root, widthPx);
}

function applyEditorCueWidthToScope(
	root: ParentNode,
	widthPx: number | null
): void {
	const normalizedWidth =
		widthPx === null
			? null
			: effectiveEditorCueWidthPx(root, widthPx);
	if ((root as Node).nodeType === (root as Node).ELEMENT_NODE) {
		applyEditorCueWidthToElement(root as HTMLElement, normalizedWidth);
	}
	const layoutTargets = new Set<HTMLElement>();
	for (const grip of root.querySelectorAll<HTMLElement>(
		".cuecraft-editor-cue-width-grip"
	)) {
		const card = grip.closest<HTMLElement>(".cuecraft-editor-rail-card");
		if (card && applyEditorCueWidthToElement(card, normalizedWidth)) {
			layoutTargets.add(
				card.closest<HTMLElement>(".cm-editor") ?? card
			);
		}
		if (normalizedWidth !== null) {
			const valueNow = String(normalizedWidth);
			if (grip.getAttribute("aria-valuenow") !== valueNow) {
				grip.setAttribute("aria-valuenow", valueNow);
			}
		}
	}
	for (const target of layoutTargets) scheduleEditorCueWidthLayout(target);
}

function effectiveEditorCueWidthPx(
	root: ParentNode,
	requestedWidthPx: number
): number {
	const absoluteWidth = clampEditorCueWidthPx(
		requestedWidthPx,
		EDITOR_CUE_WIDTH_MAX_PX
	);
	const rootElement = root as HTMLElement;
	const card = rootElement.matches?.(".cuecraft-editor-rail-card")
		? rootElement
		: root.querySelector<HTMLElement>(".cuecraft-editor-rail-card");
	if (!card?.isConnected) return absoluteWidth;
	const boundary = editorCueWorkspaceBoundary(card);
	if (!boundary) return absoluteWidth;
	const cardRight = card.getBoundingClientRect().right;
	const boundaryLeft = boundary.getBoundingClientRect().left;
	if (
		!Number.isFinite(cardRight) ||
		!Number.isFinite(boundaryLeft) ||
		cardRight <= boundaryLeft
	) {
		return absoluteWidth;
	}
	return clampEditorCueWidthPx(
		requestedWidthPx,
		editorCueDynamicMaxWidthPx(cardRight, boundaryLeft)
	);
}

function applyEditorCueWidthToElement(
	element: HTMLElement,
	widthPx: number | null
): boolean {
	const previousCustom = element.classList.contains(
		EDITOR_CUE_WIDTH_CUSTOM_CLASS
	);
	const previousWidth = element.style.getPropertyValue(
		EDITOR_CUE_WIDTH_PROPERTY
	);
	const nextCustom = widthPx !== null;
	const nextWidth = widthPx === null ? "" : `${widthPx}px`;
	if (previousCustom === nextCustom && previousWidth === nextWidth) {
		return false;
	}
	element.classList.toggle(EDITOR_CUE_WIDTH_CUSTOM_CLASS, nextCustom);
	if (widthPx === null) {
		element.style.removeProperty(EDITOR_CUE_WIDTH_PROPERTY);
	} else {
		element.style.setProperty(EDITOR_CUE_WIDTH_PROPERTY, nextWidth);
	}
	return true;
}

function scheduleEditorCueWidthLayout(target: HTMLElement): void {
	if (editorCueWidthLayoutFrames.has(target)) return;
	const win = target.ownerDocument.defaultView;
	if (!win) return;
	const dispatch = (): void => {
		editorCueWidthLayoutFrames.delete(target);
		dispatchRailCardLayoutEvent(target);
	};
	if (typeof win.requestAnimationFrame === "function") {
		editorCueWidthLayoutFrames.set(target, {
			id: win.requestAnimationFrame(dispatch),
			kind: "animation-frame",
		});
		return;
	}
	editorCueWidthLayoutFrames.set(target, {
		id: win.setTimeout(dispatch, 0),
		kind: "timeout",
	});
}

function cancelEditorCueWidthLayout(target: HTMLElement): void {
	const pending = editorCueWidthLayoutFrames.get(target);
	if (!pending) return;
	const win = target.ownerDocument.defaultView;
	if (pending.kind === "animation-frame") {
		win?.cancelAnimationFrame(pending.id);
	} else {
		win?.clearTimeout(pending.id);
	}
	editorCueWidthLayoutFrames.delete(target);
}

interface EditorCuePointerSession {
	pointerId: number;
	startPointerX: number;
	startWidthPx: number;
	dynamicMaxWidthPx: number;
}

interface EditorCueKeyboardSession {
	currentWidthPx: number;
	dynamicMaxWidthPx: number;
	heldKeys: Set<string>;
}

function installEditorCueWidthInteraction(
	card: HTMLElement,
	grip: HTMLElement,
	controller: EditorCueWidthController
): void {
	let pointerSession: EditorCuePointerSession | null = null;
	let keyboardSession: EditorCueKeyboardSession | null = null;
	let lastPreviewWidthPx: number | null = controller.getCommittedWidthPx();
	let destroyed = false;

	const unlockGripTop = (): void => {
		grip.style.removeProperty("--cuecraft-editor-cue-width-grip-top");
	};
	const lockGripTop = (): void => {
		const gripHost = grip.parentElement ?? card;
		const hostHeight = gripHost.getBoundingClientRect().height;
		if (Number.isFinite(hostHeight) && hostHeight > 0) {
			grip.style.setProperty(
				"--cuecraft-editor-cue-width-grip-top",
				`${hostHeight / 2}px`
			);
		}
	};
	const setResizing = (resizing: boolean): void => {
		card.classList.toggle(EDITOR_CUE_WIDTH_RESIZING_CLASS, resizing);
		grip.classList.toggle(EDITOR_CUE_WIDTH_RESIZING_CLASS, resizing);
		card.ownerDocument.documentElement.classList.toggle(
			EDITOR_CUE_WIDTH_RESIZING_CLASS,
			resizing
		);
	};
	const restoreCommittedWidth = (): void => {
		const committedWidthPx = controller.getCommittedWidthPx();
		if (lastPreviewWidthPx !== committedWidthPx) {
			controller.flushWidthPreview(committedWidthPx);
		}
		lastPreviewWidthPx = committedWidthPx;
	};
	const cancel = (): void => {
		if (!pointerSession && !keyboardSession) return;
		pointerSession = null;
		keyboardSession = null;
		unlockGripTop();
		setResizing(false);
		restoreCommittedWidth();
	};
	const preview = (widthPx: number, dynamicMaxWidthPx: number): void => {
		const width = clampEditorCueWidthPx(widthPx, dynamicMaxWidthPx);
		grip.setAttribute("aria-valuemax", String(dynamicMaxWidthPx));
		grip.setAttribute("aria-valuenow", String(width));
		if (lastPreviewWidthPx === width) return;
		lastPreviewWidthPx = width;
		controller.previewWidthPx(width);
	};
	const finish = (widthPx: number): void => {
		pointerSession = null;
		keyboardSession = null;
		unlockGripTop();
		setResizing(false);
		controller.commitWidthPx(widthPx);
	};
	const interactionGeometry = (): {
		widthPx: number;
		dynamicMaxWidthPx: number;
	} => {
		const cardRect = card.getBoundingClientRect();
		const boundary = editorCueWorkspaceBoundary(card);
		const boundaryLeft = boundary?.getBoundingClientRect().left ?? 0;
		const dynamicMaxWidthPx = editorCueDynamicMaxWidthPx(
			cardRect.right,
			boundaryLeft
		);
		const measuredWidth =
			cardRect.width > 0
				? cardRect.width
				: controller.getCommittedWidthPx() ?? EDITOR_CUE_WIDTH_MIN_PX;
		return {
			widthPx: clampEditorCueWidthPx(measuredWidth, dynamicMaxWidthPx),
			dynamicMaxWidthPx,
		};
	};

	const onPointerDown = (event: PointerEvent): void => {
		if (destroyed || pointerSession || keyboardSession) return;
		if (event.button !== 0 || event.isPrimary === false) return;
		const geometry = interactionGeometry();
		pointerSession = {
			pointerId: event.pointerId,
			startPointerX: event.clientX,
			startWidthPx: geometry.widthPx,
			dynamicMaxWidthPx: geometry.dynamicMaxWidthPx,
		};
		lockGripTop();
		setResizing(true);
		grip.setPointerCapture(event.pointerId);
		event.preventDefault();
		event.stopPropagation();
	};
	const onPointerMove = (event: PointerEvent): void => {
		const session = pointerSession;
		if (!session || event.pointerId !== session.pointerId) return;
		const width = editorCueWidthFromLeftEdgeDrag(
			session.startWidthPx,
			session.startPointerX,
			event.clientX,
			session.dynamicMaxWidthPx
		);
		preview(width, session.dynamicMaxWidthPx);
		event.preventDefault();
		event.stopPropagation();
	};
	const onPointerUp = (event: PointerEvent): void => {
		const session = pointerSession;
		if (!session || event.pointerId !== session.pointerId) return;
		const width = editorCueWidthFromLeftEdgeDrag(
			session.startWidthPx,
			session.startPointerX,
			event.clientX,
			session.dynamicMaxWidthPx
		);
		pointerSession = null;
		if (grip.hasPointerCapture(event.pointerId)) {
			grip.releasePointerCapture(event.pointerId);
		}
		finish(width);
		event.preventDefault();
		event.stopPropagation();
	};
	const onPointerCancel = (event: PointerEvent): void => {
		if (!pointerSession || event.pointerId !== pointerSession.pointerId) return;
		cancel();
		event.preventDefault();
		event.stopPropagation();
	};
	const onLostPointerCapture = (event: PointerEvent): void => {
		if (!pointerSession || event.pointerId !== pointerSession.pointerId) return;
		cancel();
	};
	const onKeyDown = (event: KeyboardEvent): void => {
		if (destroyed || pointerSession) return;
		const existing = keyboardSession;
		const startingGeometry = existing ? null : interactionGeometry();
		const geometry = existing ?? {
			currentWidthPx: startingGeometry?.widthPx ?? EDITOR_CUE_WIDTH_MIN_PX,
			dynamicMaxWidthPx:
				startingGeometry?.dynamicMaxWidthPx ?? EDITOR_CUE_WIDTH_MAX_PX,
			heldKeys: new Set<string>(),
		};
		const width = editorCueWidthFromKeyboard(
			event.key,
			geometry.currentWidthPx,
			geometry.dynamicMaxWidthPx
		);
		if (width === null) return;
		if (!existing) {
			keyboardSession = geometry;
			setResizing(true);
		}
		geometry.heldKeys.add(event.key);
		geometry.currentWidthPx = width;
		preview(width, geometry.dynamicMaxWidthPx);
		event.preventDefault();
		event.stopPropagation();
	};
	const onKeyUp = (event: KeyboardEvent): void => {
		const session = keyboardSession;
		if (!session || !session.heldKeys.has(event.key)) return;
		session.heldKeys.delete(event.key);
		if (session.heldKeys.size === 0) {
			finish(session.currentWidthPx);
		}
		event.preventDefault();
		event.stopPropagation();
	};
	const onFocus = (): void => {
		const geometry = interactionGeometry();
		grip.setAttribute("aria-valuemax", String(geometry.dynamicMaxWidthPx));
		grip.setAttribute("aria-valuenow", String(geometry.widthPx));
	};
	const onBlur = (): void => cancel();

	grip.addEventListener("pointerdown", onPointerDown);
	grip.addEventListener("pointermove", onPointerMove);
	grip.addEventListener("pointerup", onPointerUp);
	grip.addEventListener("pointercancel", onPointerCancel);
	grip.addEventListener("lostpointercapture", onLostPointerCapture);
	grip.addEventListener("keydown", onKeyDown);
	grip.addEventListener("keyup", onKeyUp);
	grip.addEventListener("focus", onFocus);
	grip.addEventListener("blur", onBlur);

	editorCueWidthInteractionCleanup.set(card, () => {
		if (destroyed) return;
		cancel();
		destroyed = true;
		grip.removeEventListener("pointerdown", onPointerDown);
		grip.removeEventListener("pointermove", onPointerMove);
		grip.removeEventListener("pointerup", onPointerUp);
		grip.removeEventListener("pointercancel", onPointerCancel);
		grip.removeEventListener("lostpointercapture", onLostPointerCapture);
		grip.removeEventListener("keydown", onKeyDown);
		grip.removeEventListener("keyup", onKeyUp);
		grip.removeEventListener("focus", onFocus);
		grip.removeEventListener("blur", onBlur);
		editorCueWidthInteractionCleanup.delete(card);
	});
}

function editorCueWorkspaceBoundary(card: HTMLElement): HTMLElement | null {
	return (
		card.closest<HTMLElement>(".workspace-leaf-content") ??
		card.closest<HTMLElement>(".markdown-source-view") ??
		card.closest<HTMLElement>(".cm-editor")
	);
}

function dispatchRailCardLayoutEvent(card: HTMLElement): void {
	const CustomEventCtor = card.ownerDocument.defaultView?.CustomEvent;
	if (!CustomEventCtor) return;
	card.dispatchEvent(
		new CustomEventCtor(RAIL_CARD_LAYOUT_EVENT, { bubbles: true })
	);
}

function railCardsIn(root: ParentNode): HTMLElement[] {
	const rootElement = root as Element;
	return [
		...(rootElement.matches?.(".cuecraft-editor-rail-card")
			? [rootElement as HTMLElement]
			: []),
		...Array.from(
			root.querySelectorAll<HTMLElement>(".cuecraft-editor-rail-card")
		),
	];
}

export function railSpacerHeightForOverlap(
	cardHeight: number,
	distanceToNextCard: number,
	currentSpacerHeight = 0
): number {
	if (
		!Number.isFinite(cardHeight) ||
		!Number.isFinite(distanceToNextCard) ||
		cardHeight <= 0 ||
		distanceToNextCard <= 0
	) {
		return 0;
	}
	const desiredHeight = Math.ceil(
		Math.max(0, currentSpacerHeight) +
			cardHeight +
			RAIL_CARD_SECTION_GAP -
			distanceToNextCard
	);
	return desiredHeight > RAIL_CARD_SPACER_TOLERANCE ? desiredHeight : 0;
}

export function measureRailSpacerHeights(
	root: ParentNode,
	currentSpacers: ReadonlyMap<number, number> = emptyRailSpacerMap
): Map<number, number> {
	const cards = railCardsIn(root);
	const spacers = new Map(currentSpacers);
	for (const [index, card] of cards.entries()) {
		const nextCard = cards[index + 1];
		if (!nextCard) continue;
		const nextLine = railCardLine(nextCard);
		if (nextLine === null) continue;
		const cardRect = card.getBoundingClientRect();
		const nextRect = nextCard.getBoundingClientRect();
		const cardHeight = Math.max(cardRect.height, card.scrollHeight);
		const distanceToNextCard = nextRect.top - cardRect.top;
		if (
			!Number.isFinite(cardHeight) ||
			!Number.isFinite(distanceToNextCard) ||
			cardHeight <= 0 ||
			distanceToNextCard <= 0
		) {
			continue;
		}
		const spacerHeight = railSpacerHeightForOverlap(
			cardHeight,
			distanceToNextCard,
			currentSpacers.get(nextLine) ?? 0
		);
		if (spacerHeight > 0) {
			spacers.set(nextLine, spacerHeight);
		} else {
			spacers.delete(nextLine);
		}
	}
	return spacers;
}

function railCardLine(card: HTMLElement): number | null {
	const line = Number(card.dataset.line);
	return Number.isInteger(line) && line > 0 ? line : null;
}

function appendEditorHookDisclosure(
	parent: HTMLElement,
	kind: CueSectionKind,
	previewText: string,
	content: HTMLElement,
	collapse: CueSectionCollapseRenderState | undefined
): void {
	const doc = parent.ownerDocument;
	const button = doc.createElement("button");
	button.type = "button";
	button.className = "cuecraft-editor-hook-section-toggle";
	button.dataset.section = kind;

	const sectionLabel = doc.createElement("span");
	sectionLabel.className = "cuecraft-editor-hook-section-label";
	sectionLabel.dataset.section = kind;
	appendLabelIcon(sectionLabel, CUE_SECTION_ICON_CANDIDATES[kind]);
	appendLabelText(sectionLabel, kind.toUpperCase());

	const chevron = doc.createElement("span");
	chevron.className = "cuecraft-editor-hook-section-chevron";
	chevron.setAttribute("aria-hidden", "true");
	setIcon(chevron, "chevron-down");
	sectionLabel.appendChild(chevron);
	button.appendChild(sectionLabel);

	const preview = doc.createElement("span");
	preview.className = "cuecraft-editor-hook-section-preview";
	preview.textContent = previewText;
	button.appendChild(preview);

	const body = doc.createElement("div");
	body.className = "cuecraft-editor-hook-section-body";
	body.dataset.section = kind;
	body.id = editorHookSectionBodyId();
	const bodyContent = doc.createElement("div");
	bodyContent.className = "cuecraft-editor-hook-section-content";
	bodyContent.appendChild(content);
	body.appendChild(bodyContent);
	button.setAttribute("aria-controls", body.id);

	let collapsed = collapse?.collapsed[kind] ?? false;
	const updateDom = (): void => {
		button.setAttribute("aria-expanded", String(!collapsed));
		body.setAttribute("aria-hidden", String(collapsed));
		body.dataset.collapsed = String(collapsed);
		preview.hidden = !collapsed;
	};
	let transitionMeasurePending = false;
	body.addEventListener("transitionend", (event) => {
		if (
			event.target !== body ||
			event.propertyName !== "grid-template-rows" ||
			!transitionMeasurePending
		) {
			return;
		}
		transitionMeasurePending = false;
		dispatchRailCardLayoutEvent(parent);
	});
	updateDom();
	button.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		collapsed = !collapsed;
		if (collapse) {
			void collapse.controller
				.setCollapsed(
					collapse.notePath,
					collapse.sectionId,
					kind,
					collapsed
				)
				.catch((error: unknown) => {
					console.error(
						"CueCraft cue section collapse persistence failed",
						error
					);
				});
		}
		transitionMeasurePending = true;
		updateDom();
		dispatchRailCardLayoutEvent(parent);
	});

	parent.append(button, body);
}

function editorHookSectionBodyId(): string {
	nextEditorHookSectionBodyId += 1;
	return `cuecraft-editor-hook-section-body-${nextEditorHookSectionBodyId}`;
}

const noteBriefCardOrder = [
	"whatMatters",
	"reviewFirst",
	"sayItBack",
] as const;

const noteBriefInsightLabels: Record<(typeof noteBriefCardOrder)[number], string> =
	{
		whatMatters: "core idea",
		reviewFirst: "review first",
		sayItBack: "self-test",
	};

function noteBriefTitleWithoutRepeatedLabel(title: string, label: string): string {
	const trimmedTitle = title.trim();
	const normalizedTitle = trimmedTitle.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
	const normalizedLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
	if (normalizedTitle === normalizedLabel) return "";

	const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return trimmedTitle.replace(new RegExp(`^${escapedLabel}\\s*[:\\-]\\s*`, "i"), "").trim();
}

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
	appendLabelIcon(label, "sparkles");
	appendLabelText(label, "Note brief");
	root.appendChild(label);

	const overview = doc.createElement("p");
	overview.className = "cuecraft-note-brief-overview";
	overview.textContent = noteBrief.overview;
	root.appendChild(overview);

	const cards = doc.createElement("div");
	cards.className = "cuecraft-note-brief-insights";
	for (const key of noteBriefCardOrder) {
		const card = noteBrief[key];
		const cardEl = doc.createElement("div");
		cardEl.className = "cuecraft-note-brief-insight";
		cardEl.dataset.card = key;

		const insightLabel = noteBriefInsightLabels[key];
		const displayTitle = noteBriefTitleWithoutRepeatedLabel(card.title, insightLabel);
		if (displayTitle) {
			const title = doc.createElement("div");
			title.className = "cuecraft-note-brief-insight-title";
			title.textContent = displayTitle;
			cardEl.appendChild(title);
		}

		const detail = doc.createElement("div");
		detail.className = "cuecraft-note-brief-insight-detail";
		detail.textContent = card.detail;
		cardEl.appendChild(detail);

		const badge = doc.createElement("span");
		badge.className = "cuecraft-note-brief-insight-badge cuecraft-cue-term";
		badge.textContent = insightLabel;
		cardEl.appendChild(badge);

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

const leadingAsteriskDividerPattern = /^[ ]{0,3}(?:\*[ \t]*){3,}$/;

function noteBriefAnchor(state: EditorState): number {
	const firstLine = state.doc.line(1);
	if (!leadingAsteriskDividerPattern.test(firstLine.text)) return firstLine.to;
	return state.doc.lines > 1 ? state.doc.line(2).from : firstLine.from;
}

/** Replace all cues currently rendered in the editor. */
export const setCuesEffect = StateEffect.define<CueEditorRenderState>();
export const setRailSpacersEffect =
	StateEffect.define<ReadonlyMap<number, number>>();

const emptyCueGutterMarkers = RangeSet.of<GutterMarker>([]);
const emptyRailSpacerMap = new Map<number, number>();

export function buildEditorStudyAnswerDecorations(
	state: EditorState,
	snapshot: StudySessionSnapshot | null | undefined
): DecorationSet {
	if (!snapshot?.active) return Decoration.none;
	const ranges: Range<Decoration>[] = [];
	for (const section of snapshot.sections) {
		if (section.revealed) continue;
		const { from, to } = section.bodyRange;
		if (from < 0 || to <= from || to > state.doc.length) continue;
		ranges.push(
			Decoration.mark({
				class: "cuecraft-editor-study-answer is-hidden",
				attributes: {
					"aria-hidden": "true",
					"data-study-section-id": section.sectionId,
				},
			}).range(from, to)
		);
	}
	return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

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
			}).range(noteBriefAnchor(state))
		);
	}

	if (!isInlineEditorDisplay(payload.display)) {
		return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
	}

	for (const [index, cue] of payload.cues.entries()) {
		if (cue.line < 1 || cue.line > doc.lines) continue;
		const headingLine = doc.line(cue.line);
		const cueOptions = {
			...options,
			...cueCollapseRenderOptions(payload, cue),
			...cueStudyRenderOptions(payload, cue),
		};
		// Block widget rendered on its own line just after the heading.
		ranges.push(
			Decoration.widget({
				widget: new CueWidget(cue, payload.display, index, cueOptions),
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
		const markerLine = doc.line(cue.line);
		const cardState = cue.line === currentCueLine ? "current" : "upcoming";
		const markerOptions = {
			...options,
			...cueCollapseRenderOptions(payload, cue),
			...cueStudyRenderOptions(payload, cue),
		};
		builder.add(
			markerLine.from,
			markerLine.from,
			new CueGutterMarker(cue, payload.display, index, cardState, markerOptions)
		);
	}
	return builder.finish();
}

export function buildRailSpacerDecorations(
	state: EditorState,
	payload: CueEditorRenderState | null,
	spacers: ReadonlyMap<number, number>
): DecorationSet {
	if (!payload || !railLayoutAppliesToDisplay(payload.display)) {
		return Decoration.none;
	}
	const ranges: Range<Decoration>[] = [];
	for (const [line, height] of spacers.entries()) {
		if (height <= RAIL_CARD_SPACER_TOLERANCE) continue;
		if (line < 1 || line > state.doc.lines) continue;
		ranges.push(
			Decoration.widget({
				widget: new RailSpacerWidget(Math.ceil(height)),
				block: true,
				side: -1,
			}).range(state.doc.line(line).from)
		);
	}
	return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

function editorCueRenderOptionsFromPayload(
	payload: CueEditorRenderState
): CueRenderOptions {
	return {
		showSummary: payload.showRailSummary ?? true,
		showQuestion: payload.showRailQuestions ?? true,
		showSupportTerms: payload.showRailSupportTerms ?? true,
		cueColumnWidth: payload.cueColumnWidth,
		cueFontSize: payload.cueFontSize,
		editorCueWidthController: payload.editorCueWidthController,
	};
}

function editorHookCardOptionsKey(options: CueRenderOptions): string {
	return [
		options.showSummary ?? true,
		options.showQuestion ?? true,
		options.showSupportTerms ?? true,
		options.cueColumnWidth ?? "",
		options.cueFontSize ?? "",
		options.collapse?.notePath ?? "",
		options.collapse?.sectionId ?? "",
		options.study?.sectionId ?? "",
		String(options.study?.revealed ?? false),
		...CUE_SECTION_KINDS.map((kind) =>
			String(options.collapse?.collapsed[kind] ?? false)
		),
	].join("\u0001");
}

function cueStudyRenderOptions(
	payload: CueEditorRenderState,
	cue: CueLineData
): Pick<CueRenderOptions, "study"> {
	const projection = payload.study;
	if (!projection?.snapshot.active || cue.error || cue.question.trim().length === 0) {
		return {};
	}
	const section = projection.snapshot.sections.find(
		(candidate) => candidate.sectionId === cue.sectionId
	);
	if (!section) return {};
	return {
		study: {
			sectionId: section.sectionId,
			revealed: section.revealed,
			toggleSection: projection.toggleSection,
		},
	};
}

function cueCollapseRenderOptions(
	payload: CueEditorRenderState,
	cue: CueLineData
): Pick<CueRenderOptions, "collapse"> {
	if (
		!sectionDisclosuresApplyToDisplay(payload.display) ||
		!payload.notePath ||
		!payload.collapseController
	) {
		return {};
	}
	const notePath = payload.notePath;
	const controller = payload.collapseController;
	return {
		collapse: {
			notePath,
			sectionId: cue.sectionId,
			controller,
			collapsed: cueSectionCollapsedState(
				controller,
				notePath,
				cue.sectionId
			),
		},
	};
}

function cueSectionCollapsedState(
	controller: CueSectionCollapseController,
	notePath: string,
	sectionId: string
): Record<CueSectionKind, boolean> {
	return {
		summary: controller.isCollapsed(notePath, sectionId, "summary"),
		question: controller.isCollapsed(notePath, sectionId, "question"),
		terms: controller.isCollapsed(notePath, sectionId, "terms"),
	};
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

function cornellEditorDisplayStyle(
	display: EditorCueDisplay
): CornellStyle | null {
	switch (display) {
		case "cornell":
			return "classic";
		default:
			return null;
	}
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

function mapRailSpacersThroughChanges(
	spacers: ReadonlyMap<number, number>,
	tr: Transaction
): Map<number, number> {
	if (!tr.docChanged || spacers.size === 0) return new Map(spacers);
	const mapped = new Map<number, number>();
	for (const [line, height] of spacers.entries()) {
		const nextLine = mapCueLineThroughChanges(line, tr);
		const previous = mapped.get(nextLine) ?? 0;
		mapped.set(nextLine, Math.max(previous, height));
	}
	return mapped;
}

function normalizeRailSpacers(
	spacers: ReadonlyMap<number, number>
): Map<number, number> {
	const normalized = new Map<number, number>();
	for (const [line, height] of spacers.entries()) {
		if (!Number.isInteger(line) || line < 1) continue;
		if (!Number.isFinite(height) || height <= RAIL_CARD_SPACER_TOLERANCE) {
			continue;
		}
		normalized.set(line, Math.ceil(height));
	}
	return normalized;
}

function railSpacerMapsEqual(
	a: ReadonlyMap<number, number>,
	b: ReadonlyMap<number, number>
): boolean {
	if (a.size !== b.size) return false;
	for (const [line, height] of a.entries()) {
		if (b.get(line) !== height) return false;
	}
	return true;
}

function mapStudySnapshotThroughChanges(
	snapshot: StudySessionSnapshot,
	tr: Transaction
): StudySessionSnapshot {
	if (!tr.docChanged) return snapshot;
	const sections = snapshot.sections.map((section) => {
		const headingFrom = tr.changes.mapPos(section.headingRange.from, -1);
		const headingTo = tr.changes.mapPos(section.headingRange.to, 1);
		const bodyFrom = tr.changes.mapPos(section.bodyRange.from, -1);
		const bodyTo = tr.changes.mapPos(section.bodyRange.to, 1);
		const headingPos = Math.min(headingFrom, tr.state.doc.length);
		const bodyStartPos = Math.min(bodyFrom, tr.state.doc.length);
		const bodyEndPos = Math.min(Math.max(bodyFrom, bodyTo - 1), tr.state.doc.length);
		return {
			...section,
			headingLine: tr.state.doc.lineAt(headingPos).number,
			bodyStartLine: tr.state.doc.lineAt(bodyStartPos).number,
			bodyEndLine: tr.state.doc.lineAt(bodyEndPos).number,
			headingRange: { from: headingFrom, to: headingTo },
			bodyRange: { from: bodyFrom, to: bodyTo },
		};
	});
	return { ...snapshot, sections };
}

export interface CueStudyFieldState {
	decorations: DecorationSet;
	projection: StudyProjection | null;
}

export const cueStudyField = StateField.define<CueStudyFieldState>({
	create() {
		return { decorations: Decoration.none, projection: null };
	},
	update(value, tr) {
		let projection = value.projection;
		let rebuild = false;
		for (const effect of tr.effects) {
			if (effect.is(setCuesEffect)) {
				projection = effect.value.study ?? null;
				rebuild = true;
			}
		}
		if (projection && tr.docChanged && !rebuild) {
			projection = {
				...projection,
				snapshot: mapStudySnapshotThroughChanges(projection.snapshot, tr),
			};
			rebuild = true;
		}
		if (!rebuild) return value;
		return {
			decorations: buildEditorStudyAnswerDecorations(
				tr.state,
				projection?.snapshot
			),
			projection,
		};
	},
	provide: (field) =>
		EditorView.decorations.from(field, (value) => value.decorations),
});

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

export interface CueRailSpacerState {
	decorations: DecorationSet;
	payload: CueEditorRenderState | null;
	spacers: ReadonlyMap<number, number>;
}

export const cueRailSpacerField = StateField.define<CueRailSpacerState>({
	create() {
		return {
			decorations: Decoration.none,
			payload: null,
			spacers: emptyRailSpacerMap,
		};
	},
	update(value, tr) {
		let payload = value.payload;
		let spacers = value.spacers;
		let rebuild = false;

		for (const effect of tr.effects) {
			if (effect.is(setCuesEffect)) {
				payload = effect.value;
				spacers = emptyRailSpacerMap;
				rebuild = true;
			}
			if (effect.is(setRailSpacersEffect)) {
				spacers = normalizeRailSpacers(effect.value);
				rebuild = true;
			}
		}

		if (!payload) {
			return {
				decorations: Decoration.none,
				payload,
				spacers: emptyRailSpacerMap,
			};
		}

		if (tr.docChanged) {
			payload = mapCuePayloadThroughChanges(payload, tr);
			spacers = mapRailSpacersThroughChanges(spacers, tr);
			rebuild = true;
		}

		if (!railLayoutAppliesToDisplay(payload.display)) {
			return {
				decorations: Decoration.none,
				payload,
				spacers: emptyRailSpacerMap,
			};
		}

		if (!rebuild) return value;
		return {
			decorations: buildRailSpacerDecorations(tr.state, payload, spacers),
			payload,
			spacers,
		};
	},
	provide: (f) => EditorView.decorations.from(f, (value) => value.decorations),
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

export function scheduleRailLayoutMeasure(view: EditorView): void {
	if (!viewHasRailCards(view)) return;
	view.requestMeasure({
		read: () => {
			const state = view.state;
			const currentSpacers =
				state.field(cueRailSpacerField, false)?.spacers ??
				emptyRailSpacerMap;
			return {
				state,
				spacers: measureRailSpacerHeights(view.dom, currentSpacers),
			};
		},
		write: (measurement) => {
			queueMicrotask(() => {
				if (view.state !== measurement.state) {
					return;
				}
				const latestSpacers =
					view.state.field(cueRailSpacerField, false)?.spacers ??
					emptyRailSpacerMap;
				if (!railSpacerMapsEqual(latestSpacers, measurement.spacers)) {
					view.dispatch({
						effects: setRailSpacersEffect.of(measurement.spacers),
					});
				}
			});
		},
	});
}

function viewHasRailCards(view: EditorView): boolean {
	const cueGutterState = view.state.field(cueGutterField, false);
	return cueGutterState?.payload
		? railLayoutAppliesToDisplay(cueGutterState.payload.display)
		: false;
}

const cueRailLayoutPlugin = ViewPlugin.fromClass(
	class {
		private readonly onRailCardLayout = () => {
			scheduleRailLayoutMeasure(this.view);
		};

		constructor(private readonly view: EditorView) {
			view.dom.addEventListener(
				RAIL_CARD_LAYOUT_EVENT,
				this.onRailCardLayout
			);
			scheduleRailLayoutMeasure(view);
		}

		update(update: ViewUpdate): void {
			if (railLayoutUpdateNeedsMeasure(update)) {
				scheduleRailLayoutMeasure(this.view);
			}
		}

		destroy(): void {
			cancelEditorCueWidthLayout(this.view.dom);
			this.view.dom.removeEventListener(
				RAIL_CARD_LAYOUT_EVENT,
				this.onRailCardLayout
			);
		}
	}
);

const cueEditorStudyPlugin = ViewPlugin.fromClass(
	class {
		private controlHost: HTMLElement | null = null;
		private controlCleanup: (() => void) | null = null;
		private destroyed = false;

		constructor(private readonly view: EditorView) {
			this.renderControls();
		}

		update(update: ViewUpdate): void {
			if (update.docChanged) {
				const projection = this.view.state.field(cueStudyField).projection;
				const documentChanged = projection?.documentChanged;
				const markdown = update.state.doc.toString();
				if (documentChanged) {
					queueMicrotask(() => {
						if (this.destroyed) return;
						const current = this.view.state.field(cueStudyField).projection;
						if (
							current?.documentChanged === documentChanged &&
							this.view.state.doc.toString() === markdown
						) {
							documentChanged(markdown);
						}
					});
				}
			}
			if (
				update.transactions.some((tr) =>
					tr.effects.some((effect) => effect.is(setCuesEffect))
				)
			) {
				this.renderControls();
			}
		}

		private renderControls(): void {
			this.removeControls();
			const projection = this.view.state.field(cueStudyField).projection;
			const snapshot = projection?.snapshot;
			const active = Boolean(projection && snapshot?.active);
			this.view.dom.classList.toggle("cuecraft-editor-study-active", active);
			if (!projection || !snapshot?.active) return;

			const doc = this.view.dom.ownerDocument;
			const host = doc.createElement("div");
			host.className = "cuecraft-editor-study-controls";
			host.setAttribute("role", "region");
			host.setAttribute("aria-label", "Study controls");

			const help = doc.createElement("span");
			help.className = "cuecraft-study-help";
			setIcon(help, "circle-help");
			help.append("Use the eye buttons on cue cards to show or hide sections");

			const progress = doc.createElement("span");
			progress.className = "cuecraft-editor-study-progress";
			progress.setAttribute("aria-live", "polite");
			progress.textContent = `${snapshot.revealedCount} / ${snapshot.total} revealed`;

			const progressTrack = doc.createElement("div");
			progressTrack.className = "cuecraft-study-progress-track";
			progressTrack.setAttribute("role", "progressbar");
			progressTrack.setAttribute("aria-valuemin", "0");
			progressTrack.setAttribute("aria-valuemax", String(snapshot.total));
			progressTrack.setAttribute(
				"aria-valuenow",
				String(snapshot.revealedCount)
			);
			progressTrack.setAttribute("aria-label", "Sections revealed");
			const progressFill = doc.createElement("div");
			progressFill.className = "cuecraft-study-progress-fill";
			progressFill.style.width = `${
				snapshot.total > 0
					? (snapshot.revealedCount / snapshot.total) * 100
					: 0
			}%`;
			progressTrack.append(progressFill);

			const showAll = doc.createElement("button");
			showAll.type = "button";
			showAll.className =
				"cuecraft-study-action cuecraft-editor-study-show-all";
			setIcon(showAll, "eye");
			showAll.append("Show All Sections");
			showAll.disabled = snapshot.revealedCount === snapshot.total;

			const hideAll = doc.createElement("button");
			hideAll.type = "button";
			hideAll.className =
				"cuecraft-study-action cuecraft-editor-study-hide-all";
			setIcon(hideAll, "eye-off");
			hideAll.append("Hide All Sections");
			hideAll.disabled = snapshot.revealedCount === 0;

			const exit = doc.createElement("button");
			exit.type = "button";
			exit.className = "cuecraft-study-action cuecraft-editor-study-exit";
			setIcon(exit, "log-out");
			exit.append("Exit Study Mode");

			const onShowAll = () => projection.showAll();
			const onHideAll = () => projection.hideAll();
			const onExit = () => projection.exit();
			showAll.addEventListener("click", onShowAll);
			hideAll.addEventListener("click", onHideAll);
			exit.addEventListener("click", onExit);
			const actions = doc.createElement("div");
			actions.className = "cuecraft-study-actions";
			actions.append(showAll, hideAll, exit);
			host.append(help, progress, progressTrack, actions);
			(projection.controlsContainer ?? this.view.scrollDOM).prepend(host);
			this.controlHost = host;
			this.controlCleanup = () => {
				showAll.removeEventListener("click", onShowAll);
				hideAll.removeEventListener("click", onHideAll);
				exit.removeEventListener("click", onExit);
			};
		}

		private removeControls(): void {
			this.controlCleanup?.();
			this.controlCleanup = null;
			this.controlHost?.remove();
			this.controlHost = null;
		}

		destroy(): void {
			this.destroyed = true;
			this.removeControls();
			this.view.dom.classList.remove("cuecraft-editor-study-active");
		}
	}
);

export function railLayoutUpdateNeedsMeasure(update: ViewUpdate): boolean {
	const cuesChanged = update.transactions.some((tr) =>
		tr.effects.some((effect) => effect.is(setCuesEffect))
	);
	const spacersChanged = update.transactions.some((tr) =>
		tr.effects.some((effect) => effect.is(setRailSpacersEffect))
	);
	if (spacersChanged && !cuesChanged && !update.docChanged) {
		return false;
	}
	return (
		update.docChanged ||
		update.viewportChanged ||
		update.selectionSet ||
		cuesChanged
	);
}

/** Editor extension that renders CueCraft cues. Register via registerEditorExtension. */
export const cueEditorExtension = [
	cueField,
	cueStudyField,
	cueRailSpacerField,
	cueGutterField,
	cueGutter,
	cueRailLayoutPlugin,
	cueEditorStudyPlugin,
];
