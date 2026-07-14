import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
	EDITOR_HOOK_PAGE_SHIFT_CLASS,
	EditorHookLayoutController,
	leftDockIsOpen,
} from "../src/editor-hook-layout";

describe("editor hook layout", () => {
	it("keeps an expanded dock open during a transient zero-width layout", () => {
		const leftDock = new JSDOM(
			"<div class='workspace-split mod-left-split'></div>"
		).window.document.body.firstElementChild as HTMLElement;
		Object.defineProperty(leftDock, "getBoundingClientRect", {
			value: () => ({ width: 0 }),
		});

		expect(leftDockIsOpen(leftDock)).toBe(true);

		leftDock.classList.add("is-sidedock-collapsed");
		expect(leftDockIsOpen(leftDock)).toBe(false);
	});

	it("keeps page placement stable across cue refreshes", () => {
		const editor = new JSDOM("<div class='cm-editor'></div>").window.document
			.body.firstElementChild as HTMLElement;
		const layout = new EditorHookLayoutController();

		layout.sync(editor, true, true, true);
		expect(editor.classList.contains(EDITOR_HOOK_PAGE_SHIFT_CLASS)).toBe(true);

		layout.sync(editor, true, false);
		expect(editor.classList.contains(EDITOR_HOOK_PAGE_SHIFT_CLASS)).toBe(true);

		layout.sync(editor, true, false, true);
		expect(editor.classList.contains(EDITOR_HOOK_PAGE_SHIFT_CLASS)).toBe(false);
	});

	it("updates placement when the rail appears or disappears", () => {
		const editor = new JSDOM("<div class='cm-editor'></div>").window.document
			.body.firstElementChild as HTMLElement;
		const layout = new EditorHookLayoutController();

		layout.sync(editor, false, true);
		expect(editor.classList.contains(EDITOR_HOOK_PAGE_SHIFT_CLASS)).toBe(false);

		layout.sync(editor, true, true);
		expect(editor.classList.contains(EDITOR_HOOK_PAGE_SHIFT_CLASS)).toBe(true);

		layout.sync(editor, false, true);
		expect(editor.classList.contains(EDITOR_HOOK_PAGE_SHIFT_CLASS)).toBe(false);
	});
});
