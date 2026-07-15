import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
	EDITOR_HOOK_PAGE_SHIFT_CLASS,
	EditorHookLayoutController,
	leftDockIsOpen,
} from "../src/editor-hook-layout";

describe("editor hook layout", () => {
	it("uses stable workspace state before the first editor interaction", () => {
		expect(leftDockIsOpen({ collapsed: false })).toBe(true);
		expect(leftDockIsOpen({ collapsed: true })).toBe(false);
	});

	it("keeps placement stable when the first interaction refreshes layout", () => {
		const editor = new JSDOM("<div class='cm-editor'></div>").window.document
			.body.firstElementChild as HTMLElement;
		const layout = new EditorHookLayoutController();

		layout.sync(editor, true, leftDockIsOpen({ collapsed: false }), true);
		expect(editor.classList.contains(EDITOR_HOOK_PAGE_SHIFT_CLASS)).toBe(true);

		layout.sync(editor, true, leftDockIsOpen({ collapsed: false }), true);
		expect(editor.classList.contains(EDITOR_HOOK_PAGE_SHIFT_CLASS)).toBe(true);
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
