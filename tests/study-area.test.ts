import { describe, expect, it } from "vitest";
import { buildNoteCache, type NoteCache } from "../src/cache";
import { parseSections } from "../src/parser";
import {
	DEFAULT_STUDY_AREAS,
	ENTIRE_VAULT_STUDY_AREA_LABEL,
	classifyStudyAreaNote,
	findMaintainedStudyAreaForPath,
	formatStudyAreaReadinessCounts,
	isEntireVaultStudyArea,
	isExcludedPath,
	isStudyAreaPath,
	loadStudyAreaSettings,
	loadStudyAreas,
	planStudyAreaGeneration,
	studyAreaNameForParentPath,
	studyAreaScopeLabel,
	summarizeStudyAreaRun,
	validateStudyAreaScope,
	validateStudyAreaExclusion,
	findConflictingStudyArea,
	type StudyArea,
} from "../src/study-area";
import type { NoteGenerationResult } from "../src/generator";

const NOTE = "# A\nalpha\n## B\nbeta";

describe("study area defaults", () => {
	it("starts with no study areas", () => {
		expect(DEFAULT_STUDY_AREAS).toEqual([]);
	});
});

describe("study area exclusion and recovery validation", () => {
	it("accepts only unique nested exclusion paths", () => {
		const biology = area({ excludedPaths: ["Courses/Biology/Drafts"] });
		expect(validateStudyAreaExclusion(biology, "Courses/Biology/Cells.md"))
			.toEqual({ valid: true, reason: null });
		expect(validateStudyAreaExclusion(biology, "Courses/Biology/Drafts"))
			.toEqual({ valid: false, reason: "duplicate-path" });
		expect(validateStudyAreaExclusion(biology, "Courses/Chemistry"))
			.toEqual({ valid: false, reason: "outside-scope" });
		expect(validateStudyAreaExclusion(biology, "Courses/Biology"))
			.toEqual({ valid: false, reason: "outside-scope" });
	});

	it("names the active scope responsible for a disabled legacy conflict", () => {
		const parent = area({ id: "parent" });
		expect(
			findConflictingStudyArea([parent], "Courses/Biology/Year 1")?.id
		).toBe("parent");
		expect(findConflictingStudyArea([parent], "Courses/Chemistry")).toBeNull();
	});
});

describe("study area labels", () => {
	it("uses user-facing automation and count copy", () => {
		expect(studyAreaScopeLabel("")).toBe(ENTIRE_VAULT_STUDY_AREA_LABEL);
		expect(studyAreaNameForParentPath("")).toBe(ENTIRE_VAULT_STUDY_AREA_LABEL);
		expect(
			formatStudyAreaReadinessCounts(
				{
					ready: 4,
					uncued: 2,
					stale: 1,
					failed: 0,
					skipped: 2,
				}
			)
		).toBe("4 notes ready · 2 notes missing study material · 1 note outdated");
		expect(
			formatStudyAreaReadinessCounts({
				ready: 0,
				uncued: 3,
				stale: 0,
				failed: 0,
				skipped: 1,
			})
		).toBe("3 notes missing study material");
		expect(
			formatStudyAreaReadinessCounts({
				ready: 0,
				uncued: 0,
				stale: 0,
				failed: 0,
				skipped: 1,
			})
		).toBe("No eligible notes");
		expect(
			formatStudyAreaReadinessCounts({
				ready: 0,
				uncued: 0,
				stale: 0,
				failed: 0,
				skipped: 0,
			})
		).toBe("No notes found");
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
		error: null,
	}));
	const result: NoteGenerationResult = {
		sections,
		noteBrief: {
			overview: "A and B",
			whatMatters: { title: "Both", detail: "Both matter." },
			reviewFirst: { title: "A", detail: "Start with A." },
			sayItBack: { title: "Explain", detail: "Explain both." },
		},
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

	it("can use the entire vault as a study area", () => {
		const studyArea = area({
			name: ENTIRE_VAULT_STUDY_AREA_LABEL,
			parentPath: "",
		});
		expect(isEntireVaultStudyArea(studyArea)).toBe(true);
		expect(isStudyAreaPath(studyArea, "Root note.md")).toBe(true);
		expect(isStudyAreaPath(studyArea, "Courses/Biology/Week 1.md")).toBe(true);
		expect(isStudyAreaPath(studyArea, "image.png")).toBe(false);
	});

	it("uses explicit exclusions for notes and subfolders", () => {
		const studyArea = area({
			excludedPaths: ["Courses/Biology/private.md", "Courses/Biology/Drafts"],
		});
		expect(isExcludedPath("Courses/Biology/private.md", studyArea.excludedPaths)).toBe(true);
		expect(isExcludedPath("Courses/Biology/Drafts/a.md", studyArea.excludedPaths)).toBe(true);
		expect(isStudyAreaPath(studyArea, "Courses/Biology/Public/a.md")).toBe(true);
	});
});

describe("study area maintenance matching", () => {
	it("matches edited notes inside enabled study areas only", () => {
		const maintained = area({ maintenanceMode: "maintain-on-save" });
		expect(
			findMaintainedStudyAreaForPath(
				[maintained],
				"Courses/Biology/Week 1.md"
			)
		)?.toEqual(maintained);
		expect(
			findMaintainedStudyAreaForPath(
				[maintained],
				"Courses/Chemistry/Week 1.md"
			)
		).toBeNull();
		expect(
			findMaintainedStudyAreaForPath(
				[area({ maintenanceMode: "paused" })],
				"Courses/Biology/Week 1.md"
			)
		).toBeNull();
	});

	it("uses explicit exclusions without treating hidden state as an opt-out", () => {
		const maintained = area({
			maintenanceMode: "maintain-on-save",
			excludedPaths: ["Courses/Biology/Drafts"],
		});
		expect(
			findMaintainedStudyAreaForPath(
				[maintained],
				"Courses/Biology/Drafts/a.md"
			)
		).toBeNull();
		expect(
			findMaintainedStudyAreaForPath(
				[maintained],
				"Courses/Biology/Public/a.md"
			)
		).toEqual(maintained);
	});
});

describe("study area readiness", () => {
	it("classifies exclusions as skipped without using hidden presentation state", () => {
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
		const hiddenPresentationState = {
			path: "Courses/Biology/Public.md",
			cache: null,
			currentSections: parseSections(NOTE),
			hidden: true,
		};
		expect(
			classifyStudyAreaNote(studyArea, hiddenPresentationState).readiness
		).toBe("uncued");
	});

	it("classifies uncached notes as uncued", () => {
		expect(classifyStudyAreaNote(area(), {
			path: "Courses/Biology/Week 1.md",
			cache: null,
			currentSections: parseSections(NOTE),
		}).readiness).toBe("uncued");
	});

	it("classifies notes with only empty heading sections as skipped", () => {
		expect(classifyStudyAreaNote(area(), {
			path: "Courses/Biology/Empty.md",
			cache: null,
			currentSections: parseSections("# Parent\n## Child\n"),
		})).toEqual({
			path: "Courses/Biology/Empty.md",
			readiness: "skipped",
			reason: "empty",
		});
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
		const hiddenPresentationState = {
			path: "Courses/Biology/Hidden.md",
			cache: null,
			currentSections: parseSections(NOTE),
			hidden: true,
		};
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
			hiddenPresentationState,
		]);
		expect(plan.counts).toEqual({
			ready: 1,
			uncued: 2,
			stale: 0,
			failed: 0,
			skipped: 0,
		});
		expect(plan.items).toEqual([
			{
				path: "Courses/Biology/Uncued.md",
				action: "generate-note",
				sectionIds: [],
				readiness: "uncued",
				sectionCount: 2,
			},
			{
				path: "Courses/Biology/Hidden.md",
				action: "generate-note",
				sectionIds: [],
				readiness: "uncued",
				sectionCount: 2,
			},
		]);
	});

	it("queues uncued saved notes for maintain-on-save generation", () => {
		const plan = planStudyAreaGeneration(area(), [
			{
				path: "Courses/Biology/Edited.md",
				cache: null,
				currentSections: parseSections(NOTE),
			},
		], "maintain-note");
		expect(plan.items).toEqual([
			{
				path: "Courses/Biology/Edited.md",
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

	it("queues durable retry work when initial generation left no cache", () => {
		const sectionId = parseSections(NOTE)[0].id;
		const plan = planStudyAreaGeneration(area(), [
			{
				path: "Courses/Biology/Failed.md",
				cache: null,
				currentSections: parseSections(NOTE),
				failedComponents: {
					noteBrief: true,
					sectionIds: [sectionId],
				},
			},
		], "retry-failed");

		expect(plan.counts.failed).toBe(1);
		expect(plan.items).toEqual([
			{
				path: "Courses/Biology/Failed.md",
				action: "retry-failed-sections",
				sectionIds: [sectionId],
				readiness: "failed",
				sectionCount: 1,
			},
		]);
	});

	it("plans edited and structural changes as incremental refreshes", () => {
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

		const structuralSections = parseSections("# A\nalpha\n## B\nbeta\n## C\ngamma");
		const structural = planStudyAreaGeneration(area(), [
			{
				path: "Courses/Biology/Structural.md",
				cache,
				currentSections: structuralSections,
			},
		]);
		expect(structural.items).toEqual([
			{
				path: "Courses/Biology/Structural.md",
				action: "refresh-stale-sections",
				sectionIds: [structuralSections[2].id],
				readiness: "stale",
				sectionCount: 1,
			},
		]);

		const removedOnly = planStudyAreaGeneration(area(), [
			{
				path: "Courses/Biology/Removed.md",
				cache,
				currentSections: parseSections("# A\nalpha"),
			},
		]);
		expect(removedOnly.items).toEqual([
			{
				path: "Courses/Biology/Removed.md",
				action: "refresh-stale-sections",
				sectionIds: [],
				readiness: "stale",
				sectionCount: 0,
			},
		]);
	});

	it("queues provider-limited sections after the selected provider changes", () => {
		const markdown = Array.from(
			{ length: 6 },
			(_, index) => `# Section ${index + 1}\ncontent ${index + 1}`
		).join("\n");
		const cache = buildCache(markdown);
		cache.sections[5] = {
			...cache.sections[5],
			question: null,
			keywords: null,
			summary: null,
			unavailable: {
				reason: "provider-limit",
				providerId: "hosted-demo",
				providerLabel: "FirstRecall trial",
				maxSections: 5,
			},
		};

		const plan = planStudyAreaGeneration(area(), [{
			path: "Courses/Biology/Limited.md",
			cache,
			currentSections: parseSections(markdown),
			provider: "anthropic",
		}]);

		expect(plan.items).toEqual([{
			path: "Courses/Biology/Limited.md",
			action: "refresh-stale-sections",
			sectionIds: [cache.sections[5].id],
			readiness: "stale",
			sectionCount: 1,
		}]);
	});

	it("queues Note Brief-only catch-up and Retry work without section calls", () => {
		const cache = buildCache();
		const missingBrief = { ...cache, noteBrief: null };
		const catchUp = planStudyAreaGeneration(area(), [
			{
				path: "Courses/Biology/Missing brief.md",
				cache: missingBrief,
				currentSections: parseSections(NOTE),
				noteBriefNeedsRefresh: true,
			},
		]);
		expect(catchUp.items).toEqual([
			{
				path: "Courses/Biology/Missing brief.md",
				action: "refresh-stale-sections",
				sectionIds: [],
				readiness: "stale",
				sectionCount: 0,
			},
		]);

		const retry = planStudyAreaGeneration(area(), [
			{
				path: "Courses/Biology/Failed brief.md",
				cache,
				currentSections: parseSections(NOTE),
				failedComponents: { noteBrief: true, sectionIds: [] },
			},
		], "retry-failed");
		expect(retry.items).toEqual([
			{
				path: "Courses/Biology/Failed brief.md",
				action: "retry-failed-sections",
				sectionIds: [],
				readiness: "failed",
				sectionCount: 0,
			},
		]);
	});

	it("summarizes completed, failed, skipped, and remaining work", () => {
		const hiddenPresentationState = {
			path: "Courses/Biology/Hidden.md",
			cache: null,
			currentSections: parseSections(NOTE),
			hidden: true,
		};
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
			hiddenPresentationState,
		]);
		expect(summarizeStudyAreaRun(plan, {
			completedPaths: ["Courses/Biology/One.md"],
			failedPaths: [],
			canceled: true,
		})).toEqual({
			total: 3,
			completed: 1,
			failed: 0,
			skipped: 0,
			remaining: 2,
			canceled: true,
		});
	});
});

describe("study area scope invariants", () => {
	it("rejects Entire vault mixed with folders", () => {
		expect(validateStudyAreaScope([area()], "")).toEqual({
			valid: false,
			reason: "entire-vault-conflict",
		});
		expect(
			validateStudyAreaScope(
				[area({ parentPath: "" })],
				"Courses/Biology"
			)
		).toEqual({ valid: false, reason: "entire-vault-conflict" });
	});

	it("rejects parent, descendant, and duplicate folder scopes", () => {
		expect(
			validateStudyAreaScope([area()], "Courses/Biology/Year 1")
		).toEqual({ valid: false, reason: "overlapping-path" });
		expect(
			validateStudyAreaScope(
				[area({ parentPath: "Courses/Biology/Year 1" })],
				"Courses/Biology"
			)
		).toEqual({ valid: false, reason: "overlapping-path" });
		expect(validateStudyAreaScope([area()], "/Courses/Biology/")).toEqual({
			valid: false,
			reason: "duplicate-path",
		});
	});

	it("accepts non-overlapping sibling folder scopes", () => {
		expect(
			validateStudyAreaScope([area()], "Courses/Chemistry")
		).toEqual({ valid: true, reason: null });
	});
});

describe("loadStudyAreas", () => {
	it("loads missing or invalid settings defensively", () => {
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

	it("preserves an entire-vault study area with a blank parent path", () => {
		expect(loadStudyAreas([
			{
				id: "vault",
				name: "",
				parentPath: "",
				excludedPaths: [],
				maintenanceMode: "maintain-on-save",
				createdAt: "2026-06-21T00:00:00.000Z",
			},
		])).toEqual([
			{
				id: "vault",
				name: ENTIRE_VAULT_STUDY_AREA_LABEL,
				parentPath: "",
				excludedPaths: [],
				maintenanceMode: "maintain-on-save",
				createdAt: "2026-06-21T00:00:00.000Z",
			},
		]);
	});

	it("quarantines conflicting legacy paths outside active coverage", () => {
		const loaded = loadStudyAreaSettings([
			area({ id: "bio", parentPath: "Courses/Biology" }),
			area({ id: "year", parentPath: "Courses/Biology/Year 1" }),
			area({ id: "chem", parentPath: "Courses/Chemistry" }),
			area({ id: "vault", parentPath: "" }),
		]);

		expect(loaded.studyAreas.map((studyArea) => studyArea.id)).toEqual([
			"bio",
			"chem",
		]);
		expect(loaded.disabledStudyAreas).toMatchObject([
			{
				id: "year",
				parentPath: "Courses/Biology/Year 1",
				maintenanceMode: "paused",
				disabledReason: "overlapping-path",
			},
			{
				id: "vault",
				parentPath: "",
				maintenanceMode: "paused",
				disabledReason: "entire-vault-conflict",
			},
		]);
	});
});
