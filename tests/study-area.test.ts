import { describe, expect, it } from "vitest";
import { buildNoteCache, type NoteCache } from "../src/cache";
import { parseSections } from "../src/parser";
import {
	DEFAULT_STUDY_AREAS,
	DEFAULT_STUDY_AREA_AUTOMATION_ENABLED,
	classifyStudyAreaNote,
	eligibleStudyAreaPaths,
	isExcludedPath,
	isStudyAreaPath,
	loadStudyAreas,
	planStudyAreaGeneration,
	summarizeStudyAreaRun,
	type StudyArea,
} from "../src/study-area";
import type { NoteGenerationResult } from "../src/generator";

const NOTE = "# A\nalpha\n## B\nbeta";

describe("study area defaults", () => {
	it("starts with no study areas and study-area automation paused", () => {
		expect(DEFAULT_STUDY_AREAS).toEqual([]);
		expect(DEFAULT_STUDY_AREA_AUTOMATION_ENABLED).toBe(false);
	});
});

function area(overrides: Partial<StudyArea> = {}): StudyArea {
	return {
		id: "area-1",
		name: "Biology",
		parentPath: "Courses/Biology",
		excludedPaths: [],
		maintenanceMode: "paused",
		createdAt: "2026-06-21T00:00:00.000Z",
		...overrides,
	};
}

function buildCache(markdown = NOTE): NoteCache {
	const sections = parseSections(markdown).map((section) => ({
		id: section.id,
		heading: section.heading,
		level: section.level,
		lineNumber: section.lineNumber,
		contentHash: section.contentHash,
		keywords: ["cell"],
		question: `Q:${section.heading}`,
		confidence: "high" as const,
		rationale: null,
		error: null,
	}));
	const result: NoteGenerationResult = {
		sections,
		summary: "summary",
		learningObjective: "learn biology",
		canceled: false,
	};
	return buildNoteCache({
		result,
		provider: "ollama",
		model: "llama3.1:8b",
		preset: "conceptual",
		generationMode: "whole-note-context",
		noteModifiedAt: 100,
		generatedAt: "2026-06-21T00:00:00.000Z",
	});
}

describe("study area path matching", () => {
	it("includes descendant Markdown notes and excludes sibling folders", () => {
		const studyArea = area();
		expect(isStudyAreaPath(studyArea, "Courses/Biology/Week 1.md")).toBe(true);
		expect(isStudyAreaPath(studyArea, "Courses/Biology/Sub/Week 2.md")).toBe(true);
		expect(isStudyAreaPath(studyArea, "Courses/Biology.md")).toBe(false);
		expect(isStudyAreaPath(studyArea, "Courses/Biology Lab/Week 1.md")).toBe(false);
		expect(isStudyAreaPath(studyArea, "Courses/Biology/asset.pdf")).toBe(false);
	});

	it("uses explicit exclusions for notes and subfolders", () => {
		const studyArea = area({
			excludedPaths: ["Courses/Biology/private.md", "Courses/Biology/Drafts"],
		});
		expect(isExcludedPath("Courses/Biology/private.md", studyArea.excludedPaths)).toBe(true);
		expect(isExcludedPath("Courses/Biology/Drafts/a.md", studyArea.excludedPaths)).toBe(true);
		expect(eligibleStudyAreaPaths(studyArea, [
			"Courses/Biology/private.md",
			"Courses/Biology/Drafts/a.md",
			"Courses/Biology/Public/a.md",
			"Courses/Chemistry/a.md",
		])).toEqual(["Courses/Biology/Public/a.md"]);
	});
});

describe("study area readiness", () => {
	it("classifies hidden and excluded notes as skipped", () => {
		const studyArea = area({ excludedPaths: ["Courses/Biology/private.md"] });
		expect(classifyStudyAreaNote(studyArea, {
			path: "Courses/Biology/private.md",
			cache: null,
			currentSections: [],
		})).toEqual({
			path: "Courses/Biology/private.md",
			readiness: "skipped",
			reason: "excluded",
		});
		expect(classifyStudyAreaNote(studyArea, {
			path: "Courses/Biology/Public.md",
			cache: null,
			currentSections: [],
			hidden: true,
		}).readiness).toBe("skipped");
	});

	it("classifies uncached notes as uncued", () => {
		expect(classifyStudyAreaNote(area(), {
			path: "Courses/Biology/Week 1.md",
			cache: null,
			currentSections: parseSections(NOTE),
		}).readiness).toBe("uncued");
	});

	it("classifies cached notes as ready, stale, or failed", () => {
		const cache = buildCache();
		const studyArea = area();
		expect(classifyStudyAreaNote(studyArea, {
			path: "Courses/Biology/Week 1.md",
			cache,
			currentSections: parseSections(NOTE),
		}).readiness).toBe("ready");
		expect(classifyStudyAreaNote(studyArea, {
			path: "Courses/Biology/Week 1.md",
			cache,
			currentSections: parseSections("# A\nedited\n## B\nbeta"),
		}).readiness).toBe("stale");
		expect(classifyStudyAreaNote(studyArea, {
			path: "Courses/Biology/Week 1.md",
			cache: {
				...cache,
				sections: [{ ...cache.sections[0], error: "boom" }, cache.sections[1]],
			},
			currentSections: parseSections(NOTE),
		}).readiness).toBe("failed");
	});
});

describe("study area generation planning", () => {
	it("previews readiness counts and queues uncued notes without generation", () => {
		const plan = planStudyAreaGeneration(area(), [
			{
				path: "Courses/Biology/Ready.md",
				cache: buildCache(),
				currentSections: parseSections(NOTE),
			},
			{
				path: "Courses/Biology/Uncued.md",
				cache: null,
				currentSections: parseSections(NOTE),
			},
			{
				path: "Courses/Biology/Hidden.md",
				cache: null,
				currentSections: parseSections(NOTE),
				hidden: true,
			},
		]);
		expect(plan.counts).toEqual({
			ready: 1,
			uncued: 1,
			stale: 0,
			failed: 0,
			skipped: 1,
		});
		expect(plan.items).toEqual([
			{
				path: "Courses/Biology/Uncued.md",
				action: "generate-note",
				sectionIds: [],
				readiness: "uncued",
				sectionCount: 2,
			},
		]);
	});

	it("queues retry work for failed sections only", () => {
		const cache = buildCache();
		const failedCache: NoteCache = {
			...cache,
			sections: [
				cache.sections[0],
				{ ...cache.sections[1], question: null, error: "provider failed" },
			],
		};
		const plan = planStudyAreaGeneration(area(), [
			{
				path: "Courses/Biology/Failed.md",
				cache: failedCache,
				currentSections: parseSections(NOTE),
			},
			{
				path: "Courses/Biology/Ready.md",
				cache,
				currentSections: parseSections(NOTE),
			},
		], "retry-failed");
		expect(plan.items).toEqual([
			{
				path: "Courses/Biology/Failed.md",
				action: "retry-failed-sections",
				sectionIds: [cache.sections[1].id],
				readiness: "failed",
				sectionCount: 1,
			},
		]);
	});

	it("plans edited-section refresh and structural full generation separately", () => {
		const cache = buildCache();
		const editedOnly = planStudyAreaGeneration(area(), [
			{
				path: "Courses/Biology/Edited.md",
				cache,
				currentSections: parseSections("# A\nalpha edited\n## B\nbeta"),
			},
		]);
		expect(editedOnly.items).toEqual([
			{
				path: "Courses/Biology/Edited.md",
				action: "refresh-stale-sections",
				sectionIds: [cache.sections[0].id],
				readiness: "stale",
				sectionCount: 1,
			},
		]);

		const structural = planStudyAreaGeneration(area(), [
			{
				path: "Courses/Biology/Structural.md",
				cache,
				currentSections: parseSections("# A\nalpha\n## B\nbeta\n## C\ngamma"),
			},
		]);
		expect(structural.items).toEqual([
			{
				path: "Courses/Biology/Structural.md",
				action: "generate-note",
				sectionIds: [],
				readiness: "stale",
				sectionCount: 3,
			},
		]);
	});

	it("summarizes completed, failed, skipped, and remaining work", () => {
		const plan = planStudyAreaGeneration(area(), [
			{
				path: "Courses/Biology/One.md",
				cache: null,
				currentSections: parseSections(NOTE),
			},
			{
				path: "Courses/Biology/Two.md",
				cache: null,
				currentSections: parseSections(NOTE),
			},
			{
				path: "Courses/Biology/Hidden.md",
				cache: null,
				currentSections: parseSections(NOTE),
				hidden: true,
			},
		]);
		expect(summarizeStudyAreaRun(plan, {
			completedPaths: ["Courses/Biology/One.md"],
			failedPaths: [],
			canceled: true,
		})).toEqual({
			total: 2,
			completed: 1,
			failed: 0,
			skipped: 1,
			remaining: 1,
			canceled: true,
		});
	});
});

describe("loadStudyAreas", () => {
	it("loads legacy or invalid settings defensively", () => {
		expect(loadStudyAreas(undefined)).toEqual([]);
		expect(loadStudyAreas({})).toEqual([]);
		expect(loadStudyAreas([{ id: "", parentPath: "Courses" }, "bad"])).toEqual([]);
	});

	it("normalizes valid persisted study areas", () => {
		expect(loadStudyAreas([
			{
				id: "bio",
				name: "",
				parentPath: "/Courses/Biology/",
				excludedPaths: ["/Courses/Biology/Drafts/", 42],
				maintenanceMode: "unknown",
			},
		])).toEqual([
			{
				id: "bio",
				name: "Biology",
				parentPath: "Courses/Biology",
				excludedPaths: ["Courses/Biology/Drafts"],
				maintenanceMode: "paused",
				createdAt: "1970-01-01T00:00:00.000Z",
			},
		]);
	});
});
