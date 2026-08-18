import type {
	ComponentFreshness,
	NoteFreshness,
	StudyMaterialClassification,
} from "./study-material-state";

/** Status-bar states from the v1.0 scope. `generating` carries N/M progress. */
export type CueStatus =
	| "setup"
	| "ready"
	| "generating"
	| "stale"
	| "study"
	| "hidden";

export function statusLabel(status: CueStatus): string {
	switch (status) {
		case "ready":
			return "up to date";
		case "stale":
			return "study material is outdated";
		case "setup":
			return "setup needed";
		default:
			return status;
	}
}

export type StudyCoverage = "automatic" | "manual";
export type StudyFreshness = NoteFreshness | null;

export interface StudyMaterialBannerState {
	revision: string;
	kind: "outdated" | "failed";
	action: "update" | "retry";
}

export interface StudyMaterialStatusProjection {
	coverage: StudyCoverage;
	freshness: StudyFreshness;
	statusLabel: string;
	providerSetupRequired: boolean;
	noteBriefOutdated: boolean;
	outdatedSectionIds: string[];
	banner: StudyMaterialBannerState | null;
}

function componentNeedsUpdate(freshness: ComponentFreshness): boolean {
	return freshness === "missing" ||
		freshness === "outdated" ||
		freshness === "failed";
}

function projectionLabel(
	coverage: StudyCoverage,
	freshness: StudyFreshness
): string {
	const coverageLabel = coverage === "automatic" ? "Automatic" : "Manual";
	if (!freshness) return coverageLabel;
	return `${coverageLabel} · ${freshness === "failed" ? "update failed" : freshness}`;
}

/**
 * Project persistent maintenance state independently from presentation state.
 * Hidden material and Study Mode deliberately are not inputs.
 */
export function projectStudyMaterialStatus(params: {
	coverage: StudyCoverage;
	classification: StudyMaterialClassification;
	providerConfigured: boolean;
}): StudyMaterialStatusProjection {
	const { classification } = params;
	const hasNoRequiredMaterial =
		classification.sections.length === 0 &&
		!classification.hasGeneratedMaterial;
	const freshness: StudyFreshness =
		hasNoRequiredMaterial ||
		(params.coverage === "manual" && !classification.hasGeneratedMaterial)
			? null
			: classification.freshness;
	const noteBriefOutdated = freshness !== null &&
		componentNeedsUpdate(classification.noteBrief);
	const outdatedSectionIds = freshness === null
		? []
		: classification.sections
			.filter((section) => componentNeedsUpdate(section.freshness))
			.map((section) => section.id);
	let banner: StudyMaterialBannerState | null = null;
	if (!classification.bannerDismissed && freshness === "failed") {
		banner = {
			revision: classification.sourceRevision,
			kind: "failed",
			action: classification.retryable ? "retry" : "update",
		};
	} else if (!classification.bannerDismissed && freshness === "outdated") {
		banner = {
			revision: classification.sourceRevision,
			kind: "outdated",
			action: "update",
		};
	}

	return {
		coverage: params.coverage,
		freshness,
		statusLabel: projectionLabel(params.coverage, freshness),
		providerSetupRequired: !params.providerConfigured,
		noteBriefOutdated,
		outdatedSectionIds,
		banner,
	};
}
