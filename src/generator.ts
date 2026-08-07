import { cueEligibleSections, parseSections } from "./parser";
import {
	DEFAULT_CUE_GENERATION_OPTIONS,
	type CueGenerationOptions,
} from "./cue-generation";
import type {
	CueCraftCueBatchResult,
	CueCraftCueProviderRuntime,
} from "./cue-provider";
import type { NoteBriefOutput, SectionLens } from "./schemas";

export interface SectionResult {
	id: string;
	heading: string;
	level: number;
	lineNumber: number;
	contentHash: string;
	keywords: string[] | null;
	question: string | null;
	confidence: "high" | "medium" | "low" | null;
	rationale: string | null;
	sectionLens: SectionLens | null;
	/** Non-null when this section failed validation/generation (isolated). */
	error: string | null;
}

export interface NoteGenerationResult {
	sections: SectionResult[];
	summary: string | null;
	learningObjective: string | null;
	noteBrief: NoteBriefOutput | null;
	/** True if generation was cancelled before completing the summary. */
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
	provider: CueCraftCueProviderRuntime;
	preset: string;
	options?: Partial<CueGenerationOptions>;
	noteContext?: string;
	maxContextChars?: number;
	signal?: AbortSignal;
}

export interface GenerateSectionBatchParams {
	sections: GenerateSectionParams["section"][];
	provider: CueCraftCueProviderRuntime;
	preset: string;
	options?: Partial<CueGenerationOptions>;
	noteContext?: string;
	maxContextChars?: number;
	signal?: AbortSignal;
}

export interface GenerateNoteParams {
	noteTitle: string;
	markdown: string;
	provider: CueCraftCueProviderRuntime;
	preset: string;
	options?: Partial<CueGenerationOptions>;
	useWholeNoteContext?: boolean;
	/** Cap (in chars) on note text injected into prompts; keeps requests within model context limits. */
	maxContextChars?: number;
	/** Maximum number of section cue requests running at once. */
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
	provider: CueCraftCueProviderRuntime;
	sections: readonly NoteBriefSectionSource[];
	maxContextChars?: number;
	signal?: AbortSignal;
}

/** Default budget for note text injected into a single prompt. */
export const DEFAULT_MAX_CONTEXT_CHARS = 8000;
export const DEFAULT_SECTION_CONCURRENCY = 5;

/** Trim long text to a char budget, adding a marker so the model knows it was cut. */
export function clampText(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return text.slice(0, maxChars) + "\n...[truncated for length]...";
}

export function resolveGenerationOptions(
	options?: Partial<CueGenerationOptions>
): CueGenerationOptions {
	return { ...DEFAULT_CUE_GENERATION_OPTIONS, ...options };
}

export function resolveSectionConcurrency(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.floor(value)
		: DEFAULT_SECTION_CONCURRENCY;
}

export function resolveEffectiveSectionConcurrency(
	value: unknown,
	provider: CueCraftCueProviderRuntime
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
		confidence: null,
		rationale: null,
		sectionLens: null,
		error: null,
	};
}

function applyCueResult(
	result: SectionResult,
	item: CueCraftCueBatchResult | undefined
): void {
	if (!item) {
		result.error = "Provider returned no cue for this section.";
		return;
	}
	if (item.error) {
		result.error = item.error;
		return;
	}
	if (!item.cue) {
		result.error = "Provider returned no cue for this section.";
		return;
	}
	result.keywords = item.cue.keywords;
	result.question = item.cue.question;
	result.confidence = item.cue.confidence;
	result.rationale = item.cue.rationale ?? null;
	result.sectionLens = item.cue.sectionLens ?? null;
}

/**
 * Generate a cue for a single section. The caller supplies the parsed section
 * and an optional whole-note context. On provider failure the error is captured
 * in the result rather than thrown, matching generateNote's isolation semantics.
 */
export async function generateSectionCue(
	params: GenerateSectionParams
): Promise<SectionResult> {
	const { section, provider, preset, signal } = params;
	const options = resolveGenerationOptions(params.options);
	const maxCtx = params.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
	const result = emptySectionResult(section);
	try {
		const cue = await provider.generateCue(
			{
				heading: section.heading,
				content: clampText(section.content, maxCtx),
				noteContext: params.noteContext
					? clampText(params.noteContext, maxCtx)
					: undefined,
				preset,
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

export async function generateSectionCueBatch(
	params: GenerateSectionBatchParams
): Promise<SectionResult[]> {
	const { sections, provider, preset, signal } = params;
	const generateCues = provider.generateCues?.bind(provider);
	if (!generateCues) {
		return Promise.all(
			sections.map((section) =>
				generateSectionCue({
					section,
					provider,
					preset,
					options: params.options,
					noteContext: params.noteContext,
					maxContextChars: params.maxContextChars,
					signal,
				})
			)
		);
	}
	const options = resolveGenerationOptions(params.options);
	const maxCtx = params.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
	const results = sections.map(emptySectionResult);
	try {
		const batch = await generateCues(
			sections.map((section) => ({
				heading: section.heading,
				content: clampText(section.content, maxCtx),
				noteContext: params.noteContext
					? clampText(params.noteContext, maxCtx)
					: undefined,
				preset,
				options,
			})),
			signal
		);
		results.forEach((result, index) => applyCueResult(result, batch[index]));
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		results.forEach((result) => {
			result.error = message;
		});
	}
	return results;
}

export async function generateNoteBriefForSections(
	params: GenerateNoteBriefParams
): Promise<NoteBriefOutput | null> {
	const generateNoteBrief = params.provider.generateNoteBrief?.bind(params.provider);
	if (!generateNoteBrief) return null;
	const sections = params.sections
		.filter((section) => !section.error && section.question)
		.map((section) => ({
			heading: section.heading,
			question: section.question as string,
			keywords: section.keywords ?? [],
		}));
	if (!sections.length || params.signal?.aborted) return null;
	const maxContextChars = params.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
	const t0 = Date.now();
	try {
		const noteBrief = await generateNoteBrief(
			{
				noteTitle: params.noteTitle,
				fullText: clampText(params.markdown, maxContextChars),
				sections,
			},
			params.signal
		);
		console.debug(
			`CueCraft note brief done (${((Date.now() - t0) / 1000).toFixed(1)}s)`
		);
		return noteBrief;
	} catch {
		console.debug(
			`CueCraft note brief failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`
		);
		return null;
	}
}

/**
 * Generate cues for every section in bounded parallel batches, then the whole-note review
 * artifacts. Per-section failures are isolated (recorded as `error`, never thrown).
 * Cancellation is checked between batches: in-flight sections finish, then
 * generation stops and partial results are returned.
 */
export async function generateNote(
	params: GenerateNoteParams
): Promise<NoteGenerationResult> {
	const { provider, markdown, preset, noteTitle, signal, onProgress } = params;
	const options = resolveGenerationOptions(params.options);
	const maxContextChars = params.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
	const sectionConcurrency = resolveEffectiveSectionConcurrency(
		params.sectionConcurrency,
		provider
	);
	const wholeNoteContext = params.useWholeNoteContext
		? clampText(markdown, maxContextChars)
		: undefined;
	const sections = cueEligibleSections(parseSections(markdown));
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
			const t0 = Date.now();
			const batchResults = await generateSectionCueBatch({
				sections: batch,
				provider,
				preset,
				options,
				noteContext: wholeNoteContext,
				maxContextChars,
				signal,
			});
			batchResults.forEach((result, offset) => {
				const label = result.heading.trim() || "intro";
				console.debug(
					`CueCraft section "${label}" ${result.error ? "failed" : "done"} (${((Date.now() - t0) / 1000).toFixed(1)}s)`
				);
				results[start + offset] = result;
				done++;
				onProgress?.(done, total);
			});
		} else {
			await Promise.all(
				batch.map(async (s, offset) => {
					const t0 = Date.now();
					const result = await generateSectionCue({
						section: s,
						provider,
						preset,
						options,
						noteContext: wholeNoteContext,
						maxContextChars,
						signal,
					});
					const label = s.heading.trim() || "intro";
					console.debug(
						`CueCraft section "${label}" ${result.error ? "failed" : "done"} (${((Date.now() - t0) / 1000).toFixed(1)}s)`
					);
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

	let summary: string | null = null;
	let learningObjective: string | null = null;
	let noteBrief: NoteBriefOutput | null = null;
	const completedResults = results.filter(
		(r): r is SectionResult => Boolean(r)
	);

	if (canceled || signal?.aborted) {
		return {
			sections: completedResults,
			summary,
			learningObjective,
			noteBrief,
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
		return { sections: completedResults, summary, learningObjective, noteBrief, canceled };
	}

	if (options.autoSummary && completedResults.length) {
		const t0 = Date.now();
		try {
			const sum = await provider.generateSummary(
				{
					noteTitle,
					fullText: clampText(markdown, maxContextChars),
					sectionQuestions: questions,
				},
				signal
			);
			summary = sum.summary;
			learningObjective = sum.learningObjective ?? null;
			console.debug(`CueCraft summary done (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
		} catch {
			console.debug(`CueCraft summary failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
			summary = null;
		}
	}
	if (!signal?.aborted) {
		noteBrief = await generateNoteBriefForSections({
			noteTitle,
			markdown,
			provider,
			sections: completedResults,
			maxContextChars,
			signal,
		});
		if (includesNoteBrief) {
			done++;
			onProgress?.(done, total);
		}
	}
	if (signal?.aborted) canceled = true;

	return { sections: completedResults, summary, learningObjective, noteBrief, canceled };
}
