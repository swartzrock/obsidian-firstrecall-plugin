import { describe, it, expect, vi } from "vitest";
import {
	generateNote,
	generateNoteBriefForSections,
	generateSectionCue,
	generateSectionCueBatch,
	clampText,
	DEFAULT_MAX_CONTEXT_CHARS,
	DEFAULT_SECTION_CONCURRENCY,
	resolveEffectiveSectionConcurrency,
	resolveGenerationOptions,
	resolveSectionConcurrency,
} from "../src/generator";
import type { ByokProviderStatus } from "@swartzrock/byok-runtime";
import type {
	FirstRecallCueBatchResult,
	FirstRecallCueInput,
	FirstRecallCueOutput,
	FirstRecallCueProviderRuntime,
	FirstRecallNoteBriefInput,
	FirstRecallNoteBriefOutput,
} from "../src/cue-provider";

interface MockOptions {
	failOnHeading?: string;
	batch?: boolean;
	batchErrorOnHeading?: string;
	onCue?: () => void;
	onBatch?: () => void;
	delayMs?: number;
	sectionConcurrencyLimit?: number;
	failNoteBrief?: boolean;
}

function mockProvider(opts: MockOptions = {}): FirstRecallCueProviderRuntime & {
	lastNoteBriefInput?: FirstRecallNoteBriefInput;
	cueInputs: FirstRecallCueInput[];
	batchInputs: FirstRecallCueInput[][];
	noteBriefCalls: number;
} {
	const provider: FirstRecallCueProviderRuntime & {
		lastNoteBriefInput?: FirstRecallNoteBriefInput;
		cueInputs: FirstRecallCueInput[];
		batchInputs: FirstRecallCueInput[][];
		noteBriefCalls: number;
	} = {
		id: "ollama",
		label: "Mock",
		requiresNetwork: false,
		requiresDownload: false,
		sectionConcurrencyLimit: opts.sectionConcurrencyLimit,
		lastNoteBriefInput: undefined as FirstRecallNoteBriefInput | undefined,
		cueInputs: [] as FirstRecallCueInput[],
		batchInputs: [] as FirstRecallCueInput[][],
		noteBriefCalls: 0,
		async testConnection(): Promise<ByokProviderStatus> {
			return { ok: true, message: "ok" };
		},
		async listModels() {
			return [];
		},
		async generateCue(input: FirstRecallCueInput): Promise<FirstRecallCueOutput> {
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
				summary: {
					takeaway: `${input.heading} carries the main review idea.`,
					keyPhrase: input.heading || "section",
					explanation: "This phrase anchors recall for the section.",
				},
			};
		},
		async generateNoteBrief(
			input: FirstRecallNoteBriefInput
		): Promise<FirstRecallNoteBriefOutput> {
			provider.noteBriefCalls++;
			provider.lastNoteBriefInput = input;
			if (opts.failNoteBrief) throw new Error("note brief boom");
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
			inputs: FirstRecallCueInput[]
		): Promise<FirstRecallCueBatchResult[]> => {
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
						summary: {
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
	it("counts the note brief after section progress", async () => {
		const provider = mockProvider();
		const progress: Array<[number, number]> = [];
		const result = await generateNote({
			noteTitle: "T",
			markdown: NOTE,
			provider,
			onProgress: (d, t) => progress.push([d, t]),
		});

		expect(result.sections).toHaveLength(3);
		expect(progress).toEqual([
			[0, 4],
			[1, 4],
			[2, 4],
			[3, 4],
			[4, 4],
		]);
		expect(provider.noteBriefCalls).toBe(1);
		expect(result.noteBrief?.overview).toBe("the note brief");
		expect(result.sections[0].summary?.keyPhrase).toBe("A");
		expect(provider.lastNoteBriefInput?.sections.map((s) => s.heading)).toEqual([
			"A",
			"B",
			"C",
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

	it("reports the full work total before a batched provider starts", async () => {
		const progress: Array<[number, number]> = [];
		let sawInitialProgress = false;
		const provider = mockProvider({
			batch: true,
			onBatch: () => {
				sawInitialProgress =
					progress.length === 1 && progress[0][0] === 0 && progress[0][1] === 4;
			},
		});

		await generateNote({
			noteTitle: "T",
			markdown: NOTE,
			provider,
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
		});
		const b = result.sections.find((s) => s.heading === "B");
		expect(b?.error).toMatch(/boom/);
		expect(b?.question).toBeNull();
		// Other sections still succeed.
		expect(result.sections.filter((s) => !s.error)).toHaveLength(2);
		expect(result.canceled).toBe(false);
	});

	it("cancels between batches and skips the Note Brief", async () => {
		const controller = new AbortController();
		const provider = mockProvider();
		const noteBriefSpy = vi.spyOn(provider, "generateNoteBrief");

		const result = await generateNote({
			noteTitle: "T",
			markdown: SIX_SECTION_NOTE,
			provider,
			sectionConcurrency: 2,
			signal: controller.signal,
			onProgress: (done) => {
				if (done === 1) controller.abort();
			},
		});

		expect(result.canceled).toBe(true);
		expect(result.sections).toHaveLength(2); // in-flight batch finished
		expect(noteBriefSpy).not.toHaveBeenCalled();
	});

	it("does not generate a title cue for notes with no headings", async () => {
		const provider = mockProvider();
		const result = await generateNote({
			noteTitle: "T",
			markdown: "plain note text",
			provider,
		});
		expect(provider.cueInputs).toEqual([]);
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
			onProgress: (done, total) => progress.push([done, total]),
		});
		expect(provider.cueInputs.map((input) => input.heading)).toEqual(["Prefix Sum"]);
		expect(result.sections.map((section) => section.heading)).toEqual(["Prefix Sum"]);
		expect(progress).toEqual([[0, 2], [1, 2], [2, 2]]);
	});

	it("does not call the provider for notes with no cue-worthy content", async () => {
		const provider = mockProvider();
		const result = await generateNote({
			noteTitle: "T",
			markdown: "# Empty parent\n## Empty child\n",
			provider,
		});
		expect(provider.cueInputs).toEqual([]);
		expect(provider.noteBriefCalls).toBe(0);
		expect(result.sections).toEqual([]);
	});

	it("does not call the provider for an image-only section", async () => {
		const provider = mockProvider();
		const result = await generateNote({
			noteTitle: "A Picture Of Tonks",
			markdown: "# A Picture Of Tonks\n![[tonks.jpg]]",
			provider,
			useWholeNoteContext: true,
		});

		expect(provider.cueInputs).toEqual([]);
		expect(provider.noteBriefCalls).toBe(0);
		expect(result.sections).toEqual([]);
	});

	it("removes unsupported image markup from all generated source text", async () => {
		const provider = mockProvider();
		await generateNote({
			noteTitle: "Dogs",
			markdown: "# Dogs\nBefore\n![[tonks.jpg]]\nAfter",
			provider,
			useWholeNoteContext: true,
		});

		expect(provider.cueInputs[0].content).toBe("Before\n\nAfter");
		expect(provider.cueInputs[0].noteContext).toBe(
			"# Dogs\nBefore\n\nAfter"
		);
		expect(provider.lastNoteBriefInput?.fullText).toBe(
			"# Dogs\nBefore\n\nAfter"
		);
	});

	it("uses an explicit image caption as source text", async () => {
		const provider = mockProvider();
		const result = await generateNote({
			noteTitle: "Dogs",
			markdown: "# Dogs\n![[tonks.jpg|Tonks running through a park]]",
			provider,
			useWholeNoteContext: true,
		});

		expect(result.sections).toHaveLength(1);
		expect(provider.cueInputs[0].content).toBe("Tonks running through a park");
		expect(provider.cueInputs[0].noteContext).toBe(
			"# Dogs\nTonks running through a park"
		);
	});

	it("caps whole-note context injected into each prompt (avoids context-overflow errors)", async () => {
		const provider = mockProvider();
		const big = "# H\n" + "x".repeat(50_000);
		await generateNote({
			noteTitle: "T",
			markdown: big,
			provider,
			useWholeNoteContext: true,
			maxContextChars: 1000,
		});
		for (const input of provider.cueInputs) {
			expect(input.noteContext!.length).toBeLessThanOrEqual(1100);
			expect(input.noteContext).toMatch(/truncated for length/);
		}
		expect(provider.lastNoteBriefInput!.fullText.length).toBeLessThanOrEqual(1100);
	});

	it("does not inject whole-note context unless enabled", async () => {
		const provider = mockProvider();
		await generateNote({
			noteTitle: "T",
			markdown: NOTE,
			provider,
		});
		expect(provider.cueInputs.every((i) => i.noteContext === undefined)).toBe(true);
	});

	it("passes the resolved Question type to cue calls", async () => {
		const provider = mockProvider();
		await generateNote({
			noteTitle: "T",
			markdown: NOTE,
			provider,
			options: {
				questionType: "socratic-reasoning",
			},
		});
		expect(
			provider.cueInputs.every(
				(input) => input.options.questionType === "socratic-reasoning"
			)
		).toBe(true);
	});

	it("keeps section results valid when Note Brief is unsupported", async () => {
		const provider = mockProvider();
		provider.generateNoteBrief = undefined;
		const progress: Array<[number, number]> = [];
		const result = await generateNote({
			noteTitle: "T",
			markdown: NOTE,
			provider,
			onProgress: (done, total) => progress.push([done, total]),
		});
		expect(result.sections).toHaveLength(3);
		expect(result.noteBrief).toBeNull();
		expect(progress).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]]);
	});

	it("keeps section results valid when Note Brief generation fails", async () => {
		const provider = mockProvider({ failNoteBrief: true });
		const progress: Array<[number, number]> = [];
		const result = await generateNote({
			noteTitle: "T",
			markdown: NOTE,
			provider,
			onProgress: (done, total) => progress.push([done, total]),
		});

		expect(result.sections).toHaveLength(3);
		expect(result.noteBrief).toBeNull();
		expect(provider.noteBriefCalls).toBe(1);
		expect(progress.at(-1)).toEqual([4, 4]);
	});

	it("does not request a Note Brief when no section has a usable question", async () => {
		const provider = mockProvider({
			batch: true,
			batchErrorOnHeading: "B",
		});
		provider.generateCues = async (inputs) =>
			inputs.map(() => ({ error: "no usable cue" }));
		const progress: Array<[number, number]> = [];
		const result = await generateNote({
			noteTitle: "T",
			markdown: NOTE,
			provider,
			onProgress: (done, total) => progress.push([done, total]),
		});

		expect(result.sections.every((section) => section.question === null)).toBe(true);
		expect(result.noteBrief).toBeNull();
		expect(provider.noteBriefCalls).toBe(0);
		expect(progress.at(-1)).toEqual([4, 4]);
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
		});
		expect(result.id).toBe("terms");
		expect(result.question).toBe("Q:Terms");
		expect(result.keywords).toEqual(["k1", "k2"]);
		expect(result.summary?.keyPhrase).toBe("Terms");
		expect(result.error).toBeNull();
		expect(result.contentHash).toBe("abc123");
	});

	it("forwards the resolved Question type to the provider", async () => {
		const provider = mockProvider();
		await generateSectionCue({
			section,
			provider,
			options: { questionType: "direct-recall" },
		});
		expect(provider.cueInputs[0].options.questionType).toBe("direct-recall");
	});

	it("defaults an omitted Question type to Exam practice", async () => {
		const provider = mockProvider();
		await generateSectionCue({
			section,
			provider,
		});
		expect(provider.cueInputs[0].options).toEqual({
			questionType: "exam-practice",
		});
	});

	it("captures provider error without throwing", async () => {
		const provider = mockProvider({ failOnHeading: "Terms" });
		const result = await generateSectionCue({
			section,
			provider,
		});
		expect(result.error).toMatch(/boom/);
		expect(result.question).toBeNull();
	});

	it("does not call the provider for an image-only section", async () => {
		const provider = mockProvider();
		const result = await generateSectionCue({
			section: { ...section, content: "![[tonks.jpg]]" },
			provider,
		});

		expect(provider.cueInputs).toEqual([]);
		expect(result).toMatchObject({ question: null, keywords: null, error: null });
	});

	it("passes noteContext when supplied", async () => {
		const provider = mockProvider();
		await generateSectionCue({
			section,
			provider,
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
			maxContextChars: 500,
		});
		expect(provider.cueInputs[0].content.length).toBeLessThanOrEqual(600);
		expect(provider.cueInputs[0].content).toMatch(/truncated for length/);
	});
});

describe("generateSectionCueBatch", () => {
	it("uses a CLI-style batch provider for a single section", async () => {
		const provider = mockProvider({ batch: true });
		const section = {
			id: "queues",
			heading: "Queues",
			level: 2,
			lineNumber: 3,
			content: "Queues are first-in-first-out.",
			contentHash: "queue123",
		};

		const result = await generateSectionCueBatch({
			sections: [section],
			provider,
			options: { questionType: "vocabulary-check" },
		});

		expect(provider.batchInputs).toHaveLength(1);
		expect(provider.batchInputs[0]).toHaveLength(1);
		expect(provider.batchInputs[0][0].options.questionType).toBe(
			"vocabulary-check"
		);
		expect(result[0].question).toBe("Q:Queues");
	});

	it("omits image-only sections from a provider batch", async () => {
		const provider = mockProvider({ batch: true });
		const results = await generateSectionCueBatch({
			sections: [
				{
					id: "image",
					heading: "Image",
					level: 1,
					lineNumber: 1,
					content: "![[tonks.jpg]]",
					contentHash: "image-hash",
				},
				{
					id: "text",
					heading: "Text",
					level: 1,
					lineNumber: 3,
					content: "Actual study text.",
					contentHash: "text-hash",
				},
			],
			provider,
		});

		expect(
			provider.batchInputs.map((batch) => batch.map((item) => item.heading))
		).toEqual([["Text"]]);
		expect(results.map((result) => result.question)).toEqual([null, "Q:Text"]);
	});
});

describe("generateNoteBriefForSections", () => {
	const sections = [
		{
			heading: "Terms",
			question: "What is a queue?",
			keywords: ["queue"],
			error: null,
		},
	];

	it("distinguishes success, skipped, canceled, and failed outcomes", async () => {
		const success = await generateNoteBriefForSections({
			noteTitle: "Queues",
			markdown: "# Terms\nQueues are FIFO.",
			provider: mockProvider(),
			sections,
		});
		expect(success).toMatchObject({
			status: "success",
			noteBrief: { overview: "the note brief" },
		});

		const unsupportedProvider = mockProvider();
		unsupportedProvider.generateNoteBrief = undefined;
		expect(
			await generateNoteBriefForSections({
				noteTitle: "Queues",
				markdown: "# Terms\nQueues are FIFO.",
				provider: unsupportedProvider,
				sections,
			})
		).toEqual({ status: "skipped" });

		const controller = new AbortController();
		controller.abort();
		expect(
			await generateNoteBriefForSections({
				noteTitle: "Queues",
				markdown: "# Terms\nQueues are FIFO.",
				provider: mockProvider(),
				sections,
				signal: controller.signal,
			})
		).toEqual({ status: "canceled" });

		expect(
			await generateNoteBriefForSections({
				noteTitle: "Queues",
				markdown: "# Terms\nQueues are FIFO.",
				provider: mockProvider({ failNoteBrief: true }),
				sections,
			})
		).toEqual({ status: "failed", error: "note brief boom" });
	});

	it("skips when no successful section can support a Note Brief", async () => {
		const provider = mockProvider();
		expect(
			await generateNoteBriefForSections({
				noteTitle: "Queues",
				markdown: "# Terms\nQueues are FIFO.",
				provider,
				sections: [{ ...sections[0], question: null }],
			})
		).toEqual({ status: "skipped" });
		expect(provider.noteBriefCalls).toBe(0);
	});
});

describe("resolveGenerationOptions", () => {
	it("fills unspecified values from defaults", () => {
		expect(resolveGenerationOptions()).toEqual({
			questionType: "exam-practice",
		});
		expect(resolveGenerationOptions({ questionType: "exam-practice" })).toEqual({
			questionType: "exam-practice",
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
