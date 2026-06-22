import { describe, expect, it } from "vitest";
import { statusLabel } from "../src/status";

describe("statusLabel", () => {
	it("uses user-facing status-bar copy", () => {
		expect(statusLabel("ready")).toBe("up to date");
		expect(statusLabel("stale")).toBe("cues need updating");
		expect(statusLabel("setup")).toBe("setup needed");
	});
});
