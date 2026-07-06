import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("styles.css", "utf8");

function ruleFor(selector: string): string {
	const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return (
		styles.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`))?.[0] ?? ""
	);
}

describe("settings CSS", () => {
	it("stacks active CLI command labels above the command input", () => {
		const settingRule = ruleFor(
			".cuecraft-active-provider-fields .cuecraft-cli-text-setting"
		);
		expect(settingRule).toContain("flex-direction: column");
		expect(settingRule).toContain("align-items: stretch");

		const infoRule = ruleFor(
			".cuecraft-active-provider-fields .cuecraft-cli-text-setting .setting-item-info"
		);
		expect(infoRule).toContain("flex: 0 1 auto");

		const controlRule = ruleFor(
			".cuecraft-active-provider-fields .cuecraft-cli-text-setting .setting-item-control"
		);
		expect(controlRule).toContain("width: 100%");

		const inputRule = ruleFor(
			".cuecraft-active-provider-fields .cuecraft-cli-text-input"
		);
		expect(inputRule).toContain("width: 100%");
		expect(inputRule).toContain("min-width: 0");
	});

	it("scopes shared CueCraft card tokens to review surfaces", () => {
		expect(styles).toContain("--cc-card: var(--background-primary)");
		expect(styles).toContain("--cc-border: var(--background-modifier-border)");
		expect(styles).toContain("--cc-text: var(--text-normal)");
		expect(styles).toContain("--cc-muted: var(--text-muted)");
		expect(styles).toContain("--cc-radius: 10px");
		expect(styles).toContain("--cc-sequences: #3f7f8c");
		expect(styles).toContain("--cc-linkedlists: #5b5fc7");
		expect(styles).toContain("--cc-stacks: #9a7b2b");
		expect(styles).toContain("--cc-intervals: #b04a3a");
	});

	it("uses neutral card surfaces for cues and Note Brief", () => {
		const cueRule = ruleFor(".cuecraft-cue");
		expect(cueRule).toContain("background: var(--cc-card)");
		expect(cueRule).toContain("border: 1px solid var(--cc-border)");
		expect(cueRule).toContain("border-inline-start: 3px solid");
		expect(cueRule).toContain("box-shadow: var(--cc-shadow)");

		const briefRule = ruleFor(".cuecraft-note-brief");
		expect(briefRule).toContain("background: var(--cc-card)");
		expect(briefRule).toContain("border: 1px solid var(--cc-border)");
		expect(briefRule).toContain("box-shadow: var(--cc-shadow)");
		expect(briefRule).not.toContain("interactive-accent");
	});

	it("keeps category hue constrained to rail and tag dot variables", () => {
		expect(styles).toContain('.cuecraft-cue[data-category="stacks"],');
		expect(styles).toContain("--cc-category-accent: var(--cc-stacks)");

		const cueRule = ruleFor(".cuecraft-cue");
		expect(cueRule).toContain(
			"border-inline-start: 3px solid var(--cc-category-accent, var(--cc-border))"
		);

		const dotRule = ruleFor(".cuecraft-section-tag-dot");
		expect(dotRule).toContain(
			"background: var(--cc-category-accent, var(--cc-muted))"
		);
	});

	it("does not paint cue rails from confidence", () => {
		const confidenceRail = styles.match(
			/\.cuecraft-cue\[data-confidence=["'][^"']+["']\]\s*\{[^}]*border-(?:left|inline-start)-color/
		);
		expect(confidenceRail).toBeNull();
	});

	it("keeps Note Brief insight columns flat", () => {
		const insightRule = ruleFor(".cuecraft-note-brief-insight");
		expect(insightRule).toContain("border-inline-start: 1px solid var(--cc-border)");
		expect(insightRule).not.toContain("background:");
		expect(insightRule).not.toContain("box-shadow:");
	});
});
