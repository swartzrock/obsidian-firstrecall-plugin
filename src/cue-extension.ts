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
import { setIcon } from "obsidian";
import type { NoteCache } from "./cache";
import {
	buildEditorHookCard,
	editorHookTitleDensity,
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
import {
	DEFAULT_EDITOR_HOOK_CARD_STYLE,
	type EditorHookCardStyle,
} from "./editor-hook-card-style";
import { isCueEligibleSection, type Section } from "./parser";
import type { NoteBriefOutput, SectionLens } from "./schemas";
import {
	CUE_SECTION_KINDS,
	type CueSectionCollapseController,
	type CueSectionKind,
} from "./cue-section-collapse";

export type Confidence = "high" | "medium" | "low";

const QUESTION_ICON_CANDIDATES = [
	"circle-question-mark",
	"circle-help",
	"help-circle",
] as const;
const SUMMARY_ICON_CANDIDATES = ["notebook-text", "file-text"] as const;
const TERMS_ICON_CANDIDATES = ["tags", "tag"] as const;
let nextEditorHookSectionBodyId = 0;

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
	notePath?: string;
	collapseController?: CueSectionCollapseController;
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
	collapse?: CueSectionCollapseRenderState;
}

interface CueSectionCollapseRenderState {
	notePath: string;
	sectionId: string;
	controller: CueSectionCollapseController;
	collapsed: Record<CueSectionKind, boolean>;
}

export const RAIL_CARD_COLLAPSED_MIN_HEIGHT = 112;
export const RAIL_CARD_COLLAPSED_DEFAULT_HEIGHT = 176;
export const RAIL_CARD_COLLAPSED_MAX_HEIGHT = 288;
const RAIL_CARD_SECTION_GAP = 12;
const RAIL_CARD_OVERFLOW_TOLERANCE = 1;
const RAIL_CARD_SPACER_TOLERANCE = 1;
export const RAIL_CARD_TOGGLE_EVENT = "cuecraft-rail-card-toggle";

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
			other.cue.sectionId === this.cue.sectionId &&
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
			other.cue.sectionId === this.cue.sectionId &&
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
	const cornellStyle = cornellEditorDisplayStyle(display);
	if (cornellStyle) {
		return renderCornellCueElement(cue, display, cornellStyle, state, options);
	}
	if (!isInlineEditorDisplay(display)) {
		return renderEditorHookElement(
			buildEditorHookCard(cue, display, index, state, options),
			options
		);
	}
	return renderInlineCueElement(cue, options);
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
	root.dataset.questionVisible = String(options.showQuestion ?? true);
	root.dataset.supportTermsVisible = String(options.showSupportTerms ?? true);
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
		return finalizeRailOverflowCard(root);
	}

	if (cue.confidence) {
		card.dataset.confidence = cue.confidence;
	}
	if (options.showQuestion ?? true) {
		appendCueSectionLabel(card, "QUESTION");
		const q = doc.createElement("div");
		q.className = "cuecraft-cornell-q";
		q.textContent = cue.question;
		card.appendChild(q);
	}

	appendSectionLens(card, cue.sectionLens);

	const supports = buildCornellSupportPresentation({
		keywords: cue.keywords,
	});
	if ((options.showSupportTerms ?? true) && supports.terms.length) {
		appendCueSectionLabel(card, "TERMS");
		const kw = doc.createElement("div");
		kw.className = "cuecraft-cornell-kw";
		appendCueTerms(kw, supports.terms, "cuecraft-cornell-support-term");
		card.appendChild(kw);
	}

	return finalizeRailOverflowCard(root);
}

function renderInlineCueElement(
	cue: CueLineData,
	options: CueRenderOptions = {}
): HTMLElement {
	const root = cueDocument().createElement("div");
	root.className = "cuecraft-cue";
	root.dataset.questionVisible = String(options.showQuestion ?? true);
	root.dataset.supportTermsVisible = String(options.showSupportTerms ?? true);
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
	if (options.showQuestion ?? true) {
		appendCueSectionLabel(root, "QUESTION");
		const q = cueDocument().createElement("div");
		q.className = "cuecraft-cue-question";
		q.textContent = cue.question;
		root.appendChild(q);
	}

	appendSectionLens(root, cue.sectionLens);

	if ((options.showSupportTerms ?? true) && cue.keywords.length) {
		appendCueSectionLabel(root, "TERMS");
		const kw = cueDocument().createElement("div");
		kw.className = "cuecraft-cue-keywords";
		appendCueTerms(kw, cue.keywords);
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
	root.dataset.space = card.compactForSpace ? "compact" : "normal";
	if (card.confidence) root.dataset.confidence = card.confidence;
	if (card.kind === "failed") root.classList.add("cuecraft-editor-hook-failed");

	let hasContent = false;
	if (card.sectionLens && showSectionLabels) {
		const summary = cueDocument().createElement("div");
		summary.className = "cuecraft-section-lens";
		const takeaway = cueDocument().createElement("span");
		takeaway.className = "cuecraft-section-lens-takeaway";
		takeaway.textContent = card.sectionLens.takeaway;
		summary.appendChild(takeaway);
		appendEditorHookDisclosure(
			root,
			"Summary",
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
				"Question",
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
		return railOverflowAppliesToDisplay(card.display)
			? finalizeRailOverflowCard(root)
			: root;
	}

	if (card.sectionLens && !showSectionLabels) {
		appendSectionLens(root, card.sectionLens);
		hasContent = true;
	}

	if (card.showSupportTerms && card.keywords.length) {
		const keywords = cueDocument().createElement("div");
		keywords.className = "cuecraft-editor-hook-keywords";
		const renderedKeywords =
			card.display === "anchored-card-rail"
				? card.keywords.slice(0, 4)
				: card.keywords;
		appendCueTerms(keywords, renderedKeywords);
		if (showSectionLabels) {
			appendEditorHookDisclosure(
				root,
				"Terms",
				renderedKeywords.join(", "),
				keywords,
				options.collapse
			);
		} else {
			root.appendChild(keywords);
		}
		hasContent = true;
	}
	if (!hasContent) root.classList.add("cuecraft-editor-hook-empty");
	return railOverflowAppliesToDisplay(card.display)
		? finalizeRailOverflowCard(root)
		: root;
}

function appendCueSectionLabel(parent: HTMLElement, label: string): void {
	const sectionLabel = parent.ownerDocument.createElement("div");
	sectionLabel.className = "cuecraft-cue-section-label";
	if (label === "QUESTION") {
		appendLabelIcon(sectionLabel, QUESTION_ICON_CANDIDATES);
	}
	appendLabelText(sectionLabel, label);
	parent.appendChild(sectionLabel);
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

function railOverflowAppliesToDisplay(display: EditorCueDisplay): boolean {
	return (
		display === "anchored-card-rail" ||
		display === "threaded-margin-notes" ||
		cornellEditorDisplayStyle(display) !== null
	);
}

function finalizeRailOverflowCard(root: HTMLElement): HTMLElement {
	root.classList.add("cuecraft-editor-rail-card");
	root.dataset.overflowing = "false";
	root.dataset.expanded = "false";

	const doc = root.ownerDocument;
	const content = doc.createElement("div");
	content.className = "cuecraft-editor-rail-card-content";
	while (root.firstChild) {
		content.appendChild(root.firstChild);
	}
	root.appendChild(content);

	const toggle = doc.createElement("button");
	toggle.type = "button";
	toggle.className = "cuecraft-editor-rail-card-toggle";
	toggle.textContent = "Show more";
	toggle.setAttribute("aria-expanded", "false");
	toggle.hidden = true;
	toggle.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		setRailCardExpanded(root, toggle, root.dataset.expanded !== "true");
		dispatchRailCardToggleEvent(root);
	});
	root.appendChild(toggle);

	return root;
}

function setRailCardExpanded(
	card: HTMLElement,
	toggle: HTMLButtonElement,
	expanded: boolean
): void {
	card.dataset.expanded = String(expanded);
	toggle.textContent = expanded ? "Show less" : "Show more";
	toggle.setAttribute("aria-expanded", String(expanded));
}

function dispatchRailCardToggleEvent(card: HTMLElement): void {
	const CustomEventCtor = card.ownerDocument.defaultView?.CustomEvent;
	if (!CustomEventCtor) return;
	card.dispatchEvent(
		new CustomEventCtor(RAIL_CARD_TOGGLE_EVENT, { bubbles: true })
	);
}

export function railCardCollapsedHeightForAvailable(
	availableHeight: number | null | undefined
): number {
	if (typeof availableHeight !== "number" || !Number.isFinite(availableHeight)) {
		return RAIL_CARD_COLLAPSED_DEFAULT_HEIGHT;
	}
	const usableHeight = Math.floor(availableHeight - RAIL_CARD_SECTION_GAP);
	return Math.max(
		RAIL_CARD_COLLAPSED_MIN_HEIGHT,
		Math.min(RAIL_CARD_COLLAPSED_MAX_HEIGHT, usableHeight)
	);
}

export function railCardContentOverflows(
	contentHeight: number,
	collapsedHeight: number
): boolean {
	return contentHeight > collapsedHeight + RAIL_CARD_OVERFLOW_TOLERANCE;
}

export interface RailOverflowMeasurement {
	card: HTMLElement;
	collapsedHeight: number;
	overflowing: boolean;
}

export function measureRailOverflowCards(
	root: ParentNode
): RailOverflowMeasurement[] {
	const cards = railCardsIn(root);
	return cards.map((card, index) => {
		const nextCard = cards[index + 1];
		const cardTop = card.getBoundingClientRect().top;
		const nextCardTop = nextCard?.getBoundingClientRect().top;
		const availableHeight =
			typeof nextCardTop === "number" ? nextCardTop - cardTop : null;
		const collapsedHeight =
			railCardCollapsedHeightForAvailable(availableHeight);
		const content = card.querySelector<HTMLElement>(
			":scope > .cuecraft-editor-rail-card-content"
		);
		const contentHeight = content?.scrollHeight ?? card.scrollHeight;
		return {
			card,
			collapsedHeight,
			overflowing: railCardContentOverflows(contentHeight, collapsedHeight),
		};
	});
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
	const spacers = new Map<number, number>();
	for (const [index, card] of cards.entries()) {
		const nextCard = cards[index + 1];
		if (!nextCard) continue;
		const nextLine = railCardLine(nextCard);
		if (nextLine === null) continue;
		const cardRect = card.getBoundingClientRect();
		const nextRect = nextCard.getBoundingClientRect();
		const spacerHeight = railSpacerHeightForOverlap(
			cardRect.height,
			nextRect.top - cardRect.top,
			currentSpacers.get(nextLine) ?? 0
		);
		if (spacerHeight > 0) {
			spacers.set(nextLine, spacerHeight);
		}
	}
	return spacers;
}

function railCardLine(card: HTMLElement): number | null {
	const line = Number(card.dataset.line);
	return Number.isInteger(line) && line > 0 ? line : null;
}

export function applyRailOverflowMeasurements(
	measurements: readonly RailOverflowMeasurement[]
): void {
	for (const measurement of measurements) {
		const { card, collapsedHeight, overflowing } = measurement;
		card.style.setProperty(
			"--cuecraft-rail-collapsed-max-height",
			`${collapsedHeight}px`
		);
		card.dataset.overflowing = String(overflowing);
		const toggle = card.querySelector<HTMLButtonElement>(
			":scope > .cuecraft-editor-rail-card-toggle"
		);
		if (!toggle) continue;
		toggle.hidden = !overflowing;
		if (!overflowing) {
			setRailCardExpanded(card, toggle, false);
		}
	}
}

function appendEditorHookDisclosure(
	parent: HTMLElement,
	label: "Question" | "Summary" | "Terms",
	previewText: string,
	content: HTMLElement,
	collapse: CueSectionCollapseRenderState | undefined
): void {
	const doc = parent.ownerDocument;
	const kind = label.toLowerCase() as CueSectionKind;
	const button = doc.createElement("button");
	button.type = "button";
	button.className = "cuecraft-editor-hook-section-toggle";
	button.dataset.section = kind;

	const sectionLabel = doc.createElement("span");
	sectionLabel.className = "cuecraft-editor-hook-section-label";
	sectionLabel.dataset.section = kind;
	let icon: readonly string[] = TERMS_ICON_CANDIDATES;
	if (label === "Question") {
		icon = QUESTION_ICON_CANDIDATES;
	} else if (label === "Summary") {
		icon = SUMMARY_ICON_CANDIDATES;
	}
	appendLabelIcon(sectionLabel, icon);
	appendLabelText(sectionLabel, label.toUpperCase());

	const chevron = doc.createElement("span");
	chevron.className = "cuecraft-editor-hook-section-chevron";
	chevron.setAttribute("aria-hidden", "true");
	sectionLabel.appendChild(chevron);
	button.appendChild(sectionLabel);

	const preview = doc.createElement("span");
	preview.className = "cuecraft-editor-hook-section-preview";
	preview.textContent = previewText;
	button.appendChild(preview);

	const body = doc.createElement("div");
	body.className = "cuecraft-editor-hook-section-body";
	body.dataset.section = kind;
	body.id = editorHookSectionBodyId(doc);
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
		body.hidden = collapsed;
		preview.hidden = !collapsed;
		chevron.replaceChildren();
		setIcon(chevron, collapsed ? "chevron-right" : "chevron-down");
	};
	updateDom();
	button.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		collapsed = !collapsed;
		if (collapse) {
			void collapse.controller.setCollapsed(
				collapse.notePath,
				collapse.sectionId,
				kind,
				collapsed
			);
		}
		updateDom();
	});

	parent.append(button, body);
}

function editorHookSectionBodyId(doc: Document): string {
	let id: string;
	do {
		nextEditorHookSectionBodyId += 1;
		id = `cuecraft-editor-hook-section-body-${nextEditorHookSectionBodyId}`;
	} while (doc.getElementById(id));
	return id;
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
const compactLineGapByTitleDensity: Record<
	EditorHookCard["titleDensity"],
	number
> = {
	standard: 6,
	long: 7,
	dense: 8,
};
const emptyRailSpacerMap = new Map<number, number>();

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
		const markerLine = cueGutterMarkerLine(doc, cue.line, payload.display);
		const cardState = cue.line === currentCueLine ? "current" : "upcoming";
		const compactForSpace = cueNeedsSpaceCompaction(
			doc,
			payload,
			index,
			markerLine.number,
			cue
		);
		const markerOptions = compactForSpace
			? {
					...options,
					...cueCollapseRenderOptions(payload, cue),
					compactForSpace: true,
				}
			: { ...options, ...cueCollapseRenderOptions(payload, cue) };
		builder.add(
			markerLine.from,
			markerLine.from,
			new CueGutterMarker(cue, payload.display, index, cardState, markerOptions)
		);
	}
	return builder.finish();
}

function cueNeedsSpaceCompaction(
	doc: EditorState["doc"],
	payload: CueEditorRenderState,
	index: number,
	markerLine: number,
	cue: CueLineData
): boolean {
	if (payload.display !== "anchored-card-rail") return false;
	const nextCue = payload.cues
		.slice(index + 1)
		.find((cue) => cue.line >= 1 && cue.line <= doc.lines);
	if (!nextCue) return false;
	const nextMarkerLine = cueGutterMarkerLine(
		doc,
		nextCue.line,
		payload.display
	).number;
	const titleDensity = editorHookTitleDensity(cue);
	const maximumLineGap = compactLineGapByTitleDensity[titleDensity];
	return nextMarkerLine - markerLine <= maximumLineGap;
}

function cueGutterMarkerLine(
	doc: EditorState["doc"],
	cueLine: number,
	display: EditorCueDisplay
): ReturnType<EditorState["doc"]["line"]> {
	if (display === "anchored-card-rail" && cueLine < doc.lines) {
		return doc.line(cueLine + 1);
	}
	return doc.line(cueLine);
}

export function buildRailSpacerDecorations(
	state: EditorState,
	payload: CueEditorRenderState | null,
	spacers: ReadonlyMap<number, number>
): DecorationSet {
	if (!payload || !railOverflowAppliesToDisplay(payload.display)) {
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
		options.compactForSpace ?? false,
		options.cardStyle ?? DEFAULT_EDITOR_HOOK_CARD_STYLE,
		options.cueColumnWidth ?? "",
		options.cueFontSize ?? "",
		options.collapse?.notePath ?? "",
		options.collapse?.sectionId ?? "",
		...CUE_SECTION_KINDS.map((kind) =>
			String(options.collapse?.collapsed[kind] ?? false)
		),
	].join("\u0001");
}

function cueCollapseRenderOptions(
	payload: CueEditorRenderState,
	cue: CueLineData
): Pick<CueRenderOptions, "collapse"> {
	if (
		payload.display !== "anchored-card-rail" ||
		!payload.notePath ||
		!payload.collapseController
	) {
		return {};
	}
	const notePath = payload.notePath;
	const controller = payload.collapseController;
	const collapsed: Record<CueSectionKind, boolean> = {
		summary: controller.isCollapsed(notePath, cue.sectionId, "summary"),
		question: controller.isCollapsed(notePath, cue.sectionId, "question"),
		terms: controller.isCollapsed(notePath, cue.sectionId, "terms"),
	};
	return {
		collapse: {
			notePath,
			sectionId: cue.sectionId,
			controller,
			collapsed,
		},
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
		case "cornell-exam-prep":
			return "exam-prep";
		case "cornell-minimal":
			return "minimal";
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

		if (!railOverflowAppliesToDisplay(payload.display)) {
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

function scheduleRailOverflowMeasure(view: EditorView): void {
	if (!viewHasRailOverflowCards(view)) return;
	const currentSpacers =
		view.state.field(cueRailSpacerField, false)?.spacers ??
		emptyRailSpacerMap;
	view.requestMeasure({
		read: () => ({
			overflow: measureRailOverflowCards(view.dom),
			spacers: measureRailSpacerHeights(view.dom, currentSpacers),
		}),
		write: (measurements) => {
			applyRailOverflowMeasurements(measurements.overflow);
			const latestSpacers =
				view.state.field(cueRailSpacerField, false)?.spacers ??
				emptyRailSpacerMap;
			if (!railSpacerMapsEqual(latestSpacers, measurements.spacers)) {
				view.dispatch({
					effects: setRailSpacersEffect.of(measurements.spacers),
				});
			}
		},
	});
}

function viewHasRailOverflowCards(view: EditorView): boolean {
	const cueGutterState = view.state.field(cueGutterField, false);
	return cueGutterState?.payload
		? railOverflowAppliesToDisplay(cueGutterState.payload.display)
		: false;
}

const cueRailOverflowPlugin = ViewPlugin.fromClass(
	class {
		private readonly onRailCardToggle = () => {
			scheduleRailOverflowMeasure(this.view);
		};

		constructor(private readonly view: EditorView) {
			view.dom.ownerDocument.addEventListener(
				RAIL_CARD_TOGGLE_EVENT,
				this.onRailCardToggle
			);
			scheduleRailOverflowMeasure(view);
		}

		update(update: ViewUpdate): void {
			if (railOverflowUpdateNeedsMeasure(update)) {
				scheduleRailOverflowMeasure(this.view);
			}
		}

		destroy(): void {
			this.view.dom.ownerDocument.removeEventListener(
				RAIL_CARD_TOGGLE_EVENT,
				this.onRailCardToggle
			);
		}
	}
);

export function railOverflowUpdateNeedsMeasure(update: ViewUpdate): boolean {
	return (
		update.docChanged ||
		update.viewportChanged ||
		update.selectionSet ||
		update.transactions.some((tr) =>
			tr.effects.some(
				(effect) =>
					effect.is(setCuesEffect) || effect.is(setRailSpacersEffect)
			)
		)
	);
}

/** Editor extension that renders CueCraft cues. Register via registerEditorExtension. */
export const cueEditorExtension = [
	cueField,
	cueRailSpacerField,
	cueGutterField,
	cueGutter,
	cueRailOverflowPlugin,
];
