import type { CachedSection } from "./cache";
import type { Section } from "./parser";

export interface StudyTextRange {
	/** Zero-based inclusive document offset. */
	from: number;
	/** Zero-based exclusive document offset. */
	to: number;
}

/** A fresh cached cue resolved to one exact live section body. */
export interface StudySectionDescriptor {
	sectionId: string;
	/** 1-based source line containing the heading. */
	headingLine: number;
	/** 1-based first source line after the heading. */
	bodyStartLine: number;
	/** 1-based final source line before the next heading. */
	bodyEndLine: number;
	headingRange: StudyTextRange;
	bodyRange: StudyTextRange;
}

export interface StudySessionSection extends StudySectionDescriptor {
	revealed: boolean;
}

export interface StudySessionSnapshot {
	active: boolean;
	path: string | null;
	sections: StudySessionSection[];
	revealedCount: number;
	total: number;
}

export interface StudyProjection {
	snapshot: StudySessionSnapshot;
	controlsContainer?: HTMLElement;
	toggleSection(sectionId: string): void;
	showAll(): void;
	hideAll(): void;
	exit(): void;
	documentChanged?(markdown: string): void;
}

interface SourceLines {
	starts: number[];
	ends: number[];
}

function sourceLines(markdown: string): SourceLines {
	const starts = [0];
	const ends: number[] = [];
	for (let i = 0; i < markdown.length; i++) {
		if (markdown[i] !== "\n") continue;
		ends.push(i > 0 && markdown[i - 1] === "\r" ? i - 1 : i);
		starts.push(i + 1);
	}
	ends.push(markdown.length);
	return { starts, ends };
}

function uniqueById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
	const unique = new Map<string, T>();
	const duplicates = new Set<string>();
	for (const item of items) {
		if (unique.has(item.id)) {
			duplicates.add(item.id);
			continue;
		}
		unique.set(item.id, item);
	}
	for (const id of duplicates) unique.delete(id);
	return unique;
}

/**
 * Resolve only cues that can safely conceal one current answer body. Cached
 * line numbers are deliberately ignored: an absent or ambiguous id fails open.
 */
export function resolveStudySections(
	markdown: string,
	cachedCues: readonly CachedSection[],
	currentSections: readonly Section[]
): StudySectionDescriptor[] {
	const cachedById = uniqueById(cachedCues);
	const liveById = uniqueById(currentSections);
	const lines = sourceLines(markdown);
	const orderedLive = [...currentSections].sort(
		(a, b) => a.lineNumber - b.lineNumber
	);
	const descriptors: StudySectionDescriptor[] = [];

	for (let index = 0; index < orderedLive.length; index++) {
		const live = orderedLive[index];
		if (liveById.get(live.id) !== live) continue;
		const cached = cachedById.get(live.id);
		if (
			!cached ||
			cached.error !== null ||
			typeof cached.question !== "string" ||
			cached.question.trim().length === 0 ||
			live.heading.trim().length === 0 ||
			live.content.trim().length === 0 ||
			cached.contentHash !== live.contentHash
		) {
			continue;
		}

		const headingIndex = live.lineNumber - 1;
		const headingFrom = lines.starts[headingIndex];
		const headingTo = lines.ends[headingIndex];
		if (
			headingFrom === undefined ||
			headingTo === undefined ||
			markdown.slice(headingFrom, headingTo).trimEnd() !== live.headingLine
		) {
			continue;
		}

		const next = orderedLive[index + 1];
		const bodyFrom = lines.starts[headingIndex + 1] ?? headingTo;
		const bodyTo = next
			? lines.starts[next.lineNumber - 1]
			: markdown.length;
		if (bodyTo === undefined || bodyTo <= bodyFrom) continue;
		const liveBody = markdown
			.slice(bodyFrom, bodyTo)
			.replace(/\r\n?/g, "\n")
			.trim();
		if (liveBody !== live.content) continue;

		descriptors.push({
			sectionId: live.id,
			headingLine: live.lineNumber,
			bodyStartLine: live.lineNumber + 1,
			bodyEndLine: next ? next.lineNumber - 1 : lines.starts.length,
			headingRange: { from: headingFrom, to: headingTo },
			bodyRange: { from: bodyFrom, to: bodyTo },
		});
	}

	return descriptors;
}

function inactiveSnapshot(): StudySessionSnapshot {
	return {
		active: false,
		path: null,
		sections: [],
		revealedCount: 0,
		total: 0,
	};
}

function uniqueDescriptors(
	descriptors: readonly StudySectionDescriptor[]
): Map<string, StudySectionDescriptor> {
	const sections = new Map<string, StudySectionDescriptor>();
	for (const descriptor of descriptors) {
		if (!sections.has(descriptor.sectionId)) {
			sections.set(descriptor.sectionId, descriptor);
		}
	}
	return sections;
}

/** Synchronous, transient Study state scoped to one note path. */
export class StudySessionController {
	private path: string | null = null;
	private sections = new Map<string, StudySectionDescriptor>();
	private revealed = new Set<string>();

	start(
		path: string,
		descriptors: readonly StudySectionDescriptor[]
	): StudySessionSnapshot {
		const sections = uniqueDescriptors(descriptors);
		if (path.trim().length === 0 || sections.size === 0) return this.exit();
		this.path = path;
		this.sections = sections;
		this.revealed.clear();
		return this.snapshot();
	}

	toggleReveal(path: string, sectionId: string): StudySessionSnapshot {
		if (path !== this.path || !this.sections.has(sectionId)) {
			return this.snapshot();
		}
		if (this.revealed.has(sectionId)) this.revealed.delete(sectionId);
		else this.revealed.add(sectionId);
		return this.snapshot();
	}

	showAll(path: string): StudySessionSnapshot {
		if (path === this.path) this.revealed = new Set(this.sections.keys());
		return this.snapshot();
	}

	hideAll(path: string): StudySessionSnapshot {
		if (path === this.path) this.revealed.clear();
		return this.snapshot();
	}

	reconcile(
		path: string,
		descriptors: readonly StudySectionDescriptor[]
	): StudySessionSnapshot {
		if (this.path === null) return this.snapshot();
		if (path !== this.path) return this.exit();

		const sections = uniqueDescriptors(descriptors);
		if (sections.size === 0) return this.exit();
		this.sections = sections;
		this.revealed = new Set(
			[...this.revealed].filter((sectionId) => sections.has(sectionId))
		);
		return this.snapshot();
	}

	exit(): StudySessionSnapshot {
		this.path = null;
		this.sections.clear();
		this.revealed.clear();
		return inactiveSnapshot();
	}

	snapshot(): StudySessionSnapshot {
		if (this.path === null) return inactiveSnapshot();
		const sections = [...this.sections.values()].map((descriptor) => ({
			...descriptor,
			headingRange: { ...descriptor.headingRange },
			bodyRange: { ...descriptor.bodyRange },
			revealed: this.revealed.has(descriptor.sectionId),
		}));
		return {
			active: true,
			path: this.path,
			sections,
			revealedCount: this.revealed.size,
			total: sections.length,
		};
	}
}
