import { describe, expect, it, vi } from "vitest";
import { buildNoteCache, type NoteCache } from "../src/cache";
import type {
	FirstRecallBundleInput,
	FirstRecallBundleResult,
	FirstRecallCueInput,
	FirstRecallCueOutput,
	FirstRecallCueProviderRuntime,
	FirstRecallNoteBriefInput,
} from "../src/cue-provider";
import { parseSections } from "../src/parser";
import {
	StudyMaterialMaintenance,
	planStudyMaterialMaintenance,
	type MaintenanceSource,
} from "../src/study-material-maintenance";
import {
	createCurrentMaintenanceState,
	type MaintenanceStateMap,
} from "../src/study-material-state";

const ORIGINAL = "# Alpha\none\n## Beta\ntwo";
const BRIEF = {
	overview: "Last good brief",
	whatMatters: { title: "Both", detail: "Both matter." },
	reviewFirst: { title: "Alpha", detail: "Start with Alpha." },
	sayItBack: { title: "Explain", detail: "Explain both." },
};

function source(path: string, markdown: string, title = "Note"): MaintenanceSource {
	return { path, noteTitle: title, markdown, modifiedAt: 1 };
}

function cacheFor(markdown = ORIGINAL): NoteCache {
	return buildNoteCache({
		result: {
			sections: parseSections(markdown).map((section) => ({
				...section,
				keywords: [section.heading],
				question: `Old:${section.heading}`,
				summary: null,
				error: null,
			})),
			noteBrief: BRIEF,
			canceled: false,
		},
		provider: "test",
		model: "test",
		preset: "exam-practice",
		generationMode: "whole-note-context",
		noteModifiedAt: 1,
	});
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function createHarness(initial: Record<string, string> = { "notes/note.md": ORIGINAL }) {
	const sources = new Map(
		Object.entries(initial).map(([path, markdown]) => [path, source(path, markdown)])
	);
	const caches: Record<string, NoteCache> = {};
	const states: MaintenanceStateMap = {};
	const automaticPaths = new Set<string>();
	const hidden = new Set<string>();
	const cueInputs: FirstRecallCueInput[] = [];
	const noteBriefInputs: FirstRecallNoteBriefInput[] = [];
	let activeProviders = 0;
	let maxActiveProviders = 0;
	let gate: ReturnType<typeof deferred<void>> | null = null;
	let failHeading: string | null = null;
	let failBrief = false;
	let supportsBrief = true;
	let providerOverride: FirstRecallCueProviderRuntime | null = null;
	let commitGate: ReturnType<typeof deferred<void>> | null = null;
	const provider: FirstRecallCueProviderRuntime = {
		id: "test",
		label: "Test",
		requiresNetwork: false,
		requiresDownload: false,
		async testConnection() {
			return { ok: true, message: "ok" };
		},
		async listModels() {
			return [];
		},
		async generateCue(input: FirstRecallCueInput): Promise<FirstRecallCueOutput> {
			cueInputs.push(input);
			if (failHeading === input.heading) throw new Error(`failed ${input.heading}`);
			if (gate) await gate.promise;
			return {
				question: `New:${input.heading}`,
				keywords: [input.heading],
				summary: null,
			};
		},
		async generateNoteBrief(input: FirstRecallNoteBriefInput) {
			noteBriefInputs.push(input);
			if (failBrief) throw new Error("brief failed");
			return { ...BRIEF, overview: `Brief:${input.fullText.length}` };
		},
	};
	const makeProvider = vi.fn(async () => {
		if (providerOverride) return providerOverride;
		activeProviders++;
		maxActiveProviders = Math.max(maxActiveProviders, activeProviders);
		const runtime = {
			...provider,
			generateCue: async (...args: Parameters<typeof provider.generateCue>) => {
				try {
					return await provider.generateCue(...args);
				} finally {
					activeProviders--;
				}
			},
		};
		if (!supportsBrief) runtime.generateNoteBrief = undefined;
		return runtime;
	});
	const commits: string[] = [];
	const commitSnapshots: Array<{
		cache: NoteCache | null;
		state: MaintenanceStateMap[string] | null;
	}> = [];
	const maintenance = new StudyMaterialMaintenance({
		readSource: async (path) => sources.get(path) ?? null,
		isAutomaticAllowed: (path) => automaticPaths.has(path),
		getCache: (path) => caches[path] ?? null,
		getState: (path) => states[path] ?? null,
		commit: async (path, cache, state) => {
			commits.push(path);
			commitSnapshots.push({ cache, state });
			if (cache) caches[path] = cache;
			else delete caches[path];
			if (state) states[path] = state;
			else delete states[path];
			if (commitGate) await commitGate.promise;
		},
		renamePath: async (from, to) => {
			if (caches[from]) caches[to] = caches[from];
			if (states[from]) states[to] = states[from];
			delete caches[from];
			delete states[from];
		},
		deletePath: async (path) => {
			delete caches[path];
			delete states[path];
		},
		makeProvider,
		providerMetadata: () => ({
			provider: providerOverride?.id ?? "test",
			maxGeneratedSections: providerOverride?.maxGeneratedSections,
			model: "test",
			preset: "exam-practice",
			generationMode: "whole-note-context" as const,
		}),
		generationOptions: () => ({ questionType: "exam-practice" as const }),
		sectionConcurrency: () => 5,
	});

	return {
		maintenance,
		sources,
		caches,
		states,
		automaticPaths,
		hidden,
		cueInputs,
		noteBriefInputs,
		makeProvider,
		commits,
		commitSnapshots,
		setGate(next: ReturnType<typeof deferred<void>> | null) {
			gate = next;
		},
		setFailHeading(heading: string | null) {
			failHeading = heading;
		},
		setFailBrief(value: boolean) {
			failBrief = value;
		},
		setSupportsBrief(value: boolean) {
			supportsBrief = value;
		},
		setProvider(provider: FirstRecallCueProviderRuntime) {
			providerOverride = provider;
		},
		setCommitGate(next: ReturnType<typeof deferred<void>> | null) {
			commitGate = next;
		},
		maxActiveProviders: () => maxActiveProviders,
	};
}

describe("study material maintenance planning", () => {
	it("plans missing, edited, deleted, and reordered work without a provider", () => {
		const cache = cacheFor();
		const state = createCurrentMaintenanceState("Note", ORIGINAL, cache);
		const added = `${ORIGINAL}\n## Gamma\nthree`;
		expect(
			planStudyMaterialMaintenance({
				source: source("note.md", added),
				cache,
				state,
				kind: "catch-up",
			}).components
		).toEqual({ noteBrief: true, sectionIds: ["gamma"] });

		const edited = "# Alpha\none edited\n## Beta\ntwo";
		expect(
			planStudyMaterialMaintenance({
				source: source("note.md", edited),
				cache,
				state,
				kind: "automatic",
			}).components
		).toEqual({ noteBrief: true, sectionIds: ["alpha"] });

		for (const markdown of ["# Alpha\none", "## Beta\ntwo\n# Alpha\none"]) {
			expect(
				planStudyMaterialMaintenance({
					source: source("note.md", markdown),
					cache,
					state,
					kind: "automatic",
				}).components
			).toEqual({ noteBrief: true, sectionIds: [] });
		}
	});

	it("plans a matching cached error for retry without maintenance state", () => {
		const cache = cacheFor();
		cache.sections[0] = { ...cache.sections[0], error: "provider failed" };

		expect(
			planStudyMaterialMaintenance({
				source: source("note.md", ORIGINAL),
				cache,
				state: null,
				kind: "retry",
			}).components
		).toEqual({ noteBrief: true, sectionIds: [cache.sections[0].id] });
	});

	it("regenerates provider-limited sections after the selected provider changes", () => {
		const markdown = Array.from(
			{ length: 6 },
			(_, index) => `# Section ${index + 1}\ncontent ${index + 1}`
		).join("\n");
		const cache = cacheFor(markdown);
		cache.provider = "hosted-demo";
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
		const state = createCurrentMaintenanceState("Note", markdown, cache);

		expect(
			planStudyMaterialMaintenance({
				source: source("note.md", markdown),
				cache,
				state,
				kind: "catch-up",
				provider: "hosted-demo",
				maxGeneratedSections: 5,
			}).components
		).toEqual({ noteBrief: false, sectionIds: [] });
		expect(
			planStudyMaterialMaintenance({
				source: source("note.md", markdown),
				cache,
				state,
				kind: "catch-up",
				provider: "anthropic",
			}).components
		).toEqual({
			noteBrief: true,
			sectionIds: [cache.sections[5].id],
		});
	});
});

describe("study material maintenance execution", () => {
	it("commits hosted bundle cards and Note Brief atomically after one request", async () => {
		const harness = createHarness();
		const generateBundle = vi.fn(async (
			input: FirstRecallBundleInput
		): Promise<FirstRecallBundleResult> => ({
			sections: input.sections.map((section) => ({
				cue: {
					question: `Hosted:${section.heading}`,
					keywords: [section.heading],
					summary: null,
				},
			})),
			noteBrief: { ...BRIEF, overview: "Hosted brief" },
		}));
		harness.setProvider({
			id: "hosted-demo",
			label: "FirstRecall trial",
			requiresNetwork: true,
			requiresDownload: false,
			maxGeneratedSections: 5,
			testConnection: async () => ({ ok: true, message: "ok" }),
			listModels: async () => [],
			generateBundle,
		});

		const result = await harness.maintenance.request({
			path: "notes/note.md",
			kind: "catch-up",
		});

		expect(result.status).toBe("completed");
		expect(generateBundle).toHaveBeenCalledTimes(1);
		expect(harness.cueInputs).toHaveLength(0);
		expect(harness.noteBriefInputs).toHaveLength(0);
		expect(harness.caches["notes/note.md"].sections.map((section) =>
			section.question
		)).toEqual(["Hosted:Alpha", "Hosted:Beta"]);
		expect(harness.caches["notes/note.md"].noteBrief?.overview).toBe(
			"Hosted brief"
		);
		expect(harness.commitSnapshots).toHaveLength(2);
		expect(harness.commitSnapshots[0].cache).toBeNull();
		expect(harness.commitSnapshots[1].cache?.noteBrief?.overview).toBe(
			"Hosted brief"
		);
		expect(harness.commitSnapshots[1].state?.affected).toEqual({
			noteBrief: false,
			sectionIds: [],
		});
		expect(harness.states["notes/note.md"].affected).toEqual({
			noteBrief: false,
			sectionIds: [],
		});
	});

	it("commits five trial cards and a provider-limited placeholder without failing", async () => {
		const markdown = Array.from(
			{ length: 6 },
			(_, index) => `# Section ${index + 1}\ncontent ${index + 1}`
		).join("\n");
		const harness = createHarness({ "notes/note.md": markdown });
		const generateBundle = vi.fn(async (
			input: FirstRecallBundleInput
		): Promise<FirstRecallBundleResult> => ({
			sections: input.sections.map((section, index) =>
				index < 5
					? {
							cue: {
								question: `Hosted:${section.heading}`,
								keywords: [section.heading],
								summary: null,
							},
						}
					: {
							unavailable: {
								reason: "provider-limit",
								providerId: "hosted-demo",
								providerLabel: "FirstRecall trial",
								maxSections: 5,
							},
						}
			),
			noteBrief: { ...BRIEF, overview: "Hosted brief" },
		}));
		harness.setProvider({
			id: "hosted-demo",
			label: "FirstRecall trial",
			requiresNetwork: true,
			requiresDownload: false,
			testConnection: async () => ({ ok: true, message: "ok" }),
			listModels: async () => [],
			generateBundle,
		});

		const result = await harness.maintenance.request({
			path: "notes/note.md",
			kind: "catch-up",
		});

		expect(result.status).toBe("completed");
		expect(generateBundle).toHaveBeenCalledTimes(1);
		expect(generateBundle.mock.calls[0][0].sections).toHaveLength(6);
		expect(harness.caches["notes/note.md"].sections).toHaveLength(6);
		expect(harness.caches["notes/note.md"].sections.slice(0, 5).every(
			(section) => Boolean(section.question)
		)).toBe(true);
		expect(harness.caches["notes/note.md"].sections[5]).toMatchObject({
			question: null,
			error: null,
			unavailable: {
				reason: "provider-limit",
				providerId: "hosted-demo",
				providerLabel: "FirstRecall trial",
				maxSections: 5,
			},
		});
		expect(harness.caches["notes/note.md"].noteBrief?.overview).toBe(
			"Hosted brief"
		);
		expect(harness.states["notes/note.md"].failure).toBeNull();

		const retry = await harness.maintenance.request({
			path: "notes/note.md",
			kind: "retry",
		});
		expect(retry).toEqual({
			status: "skipped",
			path: "notes/note.md",
			reason: "no-work",
		});
		expect(generateBundle).toHaveBeenCalledTimes(1);

		const reordered = [
			"# Section 6\ncontent 6",
			...Array.from(
				{ length: 5 },
				(_, index) => `# Section ${index + 1}\ncontent ${index + 1}`
			),
		].join("\n");
		harness.sources.set(
			"notes/note.md",
			source("notes/note.md", reordered)
		);
		const reorderedResult = await harness.maintenance.request({
			path: "notes/note.md",
			kind: "catch-up",
		});
		expect(reorderedResult.status).toBe("completed");
		expect(generateBundle).toHaveBeenCalledTimes(2);
		expect(generateBundle.mock.calls[1][0].sections.map(
			(section) => section.heading
		)).toEqual([
			"Section 6",
			"Section 1",
			"Section 2",
			"Section 3",
			"Section 4",
			"Section 5",
		]);
		expect(harness.caches["notes/note.md"].sections[0].question).toBe(
			"Hosted:Section 6"
		);
		expect(harness.caches["notes/note.md"].sections[5]).toMatchObject({
			heading: "Section 5",
			question: null,
			error: null,
			unavailable: { reason: "provider-limit", maxSections: 5 },
		});
	});

	it("preserves the existing Note Brief during a section-only hosted retry", async () => {
		const harness = createHarness();
		const cache = cacheFor();
		harness.caches["notes/note.md"] = cache;
		const current = createCurrentMaintenanceState("Note", ORIGINAL, cache);
		harness.states["notes/note.md"] = {
			...current,
			affected: { noteBrief: false, sectionIds: ["alpha"] },
			failure: {
				components: { noteBrief: false, sectionIds: ["alpha"] },
				message: "failed alpha",
			},
		};
		const generateBundle = vi.fn(async (
			input: FirstRecallBundleInput
		): Promise<FirstRecallBundleResult> => ({
			sections: input.sections.map((section) => ({
				cue: {
					question: `Hosted:${section.heading}`,
					keywords: [section.heading],
					summary: null,
				},
			})),
			noteBrief: { ...BRIEF, overview: "Subset brief must be ignored" },
		}));
		harness.setProvider({
			id: "hosted-demo",
			label: "FirstRecall trial",
			requiresNetwork: true,
			requiresDownload: false,
			testConnection: async () => ({ ok: true, message: "ok" }),
			listModels: async () => [],
			generateBundle,
		});

		const result = await harness.maintenance.request({
			path: "notes/note.md",
			kind: "retry",
		});

		expect(result.status).toBe("completed");
		expect(generateBundle).toHaveBeenCalledTimes(1);
		expect(generateBundle.mock.calls[0][0].sections).toHaveLength(1);
		expect(harness.caches["notes/note.md"].sections[0].question).toBe(
			"Hosted:Alpha"
		);
		expect(harness.caches["notes/note.md"].noteBrief).toEqual(BRIEF);
		expect(harness.states["notes/note.md"].failure).toBeNull();
	});

	it("explicit catch-up creates missing components and does not change source Markdown", async () => {
		const harness = createHarness();
		const before = harness.sources.get("notes/note.md")?.markdown;

		const result = await harness.maintenance.request({
			path: "notes/note.md",
			kind: "catch-up",
		});

		expect(result.status).toBe("completed");
		expect(harness.cueInputs.map((input) => input.heading)).toEqual(["Alpha", "Beta"]);
		expect(harness.noteBriefInputs).toHaveLength(1);
		expect(harness.sources.get("notes/note.md")?.markdown).toBe(before);
		expect(harness.caches["notes/note.md"].sections).toHaveLength(2);
	});

	it("adds or edits one section, refreshes the brief, and preserves unchanged cards", async () => {
		const harness = createHarness();
		const cache = cacheFor();
		harness.caches["notes/note.md"] = cache;
		harness.states["notes/note.md"] = createCurrentMaintenanceState("Note", ORIGINAL, cache);
		harness.automaticPaths.add("notes/note.md");
		harness.sources.set(
			"notes/note.md",
			source("notes/note.md", `${ORIGINAL}\n## Gamma\nthree`)
		);

		await harness.maintenance.request({ path: "notes/note.md", kind: "automatic" });
		expect(harness.cueInputs.map((input) => input.heading)).toEqual(["Gamma"]);
		expect(harness.noteBriefInputs).toHaveLength(1);
		expect(harness.caches["notes/note.md"].sections.find((s) => s.id === "alpha"))
			.toEqual(cache.sections.find((s) => s.id === "alpha"));

		harness.cueInputs.length = 0;
		harness.noteBriefInputs.length = 0;
		const current = harness.caches["notes/note.md"];
		harness.states["notes/note.md"] = createCurrentMaintenanceState(
			"Note",
			harness.sources.get("notes/note.md")!.markdown,
			current
		);
		harness.sources.set(
			"notes/note.md",
			source("notes/note.md", `# Alpha\none edited\n## Beta\ntwo\n## Gamma\nthree`)
		);
		await harness.maintenance.request({ path: "notes/note.md", kind: "automatic" });
		expect(harness.cueInputs.map((input) => input.heading)).toEqual(["Alpha"]);
		expect(harness.noteBriefInputs).toHaveLength(1);
	});

	it("reconciles deletion and reorder without regenerating unaffected cards", async () => {
		for (const markdown of ["# Alpha\none", "## Beta\ntwo\n# Alpha\none"]) {
			const harness = createHarness({ "notes/note.md": markdown });
			const cache = cacheFor();
			harness.caches["notes/note.md"] = cache;
			harness.states["notes/note.md"] = createCurrentMaintenanceState("Note", ORIGINAL, cache);
			harness.automaticPaths.add("notes/note.md");

			await harness.maintenance.request({ path: "notes/note.md", kind: "automatic" });

			expect(harness.cueInputs).toHaveLength(0);
			expect(harness.noteBriefInputs).toHaveLength(1);
			expect(harness.caches["notes/note.md"].sections.map((s) => s.id)).toEqual(
				parseSections(markdown).map((section) => section.id)
			);
		}
	});

	it("allows explicit work outside scope, blocks automatic work, and preserves hidden state", async () => {
		const harness = createHarness();
		harness.hidden.add("notes/note.md");

		expect(
			await harness.maintenance.request({ path: "notes/note.md", kind: "automatic" })
		).toMatchObject({ status: "skipped", reason: "not-authorized" });
		expect(harness.makeProvider).not.toHaveBeenCalled();

		await harness.maintenance.request({ path: "notes/note.md", kind: "update" });
		expect(harness.makeProvider).toHaveBeenCalledTimes(1);
		expect(harness.hidden.has("notes/note.md")).toBe(true);
	});

	it("does not catch up merely because automatic coverage becomes enabled", async () => {
		const harness = createHarness();
		harness.automaticPaths.add("notes/note.md");
		await Promise.resolve();
		expect(harness.makeProvider).not.toHaveBeenCalled();
		expect(harness.caches).toEqual({});
	});

	it("coalesces one revision and follows an edit with exactly one latest run", async () => {
		const harness = createHarness();
		harness.automaticPaths.add("notes/note.md");
		const gate = deferred<void>();
		harness.setGate(gate);
		const first = harness.maintenance.request({ path: "notes/note.md", kind: "automatic" });
		const same = harness.maintenance.request({ path: "notes/note.md", kind: "update" });
		await vi.waitFor(() => expect(harness.cueInputs.length).toBeGreaterThan(0));
		harness.sources.set(
			"notes/note.md",
			source("notes/note.md", "# Alpha\nlatest edit")
		);
		const latestOne = harness.maintenance.request({ path: "notes/note.md", kind: "automatic" });
		const latestTwo = harness.maintenance.request({ path: "notes/note.md", kind: "automatic" });
		harness.setGate(null);
		gate.resolve();

		await Promise.all([first, same, latestOne, latestTwo]);
		expect(harness.makeProvider).toHaveBeenCalledTimes(2);
		expect(harness.states["notes/note.md"].sourceRevision).not.toBe(
			createCurrentMaintenanceState("Note", ORIGINAL, cacheFor()).sourceRevision
		);
	});

	it("queues a same-revision section command not covered by the active run", async () => {
		const harness = createHarness();
		const cache = cacheFor();
		harness.caches["notes/note.md"] = cache;
		harness.states["notes/note.md"] = createCurrentMaintenanceState(
			"Note",
			ORIGINAL,
			cache
		);
		const gate = deferred<void>();
		harness.setGate(gate);

		const alpha = harness.maintenance.request({
			path: "notes/note.md",
			kind: "command",
			sectionIds: [cache.sections[0].id],
		});
		await vi.waitFor(() => expect(harness.cueInputs).toHaveLength(1));
		const beta = harness.maintenance.request({
			path: "notes/note.md",
			kind: "command",
			sectionIds: [cache.sections[1].id],
		});
		harness.setGate(null);
		gate.resolve();

		await Promise.all([alpha, beta]);
		expect(harness.cueInputs.map((input) => input.heading)).toEqual([
			"Alpha",
			"Beta",
		]);
		expect(harness.makeProvider).toHaveBeenCalledTimes(2);
	});

	it("cancels started automatic state when scope is revoked before provider work", async () => {
		const harness = createHarness();
		harness.automaticPaths.add("notes/note.md");
		const commitGate = deferred<void>();
		harness.setCommitGate(commitGate);

		const run = harness.maintenance.request({
			path: "notes/note.md",
			kind: "automatic",
		});
		await vi.waitFor(() =>
			expect(harness.states["notes/note.md"]?.updating.sectionIds).toHaveLength(2)
		);
		harness.automaticPaths.delete("notes/note.md");
		harness.setCommitGate(null);
		commitGate.resolve();

		expect(await run).toMatchObject({
			status: "skipped",
			reason: "not-authorized",
		});
		expect(harness.makeProvider).not.toHaveBeenCalled();
		expect(harness.states["notes/note.md"].updating).toEqual({
			noteBrief: false,
			sectionIds: [],
		});
	});

	it("detects and retries a newer source revision even before another event requests it", async () => {
		const harness = createHarness();
		harness.automaticPaths.add("notes/note.md");
		const gate = deferred<void>();
		harness.setGate(gate);
		const first = harness.maintenance.request({ path: "notes/note.md", kind: "automatic" });
		await vi.waitFor(() => expect(harness.cueInputs.length).toBeGreaterThan(0));
		harness.sources.set(
			"notes/note.md",
			source("notes/note.md", "# Alpha\nnewest source")
		);
		harness.setGate(null);
		gate.resolve();

		expect((await first).status).toBe("stale");
		await vi.waitFor(() => expect(harness.makeProvider).toHaveBeenCalledTimes(2));
		expect(harness.caches["notes/note.md"].sections).toHaveLength(1);
		expect(harness.caches["notes/note.md"].sections[0].question).toBe("New:Alpha");
	});

	it("preserves last-good components and retry state after partial failure", async () => {
		const harness = createHarness({
			"notes/note.md": "# Alpha\none edited\n## Beta\ntwo",
		});
		const cache = cacheFor();
		harness.caches["notes/note.md"] = cache;
		harness.states["notes/note.md"] = createCurrentMaintenanceState("Note", ORIGINAL, cache);
		harness.automaticPaths.add("notes/note.md");
		harness.setFailHeading("Alpha");
		harness.setFailBrief(true);

		const result = await harness.maintenance.request({
			path: "notes/note.md",
			kind: "automatic",
		});

		expect(result.status).toBe("failed");
		expect(harness.caches["notes/note.md"].sections[0]).toEqual(cache.sections[0]);
		expect(harness.caches["notes/note.md"].noteBrief).toEqual(BRIEF);
		expect(harness.states["notes/note.md"].failure).not.toBeNull();
		expect(harness.states["notes/note.md"].failure?.components).toEqual({
			noteBrief: true,
			sectionIds: ["alpha"],
		});
	});

	it("keeps the last-good Note Brief when the provider skips that component", async () => {
		const harness = createHarness({
			"notes/note.md": "# Alpha\none edited\n## Beta\ntwo",
		});
		const cache = cacheFor();
		harness.caches["notes/note.md"] = cache;
		harness.states["notes/note.md"] = createCurrentMaintenanceState("Note", ORIGINAL, cache);
		harness.setSupportsBrief(false);

		await harness.maintenance.request({ path: "notes/note.md", kind: "update" });

		expect(harness.caches["notes/note.md"].sections[0].question).toBe("New:Alpha");
		expect(harness.caches["notes/note.md"].noteBrief).toEqual(BRIEF);
		expect(harness.states["notes/note.md"].affected.noteBrief).toBe(true);
		expect(harness.states["notes/note.md"].failure).toBeNull();
	});

	it("removes generated material when the final eligible section disappears", async () => {
		const harness = createHarness({ "notes/note.md": "# Empty\n" });
		const cache = cacheFor();
		harness.caches["notes/note.md"] = cache;
		harness.states["notes/note.md"] = createCurrentMaintenanceState("Note", ORIGINAL, cache);
		harness.automaticPaths.add("notes/note.md");

		await harness.maintenance.request({ path: "notes/note.md", kind: "automatic" });

		expect(harness.caches).toEqual({});
		expect(harness.states).toEqual({});
		expect(harness.makeProvider).not.toHaveBeenCalled();
	});

	it("invalidates old-path completion after rename or delete and applies destination coverage", async () => {
		for (const transition of ["rename", "delete"] as const) {
			const harness = createHarness();
			harness.automaticPaths.add("notes/note.md");
			const gate = deferred<void>();
			harness.setGate(gate);
			const run = harness.maintenance.request({ path: "notes/note.md", kind: "automatic" });
			await vi.waitFor(() => expect(harness.cueInputs.length).toBeGreaterThan(0));
			if (transition === "rename") {
				harness.sources.delete("notes/note.md");
				harness.sources.set("archive/note.md", source("archive/note.md", ORIGINAL));
				harness.automaticPaths.delete("notes/note.md");
				await harness.maintenance.rename("notes/note.md", "archive/note.md");
			} else {
				harness.sources.delete("notes/note.md");
				await harness.maintenance.delete("notes/note.md");
			}
			harness.setGate(null);
			gate.resolve();
			expect((await run).status).toBe("stale");
			expect(harness.caches).toEqual({});
			expect(harness.states).not.toHaveProperty("notes/note.md");
			if (transition === "rename") {
				expect(harness.states["archive/note.md"]?.noteBriefRevision).toBeNull();
				expect(harness.states["archive/note.md"]?.updating).toEqual({
					noteBrief: false,
					sectionIds: [],
				});
			} else {
				expect(harness.states).toEqual({});
			}
		}
	});

	it("serializes provider work across notes while retaining bounded section concurrency", async () => {
		const harness = createHarness({
			"notes/one.md": ORIGINAL,
			"notes/two.md": ORIGINAL,
		});
		harness.automaticPaths.add("notes/one.md");
		harness.automaticPaths.add("notes/two.md");
		const gate = deferred<void>();
		harness.setGate(gate);
		const one = harness.maintenance.request({ path: "notes/one.md", kind: "automatic" });
		const two = harness.maintenance.request({ path: "notes/two.md", kind: "automatic" });
		await vi.waitFor(() => expect(harness.makeProvider).toHaveBeenCalledTimes(1));
		harness.setGate(null);
		gate.resolve();
		await Promise.all([one, two]);
		expect(harness.makeProvider).toHaveBeenCalledTimes(2);
		expect(harness.maxActiveProviders()).toBe(1);
	});
});
