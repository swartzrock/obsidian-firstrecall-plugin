import type { StudyMaterialBannerState } from "./status";

export interface StudyMaterialBannerActions {
	onUpdate(): void | Promise<void>;
	onRetry(): void | Promise<void>;
	onDismiss(revision: string): void | Promise<void>;
}

const bannerCleanup = new WeakMap<HTMLElement, () => void>();

function focusContainer(container: HTMLElement): void {
	if (!container.hasAttribute("tabindex")) container.tabIndex = -1;
	container.focus();
}

function restoreActionFocus(
	container: HTMLElement,
	action: "update" | "retry" | "dismiss"
): void {
	const next = container.querySelector<HTMLButtonElement>(
		`[data-banner-action='${action}']`
	);
	if (next) next.focus();
	else focusContainer(container);
}

function removeHost(host: HTMLElement): void {
	bannerCleanup.get(host)?.();
	bannerCleanup.delete(host);
	host.remove();
}

/** Remove every banner owned by a note view and detach its listeners. */
export function removeStudyMaterialBanner(container: HTMLElement): void {
	const hosts = Array.from(
		container.querySelectorAll<HTMLElement>(
			":scope > .cuecraft-study-material-banner"
		)
	);
	const hadFocus = hosts.some((host) => host.contains(host.ownerDocument.activeElement));
	hosts.forEach(removeHost);
	if (hadFocus) focusContainer(container);
}

/**
 * Keep one revision-specific maintenance banner at the top of a note view.
 * Rerenders replace listeners in place and restore the active named control.
 */
export function syncStudyMaterialBanner(
	container: HTMLElement,
	state: StudyMaterialBannerState | null,
	actions: StudyMaterialBannerActions
): HTMLElement | null {
	const existing = Array.from(
		container.querySelectorAll<HTMLElement>(
			":scope > .cuecraft-study-material-banner"
		)
	);
	if (!state) {
		removeStudyMaterialBanner(container);
		return null;
	}
	const host = existing.shift() ?? container.ownerDocument.createElement("aside");
	existing.forEach(removeHost);
	const active = host.contains(host.ownerDocument.activeElement)
		? (host.ownerDocument.activeElement as HTMLElement).dataset.bannerAction as
				| "update"
				| "retry"
				| "dismiss"
				| undefined
		: undefined;
	bannerCleanup.get(host)?.();
	host.replaceChildren();
	host.className = `cuecraft-study-material-banner is-${state.kind}`;
	host.dataset.revision = state.revision;
	host.setAttribute("role", state.kind === "failed" ? "alert" : "status");
	host.setAttribute("aria-live", state.kind === "failed" ? "assertive" : "polite");
	host.setAttribute("aria-atomic", "true");
	if (host.parentElement !== container || container.firstElementChild !== host) {
		container.prepend(host);
	}

	const message = container.ownerDocument.createElement("span");
	message.className = "cuecraft-study-material-banner-message";
	message.textContent = state.kind === "failed"
		? "Some study material could not be updated. Your last successful version is still shown."
		: "This note has study material that is out of date.";
	host.appendChild(message);

	const controls = container.ownerDocument.createElement("span");
	controls.className = "cuecraft-study-material-banner-actions";
	host.appendChild(controls);
	const listeners: Array<{
		button: HTMLButtonElement;
		listener: (event: MouseEvent) => void;
	}> = [];
	const addButton = (
		action: "update" | "retry" | "dismiss",
		label: string,
		callback: () => void | Promise<void>
	): HTMLButtonElement => {
		const button = container.ownerDocument.createElement("button");
		button.type = "button";
		button.dataset.bannerAction = action;
		button.className = `cuecraft-study-material-banner-${action}`;
		button.textContent = label;
		const listener = (event: MouseEvent): void => {
			event.preventDefault();
			if (button.disabled) return;
			button.disabled = true;
			host.setAttribute("aria-busy", "true");
			if (action === "update" || action === "retry") {
				host.setAttribute("role", "status");
				host.setAttribute("aria-live", "polite");
				message.textContent = "Updating study material…";
			}
			void Promise.resolve(callback()).finally(() => {
				host.removeAttribute("aria-busy");
				button.disabled = false;
				restoreActionFocus(container, action);
			});
		};
		button.addEventListener("click", listener);
		listeners.push({ button, listener });
		controls.appendChild(button);
		return button;
	};
	if (state.action === "retry") {
		addButton("retry", "Retry update", actions.onRetry);
	} else {
		addButton("update", "Update study material", actions.onUpdate);
	}
	addButton("dismiss", "Dismiss", () => actions.onDismiss(state.revision));
	bannerCleanup.set(host, () => {
		for (const { button, listener } of listeners) {
			button.removeEventListener("click", listener);
		}
	});
	if (active) restoreActionFocus(container, active);
	return host;
}
