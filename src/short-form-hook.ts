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

const MAX_HOOK_TITLE_LENGTH = 96;

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

function buildShortFormHookCard(row: CornellRow): ShortFormHookRailCard | null {
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

function trimToWordBoundary(text: string, maxLength: number): string {
	const target = text.slice(0, maxLength - 3).trimEnd();
	const lastSpace = target.lastIndexOf(" ");
	const trimmed =
		lastSpace > Math.floor(maxLength * 0.6) ? target.slice(0, lastSpace) : target;
	return `${trimmed}...`;
}
