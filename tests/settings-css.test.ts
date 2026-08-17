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
	it("styles artifact-matched settings cards without fixed widths", () => {
		const cardRule = ruleFor(".cuecraft-settings-artifact-card");
		expect(cardRule).toContain("min-width: 0");
		expect(cardRule).toContain("border: 1px solid");
		expect(cardRule).not.toMatch(/\n\twidth:/);

	});

	it("uses shared read-only instruction-control hooks for both templates", () => {
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
		expect(inputRule).toContain("max-width: 100%");
		expect(inputRule).toContain("box-sizing: border-box");
		expect(inputRule).toContain("min-height: 10rem");

		expect(styles).toContain(".cuecraft-generation-advanced");
		expect(styles).toContain(".cuecraft-generation-instructions");
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

	it("reserves measured space below Inline cue widgets", () => {
		const wrapperRule = ruleFor(".cuecraft-inline-cue-widget");
		expect(wrapperRule).toContain("padding-bottom: 1em");

		const cueRule = ruleFor(
			".cuecraft-inline-cue-widget>.cuecraft-cue"
		);
		expect(cueRule).toContain("margin-bottom: 0");
	});

	it("uses neutral cue tokens", () => {
		const cueRule = ruleFor(".cuecraft-cue");
		expect(cueRule).toContain(
			"border-inline-start: 3px solid var(--cc-border)"
		);
		const cornellRules =
			styles.match(/\.cuecraft-cornell-cue\s*\{[^}]*\}/g) ?? [];
		expect(
			cornellRules.some((rule) =>
				rule.includes("border-inline-start: 3px solid var(--cc-border)")
			)
		).toBe(true);

		expect(styles).not.toContain("--cc-sequences");
		expect(styles).not.toContain("--cc-linkedlists");
		expect(styles).not.toContain("--cc-stacks");
		expect(styles).not.toContain("--cc-intervals");
		expect(styles).not.toContain(".cuecraft-section-tag");
	});

	it("preserves failed-cue error styling", () => {
		const failedCueRule = ruleFor(
			".cuecraft-cue-error,\n.cuecraft-cornell-cue-error"
		);
		expect(failedCueRule).toContain("border-left-color: var(--text-error)");
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
		const termRule = ruleFor(".cuecraft-cue-term,\n.cuecraft-cornell-term");
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

	it("distinguishes Cornell rail and Inline cue thumbnails by geometry", () => {
		const cornellCardRule = ruleFor(
			".cuecraft-preview-editor-cue-card-cornell"
		);
		expect(cornellCardRule).toContain("inset-inline-start: 8%");
		expect(cornellCardRule).toContain("width: 43%");

		const inlineCardRule = ruleFor(
			".cuecraft-preview-editor-cue-card-inline-cues"
		);
		expect(inlineCardRule).toContain("inset-block: 35% 6%");
		expect(inlineCardRule).toContain("inset-inline: 7%");
	});

	it("keeps all cue font size options in one laptop-width row", () => {
		const cueFontGroupRule = ruleFor(".cuecraft-thumbnail-group-cue-font");
		expect(cueFontGroupRule).toContain(
			"grid-template-columns: repeat(3, minmax(0, 1fr))"
		);

		const cueFontGroupIndex = styles.indexOf(
			".cuecraft-thumbnail-group-cue-font"
		);
		const narrowMediaIndex = styles.indexOf("@media (max-width: 700px)");
		const narrowMediaEnd = styles.indexOf(
			"@media (max-width: 420px)",
			narrowMediaIndex
		);
		const narrowStyles = styles.slice(narrowMediaIndex, narrowMediaEnd);
		expect(narrowMediaIndex).toBeGreaterThan(cueFontGroupIndex);
		expect(narrowStyles).toContain(".cuecraft-thumbnail-group {");
		expect(narrowStyles).toContain(
			"grid-template-columns: repeat(auto-fit, minmax(min(138px, 100%), 1fr))"
		);
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
		const collapsedTermsRule = ruleFor(
			`${root} .cuecraft-editor-hook-section-toggle[data-section="terms"][aria-expanded="false"]`
		);
		expect(collapsedTermsRule).toContain("height: auto");
		expect(collapsedTermsRule).toContain("padding-bottom: 0.65em");

		const focusRule = ruleFor(
			`${root} .cuecraft-editor-hook-section-toggle:focus-visible`
		);
		expect(focusRule).toContain("outline: 2px solid var(--interactive-accent)");
		expect(focusRule).toContain("outline-offset: 3px");

		expect(styles).toMatch(
			/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.cuecraft-editor-hook-sectioned \.cuecraft-editor-hook-section-body,[\s\S]*?\.cuecraft-editor-hook-sectioned \.cuecraft-editor-hook-section-chevron\s*\{[^}]*transition: none/
		);
	});

	it("keeps sectioned editor cues compact and quiet", () => {
		expect(styles).not.toContain("cuecraft-editor-rail-card-toggle");
		expect(styles).not.toContain("cuecraft-editor-rail-card-content");
		expect(styles).not.toContain('data-overflowing="true"');
		expect(styles).not.toContain('data-expanded="false"');

		const titleRule = ruleFor(
			".cuecraft-editor-hook-sectioned .cuecraft-editor-hook-title"
		);
		expect(titleRule).toContain("color: var(--text-normal)");
		expect(titleRule).toContain("font-size: inherit");
		expect(titleRule).toContain("font-weight: var(--font-normal, 400)");
		expect(titleRule).toContain("line-height: 1.45");

		const summaryRule = ruleFor(
			".cuecraft-editor-hook-sectioned .cuecraft-summary"
		);
		expect(summaryRule).toContain("color: var(--text-normal)");
		expect(summaryRule).toContain("font-size: inherit");
		expect(summaryRule).toContain("font-weight: var(--font-normal, 400)");
		expect(summaryRule).toContain("line-height: 1.45");

		const termRule = ruleFor(
			".cuecraft-editor-hook-sectioned .cuecraft-cue-term,\n.cuecraft-editor-hook-sectioned .cuecraft-cornell-term"
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
		const responsiveMediumRule = ruleFor(
			".markdown-source-view.mod-cm6 .cuecraft-editor-hook-gutter .cuecraft-editor-hook.cuecraft-cuefont-medium"
		);
		expect(responsiveMediumRule).toContain("font-size: var(--font-ui-small)");
		const responsiveLargeRule = ruleFor(
			".markdown-source-view.mod-cm6 .cuecraft-editor-hook-gutter .cuecraft-editor-hook.cuecraft-cuefont-large"
		);
		expect(responsiveLargeRule).toContain("font-size: var(--font-ui-medium)");
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
			/\.cuecraft-cue[^\n{]*cuecraft-editor-cue-width-custom/
		);
	});

	it("positions editor cues when the page is shifted", () => {
		const railSelector =
			".markdown-source-view.mod-cm6 .cm-editor.cuecraft-editor-hook-page-shift .cuecraft-editor-hook-gutter .cuecraft-editor-hook";
		expect(ruleFor(railSelector)).toContain(
			"transform: translateX(calc(-100% + 1rem))"
		);
	});

	it("styles non-collapsing Editing Study answers and sticky controls", () => {
		expect(styles).not.toContain("body.cuecraft-study-active");
		expect(ruleFor(".cuecraft-study-header-action")).toContain(
			"display: inline-flex"
		);
		expect(ruleFor(".cuecraft-study-header-label")).toContain("display: inline");
		expect(styles).toContain(
			'.cuecraft-study-header-action[aria-disabled="true"]'
		);
		expect(styles).toContain(".cuecraft-study-ribbon.is-active");

		const answerRule = ruleFor(
			".markdown-source-view.mod-cm6 .cuecraft-editor-study-answer.is-hidden"
		);
		expect(answerRule).toContain("filter: blur(4px)");
		expect(answerRule).toContain("cursor: text");
		expect(answerRule).not.toContain("display: none");
		expect(answerRule).not.toContain("visibility: hidden");
		expect(answerRule).not.toContain("max-height");

		const controlsRule = ruleFor(".cuecraft-editor-study-controls");
		expect(controlsRule).toContain("position: sticky");
		expect(controlsRule).toContain("top: 0");
		expect(controlsRule).toContain("z-index: 10");
		expect(controlsRule).toContain("width: 100%");
		expect(controlsRule).toContain("background: var(--background-secondary)");
		expect(controlsRule).toContain(
			"border: 1px solid var(--background-modifier-border)"
		);

		const cueRule = ruleFor(".cuecraft-editor-study-cue");
		expect(cueRule).toContain("position: relative");
		expect(ruleFor("button.cuecraft-study-section-toggle")).toContain(
			"border: 1px solid var(--background-modifier-border)"
		);
		expect(ruleFor("button.cuecraft-study-section-toggle")).toContain(
			"inset-inline-end: -14px"
		);
	});

	it("styles inline-only Reading Study without the Cornell review launcher", () => {
		const answerRule = ruleFor(
			".cuecraft-reading-study-answer.is-hidden"
		);
		expect(answerRule).toContain("visibility: hidden");
		expect(answerRule).not.toContain("display: none");

		const controlsRule = ruleFor(".cuecraft-reading-study-controls");
		expect(controlsRule).toContain("position: sticky");
		expect(controlsRule).toContain("top: 0");
		expect(controlsRule).toContain("z-index: 10");
		expect(controlsRule).toContain("width: 100%");
		expect(controlsRule).toContain("background: var(--background-secondary)");
		expect(styles).toContain(".cuecraft-study-progress-track");
		expect(styles).toContain(".cuecraft-study-progress-fill");
		expect(ruleFor(".cuecraft-study-help")).toContain(
			"background: var(--background-primary)"
		);
		expect(ruleFor(".cuecraft-study-help-copy")).toContain(
			"flex-direction: column"
		);
		expect(ruleFor(".cuecraft-study-progress-track")).toContain(
			"flex: 1 1 120px"
		);
		expect(ruleFor(".cuecraft-study-actions")).toContain(
			"margin-inline-start: auto"
		);

		const cueRule = ruleFor(".cuecraft-reading-study-cue");
		expect(cueRule).toContain("position: relative");
		expect(styles).not.toContain(".cuecraft-reading-review");
	});
});
