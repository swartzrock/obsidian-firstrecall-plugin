import { describe, expect, it } from "vitest";
import {
	projectStudyMaterialStatus,
	statusLabel,
} from "../src/status";
import type { StudyMaterialClassification } from "../src/study-material-state";

function classification(
	overrides: Partial<StudyMaterialClassification> = {}
): StudyMaterialClassification {
	return {
		sourceRevision: "revision-1",
		freshness: "current",
		noteBrief: "current",
		sections: [{ id: "section-a", freshness: "current" }],
		retryable: false,
		bannerDismissed: false,
		hasGeneratedMaterial: true,
		...overrides,
	};
}

describe("statusLabel", () => {
	it("uses user-facing status-bar copy", () => {
		expect(statusLabel("ready")).toBe("up to date");
		expect(statusLabel("stale")).toBe("study material is outdated");
		expect(statusLabel("setup")).toBe("setup needed");
	});
});

describe("projectStudyMaterialStatus", () => {
	it.each([
		["automatic", "current", "Study material up to date · Auto-updates on"],
		["automatic", "outdated", "Study material needs updating · Auto-updates on"],
		["automatic", "updating", "Updating study material · Auto-updates on"],
		["automatic", "failed", "Study material update failed · Auto-updates on"],
		["manual", "current", "Study material up to date · Auto-updates off"],
		["manual", "outdated", "Study material needs updating · Auto-updates off"],
		["manual", "updating", "Updating study material · Auto-updates off"],
		["manual", "failed", "Study material update failed · Auto-updates off"],
	] as const)(
		"projects %s coverage crossed with %s freshness",
		(coverage, freshness, label) => {
			const result = projectStudyMaterialStatus({
				coverage,
				classification: classification({ freshness }),
				providerConfigured: true,
			});

			expect(result).toMatchObject({ coverage, freshness, statusLabel: label });
		}
	);

	it("keeps a manual note without generated material neutral", () => {
		const result = projectStudyMaterialStatus({
			coverage: "manual",
			classification: classification({
				freshness: "outdated",
				noteBrief: "missing",
				sections: [{ id: "section-a", freshness: "missing" }],
				hasGeneratedMaterial: false,
			}),
			providerConfigured: false,
		});

		expect(result).toMatchObject({
			coverage: "manual",
			freshness: null,
			statusLabel: "Auto-updates off",
			providerSetupRequired: true,
			noteBriefOutdated: false,
			outdatedSectionIds: [],
			banner: null,
		});
	});

	it("projects missing automatic material as outdated without starting work", () => {
		const result = projectStudyMaterialStatus({
			coverage: "automatic",
			classification: classification({
				freshness: "outdated",
				noteBrief: "missing",
				sections: [{ id: "section-a", freshness: "missing" }],
				hasGeneratedMaterial: false,
			}),
			providerConfigured: true,
		});

		expect(result).toMatchObject({
			freshness: "outdated",
			noteBriefOutdated: true,
			outdatedSectionIds: ["section-a"],
			banner: {
				revision: "revision-1",
				kind: "outdated",
				action: "update",
			},
		});
	});

	it("does not call an automatic note with no eligible material outdated", () => {
		expect(
			projectStudyMaterialStatus({
				coverage: "automatic",
				classification: classification({
					freshness: "outdated",
					noteBrief: "missing",
					sections: [],
					hasGeneratedMaterial: false,
				}),
				providerConfigured: true,
			})
		).toMatchObject({
			coverage: "automatic",
			freshness: null,
			statusLabel: "Auto-updates on",
			banner: null,
		});
	});

	it("uses Retry for failures and suppresses only the dismissed revision", () => {
		const failed = classification({
			freshness: "failed",
			noteBrief: "failed",
			sections: [{ id: "section-a", freshness: "failed" }],
			retryable: true,
		});
		const visible = projectStudyMaterialStatus({
			coverage: "automatic",
			classification: failed,
			providerConfigured: true,
		});
		const dismissed = projectStudyMaterialStatus({
			coverage: "automatic",
			classification: { ...failed, bannerDismissed: true },
			providerConfigured: true,
		});

		expect(visible.banner).toMatchObject({ kind: "failed", action: "retry" });
		expect(visible.noteBriefOutdated).toBe(true);
		expect(visible.outdatedSectionIds).toEqual(["section-a"]);
		expect(dismissed.banner).toBeNull();
	});

	it("keeps provider setup secondary to coverage and freshness", () => {
		expect(
			projectStudyMaterialStatus({
				coverage: "manual",
				classification: classification({ freshness: "outdated" }),
				providerConfigured: false,
			})
		).toMatchObject({
			coverage: "manual",
			freshness: "outdated",
			statusLabel: "Study material needs updating · Auto-updates off",
			providerSetupRequired: true,
		});
	});
});
