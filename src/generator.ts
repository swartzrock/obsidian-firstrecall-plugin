import {
	cueEligibleSections,
	extractStudyableText,
	parseSections,
} from "./parser";
import {
	questionTypeInfo,
	type CueGenerationOptions,
} from "./cue-generation";
import type {
	FirstRecallBundleInput,
	FirstRecallCueBatchResult,
	FirstRecallCueProviderRuntime,
} from "./cue-provider";
import type { NoteBriefOutput, SectionSummary } from "./schemas";

export interface SectionResult {
	id: string;
	heading: string;
	level: number;
	lineNumber: number;
	contentHash: string;
	keywords: string[] | null;
	question: string | null;
	summary: SectionSummary | null;
	/** Non-null when this section failed validation/generation (isolated). */
	error: string | null;
}

export interface NoteGenerationResult {
	sections: SectionResult[];
	noteBrief: NoteBriefOutput | null;
	noteBriefOutcome?: NoteBriefGenerationOutcome;
	/** True if generation was cancelled before completing all current artifacts. */
	canceled: boolean;
}

export interface GenerateSectionParams {
	section: {
		id: string;
		heading: string;
		level: number;
		lineNumber: number;
		content: string;
		contentHash: string;
	};
	provider: FirstRecallCueProviderRuntime;
	options?: Partial<CueGenerationOptions>;
	noteContext?: string;
	maxContextChars?: number;
	signal?: AbortSignal;
}

export interface GenerateSectionBatchParams {
	sections: GenerateSectionParams["section"][];
	provider: FirstRecallCueProviderRuntime;
	options?: Partial<CueGenerationOptions>;
	noteContext?: string;
	maxContextChars?: number;
	signal?: AbortSignal;
}

export interface GenerateNoteParams {
	noteTitle: string;
	markdown: string;
	provider: FirstRecallCueProviderRuntime;
	options?: Partial<CueGenerationOptions>;
	useWholeNoteContext?: boolean;
	/** Cap (in chars) on note text injected into prompts; keeps requests within model context limits. */
	maxContextChars?: number;
	/** Maximum number of section-card requests running at once. */
	sectionConcurrency?: number;
	signal?: AbortSignal;
	onProgress?: (done: number, total: number) => void;
}

export interface NoteBriefSectionSource {
	heading: string;
	question: string | null;
	keywords: string[] | null;
	error: string | null;
}

export interface GenerateNoteBriefParams {
	noteTitle: string;
	markdown: string;
	provider: FirstRecallCueProviderRuntime;
	sections: readonly NoteBriefSectionSource[];
	maxContextChars?: number;
	signal?: AbortSignal;
}

export type NoteBriefGenerationOutcome =
	| { status: "success"; noteBrief: NoteBriefOutput }
	| { status: "skipped" }
	| { status: "canceled" }
	| { status: "failed"; error: string };

/** Default budget for note text injected into a single prompt. */
export const DEFAULT_MAX_CONTEXT_CHARS = 8000;
export const DEFAULT_SECTION_CONCURRENCY = 5;
const BUNDLE_MAX_SECTIONS = 5;
const BUNDLE_MAX_TITLE_CHARS = 200;
const BUNDLE_MAX_CONTEXT_CHARS = 12_000;
const BUNDLE_MAX_SECTION_CHARS = 4_000;
const BUNDLE_SECTION_LIMIT_ERROR =
	"Hosted demo generation supports at most 5 eligible sections.";

/** Trim long text to a char budget, adding a marker so the model knows it was cut. */
export function clampText(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return text.slice(0, maxChars) + "\n...[truncated for length]...";
}

function clampTextWithinLimit(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	const marker = "\n...[truncated for length]...";
	if (maxChars <= marker.length) return text.slice(0, maxChars);
	return text.slice(0, maxChars - marker.length) + marker;
}

function boundedLength(
	requested: number | undefined,
	fallback: number,
	maximum: number
): number {
	if (
		typeof requested !== "number" ||
		!Number.isFinite(requested) ||
		requested <= 0
	) {
		return Math.min(fallback, maximum);
	}
	return Math.min(Math.floor(requested), maximum);
}

export function resolveGenerationOptions(
	options?: Partial<CueGenerationOptions>
): CueGenerationOptions {
	return {
		questionType: questionTypeInfo(options?.questionType).id,
	};
}

export function resolveSectionConcurrency(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.floor(value)
		: DEFAULT_SECTION_CONCURRENCY;
}

export function resolveEffectiveSectionConcurrency(
	value: unknown,
	provider: FirstRecallCueProviderRuntime
): number {
	const requested = resolveSectionConcurrency(value);
	const limit = provider.sectionConcurrencyLimit;
	if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
		return requested;
	}
	return Math.min(requested, Math.floor(limit));
}

function emptySectionResult(
	section: GenerateSectionParams["section"]
): SectionResult {
	return {
		id: section.id,
		heading: section.heading,
		level: section.level,
		lineNumber: section.lineNumber,
		contentHash: section.contentHash,
		keywords: null,
		question: null,
		summary: null,
		error: null,
	};
}

function applyCueResult(
	result: SectionResult,
	item: FirstRecallCueBatchResult | undefined
): void {
	if (!item) {
		result.error = "Provider returned no section study card for this section.";
		return;
	}
	if (item.error) {
		result.error = item.error;
		return;
	}
	if (!item.cue) {
		result.error = "Provider returned no section study card for this section.";
		return;
	}
	result.keywords = item.cue.keywords;
	result.question = item.cue.question;
	result.summary = item.cue.summary ?? null;
}

/**
 * Generate a cue for a single section. The caller supplies the parsed section
 * and an optional whole-note context. On provider failure the error is captured
 * in the result rather than thrown, matching generateNote's isolation semantics.
 */
export async function generateSectionCue(
	params: GenerateSectionParams
): Promise<SectionResult> {
	const { section, provider, signal } = params;
	const options = resolveGenerationOptions(params.options);
	const maxCtx = params.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
	const result = emptySectionResult(section);
	const content = extractStudyableText(section.content);
	if (!content) return result;
	const generateCue = provider.generateCue?.bind(provider);
	if (!generateCue) {
		result.error = "Provider does not support individual section generation.";
		return result;
	}
	try {
		const cue = await generateCue(
			{
				heading: section.heading,
				content: clampText(content, maxCtx),
				noteContext: params.noteContext
					? clampText(extractStudyableText(params.noteContext), maxCtx)
					: undefined,
				options,
			},
			signal
		);
		applyCueResult(result, { cue });
	} catch (e) {
		result.error = e instanceof Error ? e.message : String(e);
	}
	return result;
}

function completeProgress(
	sectionCount: number,
	total: number,
	onProgress?: (done: number, total: number) => void
): void {
	for (let done = 1; done <= sectionCount + 1; done++) {
		onProgress?.(done, total);
	}
}

async function generateNoteBundle(
	params: GenerateNoteParams,
	sections: GenerateSectionParams["section"][],
	generateBundle: NonNullable<FirstRecallCueProviderRuntime["generateBundle"]>
): Promise<NoteGenerationResult> {
	const { noteTitle, markdown, signal, onProgress } = params;
	const total = sections.length + 1;
	onProgress?.(0, total);

	if (signal?.aborted) {
		return {
			sections: [],
			noteBrief: null,
			noteBriefOutcome: { status: "canceled" },
			canceled: true,
		};
	}

	const emptyResults = sections.map(emptySectionResult);
	if (sections.length > BUNDLE_MAX_SECTIONS) {
		emptyResults.forEach((result) => {
			result.error = BUNDLE_SECTION_LIMIT_ERROR;
		});
		completeProgress(sections.length, total, onProgress);
		return {
			sections: emptyResults,
			noteBrief: null,
			noteBriefOutcome: {
				status: "failed",
				error: BUNDLE_SECTION_LIMIT_ERROR,
			},
			canceled: false,
		};
	}

	const contextLimit = boundedLength(
		params.maxContextChars,
		DEFAULT_MAX_CONTEXT_CHARS,
		BUNDLE_MAX_CONTEXT_CHARS
	);
	const sectionLimit = boundedLength(
		params.maxContextChars,
		BUNDLE_MAX_SECTION_CHARS,
		BUNDLE_MAX_SECTION_CHARS
	);
	const input: FirstRecallBundleInput = {
		note: {
			title: clampTextWithinLimit(noteTitle, BUNDLE_MAX_TITLE_CHARS),
			contextMarkdown: clampTextWithinLimit(
				extractStudyableText(markdown),
				contextLimit
			),
		},
		sections: sections.map((section) => ({
			sectionId: section.id,
			contentHash: section.contentHash,
			heading: clampTextWithinLimit(section.heading, BUNDLE_MAX_TITLE_CHARS),
			content: clampTextWithinLimit(
				extractStudyableText(section.content),
				sectionLimit
			),
		})),
	};

	try {
		const bundle = await generateBundle(input, signal);
		if (signal?.aborted) {
			return {
				sections: [],
				noteBrief: null,
				noteBriefOutcome: { status: "canceled" },
				canceled: true,
			};
		}
		if (bundle.sections.length !== sections.length) {
			throw new Error("Provider returned a different section count.");
		}

		bundle.sections.forEach((item, index) => {
			applyCueResult(emptyResults[index], item);
		});
		completeProgress(sections.length, total, onProgress);
		return {
			sections: emptyResults,
			noteBrief: bundle.noteBrief,
			noteBriefOutcome: { status: "success", noteBrief: bundle.noteBrief },
			canceled: false,
		};
	} catch (error) {
		if (signal?.aborted) {
			return {
				sections: [],
				noteBrief: null,
				noteBriefOutcome: { status: "canceled" },
				canceled: true,
			};
		}
		const message = error instanceof Error ? error.message : String(error);
		emptyResults.forEach((result) => {
			result.error = message;
		});
		completeProgress(sections.length, total, onProgress);
		return {
			sections: emptyResults,
			noteBrief: null,
			noteBriefOutcome: { status: "failed", error: message },
			canceled: false,
		};
	}
}

export async function generateSectionCueBatch(
	params: GenerateSectionBatchParams
): Promise<SectionResult[]> {
	const { sections, provider, signal } = params;
	const maxCtx = params.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
	const noteContext = params.noteContext
		? clampText(extractStudyableText(params.noteContext), maxCtx)
		: undefined;
	const generateCues = provider.generateCues?.bind(provider);
	if (!generateCues) {
		return Promise.all(
			sections.map((section) =>
				generateSectionCue({
					section,
					provider,
					options: params.options,
					noteContext,
					maxContextChars: params.maxContextChars,
					signal,
				})
			)
		);
	}
	const options = resolveGenerationOptions(params.options);
	const results = sections.map(emptySectionResult);
	const eligible = sections.flatMap((section, index) => {
		const content = extractStudyableText(section.content);
		return content ? [{ content, index, section }] : [];
	});
	if (!eligible.length) return results;
	try {
		const batch = await generateCues(
			eligible.map(({ content, section }) => ({
				heading: section.heading,
				content: clampText(content, maxCtx),
				noteContext,
				options,
			})),
			signal
		);
		eligible.forEach(({ index }, batchIndex) =>
			applyCueResult(results[index], batch[batchIndex])
		);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		eligible.forEach(({ index }) => {
			results[index].error = message;
		});
	}
	return results;
}

export async function generateNoteBriefForSections(
	params: GenerateNoteBriefParams
): Promise<NoteBriefGenerationOutcome> {
	const generateNoteBrief = params.provider.generateNoteBrief?.bind(params.provider);
	if (!generateNoteBrief) return { status: "skipped" };
	const sections = params.sections
		.filter((section) => !section.error && section.question)
		.map((section) => ({
			heading: section.heading,
			question: section.question as string,
			keywords: section.keywords ?? [],
		}));
	if (params.signal?.aborted) return { status: "canceled" };
	if (!sections.length) return { status: "skipped" };
	const maxContextChars = params.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
	try {
		const noteBrief = await generateNoteBrief(
			{
				noteTitle: params.noteTitle,
				fullText: clampText(
					extractStudyableText(params.markdown),
					maxContextChars
				),
				sections,
			},
			params.signal
		);
		if (params.signal?.aborted) return { status: "canceled" };
		return { status: "success", noteBrief };
	} catch (error) {
		if (params.signal?.aborted) return { status: "canceled" };
		return {
			status: "failed",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Generate cues for every section in bounded parallel batches, then the Note Brief.
 * Per-section failures are isolated (recorded as `error`, never thrown).
 * Cancellation is checked between batches: in-flight sections finish, then
 * generation stops and partial results are returned.
 */
export async function generateNote(
	params: GenerateNoteParams
): Promise<NoteGenerationResult> {
	const { provider, markdown, noteTitle, signal, onProgress } = params;
	const sections = cueEligibleSections(parseSections(markdown));
	const generateBundle = provider.generateBundle?.bind(provider);
	if (generateBundle && sections.length > 0) {
		return generateNoteBundle(params, sections, generateBundle);
	}
	const options = resolveGenerationOptions(params.options);
	const maxContextChars = params.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
	const sectionConcurrency = resolveEffectiveSectionConcurrency(
		params.sectionConcurrency,
		provider
	);
	const wholeNoteContext = params.useWholeNoteContext
		? clampText(extractStudyableText(markdown), maxContextChars)
		: undefined;
	const includesNoteBrief = sections.length > 0 && Boolean(provider.generateNoteBrief);
	const total = sections.length + (includesNoteBrief ? 1 : 0);
	const results: SectionResult[] = new Array(sections.length);
	let done = 0;
	let canceled = false;
	onProgress?.(done, total);

	for (let start = 0; start < sections.length; start += sectionConcurrency) {
		if (signal?.aborted) {
			canceled = true;
			break;
		}
		const batch = sections.slice(start, start + sectionConcurrency);
		if (provider.generateCues) {
			const batchResults = await generateSectionCueBatch({
				sections: batch,
				provider,
				options,
				noteContext: wholeNoteContext,
				maxContextChars,
				signal,
			});
			batchResults.forEach((result, offset) => {
				if (signal?.aborted && result.error) return;
				results[start + offset] = result;
				done++;
				onProgress?.(done, total);
			});
			if (signal?.aborted) {
				canceled = true;
				break;
			}
		} else {
			await Promise.all(
				batch.map(async (s, offset) => {
					const result = await generateSectionCue({
						section: s,
						provider,
						options,
						noteContext: wholeNoteContext,
						maxContextChars,
						signal,
					});
					if (signal?.aborted && result.error) return;
					results[start + offset] = result;
					done++;
					onProgress?.(done, total);
				})
			);
		}
		if (signal?.aborted) {
			canceled = true;
			break;
		}
	}

	let noteBrief: NoteBriefOutput | null = null;
	let noteBriefOutcome: NoteBriefGenerationOutcome = { status: "skipped" };
	const completedResults = results.filter(
		(r): r is SectionResult => Boolean(r)
	);

	if (canceled || signal?.aborted) {
		return {
			sections: completedResults,
			noteBrief,
			noteBriefOutcome: { status: "canceled" },
			canceled: true,
		};
	}

	const questions = completedResults
		.map((r) => r.question)
		.filter((q): q is string => Boolean(q));
	if (!questions.length) {
		if (includesNoteBrief) {
			done++;
			onProgress?.(done, total);
		}
		return { sections: completedResults, noteBrief, noteBriefOutcome, canceled };
	}
	if (!signal?.aborted) {
		noteBriefOutcome = await generateNoteBriefForSections({
			noteTitle,
			markdown,
			provider,
			sections: completedResults,
			maxContextChars,
			signal,
		});
		if (noteBriefOutcome.status === "success") {
			noteBrief = noteBriefOutcome.noteBrief;
		}
		if (includesNoteBrief) {
			done++;
			onProgress?.(done, total);
		}
	}
	if (signal?.aborted) canceled = true;

	if (signal?.aborted) noteBriefOutcome = { status: "canceled" };
	return { sections: completedResults, noteBrief, noteBriefOutcome, canceled };
}
