import { describe, expect, it, vi } from "vitest";
import CueCraftPlugin from "../src/main";
import { CACHE_SCHEMA_VERSION } from "../src/cache";
import {
	cacheContentRevision,
	createCurrentMaintenanceState,
} from "../src/study-material-state";
import { normalizeCueCraftProviderSettings } from "../src/byok-cuecraft-adapter";
import { DEFAULT_SETTINGS } from "../src/settings";
import type { SecureCredentialStore } from "../src/secure-credential-store";
import {
	CueSectionCollapseStore,
	type CueSectionCollapseMap,
} from "../src/cue-section-collapse";

function currentCache() {
	return {
		schemaVersion: CACHE_SCHEMA_VERSION,
		generatedAt: "2026-08-01T12:00:00.000Z",
		noteModifiedAt: 1234,
		provider: "openai",
		model: "gpt-5-mini",
		generationMode: "whole-note-context",
		preset: "conceptual",
		outline: {},
		sections: [],
		noteBrief: null,
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

describe("plugin data loading", () => {
	it("does not rewrite a complete current data snapshot", async () => {
		const currentSettings = structuredClone(DEFAULT_SETTINGS);
		normalizeCueCraftProviderSettings(
			currentSettings,
			DEFAULT_SETTINGS,
			currentSettings
		);
		const loaded = {
			settings: currentSettings,
			caches: { "notes/current.md": currentCache() },
			maintenanceStates: {},
			hidden: { "notes/current.md": true as const },
			cueSectionCollapse: {
				"notes/current.md": {
					section: { summary: true as const },
				},
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

		expect(
			(plugin as unknown as { data: unknown }).data
		).toEqual(loaded);
		expect(saveData).not.toHaveBeenCalled();
	});

	it("preserves a selected AI provider after loading", async () => {
		const currentSettings = structuredClone(DEFAULT_SETTINGS);
		currentSettings.byok.selectedProvider = "openai";
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => ({ settings: currentSettings })),
			saveData: vi.fn(async () => {}),
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		expect(plugin.settings.byok.selectedProvider).toBe("openai");
	});

	it("persists only the current settings schema", async () => {
		const saveData = vi.fn(async () => {});
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => ({
				settings: {
					showSummary: false,
					unusedSetting: true,
				},
			})),
			saveData,
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		expect(plugin.settings.showSummary).toBe(false);
		expect(plugin.settings).not.toHaveProperty("unusedSetting");
		expect(saveData).toHaveBeenCalledTimes(1);
	});

	it("does not turn a legacy global automatic-generation setting into coverage", async () => {
		const saveData = vi.fn(async () => {});
		const makeProvider = vi.fn();
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => ({
				settings: { autoGenerateOnSave: true },
			})),
			saveData,
			makeProvider,
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		expect(plugin.settings).not.toHaveProperty("autoGenerateOnSave");
		expect(plugin.settings.studyAreas).toEqual([]);
		expect(makeProvider).not.toHaveBeenCalled();
		expect(saveData).toHaveBeenCalledTimes(1);
	});

	it("quarantines ambiguous legacy scopes without invoking a provider", async () => {
		const saveData = vi.fn(async () => {});
		const makeProvider = vi.fn();
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => ({
				settings: {
					studyAreas: [
						{
							id: "biology",
							name: "Biology",
							parentPath: "Courses/Biology",
							excludedPaths: [],
							maintenanceMode: "maintain-on-save",
							createdAt: "2026-06-21T00:00:00.000Z",
						},
						{
							id: "year-one",
							name: "Year 1",
							parentPath: "Courses/Biology/Year 1",
							excludedPaths: [],
							maintenanceMode: "maintain-on-save",
							createdAt: "2026-06-21T00:00:00.000Z",
						},
					],
				},
			})),
			saveData,
			makeProvider,
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		expect(plugin.settings.studyAreas.map((area) => area.id)).toEqual([
			"biology",
		]);
		expect(plugin.settings.disabledStudyAreas).toMatchObject([
			{
				id: "year-one",
				parentPath: "Courses/Biology/Year 1",
				maintenanceMode: "paused",
				disabledReason: "overlapping-path",
			},
		]);
		expect(makeProvider).not.toHaveBeenCalled();
		expect(saveData).toHaveBeenCalledTimes(1);
	});

	it("normalizes invalid current settings to their defaults", async () => {
		const saveData = vi.fn(async () => {});
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => ({
				settings: {
					editorCueDisplay: "not-a-display",
					cueFontSize: "huge",
					questionType: "quiz",
					sectionConcurrency: 99,
					showQuestion: "no",
				},
			})),
			saveData,
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		expect(plugin.settings).toMatchObject({
			editorCueDisplay: "cornell",
			cueFontSize: "medium",
			questionType: "exam-practice",
			sectionConcurrency: 5,
			showQuestion: true,
		});
		expect(saveData).toHaveBeenCalledTimes(1);
	});

	it("preserves valid current settings", async () => {
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => ({
				settings: {
					editorCueDisplay: "cornell",
					cueFontSize: "large",
					editorCueCustomWidthPx: 240,
					questionType: "exam-practice",
					studyHideMode: "collapse",
					sectionConcurrency: 3,
					showSummary: false,
					showQuestion: false,
					showTerms: false,
				},
			})),
			saveData: vi.fn(async () => {}),
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();
		expect(plugin.settings).toMatchObject({
			editorCueDisplay: "cornell",
			cueFontSize: "large",
			editorCueCustomWidthPx: 240,
			questionType: "exam-practice",
			studyHideMode: "collapse",
			sectionConcurrency: 3,
			showSummary: false,
			showQuestion: false,
			showTerms: false,
		});
	});

	it("loads malformed collapse data as empty without disturbing other data", async () => {
		const loaded = {
			settings: { showQuestion: false },
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
	});

	it("loads malformed maintenance state as empty without discarding caches", async () => {
		const cache = currentCache();
		const saveData = vi.fn(async () => {});
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => ({
				settings: {},
				caches: { "notes/current.md": cache },
				maintenanceStates: "updating",
			})),
			saveData,
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		const data = (plugin as unknown as {
			data: {
				caches: Record<string, unknown>;
				maintenanceStates: Record<string, unknown>;
			};
		}).data;
		expect(data.caches["notes/current.md"]).toEqual(cache);
		expect(data.maintenanceStates).toEqual({});
		expect(saveData).toHaveBeenCalledTimes(1);
	});

	it("downgrades a cache/state mismatch without discarding last-good content", async () => {
		const cache = currentCache();
		const state = createCurrentMaintenanceState("Current", "# Current\ntext", cache);
		const saveData = vi.fn(async () => {});
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => ({
				settings: {},
				caches: { "notes/current.md": cache },
				maintenanceStates: {
					"notes/current.md": { ...state, cacheRevision: "mismatch" },
				},
			})),
			saveData,
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		const data = (plugin as unknown as {
			data: {
				caches: Record<string, unknown>;
				maintenanceStates: Record<
					string,
					{ cacheRevision: string; noteBriefRevision: string | null }
				>;
			};
		}).data;
		expect(data.caches["notes/current.md"]).toEqual(cache);
		expect(data.maintenanceStates["notes/current.md"]).toMatchObject({
			cacheRevision: cacheContentRevision(cache),
			noteBriefRevision: null,
		});
		expect(saveData).toHaveBeenCalledTimes(1);
	});

	it("loads a current cache without discarding an invalid cache entry", async () => {
		const cache = currentCache();
		const invalid = { schemaVersion: 99, sections: ["unknown"] };
		const loaded = {
			settings: {},
			caches: {
				"notes/retrieval.md": cache,
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
		expect(persisted.caches["notes/retrieval.md"]).toEqual(cache);
		expect(persisted.caches["notes/unrecognized.md"]).toEqual(invalid);
		expect(persisted.hidden).toEqual(loaded.hidden);
		expect(persisted.cueSectionCollapse).toEqual({
			"notes/retrieval.md": {
				"retrieval-practice": { summary: true },
			},
		});
	});
});

describe("study area creation", () => {
	it("creates non-overlapping scopes paused without provider work", async () => {
		const makeProvider = vi.fn();
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			settings: structuredClone(DEFAULT_SETTINGS),
			saveSettings: vi.fn(async () => {}),
			makeProvider,
		});

		const created = await plugin.createStudyArea("Courses/Biology");

		expect(created).toMatchObject({
			parentPath: "Courses/Biology",
			maintenanceMode: "paused",
		});
		expect(makeProvider).not.toHaveBeenCalled();
	});

	it("rejects overlapping scopes in either direction", async () => {
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			settings: {
				...structuredClone(DEFAULT_SETTINGS),
				studyAreas: [
					{
						id: "biology",
						name: "Biology",
						parentPath: "Courses/Biology",
						excludedPaths: [],
						maintenanceMode: "paused",
						createdAt: "2026-06-21T00:00:00.000Z",
					},
				],
			},
			saveSettings: vi.fn(async () => {}),
		});

		expect(
			await plugin.createStudyArea("Courses/Biology/Year 1")
		).toBeNull();
		plugin.settings.studyAreas[0].parentPath = "Courses/Biology/Year 1";
		expect(await plugin.createStudyArea("Courses/Biology")).toBeNull();
	});
});

interface PluginPersistenceHarness {
	data: {
		settings: Record<string, unknown>;
		caches: Record<string, unknown>;
		maintenanceStates: Record<string, unknown>;
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
			maintenanceStates: {},
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
