import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import CueCraftPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/settings";

describe("Editing View cue refresh", () => {
	it("applies a display change to an open editor when settings has focus", () => {
		const document = new JSDOM("<div class='cm-editor'></div>").window.document;
		const editorDom = document.querySelector<HTMLElement>(".cm-editor")!;
		const dispatch = vi.fn();
		const file = { path: "notes/agents.md" };
		const markdownView = {
			getViewType: () => "markdown",
			file,
			editor: {
				cm: { dom: editorDom, dispatch },
				getValue: () => "# Agents\nAgents use tools.",
			},
		};
		const plugin = new CueCraftPlugin({} as never, {} as never);
		plugin.settings = {
			...structuredClone(DEFAULT_SETTINGS),
			editorCueDisplay: "cornell",
		};
		Object.assign(plugin as unknown as Record<string, unknown>, {
			app: {
				workspace: {
					getActiveFile: () => null,
					iterateAllLeaves: (visit: (leaf: { view: typeof markdownView }) => void) =>
						visit({ view: markdownView }),
				},
			},
			cacheStore: { get: () => null },
			visibility: { isHidden: () => false },
			cueSectionCollapse: {},
			updateEditorHookLayout: vi.fn(),
		});

		plugin.refreshEditorCues();

		expect(dispatch).toHaveBeenCalledTimes(1);
		const effect = dispatch.mock.calls[0]?.[0].effects as {
			value: { display: string };
		};
		expect(effect.value.display).toBe("cornell");
		expect(editorDom.dataset.cuecraftEditorDisplay).toBe("cornell");
	});
});
