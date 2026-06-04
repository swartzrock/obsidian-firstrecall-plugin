import { describe, it, expect, vi } from "vitest";
import { generateNote } from "../src/generator";
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
} {
	const provider = {
		id: "mock",
		label: "Mock",
		requiresNetwork: false,
		requiresDownload: false,
		summaryCalls: 0,
		lastSummaryInput: undefined as SummaryInput | undefined,
		async testConnection(): Promise<ProviderStatus> {
			return { ok: true, message: "ok" };
		},
		async generateCue(input: CueInput): Promise<CueOutput> {
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
});
