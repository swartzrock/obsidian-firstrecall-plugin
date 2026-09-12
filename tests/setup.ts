import { vi } from "vitest";

// Node-based provider tests still use Obsidian's browser timer API.
Object.defineProperty(globalThis, "window", {
	configurable: true,
	writable: true,
	value: {
		get document() { return globalThis.document; },
		setTimeout: (handler: () => void, timeout?: number) => setTimeout(handler, timeout),
		clearTimeout: (...args: Parameters<typeof clearTimeout>) => clearTimeout(...args),
	},
});

vi.mock("jsdom", async (importOriginal) => {
	const actual = await importOriginal<typeof import("jsdom")>();
	return {
		...actual,
		JSDOM: class extends actual.JSDOM {
			constructor(...args: ConstructorParameters<typeof actual.JSDOM>) {
				super(...args);
				const { window } = this;
				window.createEl = (tag: string) => window.document.createElement(tag);
				window.createDiv = () => window.document.createElement("div");
				window.createSpan = () => window.document.createElement("span");
				Object.defineProperty(window.Element.prototype, "instanceOf", {
					value(this: Element, type: typeof window.Element): boolean {
						return this instanceof type;
					},
				});
			}
		},
	};
});
