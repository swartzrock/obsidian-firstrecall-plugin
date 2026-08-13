export interface EditorCueWidthFrameHost {
	requestAnimationFrame(callback: FrameRequestCallback): number;
	cancelAnimationFrame(id: number): void;
}

export class EditorCueWidthPreviewScheduler {
	private frameId: number | null = null;
	private latestWidthPx: number | null;

	constructor(
		initialWidthPx: number | null,
		private readonly host: EditorCueWidthFrameHost,
		private readonly apply: (widthPx: number | null) => void
	) {
		this.latestWidthPx = initialWidthPx;
	}

	preview(widthPx: number | null): void {
		this.latestWidthPx = widthPx;
		if (this.frameId !== null) return;
		this.frameId = this.host.requestAnimationFrame(() => {
			this.frameId = null;
			this.apply(this.latestWidthPx);
		});
	}

	flush(widthPx = this.latestWidthPx): void {
		this.latestWidthPx = widthPx;
		if (this.frameId !== null) {
			this.host.cancelAnimationFrame(this.frameId);
			this.frameId = null;
		}
		this.apply(widthPx);
	}

	cancel(): void {
		if (this.frameId === null) return;
		this.host.cancelAnimationFrame(this.frameId);
		this.frameId = null;
	}
}
