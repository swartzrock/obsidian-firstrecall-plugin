export const AUTO_GENERATION_SETTLE_DELAY_SECONDS_OPTIONS = [
	1,
	5,
	10,
	25,
	60,
] as const;

export type AutoGenerationSettleDelaySeconds =
	(typeof AUTO_GENERATION_SETTLE_DELAY_SECONDS_OPTIONS)[number];

export const DEFAULT_AUTO_GENERATION_SETTLE_DELAY_SECONDS: AutoGenerationSettleDelaySeconds = 10;

export function isAutoGenerationSettleDelaySeconds(
	value: unknown
): value is AutoGenerationSettleDelaySeconds {
	return (
		typeof value === "number" &&
		AUTO_GENERATION_SETTLE_DELAY_SECONDS_OPTIONS.includes(
			value as AutoGenerationSettleDelaySeconds
		)
	);
}

export function normalizeAutoGenerationSettleDelaySeconds(
	value: unknown
): AutoGenerationSettleDelaySeconds {
	return isAutoGenerationSettleDelaySeconds(value)
		? value
		: DEFAULT_AUTO_GENERATION_SETTLE_DELAY_SECONDS;
}

export function formatAutoGenerationSettleDelayLabel(
	value: AutoGenerationSettleDelaySeconds
): string {
	return `${value} second${value === 1 ? "" : "s"}`;
}
