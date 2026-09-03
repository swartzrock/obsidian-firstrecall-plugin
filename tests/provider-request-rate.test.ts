import { describe, expect, it, vi } from "vitest";
import {
	effectiveProviderRequestRate,
	RollingWindowRequestLimiter,
} from "../src/provider-request-rate";

describe("provider request rate", () => {
	it("caps the hosted trial at five requests while honoring other provider settings", () => {
		expect(effectiveProviderRequestRate("hosted-demo", 20)).toBe(5);
		expect(effectiveProviderRequestRate("hosted-demo", 1)).toBe(1);
		expect(effectiveProviderRequestRate("openai", 20)).toBe(20);
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
