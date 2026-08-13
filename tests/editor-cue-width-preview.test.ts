import { describe, expect, it, vi } from "vitest";
import { EditorCueWidthPreviewScheduler } from "../src/editor-cue-width-preview";

describe("EditorCueWidthPreviewScheduler", () => {
	it("applies only the latest preview once per animation frame", () => {
		const callbacks: FrameRequestCallback[] = [];
		const apply = vi.fn();
		const scheduler = new EditorCueWidthPreviewScheduler(
			null,
			{
				requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
					callbacks.push(callback);
					return callbacks.length;
				}),
				cancelAnimationFrame: vi.fn(),
			},
			apply
		);

		scheduler.preview(200);
		scheduler.preview(240);
		scheduler.preview(280);

		expect(callbacks).toHaveLength(1);
		expect(apply).not.toHaveBeenCalled();
		callbacks[0]?.(0);
		expect(apply).toHaveBeenCalledOnce();
		expect(apply).toHaveBeenCalledWith(280);
	});

	it("flushes completion immediately and cancels a pending preview", () => {
		const callbacks: FrameRequestCallback[] = [];
		const cancelAnimationFrame = vi.fn();
		const apply = vi.fn();
		const scheduler = new EditorCueWidthPreviewScheduler(
			240,
			{
				requestAnimationFrame: (callback) => {
					callbacks.push(callback);
					return 7;
				},
				cancelAnimationFrame,
			},
			apply
		);

		scheduler.preview(280);
		scheduler.flush(300);

		expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
		expect(apply).toHaveBeenCalledOnce();
		expect(apply).toHaveBeenCalledWith(300);
	});
});
