import type { Confidence, CornellModel, CornellRow } from "./cornell";

export interface ShortFormHookCard {
	kind: "hook";
	sectionId: string;
	heading: string;
	hookTitle: string;
	originalQuestion: string;
	confidence: Confidence | null;
}

export interface ShortFormHookFailedCard {
	kind: "failed";
	sectionId: string;
	heading: string;
	error: string;
	label: string;
}

export type ShortFormHookRailCard =
	| ShortFormHookCard
	| ShortFormHookFailedCard;

export interface ShortFormHookSummaryCard {
	label: string;
	takeaway: string | null;
	objective: string | null;
}

export interface ShortFormHookModel {
	cards: ShortFormHookRailCard[];
	summary: ShortFormHookSummaryCard | null;
}

export type ShortFormHookCardState = "current" | "upcoming";
export type ShortFormHookTitleDensity = "standard" | "long" | "dense";

const MAX_HOOK_TITLE_LENGTH = 104;
const MIN_HOOK_CONTENT_WORDS = 3;

export function buildShortFormHookModel(
	model: CornellModel
): ShortFormHookModel {
	return {
		cards: model.rows
			.map((row) => buildShortFormHookCard(row))
			.filter((card): card is ShortFormHookRailCard => Boolean(card)),
		summary: buildShortFormHookSummary({
			summary: model.summary,
			learningObjective: model.learningObjective,
		}),
	};
}

export function buildShortFormHookTitle(question: string | null): string | null {
	const normalized = question
		?.replace(/\s+/g, " ")
		.replace(/\s+([,.;:!?])/g, "$1")
		.trim();
	if (!normalized) return null;

	const withoutTerminalQuestion = normalized.replace(/[?\s]+$/g, "").trim();
	const title = withoutTerminalQuestion || normalized;
	if (title.length <= MAX_HOOK_TITLE_LENGTH) return title;
	return trimToWordBoundary(title, MAX_HOOK_TITLE_LENGTH);
}

export function buildShortFormHookSummary(opts: {
	summary: string | null;
	learningObjective: string | null;
}): ShortFormHookSummaryCard | null {
	const takeaway = opts.summary?.trim() || null;
	const objective = opts.learningObjective?.trim() || null;
	if (!takeaway && !objective) return null;
	return {
		label: "Synthesis",
		takeaway,
		objective,
	};
}

export function shortFormHookCardState(
	card: ShortFormHookRailCard,
	currentSectionId: string | null
): ShortFormHookCardState {
	return currentSectionId === card.sectionId ? "current" : "upcoming";
}

export function shortFormHookStatusIcon(
	state: ShortFormHookCardState
): string {
	return state === "current" ? "\u2022" : "\u25e6";
}

export function shortFormHookFocusLabel(card: ShortFormHookRailCard): string {
	const section = card.heading.trim() || "section";
	return `Focus ${section}`;
}

export function shortFormHookTitleDensity(
	title: string
): ShortFormHookTitleDensity {
	const normalized = title.replace(/\s+/g, " ").trim();
	const wordCount = normalized ? normalized.split(" ").length : 0;
	if (normalized.length > 88 || wordCount > 13) return "dense";
	if (normalized.length > 66 || wordCount > 10) return "long";
	return "standard";
}

export function applyShortFormHookFocusState(
	root: ParentNode,
	currentSectionId: string | null
): void {
	const cards = root.querySelectorAll<HTMLElement>(".cuecraft-hook-card-action");
	cards.forEach((card) => {
		const state =
			card.dataset.section === currentSectionId ? "current" : "upcoming";
		card.classList.toggle("is-current", state === "current");
		card.setAttribute("aria-current", state === "current" ? "location" : "false");
		const status = card.querySelector<HTMLElement>(".cuecraft-hook-status");
		if (status) status.textContent = shortFormHookStatusIcon(state);
	});
}

function buildShortFormHookCard(row: CornellRow): ShortFormHookRailCard | null {
	if (!hasMeaningfulHookSource(row)) return null;

	const hookTitle = buildShortFormHookTitle(row.question);
	if (row.hasCue && row.question && hookTitle) {
		return {
			kind: "hook",
			sectionId: row.id,
			heading: row.heading,
			hookTitle,
			originalQuestion: row.question,
			confidence: row.confidence,
		};
	}
	if (row.error) {
		return {
			kind: "failed",
			sectionId: row.id,
			heading: row.heading,
			error: row.error,
			label: "Cue unavailable",
		};
	}
	return null;
}

function hasMeaningfulHookSource(row: CornellRow): boolean {
	const text = visibleSectionText(row).trim();
	if (!text) return false;
	return text.split(/\s+/).filter(Boolean).length >= MIN_HOOK_CONTENT_WORDS;
}

function visibleSectionText(row: CornellRow): string {
	let content = row.content.trim();
	if (row.level === 0) {
		content = content.replace(/^---\n[\s\S]*?\n---\s*/u, "").trim();
	}
	return content
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`([^`]*)`/g, "$1")
		.replace(/!\[[^\]]*]\([^)]*\)/g, " ")
		.replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
		.replace(/[#>*_~`|\[\]()-]+/g, " ")
		.replace(/\s+/g, " ");
}

function trimToWordBoundary(text: string, maxLength: number): string {
	const target = text.slice(0, maxLength - 3).trimEnd();
	const lastSpace = target.lastIndexOf(" ");
	const trimmed =
		lastSpace > Math.floor(maxLength * 0.6) ? target.slice(0, lastSpace) : target;
	return `${trimmed}...`;
}
