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
	it("uses shared instruction-control hooks for both policies", () => {
		const settingRule = ruleFor(".cuecraft-instructions-setting");
		expect(settingRule).toContain("flex-direction: column");
		expect(settingRule).toContain("align-items: stretch");

		const controlRule = ruleFor(
			".cuecraft-instructions-setting .setting-item-control"
		);
		expect(controlRule).toContain("width: 100%");
		expect(controlRule).toContain("flex-direction: column");

		const inputRule = ruleFor(".cuecraft-instructions-input");
		expect(inputRule).toContain("width: 100%");
		expect(inputRule).toContain("min-height: 10rem");

		expect(styles).not.toContain("cuecraft-summary-instructions");
	});

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

	it("uses neutral rail tokens without legacy category styling", () => {
		const cueRule = ruleFor(".cuecraft-cue");
		expect(cueRule).toContain(
			"border-inline-start: 3px solid var(--cc-border)"
		);
		const railRule = ruleFor(".cuecraft-editor-hook-anchored-card-rail");
		expect(railRule).toContain(
			"border-inline-start: 3px solid var(--cc-border)"
		);
		const cornellRules =
			styles.match(/\.cuecraft-cornell-cue\s*\{[^}]*\}/g) ?? [];
		expect(
			cornellRules.some((rule) =>
				rule.includes("border-inline-start: 3px solid var(--cc-border)")
			)
		).toBe(true);

		expect(styles).not.toContain("--cc-category-accent");
		expect(styles).not.toContain("--cc-sequences");
		expect(styles).not.toContain("--cc-linkedlists");
		expect(styles).not.toContain("--cc-stacks");
		expect(styles).not.toContain("--cc-intervals");
		expect(styles).not.toContain("[data-category=");
		expect(styles).not.toContain(".cuecraft-section-tag");
	});

	it("preserves failed-cue error styling", () => {
		const failedCueRule = ruleFor(
			".cuecraft-cue-error,\n.cuecraft-cornell-cue-error"
		);
		expect(failedCueRule).toContain("border-left-color: var(--text-error)");

		const failedHookRule = ruleFor(".cuecraft-editor-hook-failed");
		expect(failedHookRule).toContain("var(--color-red)");
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
		expect(insightRule).toContain("display: flex");
		expect(insightRule).toContain("flex-direction: column");
		expect(insightRule).not.toContain("background:");
		expect(insightRule).not.toContain("box-shadow:");
		expect(insightRule).not.toContain("border-inline-start:");

		const dividerRule = ruleFor(
			".cuecraft-note-brief-insight:not(:first-child)"
		);
		expect(dividerRule).toContain(
			"border-inline-start: 1px solid var(--cc-border)"
		);

		const badgeRule = ruleFor(".cuecraft-note-brief-insight-badge");
		expect(badgeRule).toContain("align-self: flex-start");
		expect(badgeRule).toContain("margin-top: auto");

		const briefLabelRule = ruleFor(".cuecraft-note-brief-label");
		expect(briefLabelRule).toContain("font-size: 0.7em");
		expect(briefLabelRule).toContain("font-weight: 800");
		expect(briefLabelRule).toContain("letter-spacing: 0.08em");
		expect(briefLabelRule).toContain("line-height: 1.1");
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

		const editorLabelRule = ruleFor(
			".cuecraft-editor-hook-anchored-card-rail .cuecraft-editor-hook-section-label"
		);
		expect(editorLabelRule).toContain("display: flex");
		expect(editorLabelRule).toContain("align-items: center");
		expect(editorLabelRule).toContain("gap: 0.48em");

		const iconRule = ruleFor(".cuecraft-label-icon");
		expect(iconRule).toContain("width: 1.25em");
		expect(iconRule).toContain("height: 1.25em");
		expect(iconRule).toContain("color: var(--cc-muted)");

		const briefIconRule = ruleFor(
			".cuecraft-note-brief-label .cuecraft-label-icon"
		);
		expect(briefIconRule).toBe("");
	});

	it("animates accessible anchored rail section disclosures", () => {
		const root = ".cuecraft-editor-hook-anchored-card-rail";
		const toggleRule = ruleFor(`${root} .cuecraft-editor-hook-section-toggle`);
		expect(toggleRule).toContain("display: block");
		expect(toggleRule).toContain("width: 100%");
		expect(toggleRule).toContain("background: transparent");
		expect(toggleRule).toContain("color: var(--text-normal)");

		const dividerRule = ruleFor(
			`${root} .cuecraft-editor-hook-section-body+.cuecraft-editor-hook-section-toggle`
		);
		expect(dividerRule).toContain("border-top: 1px solid var(--cc-border)");
		expect(dividerRule).toContain("margin-top: 0.95em");
		expect(dividerRule).toContain("padding-top: 0.85em");

		const bodyRule = ruleFor(`${root} .cuecraft-editor-hook-section-body`);
		expect(bodyRule).toContain("display: grid");
		expect(bodyRule).toContain("grid-template-rows: 1fr");
		expect(bodyRule).toContain("opacity: 1");
		expect(bodyRule).toContain("grid-template-rows 200ms ease");
		expect(bodyRule).toContain("opacity 200ms ease");

		const collapsedBodyRule = ruleFor(
			`${root} .cuecraft-editor-hook-section-body[data-collapsed="true"]`
		);
		expect(collapsedBodyRule).toContain("grid-template-rows: 0fr");
		expect(collapsedBodyRule).toContain("opacity: 0");

		const contentRule = ruleFor(`${root} .cuecraft-editor-hook-section-content`);
		expect(contentRule).toContain("min-height: 0");
		expect(contentRule).toContain("overflow: hidden");

		const chevronRule = ruleFor(
			`${root} .cuecraft-editor-hook-section-chevron`
		);
		expect(chevronRule).toContain("transition: transform 200ms ease");
		const collapsedChevronRule = ruleFor(
			`${root} .cuecraft-editor-hook-section-toggle[aria-expanded="false"] .cuecraft-editor-hook-section-chevron`
		);
		expect(collapsedChevronRule).toContain("transform: rotate(-90deg)");

		const previewRule = ruleFor(`${root} .cuecraft-editor-hook-section-preview`);
		expect(previewRule).toContain("color: var(--cc-muted)");
		expect(previewRule).toContain("font-style: italic");
		expect(previewRule).toContain("white-space: nowrap");
		expect(previewRule).toContain("overflow: hidden");
		expect(previewRule).toContain("text-overflow: ellipsis");

		const focusRule = ruleFor(
			`${root} .cuecraft-editor-hook-section-toggle:focus-visible`
		);
		expect(focusRule).toContain("outline: 2px solid var(--interactive-accent)");
		expect(focusRule).toContain("outline-offset: 3px");

		expect(styles).toMatch(
			/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.cuecraft-editor-hook-anchored-card-rail \.cuecraft-editor-hook-section-body,[\s\S]*?\.cuecraft-editor-hook-anchored-card-rail \.cuecraft-editor-hook-section-chevron\s*\{[^}]*transition: none/
		);
	});

	it("keeps anchored rail cards compact and quiet", () => {
		const railRule = ruleFor(".cuecraft-editor-hook-anchored-card-rail");
		expect(railRule).toContain("max-width: min(16.75rem, 100%)");
		const compactRailRule = ruleFor(
			'.cuecraft-editor-hook-anchored-card-rail[data-space="compact"]'
		);
		expect(compactRailRule).toContain("padding-bottom: 8px");

		const emptyRule = ruleFor(".cuecraft-editor-hook-empty");
		expect(emptyRule).toContain("display: none");

		const titleRule = ruleFor(
			".cuecraft-editor-hook-anchored-card-rail .cuecraft-editor-hook-title"
		);
		expect(titleRule).toContain("color: var(--text-normal)");
		expect(titleRule).toContain("font-size: var(--font-ui-small)");
		expect(titleRule).toContain("font-weight: var(--font-normal, 400)");
		expect(titleRule).toContain("line-height: 1.45");

		const longTitleRule = ruleFor(
			'.cuecraft-editor-hook-anchored-card-rail[data-title-density="long"] .cuecraft-editor-hook-title'
		);
		expect(longTitleRule).toContain("font-size: var(--font-ui-small)");
		expect(longTitleRule).toContain("line-height: 1.45");

		const denseTitleRule = ruleFor(
			'.cuecraft-editor-hook-anchored-card-rail[data-title-density="dense"] .cuecraft-editor-hook-title'
		);
		expect(denseTitleRule).toContain("font-size: var(--font-ui-small)");
		expect(denseTitleRule).toContain("line-height: 1.45");

		const summaryRule = ruleFor(
			".cuecraft-editor-hook-anchored-card-rail .cuecraft-section-lens"
		);
		expect(summaryRule).toContain("color: var(--text-normal)");
		expect(summaryRule).toContain("font-size: var(--font-ui-small)");
		expect(summaryRule).toContain("font-weight: var(--font-normal, 400)");
		expect(summaryRule).toContain("line-height: 1.45");

		const termRule = ruleFor(
			".cuecraft-editor-hook-anchored-card-rail .cuecraft-cue-term"
		);
		expect(termRule).toContain("font-size: 10.75px");
		expect(termRule).toContain("line-height: 18px");

		expect(styles).toContain("width: min(16rem, 28vw)");
		expect(styles).toContain("width: clamp(13.5rem, 19vw, 16rem)");
		expect(styles).toContain("width: clamp(11.5rem, 20vw, 16rem)");
	});

	it("aligns the anchored rail masthead without moving Markdown headings", () => {
		const layoutSelector =
			'.markdown-source-view.mod-cm6 .cm-editor.cuecraft-editor-hook-page-shift[data-cuecraft-editor-display="anchored-card-rail"]';
		const layoutRule = ruleFor(layoutSelector);
		expect(layoutRule).toContain("--cuecraft-editor-masthead-offset");
		expect(layoutRule).toContain(
			"--cuecraft-editor-masthead-title-inset: 4rem"
		);
		expect(
			styles.match(/--cuecraft-editor-masthead-title-inset: 4rem/g)
		).toHaveLength(2);

		const titleSelector = `${layoutSelector} .inline-title`;
		const titleRule = ruleFor(titleSelector);
		expect(titleRule).toContain("var(--cuecraft-editor-masthead-offset)");

		const briefSelector = `${layoutSelector} .cuecraft-note-brief-editor`;
		const briefRule = ruleFor(briefSelector);
		expect(briefRule).toContain(
			"width: calc(100% + var(--cuecraft-editor-masthead-offset))"
		);
		expect(briefRule).toContain(
			"margin-inline-start: calc(0px - var(--cuecraft-editor-masthead-offset))"
		);
		expect(briefRule).toContain(
			"transform: translateX(calc(0px - var(--cuecraft-editor-masthead-offset)))"
		);

		const railSelector =
			".markdown-source-view.mod-cm6 .cm-editor.cuecraft-editor-hook-page-shift .cuecraft-editor-hook-gutter .cuecraft-editor-hook";
		expect(ruleFor(railSelector)).toContain(
			"transform: translateX(calc(-100% + 1rem))"
		);
		expect(styles).not.toContain(`${layoutSelector} .cm-line`);
	});
});
