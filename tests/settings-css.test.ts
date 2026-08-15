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
		const editorLabelRule = ruleFor(
			".cuecraft-editor-hook-sectioned .cuecraft-editor-hook-section-label"
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

	it("uses the Cornell cue text scale for inline cues", () => {
		const fontSizeFor = (selector: string): string | undefined =>
			ruleFor(selector).match(/font-size:\s*([^;]+);/)?.[1];

		const cases = [
			["small", "var(--font-smallest)"],
			["medium", "var(--font-ui-small)"],
			["large", "var(--font-ui-medium)"],
		] as const;

		for (const [size, expected] of cases) {
			const inline = fontSizeFor(
				`.cuecraft-cue.cuecraft-cuefont-${size}`
			);
			const cornell = fontSizeFor(
				`.cuecraft-editor-hook.cuecraft-cuefont-${size}`
			);

			expect(inline).toBe(expected);
			expect(cornell).toBe(expected);
			expect(inline).toBe(cornell);
		}
	});

	it("animates accessible editor card section disclosures", () => {
		const root = ".cuecraft-editor-hook-sectioned";
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
		expect(previewRule).toContain("font-size: 0.84em");
		expect(previewRule).toContain("font-style: italic");
		expect(previewRule).toContain("white-space: nowrap");
		expect(previewRule).toContain("overflow: hidden");
		expect(previewRule).toContain("text-overflow: ellipsis");
		const hiddenPreviewRule = ruleFor(
			`${root} .cuecraft-editor-hook-section-preview[hidden]`
		);
		expect(hiddenPreviewRule).toContain("display: none");

		const focusRule = ruleFor(
			`${root} .cuecraft-editor-hook-section-toggle:focus-visible`
		);
		expect(focusRule).toContain("outline: 2px solid var(--interactive-accent)");
		expect(focusRule).toContain("outline-offset: 3px");

		expect(styles).toMatch(
			/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.cuecraft-editor-hook-sectioned \.cuecraft-editor-hook-section-body,[\s\S]*?\.cuecraft-editor-hook-sectioned \.cuecraft-editor-hook-section-chevron\s*\{[^}]*transition: none/
		);
	});

	it("keeps anchored rail cards compact and quiet", () => {
		expect(styles).not.toContain("cuecraft-editor-rail-card-toggle");
		expect(styles).not.toContain("cuecraft-editor-rail-card-content");
		expect(styles).not.toContain('data-overflowing="true"');
		expect(styles).not.toContain('data-expanded="false"');

		const railRule = ruleFor(".cuecraft-editor-hook-anchored-card-rail");
		expect(railRule).toContain("max-width: min(16.75rem, 100%)");
		const compactRailRule = ruleFor(
			'.cuecraft-editor-hook-anchored-card-rail[data-space="compact"]'
		);
		expect(compactRailRule).toContain("padding-bottom: 8px");

		const emptyRule = ruleFor(".cuecraft-editor-hook-empty");
		expect(emptyRule).toContain("display: none");

		const titleRule = ruleFor(
			".cuecraft-editor-hook-sectioned .cuecraft-editor-hook-title"
		);
		expect(titleRule).toContain("color: var(--text-normal)");
		expect(titleRule).toContain("font-size: inherit");
		expect(titleRule).toContain("font-weight: var(--font-normal, 400)");
		expect(titleRule).toContain("line-height: 1.45");

		const longTitleRule = ruleFor(
			'.cuecraft-editor-hook-sectioned[data-title-density="long"] .cuecraft-editor-hook-title'
		);
		expect(longTitleRule).toContain("font-size: inherit");
		expect(longTitleRule).toContain("line-height: 1.45");

		const denseTitleRule = ruleFor(
			'.cuecraft-editor-hook-sectioned[data-title-density="dense"] .cuecraft-editor-hook-title'
		);
		expect(denseTitleRule).toContain("font-size: inherit");
		expect(denseTitleRule).toContain("line-height: 1.45");

		const summaryRule = ruleFor(
			".cuecraft-editor-hook-sectioned .cuecraft-section-lens"
		);
		expect(summaryRule).toContain("color: var(--text-normal)");
		expect(summaryRule).toContain("font-size: inherit");
		expect(summaryRule).toContain("font-weight: var(--font-normal, 400)");
		expect(summaryRule).toContain("line-height: 1.45");

		const termRule = ruleFor(
			".cuecraft-editor-hook-sectioned .cuecraft-cue-term,\n.cuecraft-editor-hook-sectioned .cuecraft-cornell-support-term"
		);
		expect(termRule).toContain("font-size: 0.84em");
		expect(termRule).toContain("line-height: 1.65");

		const cornellQuestionRule = ruleFor(
			".cuecraft-editor-hook-sectioned .cuecraft-cornell-q"
		);
		expect(cornellQuestionRule).toContain("font-size: inherit");
		expect(cornellQuestionRule).toContain(
			"font-weight: var(--font-normal, 400)"
		);
		const minimalQuestionRule = ruleFor(
			".cuecraft-style-minimal.cuecraft-editor-hook-sectioned .cuecraft-cornell-q"
		);
		expect(minimalQuestionRule).toContain("color: var(--text-normal)");
		expect(minimalQuestionRule).toContain("font-family: inherit");
		expect(minimalQuestionRule).toContain("font-size: inherit");
		expect(minimalQuestionRule).toContain(
			"font-weight: var(--font-normal, 400)"
		);
		expect(minimalQuestionRule).toContain("line-height: 1.45");
		const minimalCardRule = ruleFor(
			".cuecraft-style-minimal .cuecraft-cornell-cue"
		);
		expect(minimalCardRule).toContain("border: 1px solid var(--cc-border)");
		expect(minimalCardRule).toContain(
			"border-inline-start: 3px solid var(--cc-border)"
		);
		const examPrepLabelRule = ruleFor(
			".cuecraft-editor-hook-sectioned.cuecraft-style-exam-prep .cuecraft-cornell-cue::before"
		);
		expect(examPrepLabelRule).toContain("content: none");

		const responsiveMediumRule = ruleFor(
			".markdown-source-view.mod-cm6 .cuecraft-editor-hook-gutter .cuecraft-editor-hook.cuecraft-cuefont-medium"
		);
		expect(responsiveMediumRule).toContain("font-size: var(--font-ui-small)");
		const responsiveLargeRule = ruleFor(
			".markdown-source-view.mod-cm6 .cuecraft-editor-hook-gutter .cuecraft-editor-hook.cuecraft-cuefont-large"
		);
		expect(responsiveLargeRule).toContain("font-size: var(--font-ui-medium)");

		expect(styles).toContain("width: min(16rem, 28vw)");
		expect(styles).toContain("width: clamp(13.5rem, 19vw, 16rem)");
		expect(styles).toContain("width: clamp(11.5rem, 20vw, 16rem)");
	});

	it("styles the Editing View resize grip and scopes Custom width to rail cards", () => {
		const customRule = ruleFor(
			".markdown-source-view.mod-cm6 .cuecraft-editor-hook-gutter .cuecraft-editor-rail-card.cuecraft-editor-cue-width-custom"
		);
		expect(customRule).toContain("width: var(--cuecraft-editor-cue-width-resolved)");
		expect(customRule).toContain("max-width: none");
		const resolvedWidthRule = ruleFor(
			".markdown-source-view.mod-cm6 .cuecraft-editor-cue-width-custom"
		);
		expect(resolvedWidthRule).toContain(
			"--cuecraft-editor-cue-width-resolved: clamp(6rem, var(--cuecraft-editor-cue-width, 13rem), 32rem)"
		);

		const gripRule = ruleFor(".cuecraft-editor-cue-width-grip");
		expect(gripRule).toContain("width: 24px");
		expect(gripRule).toContain("min-width: 24px");
		expect(gripRule).toContain("cursor: ew-resize");
		expect(gripRule).toContain("touch-action: none");
		expect(gripRule).toContain("left: -12px");
		expect(gripRule).not.toContain("inset-inline-start");
		expect(gripRule).not.toContain("transition:");

		const anchoredReservedEdgeRule = ruleFor(
			".cuecraft-editor-hook-anchored-card-rail.cuecraft-editor-rail-card"
		);
		expect(anchoredReservedEdgeRule).toContain("padding-left: 28px");
		expect(anchoredReservedEdgeRule).toContain("overflow: visible");
		const cornellRootRule = ruleFor(
			".cuecraft-editor-cornell-card.cuecraft-editor-rail-card"
		);
		expect(cornellRootRule).toContain("padding-left: 0");
		const cornellContentRule = ruleFor(
			".cuecraft-editor-cornell-card.cuecraft-editor-rail-card .cuecraft-cornell-cue"
		);
		expect(cornellContentRule).toContain("padding-left: 28px");

		const compactGripRule = ruleFor(
			".cuecraft-editor-cue-width-grip::before"
		);
		expect(compactGripRule).toContain(
			"top: var(--cuecraft-editor-cue-width-grip-top, 50%)"
		);
		expect(compactGripRule).toContain("left: 50%");
		expect(compactGripRule).toContain("width: 9px");
		expect(compactGripRule).toContain("height: 52px");
		expect(compactGripRule).toContain("transform: translate(-50%, -50%)");
		expect(compactGripRule).toContain(
			"background: var(--background-primary)"
		);
		expect(compactGripRule).not.toContain("inset-block");
		const gripDotsRule = ruleFor(".cuecraft-editor-cue-width-grip::after");
		expect(gripDotsRule).toContain("radial-gradient");

		const focusRule = ruleFor(
			".cuecraft-editor-cue-width-grip:focus-visible"
		);
		expect(focusRule).toContain("outline: none");
		expect(styles).toContain(
			".cuecraft-editor-cue-width-grip:hover::before"
		);
		expect(styles).toContain(
			"html.cuecraft-editor-cue-width-resizing *"
		);
		expect(styles).not.toMatch(
			/\.cuecraft-cornell-view[^\n{]*cuecraft-editor-cue-width-custom/
		);
		expect(styles).not.toMatch(
			/\.cuecraft-cue[^\n{]*cuecraft-editor-cue-width-custom/
		);
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
