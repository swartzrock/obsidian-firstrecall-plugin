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

export interface AutoGenerationTimerApi {
	setTimeout(callback: () => void, delayMs: number): number;
	clearTimeout(timer: number): void;
}

export interface ScheduleAutoGenerationTimerOptions {
	timers: Map<string, number>;
	key: string;
	delaySeconds: AutoGenerationSettleDelaySeconds;
	timerApi: AutoGenerationTimerApi;
	shouldRun?: () => boolean;
	onRun: () => void;
}

export function autoGenerationSettleDelayMs(
	delaySeconds: AutoGenerationSettleDelaySeconds
): number {
	return delaySeconds * 1000;
}

export function scheduleAutoGenerationTimer({
	timers,
	key,
	delaySeconds,
	timerApi,
	shouldRun,
	onRun,
}: ScheduleAutoGenerationTimerOptions): void {
	const existing = timers.get(key);
	if (existing !== undefined) timerApi.clearTimeout(existing);
	const timer = timerApi.setTimeout(() => {
		timers.delete(key);
		if (shouldRun && !shouldRun()) return;
		onRun();
	}, autoGenerationSettleDelayMs(delaySeconds));
	timers.set(key, timer);
}
