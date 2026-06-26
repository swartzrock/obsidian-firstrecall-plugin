import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("styles.css", "utf8");

function ruleFor(selector: string): string {
	const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return styles.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`))?.[0] ?? "";
}

describe("Cornell style CSS", () => {
	it("keeps Legal Pad styling scoped to cue cards", () => {
		expect(styles).not.toContain(
			".cuecraft-style-legal-pad .cuecraft-cornell-grid {"
		);
		expect(styles).not.toContain(
			".cuecraft-style-legal-pad .cuecraft-cornell-cuecell"
		);
		expect(styles).not.toContain(
			".cuecraft-style-legal-pad .cuecraft-cornell-body"
		);
		const legalPadCueRule = ruleFor(
			".cuecraft-style-legal-pad .cuecraft-cornell-cue"
		);
		expect(legalPadCueRule).toContain("background-image");
		expect(legalPadCueRule).toContain("repeating-linear-gradient");
	});
});
