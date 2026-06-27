import { describe, expect, it } from "vitest";
import {
	autoGenerationSettleDelayMs,
	scheduleAutoGenerationTimer,
	type AutoGenerationTimerApi,
} from "../src/auto-generation-delay";

function createTimerHarness() {
	let nextTimer = 1;
	const callbacks = new Map<number, () => void>();
	const cleared: number[] = [];
	const delays: number[] = [];
	const api: AutoGenerationTimerApi = {
		setTimeout(callback, delayMs) {
			const timer = nextTimer++;
			callbacks.set(timer, callback);
			delays.push(delayMs);
			return timer;
		},
		clearTimeout(timer) {
			cleared.push(timer);
			callbacks.delete(timer);
		},
	};
	return {
		api,
		cleared,
		delays,
		fire(timer: number) {
			callbacks.get(timer)?.();
		},
	};
}

describe("auto-generation settle delay", () => {
	it("converts configured seconds to milliseconds", () => {
		expect(autoGenerationSettleDelayMs(1)).toBe(1000);
		expect(autoGenerationSettleDelayMs(10)).toBe(10000);
		expect(autoGenerationSettleDelayMs(60)).toBe(60000);
	});

	it("schedules a callback after the configured settle delay", () => {
		const timers = new Map<string, number>();
		const harness = createTimerHarness();
		let calls = 0;

		scheduleAutoGenerationTimer({
			timers,
			key: "note.md",
			delaySeconds: 10,
			timerApi: harness.api,
			onRun: () => {
				calls += 1;
			},
		});

		expect(harness.delays).toEqual([10000]);
		expect(calls).toBe(0);
		harness.fire(timers.get("note.md")!);
		expect(calls).toBe(1);
		expect(timers.has("note.md")).toBe(false);
	});

	it("clears and replaces an existing timer for repeated edits", () => {
		const timers = new Map<string, number>();
		const harness = createTimerHarness();
		let calls = 0;

		scheduleAutoGenerationTimer({
			timers,
			key: "note.md",
			delaySeconds: 10,
			timerApi: harness.api,
			onRun: () => {
				calls += 1;
			},
		});
		const firstTimer = timers.get("note.md")!;

		scheduleAutoGenerationTimer({
			timers,
			key: "note.md",
			delaySeconds: 10,
			timerApi: harness.api,
			onRun: () => {
				calls += 1;
			},
		});
		const secondTimer = timers.get("note.md")!;

		expect(harness.cleared).toEqual([firstTimer]);
		harness.fire(firstTimer);
		expect(calls).toBe(0);
		harness.fire(secondTimer);
		expect(calls).toBe(1);
	});

	it("skips the callback when the latest-state guard fails before fire", () => {
		const timers = new Map<string, number>();
		const harness = createTimerHarness();
		let enabled = true;
		let calls = 0;

		scheduleAutoGenerationTimer({
			timers,
			key: "note.md",
			delaySeconds: 10,
			timerApi: harness.api,
			shouldRun: () => enabled,
			onRun: () => {
				calls += 1;
			},
		});

		enabled = false;
		harness.fire(timers.get("note.md")!);
		expect(calls).toBe(0);
		expect(timers.has("note.md")).toBe(false);
	});

	it("supports resolving the latest eligible target when the timer fires", () => {
		const timers = new Map<string, number>();
		const harness = createTimerHarness();
		let currentAreaId: string | null = "area-1";
		const runs: string[] = [];

		scheduleAutoGenerationTimer({
			timers,
			key: "note.md",
			delaySeconds: 10,
			timerApi: harness.api,
			onRun: () => {
				if (!currentAreaId) return;
				runs.push(currentAreaId);
			},
		});

		currentAreaId = null;
		harness.fire(timers.get("note.md")!);
		expect(runs).toEqual([]);

		scheduleAutoGenerationTimer({
			timers,
			key: "note.md",
			delaySeconds: 10,
			timerApi: harness.api,
			onRun: () => {
				if (!currentAreaId) return;
				runs.push(currentAreaId);
			},
		});

		currentAreaId = "area-2";
		harness.fire(timers.get("note.md")!);
		expect(runs).toEqual(["area-2"]);
	});
});
