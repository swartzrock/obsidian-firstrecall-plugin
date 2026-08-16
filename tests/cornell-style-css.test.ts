import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("styles.css", "utf8");

describe("editor Cornell style CSS", () => {
	it("retains the classic card and removes pane-only style presets", () => {
		expect(styles).toContain(".cuecraft-editor-cornell-card");
		expect(styles).not.toContain(".cuecraft-style-exam-prep");
		expect(styles).not.toContain(".cuecraft-style-legal-pad");
		expect(styles).not.toContain(".cuecraft-style-minimal");
		expect(styles).not.toContain(".cuecraft-style-handwritten");
	});
});
