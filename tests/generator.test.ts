import { describe, it, expect, vi } from "vitest";
import {
	generateNote,
	generateSectionCue,
	clampText,
	DEFAULT_MAX_CONTEXT_CHARS,
	DEFAULT_SECTION_CONCURRENCY,
	resolveEffectiveSectionConcurrency,
	resolveGenerationOptions,
	resolveSectionConcurrency,
} from "../src/generator";
import type {
	ByokCueBatchResult,
	ByokCueInput,
	ByokCueOutput,
	ByokNoteBriefInput,
	ByokNoteBriefOutput,
	ByokProviderRuntime,
	ByokProviderStatus,
	ByokSummaryInput,
	ByokSummaryOutput,
} from "../src/byok";

interface MockOptions {
	failOnHeading?: string;
	batch?: boolean;
	batchErrorOnHeading?: string;
	onCue?: () => void;
	onBatch?: () => void;
	delayMs?: number;
	sectionConcurrencyLimit?: number;
}

function mockProvider(opts: MockOptions = {}): ByokProviderRuntime & {
	summaryCalls: number;
	noteBriefCalls: number;
	lastSummaryInput?: ByokSummaryInput;
	lastNoteBriefInput?: ByokNoteBriefInput;
	cueInputs: ByokCueInput[];
	batchInputs: ByokCueInput[][];
} {
	const provider: ByokProviderRuntime & {
		summaryCalls: number;
		noteBriefCalls: number;
		lastSummaryInput?: ByokSummaryInput;
		lastNoteBriefInput?: ByokNoteBriefInput;
		cueInputs: ByokCueInput[];
		batchInputs: ByokCueInput[][];
	} = {
		id: "ollama",
		label: "Mock",
		requiresNetwork: false,
		requiresDownload: false,
		sectionConcurrencyLimit: opts.sectionConcurrencyLimit,
		summaryCalls: 0,
		noteBriefCalls: 0,
		lastSummaryInput: undefined as ByokSummaryInput | undefined,
		lastNoteBriefInput: undefined as ByokNoteBriefInput | undefined,
		cueInputs: [] as ByokCueInput[],
		batchInputs: [] as ByokCueInput[][],
		async testConnection(): Promise<ByokProviderStatus> {
			return { ok: true, message: "ok" };
		},
		async generateCue(input: ByokCueInput): Promise<ByokCueOutput> {
			provider.cueInputs.push(input);
			opts.onCue?.();
			if (opts.delayMs) {
				await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
			}
			if (opts.failOnHeading && input.heading === opts.failOnHeading) {
				throw new Error("boom");
			}
			return {
				question: `Q:${input.heading}`,
				keywords: ["k1", "k2"],
				confidence: "high",
				rationale: input.heading === "Terms" ? "clear section" : undefined,
				sectionLens: {
					takeaway: `${input.heading} carries the main review idea.`,
					keyPhrase: input.heading || "section",
					explanation: "This phrase anchors recall for the section.",
				},
			};
		},
		async generateSummary(input: ByokSummaryInput): Promise<ByokSummaryOutput> {
			provider.summaryCalls++;
			provider.lastSummaryInput = input;
			return { summary: "the summary", learningObjective: null };
		},
		async generateNoteBrief(input: ByokNoteBriefInput): Promise<ByokNoteBriefOutput> {
			provider.noteBriefCalls++;
			provider.lastNoteBriefInput = input;
			return {
				overview: "the note brief",
				whatMatters: { title: "Main idea", detail: "Review the main idea." },
				reviewFirst: { title: "A", detail: "Start with the first section." },
				sayItBack: { title: "Say it back", detail: "Explain the note aloud." },
			};
		},
	};
	if (opts.batch) {
		provider.generateCues = async (
			inputs: ByokCueInput[]
		): Promise<ByokCueBatchResult[]> => {
			provider.batchInputs.push(inputs);
			opts.onBatch?.();
			return inputs.map((input) => {
				if (
					opts.batchErrorOnHeading &&
					input.heading === opts.batchErrorOnHeading
				) {
					return { error: "batch boom" };
				}
				return {
					cue: {
						question: `Q:${input.heading}`,
						keywords: ["k1", "k2"],
						confidence: "high",
						rationale: input.heading === "Terms" ? "clear section" : undefined,
						sectionLens: {
							takeaway: `${input.heading} carries the main review idea.`,
							keyPhrase: input.heading || "section",
							explanation: "This phrase anchors recall for the section.",
						},
					},
				};
			});
		};
	}
	return provider;
}

const NOTE = "# A\na\n## B\nb\n### C\nc";
const SIX_SECTION_NOTE = "# A\na\n# B\nb\n# C\nc\n# D\nd\n# E\ne\n# F\nf";

describe("generateNote", () => {
	it("reports progress for every section and generates the summary last", async () => {
		const provider = mockProvider();
		const progress: Array<[number, number]> = [];
		const result = await generateNote({
			noteTitle: "T",
			markdown: NOTE,
			provider,
			preset: "conceptual",
			onProgress: (d, t) => progress.push([d, t]),
		});

		expect(result.sections).toHaveLength(3);
		expect(progress).toEqual([
			[0, 3],
			[1, 3],
			[2, 3],
			[3, 3],
		]);
		expect(provider.summaryCalls).toBe(1);
		expect(provider.noteBriefCalls).toBe(1);
		expect(result.summary).toBe("the summary");
		expect(result.noteBrief?.overview).toBe("the note brief");
		expect(result.sections[0].sectionLens?.keyPhrase).toBe("A");
		expect(provider.lastNoteBriefInput?.sections.map((s) => s.heading)).toEqual([
			"A",
			"B",
			"C",
		]);
		// Summary receives the per-section questions.
		expect(provider.lastSummaryInput?.sectionQuestions).toEqual([
			"Q:A",
			"Q:B",
			"Q:C",
		]);
	});

	it("runs section cue generation in bounded parallel batches", async () => {
		let active = 0;
		let maxActive = 0;
		const provider = mockProvider({
			delayMs: 5,
			onCue: () => {
				active++;
				maxActive = Math.max(maxActive, active);
				setTimeout(() => {
					active--;
				}, 5);
			},
		});
		const result = await generateNote({
			noteTitle: "T",
			markdown: SIX_SECTION_NOTE,
			provider,
			preset: "conceptual",
			sectionConcurrency: 5,
		});
		expect(result.sections.map((s) => s.heading)).toEqual([
			"A",
			"B",
			"C",
			"D",
			"E",
			"F",
		]);
		expect(maxActive).toBe(5);
	});

	it("honors a provider section concurrency cap below the slider value", async () => {
		let active = 0;
		let maxActive = 0;
		const provider = mockProvider({
			sectionConcurrencyLimit: 1,
			delayMs: 5,
			onCue: () => {
				active++;
				maxActive = Math.max(maxActive, active);
				setTimeout(() => {
					active--;
				}, 5);
			},
		});
		const result = await generateNote({
			noteTitle: "T",
			markdown: SIX_SECTION_NOTE,
			provider,
			preset: "conceptual",
			sectionConcurrency: 5,
		});
		expect(result.sections).toHaveLength(6);
		expect(maxActive).toBe(1);
	});

	it("uses the parallel request setting as the batch size for batched providers", async () => {
		const provider = mockProvider({ batch: true });

		const result = await generateNote({
			noteTitle: "T",
			markdown: SIX_SECTION_NOTE,
			provider,
			preset: "conceptual",
			sectionConcurrency: 3,
		});

		expect(provider.cueInputs).toHaveLength(0);
		expect(provider.batchInputs.map((batch) => batch.map((i) => i.heading))).toEqual([
			["A", "B", "C"],
			["D", "E", "F"],
		]);
		expect(result.sections.map((s) => s.question)).toEqual([
			"Q:A",
			"Q:B",
			"Q:C",
			"Q:D",
			"Q:E",
			"Q:F",
		]);
	});

	it("reports the section total before a batched provider starts work", async () => {
		const progress: Array<[number, number]> = [];
		let sawInitialProgress = false;
		const provider = mockProvider({
			batch: true,
			onBatch: () => {
				sawInitialProgress =
					progress.length === 1 && progress[0][0] === 0 && progress[0][1] === 3;
			},
		});

		await generateNote({
			noteTitle: "T",
			markdown: NOTE,
			provider,
			preset: "conceptual",
			sectionConcurrency: 3,
			onProgress: (done, total) => progress.push([done, total]),
		});

		expect(sawInitialProgress).toBe(true);
	});

	it("isolates item-level errors from a batched provider", async () => {
		const provider = mockProvider({ batch: true, batchErrorOnHeading: "B" });

		const result = await generateNote({
			noteTitle: "T",
			markdown: NOTE,
			provider,
			preset: "conceptual",
			sectionConcurrency: 3,
		});

		expect(result.sections.map((s) => s.error)).toEqual([
			null,
			"batch boom",
			null,
		]);
		expect(result.sections.map((s) => s.question)).toEqual([
			"Q:A",
			null,
			"Q:C",
		]);
	});

	it("isolates a failing section without aborting the rest (H1.3)", async () => {
		const provider = mockProvider({ failOnHeading: "B" });
		const result = await generateNote({
			noteTitle: "T",
			markdown: NOTE,
			provider,
			preset: "conceptual",
		});
		const b = result.sections.find((s) => s.heading === "B");
		expect(b?.error).toMatch(/boom/);
		expect(b?.question).toBeNull();
		// Other sections still succeed.
		expect(result.sections.filter((s) => !s.error)).toHaveLength(2);
		expect(result.canceled).toBe(false);
	});

	it("cancels between batches and skips the summary", async () => {
		const controller = new AbortController();
		const provider = mockProvider();
		const summarySpy = vi.spyOn(provider, "generateSummary");
		const noteBriefSpy = vi.spyOn(provider, "generateNoteBrief");

		const result = await generateNote({
			noteTitle: "T",
			markdown: SIX_SECTION_NOTE,
			provider,
			preset: "conceptual",
			sectionConcurrency: 2,
			signal: controller.signal,
			onProgress: (done) => {
				if (done === 1) controller.abort();
			},
		});

		expect(result.canceled).toBe(true);
		expect(result.sections).toHaveLength(2); // in-flight batch finished
		expect(result.summary).toBeNull();
		expect(summarySpy).not.toHaveBeenCalled();
		expect(noteBriefSpy).not.toHaveBeenCalled();
	});

	it("does not generate a title cue for notes with no headings", async () => {
		const provider = mockProvider();
		const result = await generateNote({
			noteTitle: "T",
			markdown: "plain note text",
			provider,
			preset: "conceptual",
		});
		expect(provider.cueInputs).toEqual([]);
		expect(provider.summaryCalls).toBe(0);
		expect(provider.noteBriefCalls).toBe(0);
		expect(result.sections).toEqual([]);
	});

	it("skips heading-only sections when generating cues", async () => {
		const provider = mockProvider();
		const progress: Array<[number, number]> = [];
		const result = await generateNote({
			noteTitle: "T",
			markdown: "# Empty parent\n## Prefix Sum\nactual notes",
			provider,
			preset: "conceptual",
			onProgress: (done, total) => progress.push([done, total]),
		});
		expect(provider.cueInputs.map((input) => input.heading)).toEqual(["Prefix Sum"]);
		expect(result.sections.map((section) => section.heading)).toEqual(["Prefix Sum"]);
		expect(progress).toEqual([[0, 1], [1, 1]]);
		expect(provider.lastSummaryInput?.sectionQuestions).toEqual(["Q:Prefix Sum"]);
	});

	it("does not call the provider for notes with no cue-worthy content", async () => {
		const provider = mockProvider();
		const result = await generateNote({
			noteTitle: "T",
			markdown: "# Empty parent\n## Empty child\n",
			provider,
			preset: "conceptual",
		});
		expect(provider.cueInputs).toEqual([]);
		expect(provider.summaryCalls).toBe(0);
		expect(provider.noteBriefCalls).toBe(0);
		expect(result.sections).toEqual([]);
		expect(result.summary).toBeNull();
	});

	it("caps whole-note context injected into each prompt (avoids context-overflow errors)", async () => {
		const provider = mockProvider();
		const big = "# H\n" + "x".repeat(50_000);
		await generateNote({
			noteTitle: "T",
			markdown: big,
			provider,
			preset: "conceptual",
			useWholeNoteContext: true,
			maxContextChars: 1000,
		});
		for (const input of provider.cueInputs) {
			expect(input.noteContext!.length).toBeLessThanOrEqual(1100);
			expect(input.noteContext).toMatch(/truncated for length/);
		}
		// Summary's full text is capped too.
		expect(provider.lastSummaryInput!.fullText.length).toBeLessThanOrEqual(1100);
	});

	it("does not inject whole-note context unless enabled", async () => {
		const provider = mockProvider();
		await generateNote({
			noteTitle: "T",
			markdown: NOTE,
			provider,
			preset: "conceptual",
		});
		expect(provider.cueInputs.every((i) => i.noteContext === undefined)).toBe(true);
	});

	it("passes generation options to cue calls", async () => {
		const provider = mockProvider();
		await generateNote({
			noteTitle: "T",
			markdown: NOTE,
			provider,
			preset: "conceptual",
			options: {
				cueDensity: 3,
				questionStyle: "socratic",
				generateKeywords: false,
			},
		});
		expect(provider.cueInputs.every((i) => i.options?.cueDensity === 3)).toBe(true);
		expect(provider.cueInputs.every((i) => i.options?.questionStyle === "socratic")).toBe(true);
		expect(provider.cueInputs.every((i) => i.options?.generateKeywords === false)).toBe(true);
	});

	it("skips summary generation when autoSummary is disabled", async () => {
		const provider = mockProvider();
		const result = await generateNote({
			noteTitle: "T",
			markdown: NOTE,
			provider,
			preset: "conceptual",
			options: { autoSummary: false },
		});
		expect(provider.summaryCalls).toBe(0);
		expect(provider.noteBriefCalls).toBe(1);
		expect(result.summary).toBeNull();
		expect(result.learningObjective).toBeNull();
		expect(result.noteBrief?.overview).toBe("the note brief");
	});
});

describe("generateSectionCue", () => {
	const section = {
		id: "terms",
		heading: "Terms",
		level: 2,
		lineNumber: 3,
		content: "some body text",
		contentHash: "abc123",
	};

	it("returns a SectionResult with the cue on success", async () => {
		const provider = mockProvider();
		const result = await generateSectionCue({
			section,
			provider,
			preset: "conceptual",
		});
		expect(result.id).toBe("terms");
		expect(result.question).toBe("Q:Terms");
		expect(result.keywords).toEqual(["k1", "k2"]);
		expect(result.confidence).toBe("high");
		expect(result.rationale).toBe("clear section");
		expect(result.sectionLens?.keyPhrase).toBe("Terms");
		expect(result.error).toBeNull();
		expect(result.contentHash).toBe("abc123");
	});

	it("forwards the preset (tone override) to the provider", async () => {
		const provider = mockProvider();
		await generateSectionCue({
			section,
			provider,
			preset: "simpler",
		});
		expect(provider.cueInputs[0].preset).toBe("simpler");
	});

	it("forwards resolved generation options to the provider", async () => {
		const provider = mockProvider();
		await generateSectionCue({
			section,
			provider,
			preset: "conceptual",
			options: {
				cueDensity: 1,
				questionStyle: "exam",
				generateKeywords: false,
			},
		});
		expect(provider.cueInputs[0].options).toMatchObject({
			cueDensity: 1,
			questionStyle: "exam",
			generateKeywords: false,
			autoSummary: true,
		});
	});

	it("captures provider error without throwing", async () => {
		const provider = mockProvider({ failOnHeading: "Terms" });
		const result = await generateSectionCue({
			section,
			provider,
			preset: "conceptual",
		});
		expect(result.error).toMatch(/boom/);
		expect(result.question).toBeNull();
	});

	it("passes noteContext when supplied", async () => {
		const provider = mockProvider();
		await generateSectionCue({
			section,
			provider,
			preset: "conceptual",
			noteContext: "full note text",
		});
		expect(provider.cueInputs[0].noteContext).toBe("full note text");
	});

	it("clamps section content to maxContextChars", async () => {
		const big = { ...section, content: "x".repeat(50_000) };
		const provider = mockProvider();
		await generateSectionCue({
			section: big,
			provider,
			preset: "conceptual",
			maxContextChars: 500,
		});
		expect(provider.cueInputs[0].content.length).toBeLessThanOrEqual(600);
		expect(provider.cueInputs[0].content).toMatch(/truncated for length/);
	});
});

describe("resolveGenerationOptions", () => {
	it("fills unspecified values from defaults", () => {
		expect(resolveGenerationOptions({ cueDensity: 3 })).toEqual({
			cueDensity: 3,
			questionStyle: "recall",
			generateKeywords: true,
			autoSummary: true,
		});
	});
});

describe("resolveSectionConcurrency", () => {
	it("defaults to five parallel section requests", () => {
		expect(DEFAULT_SECTION_CONCURRENCY).toBe(5);
		expect(resolveSectionConcurrency(undefined)).toBe(5);
		expect(resolveSectionConcurrency(0)).toBe(5);
		expect(resolveSectionConcurrency(-1)).toBe(5);
	});

	it("accepts positive finite numbers and floors decimals", () => {
		expect(resolveSectionConcurrency(3)).toBe(3);
		expect(resolveSectionConcurrency(2.8)).toBe(2);
	});

	it("caps effective concurrency when the provider asks for a lower limit", () => {
		const provider = mockProvider({ sectionConcurrencyLimit: 1 });
		expect(resolveEffectiveSectionConcurrency(5, provider)).toBe(1);
		expect(resolveEffectiveSectionConcurrency(1, provider)).toBe(1);
	});

	it("preserves requested concurrency when the provider has no lower limit", () => {
		expect(resolveEffectiveSectionConcurrency(4, mockProvider())).toBe(4);
	});
});

describe("clampText", () => {
	it("returns short text unchanged", () => {
		expect(clampText("hello", 100)).toBe("hello");
	});
	it("truncates and marks long text", () => {
		const out = clampText("a".repeat(200), 50);
		expect(out.startsWith("a".repeat(50))).toBe(true);
		expect(out).toMatch(/truncated for length/);
	});
	it("exposes a sane default budget", () => {
		expect(DEFAULT_MAX_CONTEXT_CHARS).toBeGreaterThan(0);
	});
});
