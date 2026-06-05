import { parseSections } from "./parser";
import type { AiProvider } from "./providers/types";

export interface SectionResult {
	id: string;
	heading: string;
	level: number;
	lineNumber: number;
	contentHash: string;
	keywords: string[] | null;
	question: string | null;
	confidence: "high" | "medium" | "low" | null;
	/** Non-null when this section failed validation/generation (isolated). */
	error: string | null;
}

export interface NoteGenerationResult {
	sections: SectionResult[];
	summary: string | null;
	learningObjective: string | null;
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
	provider: AiProvider;
	preset: string;
	noteContext?: string;
	maxContextChars?: number;
	signal?: AbortSignal;
}

export interface GenerateNoteParams {
	noteTitle: string;
	markdown: string;
	provider: AiProvider;
	preset: string;
	useWholeNoteContext?: boolean;
	/** Cap (in chars) on note text injected into prompts; keeps requests within model context limits. */
	maxContextChars?: number;
	signal?: AbortSignal;
	onProgress?: (done: number, total: number) => void;
}

/** Default budget for note text injected into a single prompt. */
export const DEFAULT_MAX_CONTEXT_CHARS = 8000;

/** Trim long text to a char budget, adding a marker so the model knows it was cut. */
export function clampText(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return text.slice(0, maxChars) + "\n...[truncated for length]...";
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
	const maxCtx = params.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
	const result: SectionResult = {
		id: section.id,
		heading: section.heading,
		level: section.level,
		lineNumber: section.lineNumber,
		contentHash: section.contentHash,
		keywords: null,
		question: null,
		confidence: null,
		error: null,
	};
	try {
		const cue = await provider.generateCue(
			{
				heading: section.heading,
				content: clampText(section.content, maxCtx),
				noteContext: params.noteContext
					? clampText(params.noteContext, maxCtx)
					: undefined,
				preset,
			},
			signal
		);
		result.keywords = cue.keywords;
		result.question = cue.question;
		result.confidence = cue.confidence;
	} catch (e) {
		result.error = e instanceof Error ? e.message : String(e);
	}
	return result;
}

/**
 * Generate cues for every section sequentially, then the whole-note summary
 * last. Per-section failures are isolated (recorded as `error`, never thrown).
 * Cancellation is checked between sections (AC C3.2): the in-flight section
 * finishes, then generation stops and partial results are returned.
 */
export async function generateNote(
	params: GenerateNoteParams
): Promise<NoteGenerationResult> {
	const { provider, markdown, preset, noteTitle, signal, onProgress } = params;
	const maxContextChars = params.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
	const wholeNoteContext = params.useWholeNoteContext
		? clampText(markdown, maxContextChars)
		: undefined;
	const sections = parseSections(markdown);
	const total = sections.length;
	const results: SectionResult[] = [];
	let canceled = false;

	for (let i = 0; i < sections.length; i++) {
		if (signal?.aborted) {
			canceled = true;
			break;
		}
		const s = sections[i];
		const result = await generateSectionCue({
			section: s,
			provider,
			preset,
			noteContext: wholeNoteContext,
			maxContextChars,
			signal,
		});
		results.push(result);
		onProgress?.(i + 1, total);
	}

	let summary: string | null = null;
	let learningObjective: string | null = null;

	if (canceled || signal?.aborted) {
		return { sections: results, summary, learningObjective, canceled: true };
	}

	const questions = results
		.map((r) => r.question)
		.filter((q): q is string => Boolean(q));
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
	} catch {
		summary = null;
	}

	return { sections: results, summary, learningObjective, canceled };
}
