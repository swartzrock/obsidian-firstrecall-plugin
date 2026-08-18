import { describe, it, expect, vi } from "vitest";
import {
	VisibilityStore,
	loadHiddenMap,
	pillAction,
	visibilityMenuLabel,
} from "../src/visibility";

describe("pillAction", () => {
	it("opens settings when unconfigured", () => {
		expect(pillAction("setup")).toBe("open-settings");
	});

	it("is inert during generation and study mode", () => {
		expect(pillAction("generating")).toBe("none");
		expect(pillAction("study")).toBe("none");
	});

	it("toggles visibility for an idle note", () => {
		expect(pillAction("ready")).toBe("toggle-visibility");
		expect(pillAction("stale")).toBe("toggle-visibility");
		expect(pillAction("hidden")).toBe("toggle-visibility");
	});
});

describe("visibilityMenuLabel", () => {
	it("offers to show when hidden and hide when shown", () => {
		expect(visibilityMenuLabel(true)).toBe(
			"CueCraft: Show generated content for this note"
		);
		expect(visibilityMenuLabel(false)).toBe(
			"CueCraft: Hide generated content for this note"
		);
	});
});

describe("loadHiddenMap", () => {
	it("returns an empty map for non-object input", () => {
		expect(loadHiddenMap(null)).toEqual({});
		expect(loadHiddenMap(undefined)).toEqual({});
		expect(loadHiddenMap("nope")).toEqual({});
	});

	it("keeps only entries explicitly set to true", () => {
		expect(loadHiddenMap({ a: true, b: false, c: 1, "": true })).toEqual({
			a: true,
		});
	});
});

describe("VisibilityStore", () => {
	it("treats notes as shown by default", () => {
		const store = new VisibilityStore({}, async () => {});
		expect(store.isHidden("a.md")).toBe(false);
	});

	it("hides and shows a note, persisting each change", async () => {
		const persist = vi.fn(async () => {});
		const store = new VisibilityStore({}, persist);

		await store.hide("a.md");
		expect(store.isHidden("a.md")).toBe(true);
		expect(persist).toHaveBeenCalledTimes(1);

		await store.show("a.md");
		expect(store.isHidden("a.md")).toBe(false);
		expect(persist).toHaveBeenCalledTimes(2);
	});

	it("does not persist no-op transitions", async () => {
		const persist = vi.fn(async () => {});
		const store = new VisibilityStore({ "a.md": true }, persist);

		await store.hide("a.md"); // already hidden
		await store.show("b.md"); // already shown
		expect(persist).not.toHaveBeenCalled();
	});

	it("moves visibility across a rename", async () => {
		const persist = vi.fn(async () => {});
		const store = new VisibilityStore({ "old.md": true }, persist);

		await store.rename("old.md", "new.md");
		expect(store.isHidden("old.md")).toBe(false);
		expect(store.isHidden("new.md")).toBe(true);
		expect(persist).toHaveBeenCalledTimes(1);
	});

	it("is a no-op when renaming a shown note", async () => {
		const persist = vi.fn(async () => {});
		const store = new VisibilityStore({}, persist);

		await store.rename("old.md", "new.md");
		expect(store.isHidden("new.md")).toBe(false);
		expect(persist).not.toHaveBeenCalled();
	});

	it("snapshot returns a copy, not the internal map", async () => {
		const store = new VisibilityStore({ "a.md": true }, async () => {});
		const snap = store.snapshot();
		snap["b.md"] = true;
		expect(store.isHidden("b.md")).toBe(false);
	});
});
