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

	it.each([
		{
			name: "legacy key only",
			stored: { summaryInstructionsOverride: "  Legacy policy.  " },
			expected: "  Legacy policy.  ",
			saves: 1,
		},
		{
			name: "new key only",
			stored: { noteBriefInstructionsOverride: "  Current policy.  " },
			expected: "  Current policy.  ",
			saves: 0,
		},
		{
			name: "both keys",
			stored: {
				summaryInstructionsOverride: "Legacy policy.",
				noteBriefInstructionsOverride: "Current policy.",
			},
			expected: "Current policy.",
			saves: 1,
		},
	])("uses the expected Note Brief prompt for $name", async ({ stored, expected, saves }) => {
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

		expect(plugin.settings.noteBriefInstructionsOverride).toBe(expected);
		expect(plugin.settings).not.toHaveProperty("summaryInstructionsOverride");
		expect(saveData).toHaveBeenCalledTimes(saves);
		if (saves) {
			const persisted = saveData.mock.calls[0]?.[0] as {
				settings: Record<string, unknown>;
			};
			expect(persisted.settings.noteBriefInstructionsOverride).toBe(expected);
			expect(persisted.settings).not.toHaveProperty(
				"summaryInstructionsOverride"
			);
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
		expect(data.settings.showRailQuestions).toBe(false);
		expect(data.settings.showRailSummary).toBe(true);
		expect(data.caches).toEqual({});
		expect(data.hidden).toEqual(loaded.hidden);
		expect(data.cueSectionCollapse).toEqual({});
		expect(saveData).not.toHaveBeenCalled();
	});

	it("repairs Editing View cue sections when persisted data hides all three", async () => {
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

		expect(plugin.settings.showRailSummary).toBe(true);
		expect(plugin.settings.showRailQuestions).toBe(false);
		expect(plugin.settings.showRailSupportTerms).toBe(false);
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
