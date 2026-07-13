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
		const insightGridRule = ruleFor(".cuecraft-note-brief-insights");
		expect(insightGridRule).toContain("border-top: 1px solid var(--cc-border)");
		expect(insightGridRule).toContain("padding-top: 1em");

		const insightRule = ruleFor(".cuecraft-note-brief-insight");
		expect(insightRule).not.toContain("background:");
		expect(insightRule).not.toContain("box-shadow:");
		expect(insightRule).not.toContain("border-inline-start:");

		const dividerRule = ruleFor(
			".cuecraft-note-brief-insight:not(:first-child)"
		);
		expect(dividerRule).toContain(
			"border-inline-start: 1px solid var(--cc-border)"
		);

		const labelRule = ruleFor(".cuecraft-note-brief-insight-label");
		expect(labelRule).toContain("text-transform: uppercase");
		expect(labelRule).toContain("letter-spacing: 0.08em");
	});

	it("styles cue terms as quiet secondary chips", () => {
		const termRule = ruleFor(".cuecraft-cue-term,\n.cuecraft-cornell-support-term");
		expect(termRule).toContain("padding: 0 0.5rem");
		expect(termRule).toContain(
			"border: 1px solid color-mix(in srgb, var(--cc-border) 70%, transparent)"
		);
		expect(termRule).toContain("border-radius: 6px");
		expect(termRule).toContain(
			"background: color-mix(in srgb, var(--background-secondary) 50%, transparent)"
		);
		expect(termRule).toContain("font-size: 11.5px");
		expect(termRule).toContain("line-height: 20px");
	});

	it("keeps CueCraft label icons small and inline", () => {
		const cueLabelRule = ruleFor(".cuecraft-cue-section-label");
		expect(cueLabelRule).toContain("display: inline-flex");
		expect(cueLabelRule).toContain("align-items: center");
		expect(cueLabelRule).toContain("gap: 0.48em");

		const editorLabelRules =
			styles.match(/\.cuecraft-editor-hook-section-label\s*\{[^}]*\}/g) ?? [];
		expect(
			editorLabelRules.some(
				(rule) =>
					rule.includes("display: flex") &&
					rule.includes("align-items: center") &&
					rule.includes("gap: 0.48em")
			)
		).toBe(true);

		const editorDividerRule = ruleFor(
			".cuecraft-editor-hook-section-label:not(:first-child)"
		);
		expect(editorDividerRule).toContain("border-top: 1px solid var(--cc-border)");
		expect(editorDividerRule).toContain("margin-top: 0.95em");
		expect(editorDividerRule).toContain("padding-top: 0.85em");

		const iconRule = ruleFor(".cuecraft-label-icon");
		expect(iconRule).toContain("width: 1.25em");
		expect(iconRule).toContain("height: 1.25em");
		expect(iconRule).toContain("color: var(--cc-category-accent, var(--cc-muted))");

		const briefIconRule = ruleFor(
			".cuecraft-note-brief-label .cuecraft-label-icon"
		);
		expect(briefIconRule).toContain("color: var(--cc-sequences)");
	});

	it("keeps anchored rail cards compact and quiet", () => {
		const railRule = ruleFor(".cuecraft-editor-hook-anchored-card-rail");
		expect(railRule).toContain("max-width: min(16.75rem, 100%)");

		const emptyRule = ruleFor(".cuecraft-editor-hook-empty");
		expect(emptyRule).toContain("display: none");

		const titleRule = ruleFor(
			".cuecraft-editor-hook-anchored-card-rail .cuecraft-editor-hook-title"
		);
		expect(titleRule).toContain("font-size: 15.5px");
		expect(titleRule).toContain("font-weight: var(--font-semibold)");
		expect(titleRule).toContain("line-height: 1.34");

		const longTitleRule = ruleFor(
			'.cuecraft-editor-hook-anchored-card-rail[data-title-density="long"] .cuecraft-editor-hook-title'
		);
		expect(longTitleRule).toContain("font-size: 14px");

		const denseTitleRule = ruleFor(
			'.cuecraft-editor-hook-anchored-card-rail[data-title-density="dense"] .cuecraft-editor-hook-title'
		);
		expect(denseTitleRule).toContain("font-size: 12.5px");

		const termRule = ruleFor(
			".cuecraft-editor-hook-anchored-card-rail .cuecraft-cue-term,\n.cuecraft-editor-hook-terms-toggle"
		);
		expect(termRule).toContain("font-size: 10.75px");
		expect(termRule).toContain("line-height: 18px");

		expect(styles).toContain("width: min(16rem, 28vw)");
		expect(styles).toContain("width: clamp(13.5rem, 19vw, 16rem)");
		expect(styles).toContain("width: clamp(11.5rem, 20vw, 16rem)");
	});
});
