import { byokProviderDefinition, isByokProviderId } from "@swartzrock/byok-runtime";

export interface ParallelRequestsGuidanceSettings {
	sectionConcurrency: number;
	provider?: string;
}

const PARALLEL_REQUESTS_HINT =
	"Usually safe for faster parallel generation. Lower this value if generation fails with rate-limit errors.";
const CLI_REQUESTS_HINT =
	"Local CLI providers run one CLI process at a time to avoid multiple agent processes and interactive prompts.";

function isCliProvider(provider: string | undefined): boolean {
	return isByokProviderId(provider)
		? byokProviderDefinition(provider).credentialKind === "command"
		: false;
}

export function effectiveParallelRequestCount(
	settings: ParallelRequestsGuidanceSettings
): number {
	return settings.sectionConcurrency;
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
	if (isCliProvider(settings.provider)) {
		return `Batch up to ${effectiveCount} section${
			effectiveCount === 1 ? "" : "s"
		} in one local CLI request. ${parallelRequestsGuidance(settings)}`;
	}
	return `Run up to ${effectiveCount} section request${
		effectiveCount === 1 ? "" : "s"
	} at once. ${parallelRequestsGuidance(settings)}`;
}
