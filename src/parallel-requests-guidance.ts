export interface ParallelRequestsGuidanceSettings {
	sectionConcurrency: number;
}

const PARALLEL_REQUESTS_HINT =
	"Usually safe for faster parallel generation. Lower this value if generation fails with rate-limit errors.";

export function parallelRequestsGuidance(
	_settings: ParallelRequestsGuidanceSettings
): string {
	return PARALLEL_REQUESTS_HINT;
}

export function formatParallelRequestsDescription(
	settings: ParallelRequestsGuidanceSettings
): string {
	return `Run up to ${settings.sectionConcurrency} section request${
		settings.sectionConcurrency === 1 ? "" : "s"
	} at once. ${parallelRequestsGuidance(settings)}`;
}
