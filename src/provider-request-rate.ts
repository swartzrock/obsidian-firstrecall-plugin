import type { FirstRecallProviderId } from "./cue-provider";

export const REQUEST_RATE_OPTIONS = [1, 5, 10, 20] as const;
export type RequestsPerTenSeconds = (typeof REQUEST_RATE_OPTIONS)[number];

const WINDOW_MILLISECONDS = 10_000;
const HOSTED_DEMO_MAX_REQUESTS: RequestsPerTenSeconds = 5;

export function isRequestsPerTenSeconds(
	value: unknown
): value is RequestsPerTenSeconds {
	return REQUEST_RATE_OPTIONS.some((option) => option === value);
}

export function effectiveProviderRequestRate(
	providerId: FirstRecallProviderId,
	configuredRate: RequestsPerTenSeconds
): RequestsPerTenSeconds {
	if (
		providerId === "hosted-demo" &&
		configuredRate > HOSTED_DEMO_MAX_REQUESTS
	) {
		return HOSTED_DEMO_MAX_REQUESTS;
	}
	return configuredRate;
}

export interface ProviderRequestRateGate {
	acquire(signal?: AbortSignal): Promise<void>;
}

interface RollingWindowRequestLimiterDeps {
	now(): number;
	sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
}

function abortReason(signal: AbortSignal): Error {
	return signal.reason instanceof Error
		? signal.reason
		: new DOMException("Canceled", "AbortError");
}

export function abortableDelay(
	milliseconds: number,
	signal?: AbortSignal
): Promise<void> {
	if (signal?.aborted) return Promise.reject(abortReason(signal));
	return new Promise((resolve, reject) => {
		const finish = (): void => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		};
		const timer = setTimeout(finish, milliseconds);
		const onAbort = (): void => {
			clearTimeout(timer);
			if (signal) reject(abortReason(signal));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

export class RollingWindowRequestLimiter implements ProviderRequestRateGate {
	private starts: number[] = [];
	private tail: Promise<void> = Promise.resolve();

	constructor(
		private readonly limit: () => RequestsPerTenSeconds,
		private readonly deps: RollingWindowRequestLimiterDeps = {
			now: () => Date.now(),
			sleep: abortableDelay,
		}
	) {}

	async acquire(signal?: AbortSignal): Promise<void> {
		const previous = this.tail;
		let release = (): void => {};
		this.tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			while (true) {
				if (signal?.aborted) throw abortReason(signal);
				const now = this.deps.now();
				this.starts = this.starts.filter(
					(startedAt) => startedAt > now - WINDOW_MILLISECONDS
				);
				const limit = this.limit();
				if (this.starts.length < limit) {
					this.starts.push(now);
					return;
				}
				const firstRequiredExpiry = this.starts[this.starts.length - limit];
				await this.deps.sleep(
					Math.max(0, firstRequiredExpiry + WINDOW_MILLISECONDS - now),
					signal
				);
			}
		} finally {
			release();
		}
	}
}
