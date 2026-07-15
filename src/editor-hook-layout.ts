export const EDITOR_HOOK_PAGE_SHIFT_CLASS = "cuecraft-editor-hook-page-shift";

export interface LeftDockState {
	collapsed: boolean;
}

export function leftDockIsOpen(leftDock: LeftDockState | null): boolean {
	if (!leftDock) return false;
	return !leftDock.collapsed;
}

export class EditorHookLayoutController {
	private railPresence = new WeakMap<HTMLElement, boolean>();

	sync(
		editor: HTMLElement,
		hasHookRail: boolean,
		leftDockOpen: boolean,
		forceLayout = false
	): void {
		const previousRailPresence = this.railPresence.get(editor);
		if (!forceLayout && previousRailPresence === hasHookRail) return;

		editor.classList.toggle(
			EDITOR_HOOK_PAGE_SHIFT_CLASS,
			hasHookRail && leftDockOpen
		);
		this.railPresence.set(editor, hasHookRail);
	}
}
