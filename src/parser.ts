/**
 * Markdown section parser. Splits a note into one section per heading
 * (plus an implicit "intro" section for any content before the first
 * heading). Code fences are respected so `#` inside code is not a heading.
 *
 * Each section carries a stable `id` (derived from heading text + ordinal,
 * so it survives body edits) and a lightweight `contentHash` used for
 * stale detection and future per-section refresh.
 */

export interface Section {
	/** Stable across body edits; based on heading slug + ordinal. */
	id: string;
	/** 0 for the intro section, 1-6 for `#`-`######` headings. */
	level: number;
	/** Heading text without leading `#`s; empty for the intro section. */
	heading: string;
	/** Full heading line as written, e.g. "## Foo"; empty for intro. */
	headingLine: string;
	/** 1-based line number of the heading (1 for intro). */
	lineNumber: number;
	/** Body text of the section, excluding the heading line. */
	content: string;
	/** Lightweight deterministic hash of heading + content. */
	contentHash: string;
}

const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;

function slug(text: string): string {
	return (
		text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "section"
	);
}

/** FNV-1a 32-bit hash, returned as 8-char hex. Browser-safe (no crypto). */
export function lightHash(input: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}

interface HeadingMarker {
	level: number;
	heading: string;
	headingLine: string;
	lineIndex: number; // 0-based
}

export function parseSections(markdown: string): Section[] {
	const lines = markdown.replace(/\r\n?/g, "\n").split("\n");

	const markers: HeadingMarker[] = [];
	let inFence = false;
	let fenceToken = "";

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const fence = line.match(FENCE_RE);
		if (fence) {
			const token = fence[1][0]; // ` or ~
			if (!inFence) {
				inFence = true;
				fenceToken = token;
			} else if (token === fenceToken) {
				inFence = false;
				fenceToken = "";
			}
			continue;
		}
		if (inFence) continue;

		const m = line.match(HEADING_RE);
		if (m) {
			markers.push({
				level: m[1].length,
				heading: m[2].trim(),
				headingLine: line.trimEnd(),
				lineIndex: i,
			});
		}
	}

	const sections: Section[] = [];
	const slugCounts = new Map<string, number>();
	const makeId = (base: string): string => {
		const n = slugCounts.get(base) ?? 0;
		slugCounts.set(base, n + 1);
		return n === 0 ? base : `${base}-${n + 1}`;
	};

	// Intro section: content before the first heading.
	const firstHeadingLine = markers.length ? markers[0].lineIndex : lines.length;
	const introContent = lines.slice(0, firstHeadingLine).join("\n").trim();
	if (introContent.length > 0) {
		sections.push({
			id: makeId("intro"),
			level: 0,
			heading: "",
			headingLine: "",
			lineNumber: 1,
			content: introContent,
			contentHash: lightHash(`intro\n${introContent}`),
		});
	}

	for (let mi = 0; mi < markers.length; mi++) {
		const marker = markers[mi];
		const bodyStart = marker.lineIndex + 1;
		const bodyEnd = mi + 1 < markers.length ? markers[mi + 1].lineIndex : lines.length;
		const content = lines.slice(bodyStart, bodyEnd).join("\n").trim();
		const base = slug(marker.heading);
		sections.push({
			id: makeId(base),
			level: marker.level,
			heading: marker.heading,
			headingLine: marker.headingLine,
			lineNumber: marker.lineIndex + 1,
			content,
			contentHash: lightHash(`${marker.headingLine}\n${content}`),
		});
	}

	// A note with no headings and no intro still yields one whole-note section.
	if (sections.length === 0) {
		const whole = markdown.trim();
		sections.push({
			id: "section",
			level: 0,
			heading: "",
			headingLine: "",
			lineNumber: 1,
			content: whole,
			contentHash: lightHash(`whole\n${whole}`),
		});
	}

	return sections;
}

export function isCueEligibleSection(
	section: Pick<Section, "heading" | "content">
): boolean {
	return (
		section.heading.trim().length > 0 &&
		extractStudyableText(section.content).length > 0
	);
}

function meaningfulImageCaption(value: string | undefined): string {
	const caption = value?.trim() ?? "";
	if (/^\d+(?:\s*x\s*\d+)?$/i.test(caption)) return "";
	if (
		/(?:^|[\\/])[^\\/]+\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)$/i.test(
			caption
		)
	) {
		return "";
	}
	return caption;
}

/** Return section text that can ground a text-only cue provider. */
export function extractStudyableText(markdown: string): string {
	return markdown
		.replace(/!\[\[([^\]]+)\]\]/g, (_match, embed: string) => {
			const caption = embed.split("|", 2)[1];
			return meaningfulImageCaption(caption);
		})
		.replace(
			/!\[([^\]]*)\]\((?:\\.|[^()\\]|\([^()]*\))*\)/g,
			(_match, altText: string) => meaningfulImageCaption(altText)
		)
		.replace(/<img\b[^>]*>/gi, (tag: string) => {
			const alt = /(?:^|\s)alt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(
				tag
			);
			return meaningfulImageCaption(alt?.[1] ?? alt?.[2] ?? alt?.[3]);
		})
		.trim();
}

export function cueEligibleSections<T extends Pick<Section, "heading" | "content">>(
	sections: readonly T[]
): T[] {
	return sections.filter(isCueEligibleSection);
}
