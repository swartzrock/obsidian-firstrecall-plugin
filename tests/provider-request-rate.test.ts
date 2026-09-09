import { describe, expect, it, vi } from "vitest";
import {
	effectiveProviderRequestRate,
	RollingWindowRequestLimiter,
} from "../src/provider-request-rate";

describe("provider request rate", () => {
	it("locks the hosted trial to one request per ten seconds while honoring other provider settings", () => {
		expect(effectiveProviderRequestRate("hosted-demo", 20)).toBe(1);
		expect(effectiveProviderRequestRate("hosted-demo", 5)).toBe(1);
		expect(effectiveProviderRequestRate("hosted-demo", 1)).toBe(1);
		expect(effectiveProviderRequestRate("openai", 20)).toBe(20);
	});

	it("spaces hosted trial requests ten seconds apart even with a higher saved rate", async () => {
		let now = 0;
		const starts: number[] = [];
		const limiter = new RollingWindowRequestLimiter(
			() => effectiveProviderRequestRate("hosted-demo", 20),
			{
				now: () => now,
				sleep: async (milliseconds) => { now += milliseconds; },
			}
		);

		for (let request = 0; request < 7; request++) {
			await limiter.acquire();
			starts.push(now);
		}

		expect(starts).toEqual([0, 10_000, 20_000, 30_000, 40_000, 50_000, 60_000]);
	});

	it("admits only five starts in a rolling ten-second window", async () => {
		let now = 0;
		const sleeps: number[] = [];
		const limiter = new RollingWindowRequestLimiter(() => 5, {
			now: () => now,
			sleep: async (milliseconds) => {
				sleeps.push(milliseconds);
				now += milliseconds;
			},
		});

		await Promise.all(Array.from({ length: 20 }, () => limiter.acquire()));

		expect(sleeps).toEqual([10_000, 10_000, 10_000]);
	});

	it("releases the queue when a sleeping request is canceled", async () => {
		let now = 0;
		const sleep = vi.fn((_milliseconds: number, signal?: AbortSignal) =>
			new Promise<void>((resolve, reject) => {
				signal?.addEventListener(
					"abort",
					() => reject(
						signal.reason instanceof Error
							? signal.reason
							: new DOMException("Canceled", "AbortError")
					),
					{ once: true }
				);
			})
		);
		const limiter = new RollingWindowRequestLimiter(() => 5, {
			now: () => now,
			sleep,
		});
		await Promise.all(Array.from({ length: 5 }, () => limiter.acquire()));

		const controller = new AbortController();
		const canceled = limiter.acquire(controller.signal);
		await vi.waitFor(() => expect(sleep).toHaveBeenCalledOnce());
		controller.abort(new DOMException("Canceled", "AbortError"));
		await expect(canceled).rejects.toThrow("Canceled");

		now = 10_000;
		await expect(limiter.acquire()).resolves.toBeUndefined();
	});
});
