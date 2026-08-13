import { describe, expect, it, vi } from "vitest";
import CueCraftPlugin from "../src/main";
import { CACHE_SCHEMA_VERSION, migrateCache } from "../src/cache";
import type { SecureCredentialStore } from "../src/secure-credential-store";
import {
	CueSectionCollapseStore,
	type CueSectionCollapseMap,
} from "../src/cue-section-collapse";

function richV5Cache() {
	return {
		schemaVersion: 5,
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
				confidence: "high",
				category: "sequences",
				rationale: "The section states the causal relationship directly.",
				sectionLens: {
					takeaway: "Practice recalling an idea instead of rereading it.",
					keyPhrase: "retrieval practice",
					explanation: "Active recall makes the memory easier to access later.",
				},
				error: null,
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
	it("loads independent Editing View width preferences with legacy preset migration", async () => {
		for (const [storedSettings, expectedPreset, expectedCustom] of [
			[{ cueColumnWidth: "wide" }, "wide", null],
			[
				{
					cueColumnWidth: "narrow",
					editorCueWidthPreset: "wide",
					editorCueCustomWidthPx: 240,
				},
				"wide",
				240,
			],
			[
				{
					cueColumnWidth: "wide",
					editorCueWidthPreset: "invalid",
					editorCueCustomWidthPx: 240.5,
				},
				"medium",
				null,
			],
		] as const) {
			const plugin = new CueCraftPlugin({} as never, {} as never);
			Object.assign(plugin as unknown as Record<string, unknown>, {
				credentialStore: unavailableCredentialStore(),
				loadData: vi.fn(async () => ({ settings: storedSettings })),
				saveData: vi.fn(async () => {}),
			});

			await (
				plugin as unknown as { loadPluginData(): Promise<void> }
			).loadPluginData();

			expect(plugin.settings.editorCueWidthPreset).toBe(expectedPreset);
			expect(plugin.settings.editorCueCustomWidthPx).toBe(expectedCustom);
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
		expect(data.caches).toEqual({});
		expect(data.hidden).toEqual(loaded.hidden);
		expect(data.cueSectionCollapse).toEqual({});
		expect(saveData).not.toHaveBeenCalled();
	});

	it("persists a category-free v6 cache without discarding an invalid cache entry", async () => {
		const v5 = richV5Cache();
		const invalid = { schemaVersion: 99, sections: ["unknown"] };
		const loaded = {
			settings: {},
			caches: {
				"notes/retrieval.md": v5,
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
		expect(persisted.caches["notes/retrieval.md"]).toEqual(migrateCache(v5));
		expect(persisted.caches["notes/retrieval.md"].schemaVersion).toBe(
			CACHE_SCHEMA_VERSION
		);
		expect(persisted.caches["notes/retrieval.md"].sections[0]).not.toHaveProperty(
			"category"
		);
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
