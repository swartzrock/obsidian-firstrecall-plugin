import { describe, expect, it, vi } from "vitest";
import CueCraftPlugin from "../src/main";
import { CACHE_SCHEMA_VERSION, migrateCache } from "../src/cache";
import type { SecureCredentialStore } from "../src/secure-credential-store";
import {
	CueSectionCollapseStore,
	type CueSectionCollapseMap,
} from "../src/cue-section-collapse";

function richV6Cache() {
	return {
		schemaVersion: 6,
		generatedAt: "2026-08-01T12:00:00.000Z",
		noteModifiedAt: 1234,
		provider: "openai",
		model: "gpt-5-mini",
		generationMode: "whole-note-context",
		preset: "exam-prep",
		outline: {
			learningObjective: "Explain how retrieval strengthens memory.",
			keyThemes: ["retrieval", "memory"],
		},
		sections: [
			{
				id: "retrieval-practice",
				heading: "Retrieval Practice",
				level: 2,
				lineNumber: 7,
				contentHash: "abc123",
				keywords: ["retrieval", "testing effect"],
				question: "Why does retrieval practice strengthen memory?",
				confidence: "low",
				rationale: "The section states the causal relationship directly.",
				sectionLens: {
					takeaway: "Practice recalling an idea instead of rereading it.",
					keyPhrase: "retrieval practice",
					explanation: "Active recall makes the memory easier to access later.",
				},
				error: null,
			},
			{
				id: "summary-section",
				heading: "Summary",
				level: 2,
				lineNumber: 20,
				contentHash: "def456",
				keywords: null,
				question: null,
				confidence: null,
				rationale: "Provider validation failed.",
				sectionLens: null,
				error: "question is required",
			},
		],
		summary: "Retrieval practice improves later access to learned material.",
		noteBrief: {
			overview: "Retrieval strengthens memory. Repeated recall improves access.",
			whatMatters: {
				title: "Recall beats rereading",
				detail: "Effortful retrieval produces more durable learning.",
			},
			reviewFirst: {
				title: "Retrieval practice",
				detail: "Start with the mechanism that strengthens recall.",
			},
			sayItBack: {
				title: "Why does retrieval strengthen memory?",
				detail: "Explain the testing effect without looking at the note.",
			},
		},
	};
}

function unavailableCredentialStore(): SecureCredentialStore {
	const missing = async () => ({
		ok: false as const,
		reason: "missing-credential" as const,
	});
	return {
		availability: () => ({ ok: true }),
		metadata: missing,
		read: missing,
		save: missing,
		clear: missing,
	};
}

describe("plugin data cache migration", () => {
	it.each([
		"collapsed-tabs",
		"active-section-composer",
		"hook-minimap",
		"not-a-display",
	])("replaces invalid editor display %s with inline cues", async (display) => {
		const saveData = vi.fn(async () => {});
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => ({
				settings: { editorCueDisplay: display },
			})),
			saveData,
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		expect(plugin.settings.editorCueDisplay).toBe("inline-cues");
		expect(saveData).toHaveBeenCalledTimes(1);
		const persisted = saveData.mock.calls[0]?.[0] as {
			settings: Record<string, unknown>;
		};
		expect(persisted.settings.editorCueDisplay).toBe("inline-cues");
	});

	it("strips obsolete settings, preserves editor settings, and saves once", async () => {
		const saveData = vi.fn(async () => {});
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => ({
				settings: {
					autoSummary: false,
					cornellDisplayMode: "hook",
					cornellStyle: "legal-pad",
					cueColumnWidth: "wide",
					cueAccent: "blue",
					showCueBorder: false,
					compactChips: true,
					foldCueColumnOnMobile: false,
					readingModeDisplay: "review-button",
					editorCueWidthPreset: "wide",
					editorHookCardStyle: "gradient",
					editorCueDisplay: "cornell",
					cueFontSize: "large",
					editorCueCustomWidthPx: 240,
				},
			})),
			saveData,
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();
		expect(saveData).toHaveBeenCalledTimes(1);
		const persisted = saveData.mock.calls[0]?.[0] as {
			settings: Record<string, unknown>;
		};
		for (const key of [
			"autoSummary",
			"cornellDisplayMode",
			"cornellStyle",
			"cueColumnWidth",
			"cueAccent",
			"showCueBorder",
			"compactChips",
			"foldCueColumnOnMobile",
			"readingModeDisplay",
			"editorCueWidthPreset",
			"editorHookCardStyle",
		]) {
			expect(persisted.settings).not.toHaveProperty(key);
		}
		expect(persisted.settings).toMatchObject({
			editorCueDisplay: "cornell",
			cueFontSize: "large",
			editorCueCustomWidthPx: 240,
		});
	});

	it("discards every custom instruction override", async () => {
		const saveData = vi.fn(async () => {});
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => ({
				settings: {
					cueInstructionsOverride: "Custom cue policy.",
					noteBriefInstructionsOverride: "Custom Note Brief policy.",
					summaryInstructionsOverride: "Legacy Summary policy.",
				},
			})),
			saveData,
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		expect(saveData).toHaveBeenCalledTimes(1);
		const persisted = saveData.mock.calls[0]?.[0] as {
			settings: Record<string, unknown>;
		};
		for (const key of [
			"cueInstructionsOverride",
			"noteBriefInstructionsOverride",
			"summaryInstructionsOverride",
		]) {
			expect(plugin.settings).not.toHaveProperty(key);
			expect(persisted.settings).not.toHaveProperty(key);
		}
	});

	it("loads malformed collapse data as empty without disturbing other data", async () => {
		const loaded = {
			settings: { showRailQuestions: false },
			caches: {},
			hidden: { "notes/hidden.md": true },
			cueSectionCollapse: "collapsed",
		};
		const saveData = vi.fn(async () => {});
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => loaded),
			saveData,
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		const data = (
			plugin as unknown as {
				data: {
					settings: Record<string, unknown>;
					caches: Record<string, unknown>;
					hidden: Record<string, true>;
					cueSectionCollapse: CueSectionCollapseMap;
				};
			}
		).data;
		expect(data.settings.showQuestion).toBe(false);
		expect(data.settings.showSummary).toBe(true);
		expect(data.caches).toEqual({});
		expect(data.hidden).toEqual(loaded.hidden);
		expect(data.cueSectionCollapse).toEqual({});
		expect(saveData).toHaveBeenCalledTimes(1);
		const persisted = saveData.mock.calls[0]?.[0] as {
			settings: Record<string, unknown>;
		};
		expect(persisted.settings.showQuestion).toBe(false);
		expect(persisted.settings).not.toHaveProperty("showRailQuestions");
	});

	it("preserves all-off component visibility", async () => {
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => ({
				settings: {
					showRailSummary: false,
					showRailQuestions: false,
					showRailSupportTerms: false,
				},
			})),
			saveData: vi.fn(async () => {}),
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		expect(plugin.settings.showSummary).toBe(false);
		expect(plugin.settings.showQuestion).toBe(false);
		expect(plugin.settings.showTerms).toBe(false);
	});

	it.each([
		[{ cuePreset: "conceptual", cueDensity: 2, questionStyle: "recall" }, "conceptual"],
		[{ cuePreset: "exam-prep", questionStyle: "exam" }, "exam-practice"],
		[{ cuePreset: "vocabulary" }, "vocabulary-check"],
		[{ cuePreset: "minimal", cueDensity: 1 }, "direct-recall"],
		[{ questionStyle: "socratic" }, "socratic-reasoning"],
		[{ cuePreset: "vocabulary", questionStyle: "exam" }, "conceptual"],
		[{ cuePreset: "unrecognized" }, "conceptual"],
	] as const)("normalizes legacy Question settings %#", async (stored, expected) => {
		const saveData = vi.fn(async () => {});
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => ({ settings: stored })),
			saveData,
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		expect(plugin.settings.questionType).toBe(expected);
		expect(saveData).toHaveBeenCalledTimes(1);
		const persisted = saveData.mock.calls[0]?.[0] as {
			settings: Record<string, unknown>;
		};
		expect(persisted.settings.questionType).toBe(expected);
		for (const key of ["cuePreset", "cueDensity", "questionStyle"]) {
			expect(persisted.settings).not.toHaveProperty(key);
		}
	});

	it("uses component-specific visibility precedence and removes every legacy key", async () => {
		const saveData = vi.fn(async () => {});
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => ({
				settings: {
					showRailSummary: false,
					showSectionLens: true,
					showRailQuestions: false,
					showRailSupportTerms: "invalid",
					generateKeywords: false,
					showNoteBrief: false,
					renderInReadingMode: false,
				},
			})),
			saveData,
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		expect(plugin.settings).toMatchObject({
			showSummary: false,
			showQuestion: false,
			showTerms: false,
			showNoteBrief: false,
		});
		expect(saveData).toHaveBeenCalledTimes(1);
		const persisted = saveData.mock.calls[0]?.[0] as {
			settings: Record<string, unknown>;
		};
		for (const key of [
			"showRailSummary",
			"showRailQuestions",
			"showRailSupportTerms",
			"showSectionLens",
			"generateKeywords",
			"renderInReadingMode",
		]) {
			expect(persisted.settings).not.toHaveProperty(key);
		}
	});

	it("falls back only to each component's documented source", async () => {
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => ({
				settings: {
					showRailSummary: "invalid",
					showSectionLens: false,
					showRailQuestions: "invalid",
					showRailSupportTerms: null,
					generateKeywords: false,
					showNoteBrief: "invalid",
					renderInReadingMode: false,
				},
			})),
			saveData: vi.fn(async () => {}),
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		expect(plugin.settings).toMatchObject({
			showSummary: false,
			showQuestion: true,
			showTerms: false,
			showNoteBrief: true,
		});
	});

	it("persists a canonical v7 cache without discarding an invalid cache entry", async () => {
		const v6 = richV6Cache();
		const invalid = { schemaVersion: 99, sections: ["unknown"] };
		const loaded = {
			settings: {},
			caches: {
				"notes/retrieval.md": v6,
				"notes/unrecognized.md": invalid,
			},
			hidden: { "notes/hidden.md": true },
			cueSectionCollapse: {
				"notes/retrieval.md": {
					"retrieval-practice": {
						summary: true,
						question: false,
						terms: "yes",
					},
					"": { question: true },
				},
				"": { invalid: { terms: true } },
			},
		};
		const saveData = vi.fn(async () => {});
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => loaded),
			saveData,
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		expect(saveData).toHaveBeenCalledTimes(1);
		const persisted = saveData.mock.calls[0][0] as typeof loaded;
		expect(persisted.caches["notes/retrieval.md"]).toEqual(migrateCache(v6));
		expect(persisted.caches["notes/retrieval.md"].schemaVersion).toBe(
			CACHE_SCHEMA_VERSION
		);
		expect(persisted.caches["notes/retrieval.md"].sections[0]).not.toHaveProperty(
			"confidence"
		);
		expect(persisted.caches["notes/retrieval.md"].sections[0]).not.toHaveProperty(
			"rationale"
		);
		expect(persisted.caches["notes/retrieval.md"]).not.toHaveProperty("summary");
		expect(persisted.caches["notes/retrieval.md"].outline).toEqual({
			keyThemes: ["retrieval", "memory"],
		});
		expect(persisted.caches["notes/retrieval.md"].sections[1]).toMatchObject({
			heading: "Summary",
			error: "question is required",
		});
		expect(persisted.caches["notes/unrecognized.md"]).toEqual(invalid);
		expect(persisted.hidden).toEqual(loaded.hidden);
		expect(persisted.cueSectionCollapse).toEqual({
			"notes/retrieval.md": {
				"retrieval-practice": { summary: true },
			},
		});
	});
});

interface PluginPersistenceHarness {
	data: {
		settings: Record<string, unknown>;
		caches: Record<string, unknown>;
		hidden: Record<string, true>;
		cueSectionCollapse: CueSectionCollapseMap;
	};
	persistPluginData(): Promise<void>;
}

function persistenceHarness(
	saveData: (snapshot: unknown) => Promise<void>
): PluginPersistenceHarness {
	const plugin = new CueCraftPlugin({} as never, {} as never);
	Object.assign(plugin as unknown as Record<string, unknown>, {
		data: {
			settings: { marker: "before" },
			caches: {},
			hidden: {},
			cueSectionCollapse: {},
		},
		retainedCaches: {},
		saveData,
	});
	return plugin as unknown as PluginPersistenceHarness;
}

describe("plugin data persistence ordering", () => {
	it("keeps the final rapid collapse state when writes finish slowly", async () => {
		const completed: Array<Record<string, unknown>> = [];
		const delays = [5, 30, 0];
		let call = 0;
		const plugin = persistenceHarness(async (snapshot) => {
			const delay = delays[call++] ?? 0;
			await new Promise((resolve) => setTimeout(resolve, delay));
			completed.push(snapshot as Record<string, unknown>);
		});
		const store = new CueSectionCollapseStore({}, async (map) => {
			plugin.data.cueSectionCollapse = map;
			await plugin.persistPluginData();
		});

		const writes = [
			store.setCollapsed("notes/a.md", "section-a", "summary", true),
			store.setCollapsed("notes/a.md", "section-a", "summary", false),
			store.setCollapsed("notes/a.md", "section-a", "summary", true),
		];
		await Promise.all(writes);

		expect(completed).toHaveLength(3);
		expect(completed.at(-1)?.cueSectionCollapse).toEqual({
			"notes/a.md": { "section-a": { summary: true } },
		});
	});

	it("preserves collapse and an interleaved whole-plugin update", async () => {
		const completed: Array<Record<string, unknown>> = [];
		let call = 0;
		const plugin = persistenceHarness(async (snapshot) => {
			const delay = call++ === 0 ? 20 : 0;
			await new Promise((resolve) => setTimeout(resolve, delay));
			completed.push(snapshot as Record<string, unknown>);
		});
		const store = new CueSectionCollapseStore({}, async (map) => {
			plugin.data.cueSectionCollapse = map;
			await plugin.persistPluginData();
		});

		const collapseWrite = store.setCollapsed(
			"notes/a.md",
			"section-a",
			"question",
			true
		);
		plugin.data.settings = { marker: "after" };
		const settingsWrite = plugin.persistPluginData();
		await Promise.all([collapseWrite, settingsWrite]);

		expect(completed.at(-1)).toMatchObject({
			settings: { marker: "after" },
			cueSectionCollapse: {
				"notes/a.md": { "section-a": { question: true } },
			},
		});
	});
});
