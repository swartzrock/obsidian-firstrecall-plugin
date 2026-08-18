/**
 * Reading-mode (preview) section card display. Obsidian renders reading view through
 * Markdown post-processors that hand us one rendered block at a time, so we
 * resolve the cached cues to current document lines (reusing the same
 * {@link buildCueLineData} logic as the editor) and key them by heading line.
 * The post-processor then looks up a heading element's source line and inserts
 * the matching cue beneath it. This module owns both the pure cue mapping and
 * the Reading Study DOM projection and control lifecycle.
 */

import { setIcon, setTooltip } from "obsidian";

import {
	buildCueLineData,
	type CueLineData,
	type CueLineDataOptions,
} from "./cue-extension";
import { parseSections } from "./parser";
import type { NoteCache } from "./cache";
import type {
	StudyProjection,
	StudySessionSnapshot,
} from "./study-session";

export interface ReadingCueDisplayState {
	showInlineCues: boolean;
}

export type ReadingCueVisibility = Required<
	Pick<CueLineDataOptions, "showSummary" | "showQuestion" | "showTerms">
>;

export interface ReadingNoteBriefDisplayState {
	showNoteBrief: boolean;
}

export interface ReadingSectionInfo {
	lineStart: number;
	lineEnd: number;
}

const readingStudyCueCleanup = new WeakMap<HTMLElement, () => void>();
const readingStudyControlState = new WeakMap<
	HTMLElement,
	{ projection: StudyProjection; cleanup: () => void }
>();

/**
 * Resolve a note's cached cues against its current Markdown and index them by
 * 1-based heading line. Sections without a heading (the intro/whole-note
 * section, line 1) have no heading element to attach to in reading mode, so
 * callers simply won't find a heading at that line.
 */
export function buildReadingCueMap(
	cache: NoteCache,
	markdown: string,
	options: CueLineDataOptions = {}
): Map<number, CueLineData> {
	const map = new Map<number, CueLineData>();
	for (const cue of buildCueLineData(cache, parseSections(markdown), options)) {
		// First cue wins for a given line; cues are already top-to-bottom.
		if (!map.has(cue.line)) map.set(cue.line, cue);
	}
	return map;
}

export function readingCueDisplayState(opts: {
	hasCache: boolean;
	isHidden: boolean;
	studyActive: boolean;
	hasErrors: boolean;
	visibility: ReadingCueVisibility;
}): ReadingCueDisplayState {
	const hasVisibleComponent =
		opts.visibility.showSummary ||
		opts.visibility.showQuestion ||
		opts.visibility.showTerms;
	return {
		showInlineCues:
			opts.hasCache &&
			(opts.studyActive || (!opts.isHidden && (hasVisibleComponent || opts.hasErrors))),
	};
}

function clearReadingStudyCue(cue: HTMLElement): void {
	readingStudyCueCleanup.get(cue)?.();
	readingStudyCueCleanup.delete(cue);
	cue.classList.remove("cuecraft-reading-study-cue");
	delete cue.dataset.studySectionId;
	delete cue.dataset.studyState;
	cue.setAttribute("role", "note");
	cue.removeAttribute("aria-expanded");
	cue.removeAttribute("tabindex");
}

/** Restore block-owned Study state without disturbing rendered Markdown. */
export function restoreReadingStudyBlock(root: HTMLElement): void {
	for (const cue of root.querySelectorAll<HTMLElement>(
		".cuecraft-cue[data-cuecraft-section-id]"
	)) {
		clearReadingStudyCue(cue);
	}
	for (const answer of root.querySelectorAll<HTMLElement>(
		".cuecraft-reading-study-answer"
	)) {
		answer.classList.remove("cuecraft-reading-study-answer", "is-hidden");
		delete answer.dataset.studySectionId;
		answer.removeAttribute("aria-hidden");
	}
}

function isHeading(element: Element): boolean {
	return /^H[1-6]$/.test(element.tagName);
}

function studyBodyNodes(
	heading: HTMLElement,
	section: StudySessionSnapshot["sections"][number],
	getSectionInfo: (element: HTMLElement) => ReadingSectionInfo | null
): HTMLElement[] {
	const candidates: Array<{
		element: HTMLElement;
		lineStart: number;
		lineEnd: number;
	}> = [];
	let sibling = heading.nextElementSibling;
	while (sibling && !isHeading(sibling)) {
		if (
			sibling instanceof heading.ownerDocument.defaultView!.HTMLElement &&
			!sibling.classList.contains("cuecraft-cue")
		) {
			const info = getSectionInfo(sibling);
			const lineStart = (info?.lineStart ?? -1) + 1;
			const lineEnd = (info?.lineEnd ?? -1) + 1;
			if (
				info &&
				lineStart >= section.bodyStartLine &&
				lineEnd <= section.bodyEndLine &&
				lineStart <= lineEnd
			) {
				candidates.push({ element: sibling, lineStart, lineEnd });
			}
		}
		sibling = sibling.nextElementSibling;
	}

	return candidates
		.filter(
			(candidate, index) =>
				!candidates.some(
					(other, otherIndex) =>
						otherIndex !== index &&
						candidate.lineStart <= other.lineEnd &&
						other.lineStart <= candidate.lineEnd
				)
		)
		.map((candidate) => candidate.element);
}

/** Project one transient Study snapshot into one postprocessor-owned block. */
export function projectReadingStudyBlock(
	root: HTMLElement,
	getSectionInfo: (element: HTMLElement) => ReadingSectionInfo | null,
	projection: StudyProjection | null
): void {
	restoreReadingStudyBlock(root);
	if (!projection?.snapshot.active) return;

	const headings = Array.from(
		root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")
	);
	const cues = Array.from(
		root.querySelectorAll<HTMLElement>(
			".cuecraft-cue[data-cuecraft-section-id]"
		)
	);

	for (const section of projection.snapshot.sections) {
		const heading = headings.find(
			(candidate) =>
				getSectionInfo(candidate)?.lineStart === section.headingLine - 1
		);
		const cue = cues.find(
			(candidate) =>
				candidate.dataset.cuecraftSectionId === section.sectionId &&
				candidate.previousElementSibling === heading
		);
		if (!heading || !cue) continue;

		cue.classList.add("cuecraft-reading-study-cue");
		cue.dataset.studySectionId = section.sectionId;
		cue.dataset.studyState = section.revealed ? "revealed" : "hidden";

		const toggle = cue.ownerDocument.createElement("button");
		toggle.type = "button";
		toggle.className = "cuecraft-study-section-toggle";
		toggle.dataset.revealed = String(section.revealed);
		const label = section.revealed ? "Hide answer" : "Show answer";
		toggle.setAttribute("aria-label", label);
		toggle.setAttribute("aria-pressed", String(section.revealed));
		setIcon(toggle, section.revealed ? "eye-off" : "eye");
		setTooltip(toggle, label, { placement: "right" });
		const onClick = (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			projection.toggleSection(section.sectionId);
		};
		toggle.addEventListener("click", onClick);
		cue.append(toggle);
		readingStudyCueCleanup.set(cue, () => {
			toggle.removeEventListener("click", onClick);
			toggle.remove();
		});

		for (const answer of studyBodyNodes(heading, section, getSectionInfo)) {
			answer.classList.add("cuecraft-reading-study-answer");
			answer.dataset.studySectionId = section.sectionId;
			answer.classList.toggle("is-hidden", !section.revealed);
			if (section.revealed) answer.removeAttribute("aria-hidden");
			else answer.setAttribute("aria-hidden", "true");
		}
	}
}

function removeReadingStudyControlHost(host: HTMLElement): void {
	readingStudyControlState.get(host)?.cleanup();
	readingStudyControlState.delete(host);
	host.remove();
}

export function removeReadingStudyControls(container: HTMLElement): void {
	for (const host of container.querySelectorAll<HTMLElement>(
		".cuecraft-reading-study-controls"
	)) {
		removeReadingStudyControlHost(host);
	}
}

/** Keep one Study control host beneath the active Reading view header. */
export function syncReadingStudyControls(
	container: HTMLElement,
	projection: StudyProjection | null,
	controlsContainer: HTMLElement = container
): void {
	const hosts = Array.from(
		controlsContainer.querySelectorAll<HTMLElement>(
			".cuecraft-reading-study-controls"
		)
	);
	if (!projection?.snapshot.active) {
		for (const host of hosts) removeReadingStudyControlHost(host);
		return;
	}

	let host = hosts.shift();
	for (const duplicate of hosts) removeReadingStudyControlHost(duplicate);
	if (!host) {
		const doc = container.ownerDocument;
		host = doc.createElement("div");
		host.className = "cuecraft-reading-study-controls";
		host.setAttribute("role", "region");
		host.setAttribute("aria-label", "Study controls");

		const help = doc.createElement("span");
		help.className = "cuecraft-study-help";
		setIcon(help, "eye");
		const helpCopy = doc.createElement("span");
		helpCopy.className = "cuecraft-study-help-copy";
		const helpTitle = doc.createElement("span");
		helpTitle.className = "cuecraft-study-help-title";
		helpTitle.textContent = "Show or hide answers";
		const helpDetail = doc.createElement("span");
		helpDetail.className = "cuecraft-study-help-detail";
		helpDetail.textContent = "Click the eye icon on any section card.";
		helpCopy.append(helpTitle, helpDetail);
		help.append(helpCopy);

		const progress = doc.createElement("span");
		progress.className = "cuecraft-reading-study-progress";
		progress.setAttribute("aria-live", "polite");

		const progressTrack = doc.createElement("div");
		progressTrack.className = "cuecraft-study-progress-track";
		progressTrack.setAttribute("role", "progressbar");
		progressTrack.setAttribute("aria-valuemin", "0");
		progressTrack.setAttribute("aria-label", "Answers revealed");
		const progressFill = doc.createElement("div");
		progressFill.className = "cuecraft-study-progress-fill";
		progressTrack.append(progressFill);

		const showAll = doc.createElement("button");
		showAll.type = "button";
		showAll.className =
			"cuecraft-study-action cuecraft-reading-study-show-all";
		setIcon(showAll, "eye");
		showAll.append("Show All Answers");

		const hideAll = doc.createElement("button");
		hideAll.type = "button";
		hideAll.className =
			"cuecraft-study-action cuecraft-reading-study-hide-all";
		setIcon(hideAll, "eye-off");
		hideAll.append("Hide All Answers");

		const exit = doc.createElement("button");
		exit.type = "button";
		exit.className = "cuecraft-study-action cuecraft-reading-study-exit";
		setIcon(exit, "log-out");
		exit.append("Exit Study Mode");

		const onShowAll = () => readingStudyControlState.get(host!)?.projection.showAll();
		const onHideAll = () => readingStudyControlState.get(host!)?.projection.hideAll();
		const onExit = () => {
			readingStudyControlState.get(host!)?.projection.exit();
			restoreReadingStudyBlock(container);
			removeReadingStudyControls(controlsContainer);
		};
		showAll.addEventListener("click", onShowAll);
		hideAll.addEventListener("click", onHideAll);
		exit.addEventListener("click", onExit);
		const actions = doc.createElement("div");
		actions.className = "cuecraft-study-actions";
		actions.append(showAll, hideAll, exit);
		host.append(help, progress, progressTrack, actions);
		controlsContainer.prepend(host);
		readingStudyControlState.set(host, {
			projection,
			cleanup: () => {
				showAll.removeEventListener("click", onShowAll);
				hideAll.removeEventListener("click", onHideAll);
				exit.removeEventListener("click", onExit);
			},
		});
	} else {
		const state = readingStudyControlState.get(host);
		if (state) state.projection = projection;
		else {
			removeReadingStudyControlHost(host);
			syncReadingStudyControls(container, projection, controlsContainer);
			return;
		}
	}

	const progress = host.querySelector<HTMLElement>(
		".cuecraft-reading-study-progress"
	);
	if (progress) {
		progress.textContent = `${projection.snapshot.revealedCount} / ${projection.snapshot.total} answers revealed`;
	}
	const progressTrack = host.querySelector<HTMLElement>(
		".cuecraft-study-progress-track"
	);
	if (progressTrack) {
		progressTrack.setAttribute(
			"aria-valuemax",
			String(projection.snapshot.total)
		);
		progressTrack.setAttribute(
			"aria-valuenow",
			String(projection.snapshot.revealedCount)
		);
		const progressFill = progressTrack.querySelector<HTMLElement>(
			".cuecraft-study-progress-fill"
		);
		if (progressFill) {
			progressFill.style.width = `${
				projection.snapshot.total > 0
					? (projection.snapshot.revealedCount / projection.snapshot.total) * 100
					: 0
			}%`;
		}
	}
	const showAll = host.querySelector<HTMLButtonElement>(
		".cuecraft-reading-study-show-all"
	);
	if (showAll) {
		showAll.disabled =
			projection.snapshot.revealedCount === projection.snapshot.total;
	}
	const hideAll = host.querySelector<HTMLButtonElement>(
		".cuecraft-reading-study-hide-all"
	);
	if (hideAll) hideAll.disabled = projection.snapshot.revealedCount === 0;
}

export function readingNoteBriefDisplayState(opts: {
	showNoteBrief: boolean;
	hasCache: boolean;
	hasNoteBrief: boolean;
	isHidden: boolean;
}): ReadingNoteBriefDisplayState {
	return {
		showNoteBrief:
			opts.showNoteBrief &&
			opts.hasCache &&
			opts.hasNoteBrief &&
			!opts.isHidden,
	};
}
