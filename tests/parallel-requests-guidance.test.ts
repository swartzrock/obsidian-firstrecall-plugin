import { describe, expect, it } from "vitest";
import {
	effectiveParallelRequestCount,
	formatParallelRequestsDescription,
	parallelRequestsGuidance,
	type ParallelRequestsGuidanceSettings,
} from "../src/parallel-requests-guidance";

function baseSettings(
	overrides: Partial<ParallelRequestsGuidanceSettings> = {}
): ParallelRequestsGuidanceSettings {
	return {
		sectionConcurrency: 5,
		...overrides,
	};
}

describe("parallelRequestsGuidance", () => {
	it("uses the same provider-agnostic guidance", () => {
		expect(parallelRequestsGuidance(baseSettings())).toBe(
			"Usually safe for faster parallel generation. Lower this value if generation fails with rate-limit errors."
		);
		expect(parallelRequestsGuidance(baseSettings({ sectionConcurrency: 2 }))).toBe(
			"Usually safe for faster parallel generation. Lower this value if generation fails with rate-limit errors."
		);
	});

	it.each(["codex-cli", "claude-cli"])(
		"describes %s providers as batched local CLI requests",
		(provider) => {
			const settings = baseSettings({
				provider,
				sectionConcurrency: 5,
			});
			expect(effectiveParallelRequestCount(settings)).toBe(5);
			expect(parallelRequestsGuidance(settings)).toBe(
				"Local CLI providers run one CLI process at a time to avoid multiple agent processes and interactive prompts."
			);
			expect(formatParallelRequestsDescription(settings)).toBe(
				"Batch up to 5 sections in one local CLI request. Local CLI providers run one CLI process at a time to avoid multiple agent processes and interactive prompts."
			);
		}
	);

	it("formats the slider description with the current concurrency", () => {
		expect(
			formatParallelRequestsDescription(baseSettings({ sectionConcurrency: 3 }))
		).toBe(
			"Run up to 3 section requests at once. Usually safe for faster parallel generation. Lower this value if generation fails with rate-limit errors."
		);
	});
});
