import { describe, expect, it } from "vitest";
import type { CachedSection } from "../src/cache";
import { parseSections, type Section } from "../src/parser";
import {
	StudySessionController,
	resolveStudySections,
	type StudySectionDescriptor,
} from "../src/study-session";

function cachedCue(
	section: Section,
	overrides: Partial<CachedSection> = {}
): CachedSection {
	return {
		id: section.id,
		heading: section.heading,
		level: section.level,
		lineNumber: section.lineNumber,
		contentHash: section.contentHash,
		keywords: [],
		question: `How does ${section.heading} work?`,
		confidence: "high",
		rationale: null,
		sectionLens: null,
		error: null,
		...overrides,
	};
}

function resolveAll(markdown: string): StudySectionDescriptor[] {
	const sections = parseSections(markdown);
	return resolveStudySections(
		markdown,
		sections.map((section) => cachedCue(section)),
		sections
	);
}

describe("resolveStudySections", () => {
	it("admits exact fresh cues and describes heading and answer ranges", () => {
		const markdown = "# Alpha\nA body.\n\n## Beta\nB body.";
		const sections = parseSections(markdown);

		const descriptors = resolveStudySections(
			markdown,
			sections.map((section) => cachedCue(section)),
			sections
		);

		expect(descriptors).toEqual([
			{
				sectionId: "alpha",
				headingLine: 1,
				bodyStartLine: 2,
				bodyEndLine: 3,
				headingRange: { from: 0, to: 7 },
				bodyRange: { from: 8, to: 17 },
			},
			{
				sectionId: "beta",
				headingLine: 4,
				bodyStartLine: 5,
				bodyEndLine: 5,
				headingRange: { from: 17, to: 24 },
				bodyRange: { from: 25, to: 32 },
			},
		]);
	});

	it("resolves source ranges across CRLF and trimmed heading whitespace", () => {
		const markdown = "## Alpha ##  \r\nanswer\r\n";
		const sections = parseSections(markdown);

		const descriptors = resolveStudySections(
			markdown,
			[cachedCue(sections[0])],
			sections
		);

		expect(descriptors).toHaveLength(1);
		expect(descriptors[0].headingRange).toEqual({ from: 0, to: 13 });
		expect(descriptors[0].bodyRange).toEqual({ from: 15, to: 23 });
	});

	it("excludes stale, failed, empty, missing, and line-fallback-only cues", () => {
		const markdown = [
			"# Fresh",
			"fresh body",
			"# Stale",
			"current body",
			"# Failed",
			"failed body",
			"# Empty question",
			"answer body",
			"# Empty body",
			"# Last",
			"last body",
		].join("\n");
		const sections = parseSections(markdown);
		const [fresh, stale, failed, emptyQuestion, emptyBody, last] = sections;
		const cues = [
			cachedCue(fresh),
			cachedCue(stale, { contentHash: "stale000" }),
			cachedCue(failed, { error: "Generation failed" }),
			cachedCue(emptyQuestion, { question: "   " }),
			cachedCue(emptyBody),
			cachedCue(last, { id: "old-last", lineNumber: last.lineNumber }),
			cachedCue(last, { id: "missing", lineNumber: 99 }),
		];

		const descriptors = resolveStudySections(markdown, cues, sections);

		expect(descriptors.map((section) => section.sectionId)).toEqual(["fresh"]);
		expect(descriptors).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ sectionId: "old-last" }),
			])
		);
	});
});

describe("StudySessionController", () => {
	it("starts fresh, toggles sections independently, and hides all", () => {
		const sections = resolveAll("# Alpha\nA body.\n# Beta\nB body.");
		const controller = new StudySessionController();

		expect(controller.start("notes/a.md", sections)).toMatchObject({
			active: true,
			path: "notes/a.md",
			revealedCount: 0,
			total: 2,
		});

		controller.toggleReveal("notes/a.md", "alpha");
		controller.toggleReveal("notes/a.md", "beta");
		expect(controller.snapshot().sections.map(({ sectionId, revealed }) => ({ sectionId, revealed }))).toEqual([
			{ sectionId: "alpha", revealed: true },
			{ sectionId: "beta", revealed: true },
		]);

		controller.toggleReveal("notes/a.md", "alpha");
		expect(controller.snapshot().sections.find(({ sectionId }) => sectionId === "beta")?.revealed).toBe(true);

		controller.hideAll("notes/a.md");
		expect(controller.snapshot()).toMatchObject({
			active: true,
			revealedCount: 0,
			total: 2,
		});

		controller.toggleReveal("notes/a.md", "alpha");
		expect(controller.start("notes/a.md", sections).revealedCount).toBe(0);
	});

	it("ignores unknown or wrong-path reveal operations", () => {
		const sections = resolveAll("# Alpha\nA body.");
		const controller = new StudySessionController();
		controller.start("notes/a.md", sections);
		controller.toggleReveal("notes/a.md", "alpha");

		controller.toggleReveal("notes/a.md", "missing");
		controller.toggleReveal("notes/b.md", "alpha");
		controller.hideAll("notes/b.md");

		expect(controller.snapshot().revealedCount).toBe(1);
	});

	it("reconciles only the same path, preserving surviving reveals", () => {
		const controller = new StudySessionController();
		const initial = resolveAll("# Alpha\nA body.\n# Beta\nB body.");
		controller.start("notes/a.md", initial);
		controller.toggleReveal("notes/a.md", "alpha");
		controller.toggleReveal("notes/a.md", "beta");

		const next = resolveAll(
			"preface\n# Alpha\nA longer body.\n# Gamma\nC body."
		);
		const snapshot = controller.reconcile("notes/a.md", next);

		expect(snapshot.sections.map(({ sectionId, revealed }) => ({
			sectionId,
			revealed,
		}))).toEqual([
			{ sectionId: "alpha", revealed: true },
			{ sectionId: "gamma", revealed: false },
		]);
		expect(snapshot).toMatchObject({ revealedCount: 1, total: 2 });
		expect(snapshot.sections[0].bodyRange).toEqual({ from: 16, to: 31 });
	});

	it("ends when reconciliation has no studyable sections", () => {
		const controller = new StudySessionController();
		controller.start("notes/a.md", resolveAll("# Alpha\nA body."));

			expect(controller.reconcile("notes/a.md", [])).toEqual({
			active: false,
			path: null,
			sections: [],
			revealedCount: 0,
			total: 0,
		});
	});

	it("ends and clears progress when the path changes or the session exits", () => {
		const controller = new StudySessionController();
		const sections = resolveAll("# Alpha\nA body.");
		controller.start("notes/a.md", sections);
		controller.toggleReveal("notes/a.md", "alpha");

		expect(controller.reconcile("notes/renamed.md", sections).active).toBe(false);
		expect(controller.snapshot().revealedCount).toBe(0);

		controller.start("notes/a.md", sections);
		controller.toggleReveal("notes/a.md", "alpha");
		expect(controller.exit().active).toBe(false);
		expect(controller.snapshot().total).toBe(0);
	});
});
