import {
	isAutoGenerationSettleDelaySeconds,
	normalizeAutoGenerationSettleDelaySeconds,
} from "./auto-generation-delay";
import { normalizeFirstRecallProviderSettings } from "./byok-firstrecall-adapter";
import { isCueFontSize } from "./cornell-layout";
import { isQuestionType } from "./cue-generation";
import { isEditorCueDisplay } from "./editor-cue-display";
import { normalizeEditorCueCustomWidthPx } from "./editor-cue-width";
import { DEFAULT_SETTINGS, type FirstRecallSettings } from "./settings";
import { loadStudyAreaSettings } from "./study-area";

export interface ParsedFirstRecallSettings {
	settings: FirstRecallSettings;
	changed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(record, key);
}

function firstBoolean(
	record: Record<string, unknown>,
	keys: readonly string[],
	fallback: boolean
): boolean {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "boolean") return value;
	}
	return fallback;
}

function isJsonEqual(left: unknown, right: unknown): boolean {
	try {
		return JSON.stringify(left) === JSON.stringify(right);
	} catch {
		return false;
	}
}

/** Parse the complete persisted settings boundary before values enter the app. */
export function parsePersistedFirstRecallSettings(
	raw: unknown
): ParsedFirstRecallSettings {
	const record = isRecord(raw) ? raw : {};
	let changed = raw !== undefined && raw !== null && !isRecord(raw);

	const rawQuestionType = record.questionType;
	const questionType = isQuestionType(rawQuestionType)
		? rawQuestionType
		: DEFAULT_SETTINGS.questionType;
	if (hasOwn(record, "questionType") && !isQuestionType(rawQuestionType)) {
		changed = true;
	}

	const rawStudyHideMode = record.studyHideMode;
	const studyHideMode =
		rawStudyHideMode === "blur" || rawStudyHideMode === "collapse"
			? rawStudyHideMode
			: DEFAULT_SETTINGS.studyHideMode;
	if (
		hasOwn(record, "studyHideMode") &&
		rawStudyHideMode !== "blur" &&
		rawStudyHideMode !== "collapse"
	) {
		changed = true;
	}

	const rawEditorCueDisplay = record.editorCueDisplay;
	const editorCueDisplay = isEditorCueDisplay(rawEditorCueDisplay)
		? rawEditorCueDisplay
		: DEFAULT_SETTINGS.editorCueDisplay;
	if (
		hasOwn(record, "editorCueDisplay") &&
		!isEditorCueDisplay(rawEditorCueDisplay)
	) {
		changed = true;
	}

	const rawEditorCueCustomWidthPx = record.editorCueCustomWidthPx;
	const editorCueCustomWidthPx = normalizeEditorCueCustomWidthPx(
		rawEditorCueCustomWidthPx
	);
	if (
		hasOwn(record, "editorCueCustomWidthPx") &&
		rawEditorCueCustomWidthPx !== null &&
		editorCueCustomWidthPx === null
	) {
		changed = true;
	}

	const rawCueFontSize = record.cueFontSize;
	const cueFontSize = isCueFontSize(rawCueFontSize)
		? rawCueFontSize
		: DEFAULT_SETTINGS.cueFontSize;
	if (hasOwn(record, "cueFontSize") && !isCueFontSize(rawCueFontSize)) {
		changed = true;
	}

	const rawSettleDelay = record.autoGenerationSettleDelaySeconds;
	const autoGenerationSettleDelaySeconds =
		normalizeAutoGenerationSettleDelaySeconds(rawSettleDelay);
	if (
		hasOwn(record, "autoGenerationSettleDelaySeconds") &&
		!isAutoGenerationSettleDelaySeconds(rawSettleDelay)
	) {
		changed = true;
	}

	const rawSectionConcurrency = record.sectionConcurrency;
	const sectionConcurrency =
		typeof rawSectionConcurrency === "number" &&
		Number.isInteger(rawSectionConcurrency) &&
		rawSectionConcurrency >= 1 &&
		rawSectionConcurrency <= 5
			? rawSectionConcurrency
			: DEFAULT_SETTINGS.sectionConcurrency;
	if (
		hasOwn(record, "sectionConcurrency") &&
		sectionConcurrency !== rawSectionConcurrency
	) {
		changed = true;
	}

	for (const key of [
		"showSummary",
		"showQuestion",
		"showTerms",
		"showNoteBrief",
	] as const) {
		if (hasOwn(record, key) && typeof record[key] !== "boolean") {
			changed = true;
		}
	}
	const { studyAreas, disabledStudyAreas } = loadStudyAreaSettings(
		record.studyAreas,
		record.disabledStudyAreas
	);
	if (hasOwn(record, "studyAreas") && !isJsonEqual(record.studyAreas, studyAreas)) {
		changed = true;
	}
	if (
		hasOwn(record, "disabledStudyAreas") &&
		!isJsonEqual(record.disabledStudyAreas, disabledStudyAreas)
	) {
		changed = true;
	}

	const settings: FirstRecallSettings = {
		byok: DEFAULT_SETTINGS.byok,
		questionType,
		studyHideMode,
		editorCueDisplay,
		editorCueCustomWidthPx,
		cueFontSize,
		autoGenerationSettleDelaySeconds,
		studyAreas,
		disabledStudyAreas,
		sectionConcurrency,
		showNoteBrief: firstBoolean(
			record,
			["showNoteBrief"],
			DEFAULT_SETTINGS.showNoteBrief
		),
		showSummary: firstBoolean(
			record,
			["showSummary"],
			DEFAULT_SETTINGS.showSummary
		),
		showQuestion: firstBoolean(
			record,
			["showQuestion"],
			DEFAULT_SETTINGS.showQuestion
		),
		showTerms: firstBoolean(
			record,
			["showTerms"],
			DEFAULT_SETTINGS.showTerms
		),
	};
	normalizeFirstRecallProviderSettings(settings, DEFAULT_SETTINGS, raw);
	changed = !isJsonEqual(record, settings) || changed;
	return { settings, changed };
}
