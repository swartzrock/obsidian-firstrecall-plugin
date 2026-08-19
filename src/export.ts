/**
 * Export generated recall questions and key terms for external study. Two pure formatters turn a note's
 * cached study material into:
 *   - a Markdown study sheet (human-readable, one recall question + key terms per section), and
 *   - Anki-compatible TSV (`question<TAB>answer`), importable as Basic notes.
 * Both ignore sections that never produced a usable recall question (no question, or an
 * error), so an export is always clean review material.
 */

import type { NoteCache } from "./cache";

export interface ExportQuestion {
	heading: string;
	question: string;
	keywords: string[];
}

/** Usable Questions from a cache, in document order (skips empty/errored sections). */
export function selectExportableQuestions(cache: NoteCache): ExportQuestion[] {
	return cache.sections
		.filter((s) => s.question && !s.error)
		.map((s) => ({
			heading: s.heading,
			question: s.question as string,
			keywords: s.keywords ?? [],
		}));
}

/** A Markdown study sheet: a heading + recall question + key terms per section. */
export function questionsAndTermsToMarkdown(
	noteTitle: string,
	questions: ExportQuestion[]
): string {
	const lines: string[] = [`# Recall Questions and Key Terms — ${noteTitle}`, ""];
	if (questions.length === 0) {
		lines.push("_No generated recall questions and key terms to export yet._", "");
		return lines.join("\n");
	}
	for (const question of questions) {
		if (question.heading) lines.push(`## ${question.heading}`);
		lines.push(`**Recall question:** ${question.question}`);
		if (question.keywords.length) {
			lines.push("", `_Key terms:_ ${question.keywords.join(" · ")}`);
		}
		lines.push("");
	}
	return lines.join("\n");
}

/** Collapse tabs/newlines so a value stays inside one TSV field. */
function tsvField(value: string): string {
	return value.replace(/[\t\r\n]+/g, " ").trim();
}

/**
 * Anki TSV: `question<TAB>answer`, one note per line. The answer is the
 * section's key terms (falling back to the heading) so the front is the recall question and
 * the back is what to recall. Import into Anki as a Basic (front/back) note type.
 */
export function questionsAndTermsToAnki(questions: ExportQuestion[]): string {
	return questions
		.map((question) => {
			const back = question.keywords.length
				? question.keywords.join(" · ")
				: question.heading;
			return `${tsvField(question.question)}\t${tsvField(back)}`;
		})
		.join("\n");
}

export function exportFilePath(
	dir: string,
	basename: string,
	format: "markdown" | "anki"
): string {
	const ext = format === "markdown" ? "md" : "tsv";
	const tag = format === "markdown"
		? "recall-questions-and-key-terms"
		: "recall-questions-and-key-terms.anki";
	return `${dir}${basename} (${tag}).${ext}`;
}
