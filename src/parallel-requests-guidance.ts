export interface ParallelRequestsGuidanceSettings {
	sectionConcurrency: number;
	provider?: string;
}

const PARALLEL_REQUESTS_HINT =
	"Usually safe for faster parallel generation. Lower this value if generation fails with rate-limit errors.";
const CLI_REQUESTS_HINT =
	"Local CLI providers run one section request at a time to avoid multiple agent processes and interactive prompts.";

function isCliProvider(provider: string | undefined): boolean {
	return provider === "codex-cli" || provider === "claude-cli";
}

export function effectiveParallelRequestCount(
	settings: ParallelRequestsGuidanceSettings
): number {
	return isCliProvider(settings.provider) ? 1 : settings.sectionConcurrency;
}

export function parallelRequestsGuidance(
	settings: ParallelRequestsGuidanceSettings
): string {
	if (isCliProvider(settings.provider)) return CLI_REQUESTS_HINT;
	return PARALLEL_REQUESTS_HINT;
}

export function formatParallelRequestsDescription(
	settings: ParallelRequestsGuidanceSettings
): string {
	const effectiveCount = effectiveParallelRequestCount(settings);
	return `Run up to ${effectiveCount} section request${
		effectiveCount === 1 ? "" : "s"
	} at once. ${parallelRequestsGuidance(settings)}`;
}
