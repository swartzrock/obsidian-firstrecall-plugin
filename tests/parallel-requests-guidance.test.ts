import { describe, expect, it } from "vitest";
import {
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

	it("formats the slider description with the current concurrency", () => {
		expect(
			formatParallelRequestsDescription(baseSettings({ sectionConcurrency: 3 }))
		).toBe(
			"Run up to 3 section requests at once. Usually safe for faster parallel generation. Lower this value if generation fails with rate-limit errors."
		);
	});
});
