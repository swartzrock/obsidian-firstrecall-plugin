import { describe, it, expect, vi } from "vitest";
import { generateNote, generateSectionCue, clampText, DEFAULT_MAX_CONTEXT_CHARS } from "../src/generator";
import type {
	AiProvider,
	CueInput,
	ProviderStatus,
	SummaryInput,
} from "../src/providers/types";
import type { CueOutput, SummaryOutput } from "../src/schemas";

interface MockOptions {
	failOnHeading?: string;
	onCue?: () => void;
}

function mockProvider(opts: MockOptions = {}): AiProvider & {
	summaryCalls: number;
	lastSummaryInput?: SummaryInput;
	cueInputs: CueInput[];
} {
	const provider = {
		id: "mock",
		label: "Mock",
		requiresNetwork: false,
		requiresDownload: false,
		summaryCalls: 0,
		lastSummaryInput: undefined as SummaryInput | undefined,
		cueInputs: [] as CueInput[],
		async testConnection(): Promise<ProviderStatus> {
			return { ok: true, message: "ok" };
		},
		async generateCue(input: CueInput): Promise<CueOutput> {
			provider.cueInputs.push(input);
			opts.onCue?.();
			if (opts.failOnHeading && input.heading === opts.failOnHeading) {
				throw new Error("boom");
			}
			return {
				question: `Q:${input.heading}`,
				keywords: ["k1", "k2"],
				confidence: "high",
			};
		},
		async generateSummary(input: SummaryInput): Promise<SummaryOutput> {
			provider.summaryCalls++;
			provider.lastSummaryInput = input;
			return { summary: "the summary" };
		},
	};
	return provider;
}

const NOTE = "# A\na\n## B\nb\n### C\nc";

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
			[1, 3],
			[2, 3],
			[3, 3],
		]);
		expect(provider.summaryCalls).toBe(1);
		expect(result.summary).toBe("the summary");
		// Summary receives the per-section questions.
		expect(provider.lastSummaryInput?.sectionQuestions).toEqual([
			"Q:A",
			"Q:B",
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

	it("cancels between sections and skips the summary (C3.2)", async () => {
		const controller = new AbortController();
		const provider = mockProvider();
		const summarySpy = vi.spyOn(provider, "generateSummary");

		const result = await generateNote({
			noteTitle: "T",
			markdown: NOTE,
			provider,
			preset: "conceptual",
			signal: controller.signal,
			onProgress: (done) => {
				if (done === 1) controller.abort();
			},
		});

		expect(result.canceled).toBe(true);
		expect(result.sections).toHaveLength(1); // stopped after first
		expect(result.summary).toBeNull();
		expect(summarySpy).not.toHaveBeenCalled();
	});

	it("handles a note with no headings as a single section", async () => {
		const provider = mockProvider();
		const result = await generateNote({
			noteTitle: "T",
			markdown: "plain note text",
			provider,
			preset: "conceptual",
		});
		expect(result.sections).toHaveLength(1);
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
		expect(result.error).toBeNull();
		expect(result.contentHash).toBe("abc123");
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
