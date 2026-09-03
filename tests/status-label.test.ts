import { describe, expect, it } from "vitest";
import { projectStudyMaterialStatus } from "../src/status";
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

describe("projectStudyMaterialStatus", () => {
	it.each([
		["automatic", "current"],
		["automatic", "outdated"],
		["automatic", "updating"],
		["automatic", "failed"],
		["manual", "current"],
		["manual", "outdated"],
		["manual", "updating"],
		["manual", "failed"],
	] as const)(
		"projects %s coverage crossed with %s freshness",
		(coverage, freshness) => {
			const result = projectStudyMaterialStatus({
				coverage,
				classification: classification({ freshness }),
				providerConfigured: true,
			});

			expect(result).toMatchObject({ coverage, freshness });
		}
	);

	it("keeps status labels meaningful across freshness and coverage", () => {
		const freshnessStates = ["current", "outdated", "updating", "failed"] as const;
		const coverages = ["automatic", "manual"] as const;
		const labels = new Map<string, string>();

		for (const coverage of coverages) {
			for (const freshness of freshnessStates) {
				const { statusLabel } = projectStudyMaterialStatus({
					coverage,
					classification: classification({ freshness }),
					providerConfigured: true,
				});

				expect(statusLabel.trim()).not.toBe("");
				labels.set(`${coverage}:${freshness}`, statusLabel);
			}
		}

		for (const coverage of coverages) {
			const freshnessLabels = freshnessStates.map((freshness) =>
				labels.get(`${coverage}:${freshness}`)
			);
			expect(new Set(freshnessLabels)).toHaveLength(freshnessStates.length);
		}

		for (const freshness of freshnessStates) {
			expect(labels.get(`automatic:${freshness}`)).not.toBe(
				labels.get(`manual:${freshness}`)
			);
		}
	});

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
			providerSetupRequired: true,
		});
	});
});
