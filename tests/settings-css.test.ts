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
	it("keeps guided provider paths distinct from the provider grid", () => {
		const sharedGridRule = ruleFor(
			".firstrecall-provider-paths,\n.firstrecall-provider-picker"
		);
		expect(sharedGridRule).toContain("display: grid");
		expect(sharedGridRule).toContain(
			"grid-template-columns: repeat(3, minmax(0, 1fr))"
		);
		expect(sharedGridRule).toContain("gap: 8px");

		const pathGridRule = ruleFor(".firstrecall-provider-paths");
		const providerGridRules =
			styles.match(/\.firstrecall-provider-picker\s*\{[^}]*\}/g) ?? [];
		expect(pathGridRule).toContain("margin: 12px 0 16px");
		expect(
			providerGridRules.some((rule) => rule.includes("margin: 8px 0 12px"))
		).toBe(true);
	});

	it("styles compact path buttons with descriptions underneath", () => {
		const pathButtonRule = ruleFor(".firstrecall-provider-path-button");
		expect(pathButtonRule).toContain("min-height: 44px");
		expect(pathButtonRule).toContain("font-size: var(--font-ui-small)");
		expect(pathButtonRule).toContain("font-weight: var(--font-semibold)");
		const sharedCardRule = ruleFor(
			".firstrecall-provider-path-button,\n.firstrecall-provider-button"
		);
		expect(sharedCardRule).toContain(
			"border: 1px solid var(--background-modifier-border)"
		);
		expect(sharedCardRule).toContain("background: var(--background-primary)");
		expect(sharedCardRule).toContain("color: var(--text-normal)");

		const selectedRule = ruleFor(
			".firstrecall-provider-path-button.is-selected,\n.firstrecall-provider-button.is-selected"
		);
		expect(selectedRule).toContain("border-color: var(--interactive-accent)");
		expect(selectedRule).toContain(
			"box-shadow: 0 0 0 2px var(--interactive-accent)"
		);
		expect(styles).toContain(
			".firstrecall-provider-path-button:focus-visible"
		);

		const descriptionRule = ruleFor(
			".firstrecall-provider-path-description"
		);
		expect(descriptionRule).toContain("font-size: var(--font-ui-smaller)");
		expect(descriptionRule).toContain("color: var(--text-muted)");
		expect(descriptionRule).toContain("white-space: normal");
		expect(descriptionRule).toContain("margin:");
		expect(styles).not.toContain(".firstrecall-provider-browse-all");
	});

	it("collapses provider paths from three columns to two and then one", () => {
		const mediumMediaIndex = styles.indexOf("@media (max-width: 700px)");
		const narrowMediaIndex = styles.indexOf("@media (max-width: 420px)");
		const mediumStyles = styles.slice(mediumMediaIndex, narrowMediaIndex);
		const narrowStyles = styles.slice(narrowMediaIndex);

		expect(mediumStyles).toContain(
			".firstrecall-provider-paths,\n\t.firstrecall-provider-picker {"
		);
		expect(mediumStyles).toContain(
			"grid-template-columns: repeat(2, minmax(0, 1fr))"
		);
		expect(narrowStyles).toContain(
			".firstrecall-provider-paths,\n\t.firstrecall-provider-picker {"
		);
		expect(narrowStyles).toContain("grid-template-columns: 1fr");
	});

	it("styles artifact-matched settings cards without fixed widths", () => {
		const cardRule = ruleFor(".firstrecall-settings-artifact-card");
		expect(cardRule).toContain("min-width: 0");
		expect(cardRule).toContain("border: 1px solid");
		expect(cardRule).not.toMatch(/\n\twidth:/);

	});

	it("uses shared read-only instruction-control hooks for both templates", () => {
		const settingRule = ruleFor(".firstrecall-instructions-setting");
		expect(settingRule).toContain("flex-direction: column");
		expect(settingRule).toContain("align-items: stretch");

		const controlRule = ruleFor(
			".firstrecall-instructions-setting .setting-item-control"
		);
		expect(controlRule).toContain("width: 100%");
		expect(controlRule).toContain("flex-direction: column");

		const inputRule = ruleFor(".firstrecall-instructions-input");
		expect(inputRule).toContain("width: 100%");
		expect(inputRule).toContain("max-width: 100%");
		expect(inputRule).toContain("box-sizing: border-box");
		expect(inputRule).toContain("min-height: 10rem");

		expect(styles).toContain(".firstrecall-generation-advanced");
		expect(styles).toContain(".firstrecall-generation-instructions");
	});

	it("keeps exclusions legible and recovery scopes visibly disabled", () => {
		const exclusionsRule = ruleFor(".firstrecall-study-area-exclusions");
		expect(exclusionsRule).toContain("border: 1px solid");
		expect(exclusionsRule).toContain("background: var(--background-secondary)");

		const exclusionRowRule = ruleFor(".firstrecall-study-area-exclusion-row");
		expect(exclusionRowRule).toContain("display: flex");
		expect(exclusionRowRule).toContain("justify-content: space-between");

		const disabledRule = ruleFor(".firstrecall-study-area-row.is-disabled");
		expect(disabledRule).toContain("opacity:");
	});

	it("stacks active CLI command labels above the command input", () => {
		const settingRule = ruleFor(
			".firstrecall-active-provider-fields .firstrecall-cli-text-setting"
		);
		expect(settingRule).toContain("flex-direction: column");
		expect(settingRule).toContain("align-items: stretch");

		const infoRule = ruleFor(
			".firstrecall-active-provider-fields .firstrecall-cli-text-setting .setting-item-info"
		);
		expect(infoRule).toContain("flex: 0 1 auto");

		const controlRule = ruleFor(
			".firstrecall-active-provider-fields .firstrecall-cli-text-setting .setting-item-control"
		);
		expect(controlRule).toContain("width: 100%");

		const inputRule = ruleFor(
			".firstrecall-active-provider-fields .firstrecall-cli-text-input"
		);
		expect(inputRule).toContain("width: 100%");
		expect(inputRule).toContain("min-width: 0");
	});

	it("scopes shared FirstRecall card tokens to review surfaces", () => {
		expect(styles).toContain("--cc-card: var(--background-primary)");
		expect(styles).toContain("--cc-border: var(--background-modifier-border)");
		expect(styles).toContain("--cc-text: var(--text-normal)");
		expect(styles).toContain("--cc-muted: var(--text-muted)");
		expect(styles).toContain("--cc-radius: 10px");
	});

	it("uses neutral card surfaces for cues and Note Brief", () => {
		const cueRule = ruleFor(".firstrecall-cue");
		expect(cueRule).toContain("background: var(--cc-card)");
		expect(cueRule).toContain("border: 1px solid var(--cc-border)");
		expect(cueRule).toContain("border-inline-start: 3px solid");
		expect(cueRule).toContain("box-shadow: var(--cc-shadow)");

		const briefRule = ruleFor(".firstrecall-note-brief");
		expect(briefRule).toContain("background: var(--cc-card)");
		expect(briefRule).toContain("border: 1px solid var(--cc-border)");
		expect(briefRule).toContain("box-shadow: var(--cc-shadow)");
		expect(briefRule).not.toContain("interactive-accent");
	});

	it("reserves measured space below Inline cue widgets", () => {
		const wrapperRule = ruleFor(".firstrecall-inline-cue-widget");
		expect(wrapperRule).toContain("padding-bottom: 1em");

		const cueRule = ruleFor(
			".firstrecall-inline-cue-widget>.firstrecall-cue"
		);
		expect(cueRule).toContain("margin-bottom: 0");
	});

	it("uses neutral cue tokens", () => {
		const cueRule = ruleFor(".firstrecall-cue");
		expect(cueRule).toContain(
			"border-inline-start: 3px solid var(--cc-border)"
		);
		const cornellRules =
			styles.match(/\.firstrecall-cornell-cue\s*\{[^}]*\}/g) ?? [];
		expect(
			cornellRules.some((rule) =>
				rule.includes("border-inline-start: 3px solid var(--cc-border)")
			)
		).toBe(true);

		expect(styles).not.toContain("--cc-sequences");
		expect(styles).not.toContain("--cc-linkedlists");
		expect(styles).not.toContain("--cc-stacks");
		expect(styles).not.toContain("--cc-intervals");
		expect(styles).not.toContain(".firstrecall-section-tag");
	});

	it("preserves failed-cue error styling", () => {
		const failedCueRule = ruleFor(
			".firstrecall-cue-error,\n.firstrecall-cornell-cue-error"
		);
		expect(failedCueRule).toContain("border-left-color: var(--text-error)");
	});

	it("keeps Note Brief insight columns flat", () => {
		const insightGridRule = ruleFor(".firstrecall-note-brief-insights");
		expect(insightGridRule).toContain("border-top: 1px solid var(--cc-border)");
		expect(insightGridRule).toContain("padding-top: 1em");

		const insightRule = ruleFor(".firstrecall-note-brief-insight");
		expect(insightRule).toContain("display: flex");
		expect(insightRule).toContain("flex-direction: column");
		expect(insightRule).not.toContain("background:");
		expect(insightRule).not.toContain("box-shadow:");
		expect(insightRule).not.toContain("border-inline-start:");

		const dividerRule = ruleFor(
			".firstrecall-note-brief-insight:not(:first-child)"
		);
		expect(dividerRule).toContain(
			"border-inline-start: 1px solid var(--cc-border)"
		);

		const badgeRule = ruleFor(".firstrecall-note-brief-insight-badge");
		expect(badgeRule).toContain("align-self: flex-start");
		expect(badgeRule).toContain("margin-top: auto");

		const briefLabelRule = ruleFor(".firstrecall-note-brief-label");
		expect(briefLabelRule).toContain("font-size: 0.7em");
		expect(briefLabelRule).toContain("font-weight: 800");
		expect(briefLabelRule).toContain("letter-spacing: 0.08em");
		expect(briefLabelRule).toContain("line-height: 1.1");
	});

	it("styles cue terms as quiet secondary chips", () => {
		const termRule = ruleFor(".firstrecall-cue-term,\n.firstrecall-cornell-term");
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

	it("keeps FirstRecall label icons small and inline", () => {
		const editorLabelRule = ruleFor(
			".firstrecall-editor-hook-sectioned .firstrecall-editor-hook-section-label"
		);
		expect(editorLabelRule).toContain("display: flex");
		expect(editorLabelRule).toContain("align-items: center");
		expect(editorLabelRule).toContain("gap: 0.48em");

		const iconRule = ruleFor(".firstrecall-label-icon");
		expect(iconRule).toContain("width: 1.25em");
		expect(iconRule).toContain("height: 1.25em");
		expect(iconRule).toContain("color: var(--cc-muted)");

		const briefIconRule = ruleFor(
			".firstrecall-note-brief-label .firstrecall-label-icon"
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
				`.firstrecall-cue.firstrecall-cuefont-${size}`
			);
			const cornell = fontSizeFor(
				`.firstrecall-editor-hook.firstrecall-cuefont-${size}`
			);

			expect(inline).toBe(expected);
			expect(cornell).toBe(expected);
			expect(inline).toBe(cornell);
		}
	});

	it("distinguishes Cornell rail and Inline cue thumbnails by geometry", () => {
		const cornellCardRule = ruleFor(
			".firstrecall-preview-editor-cue-card-cornell"
		);
		expect(cornellCardRule).toContain("inset-inline-start: 8%");
		expect(cornellCardRule).toContain("width: 43%");

		const inlineCardRule = ruleFor(
			".firstrecall-preview-editor-cue-card-inline-cues"
		);
		expect(inlineCardRule).toContain("inset-block: 35% 6%");
		expect(inlineCardRule).toContain("inset-inline: 7%");
	});

	it("keeps all cue font size options in one laptop-width row", () => {
		const cueFontGroupRule = ruleFor(".firstrecall-thumbnail-group-cue-font");
		expect(cueFontGroupRule).toContain(
			"grid-template-columns: repeat(3, minmax(0, 1fr))"
		);

		const cueFontGroupIndex = styles.indexOf(
			".firstrecall-thumbnail-group-cue-font"
		);
		const narrowMediaIndex = styles.indexOf("@media (max-width: 700px)");
		const narrowMediaEnd = styles.indexOf(
			"@media (max-width: 420px)",
			narrowMediaIndex
		);
		const narrowStyles = styles.slice(narrowMediaIndex, narrowMediaEnd);
		expect(narrowMediaIndex).toBeGreaterThan(cueFontGroupIndex);
		expect(narrowStyles).toContain(".firstrecall-thumbnail-group {");
		expect(narrowStyles).toContain(
			"grid-template-columns: repeat(auto-fit, minmax(min(138px, 100%), 1fr))"
		);
	});

	it("animates accessible editor card section disclosures", () => {
		const root = ".firstrecall-editor-hook-sectioned";
		const toggleRule = ruleFor(`${root} .firstrecall-editor-hook-section-toggle`);
		expect(toggleRule).toContain("display: block");
		expect(toggleRule).toContain("width: 100%");
		expect(toggleRule).toContain("background: transparent");
		expect(toggleRule).toContain("color: var(--text-normal)");

		const dividerRule = ruleFor(
			`${root} .firstrecall-editor-hook-section-body+.firstrecall-editor-hook-section-toggle`
		);
		expect(dividerRule).toContain("border-top: 1px solid var(--cc-border)");
		expect(dividerRule).toContain("margin-top: 0.95em");
		expect(dividerRule).toContain("padding-top: 0.85em");

		const bodyRule = ruleFor(`${root} .firstrecall-editor-hook-section-body`);
		expect(bodyRule).toContain("display: grid");
		expect(bodyRule).toContain("grid-template-rows: 1fr");
		expect(bodyRule).toContain("opacity: 1");
		expect(bodyRule).toContain("grid-template-rows 200ms ease");
		expect(bodyRule).toContain("opacity 200ms ease");

		const collapsedBodyRule = ruleFor(
			`${root} .firstrecall-editor-hook-section-body[data-collapsed="true"]`
		);
		expect(collapsedBodyRule).toContain("grid-template-rows: 0fr");
		expect(collapsedBodyRule).toContain("opacity: 0");

		const contentRule = ruleFor(`${root} .firstrecall-editor-hook-section-content`);
		expect(contentRule).toContain("min-height: 0");
		expect(contentRule).toContain("overflow: hidden");

		const chevronRule = ruleFor(
			`${root} .firstrecall-editor-hook-section-chevron`
		);
		expect(chevronRule).toContain("transition: transform 200ms ease");
		const collapsedChevronRule = ruleFor(
			`${root} .firstrecall-editor-hook-section-toggle[aria-expanded="false"] .firstrecall-editor-hook-section-chevron`
		);
		expect(collapsedChevronRule).toContain("transform: rotate(-90deg)");

		const previewRule = ruleFor(`${root} .firstrecall-editor-hook-section-preview`);
		expect(previewRule).toContain("color: var(--cc-muted)");
		expect(previewRule).toContain("font-size: 0.84em");
		expect(previewRule).toContain("font-style: italic");
		expect(previewRule).toContain("white-space: nowrap");
		expect(previewRule).toContain("overflow: hidden");
		expect(previewRule).toContain("text-overflow: ellipsis");
		const hiddenPreviewRule = ruleFor(
			`${root} .firstrecall-editor-hook-section-preview[hidden]`
		);
		expect(hiddenPreviewRule).toContain("display: none");
		const collapsedTermsRule = ruleFor(
			`${root} .firstrecall-editor-hook-section-toggle[data-section="terms"][aria-expanded="false"]`
		);
		expect(collapsedTermsRule).toContain("height: auto");
		expect(collapsedTermsRule).toContain("padding-bottom: 0.65em");

		const focusRule = ruleFor(
			`${root} .firstrecall-editor-hook-section-toggle:focus-visible`
		);
		expect(focusRule).toContain("outline: 2px solid var(--interactive-accent)");
		expect(focusRule).toContain("outline-offset: 3px");

		expect(styles).toMatch(
			/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.firstrecall-editor-hook-sectioned \.firstrecall-editor-hook-section-body,[\s\S]*?\.firstrecall-editor-hook-sectioned \.firstrecall-editor-hook-section-chevron\s*\{[^}]*transition: none/
		);
	});

	it("keeps sectioned editor cues compact and quiet", () => {
		expect(styles).not.toContain("firstrecall-editor-rail-card-toggle");
		expect(styles).not.toContain("firstrecall-editor-rail-card-content");
		expect(styles).not.toContain('data-overflowing="true"');
		expect(styles).not.toContain('data-expanded="false"');

		const titleRule = ruleFor(
			".firstrecall-editor-hook-sectioned .firstrecall-editor-hook-title"
		);
		expect(titleRule).toContain("color: var(--text-normal)");
		expect(titleRule).toContain("font-size: inherit");
		expect(titleRule).toContain("font-weight: var(--font-normal, 400)");
		expect(titleRule).toContain("line-height: 1.45");

		const summaryRule = ruleFor(
			".firstrecall-editor-hook-sectioned .firstrecall-summary"
		);
		expect(summaryRule).toContain("color: var(--text-normal)");
		expect(summaryRule).toContain("font-size: inherit");
		expect(summaryRule).toContain("font-weight: var(--font-normal, 400)");
		expect(summaryRule).toContain("line-height: 1.45");

		const termRule = ruleFor(
			".firstrecall-editor-hook-sectioned .firstrecall-cue-term,\n.firstrecall-editor-hook-sectioned .firstrecall-cornell-term"
		);
		expect(termRule).toContain("font-size: 0.84em");
		expect(termRule).toContain("line-height: 1.65");

		const cornellQuestionRule = ruleFor(
			".firstrecall-editor-hook-sectioned .firstrecall-cornell-q"
		);
		expect(cornellQuestionRule).toContain("font-size: inherit");
		expect(cornellQuestionRule).toContain(
			"font-weight: var(--font-normal, 400)"
		);
		const responsiveMediumRule = ruleFor(
			".markdown-source-view.mod-cm6 .firstrecall-editor-hook-gutter .firstrecall-editor-hook.firstrecall-cuefont-medium"
		);
		expect(responsiveMediumRule).toContain("font-size: var(--font-ui-small)");
		const responsiveLargeRule = ruleFor(
			".markdown-source-view.mod-cm6 .firstrecall-editor-hook-gutter .firstrecall-editor-hook.firstrecall-cuefont-large"
		);
		expect(responsiveLargeRule).toContain("font-size: var(--font-ui-medium)");
	});

	it("styles the Editing View resize grip and scopes Custom width to rail cards", () => {
		const customRule = ruleFor(
			".markdown-source-view.mod-cm6 .firstrecall-editor-hook-gutter .firstrecall-editor-rail-card.firstrecall-editor-cue-width-custom"
		);
		expect(customRule).toContain("width: var(--firstrecall-editor-cue-width-resolved)");
		expect(customRule).toContain("max-width: none");
		const resolvedWidthRule = ruleFor(
			".markdown-source-view.mod-cm6 .firstrecall-editor-cue-width-custom"
		);
		expect(resolvedWidthRule).toContain(
			"--firstrecall-editor-cue-width-resolved: clamp(6rem, var(--firstrecall-editor-cue-width, 13rem), 32rem)"
		);

		const gripRule = ruleFor(".firstrecall-editor-cue-width-grip");
		expect(gripRule).toContain("width: 24px");
		expect(gripRule).toContain("min-width: 24px");
		expect(gripRule).toContain("cursor: ew-resize");
		expect(gripRule).toContain("touch-action: none");
		expect(gripRule).toContain("left: -12px");
		expect(gripRule).not.toContain("inset-inline-start");
		expect(gripRule).not.toContain("transition:");

		const cornellRootRule = ruleFor(
			".firstrecall-editor-cornell-card.firstrecall-editor-rail-card"
		);
		expect(cornellRootRule).toContain("padding-left: 0");
		const cornellContentRule = ruleFor(
			".firstrecall-editor-cornell-card.firstrecall-editor-rail-card .firstrecall-cornell-cue"
		);
		expect(cornellContentRule).toContain("padding-left: 28px");

		const compactGripRule = ruleFor(
			".firstrecall-editor-cue-width-grip::before"
		);
		expect(compactGripRule).toContain(
			"top: var(--firstrecall-editor-cue-width-grip-top, 50%)"
		);
		expect(compactGripRule).toContain("left: 50%");
		expect(compactGripRule).toContain("width: 9px");
		expect(compactGripRule).toContain("height: 52px");
		expect(compactGripRule).toContain("transform: translate(-50%, -50%)");
		expect(compactGripRule).toContain(
			"background: var(--background-primary)"
		);
		expect(compactGripRule).not.toContain("inset-block");
		const gripDotsRule = ruleFor(".firstrecall-editor-cue-width-grip::after");
		expect(gripDotsRule).toContain("radial-gradient");

		const focusRule = ruleFor(
			".firstrecall-editor-cue-width-grip:focus-visible"
		);
		expect(focusRule).toContain("outline: none");
		expect(styles).toContain(
			".firstrecall-editor-cue-width-grip:hover::before"
		);
		expect(styles).toContain(
			"html.firstrecall-editor-cue-width-resizing *"
		);
		expect(styles).not.toMatch(
			/\.firstrecall-cue[^\n{]*firstrecall-editor-cue-width-custom/
		);
	});

	it("positions editor cues when the page is shifted", () => {
		const railSelector =
			".markdown-source-view.mod-cm6 .cm-editor.firstrecall-editor-hook-page-shift .firstrecall-editor-hook-gutter .firstrecall-editor-hook";
		expect(ruleFor(railSelector)).toContain(
			"transform: translateX(calc(-100% + 1rem))"
		);
	});

	it("styles non-collapsing Editing Study answers and sticky controls", () => {
		expect(styles).not.toContain("body.firstrecall-study-active");
		expect(ruleFor(".firstrecall-study-header-action")).toContain(
			"display: inline-flex"
		);
		expect(ruleFor(".firstrecall-study-header-label")).toContain("display: inline");
		expect(styles).toContain(
			'.firstrecall-study-header-action[aria-disabled="true"]'
		);

		const answerRule = ruleFor(
			".markdown-source-view.mod-cm6 .firstrecall-editor-study-answer.is-hidden"
		);
		expect(answerRule).toContain("filter: blur(4px)");
		expect(answerRule).toContain("cursor: text");
		expect(answerRule).not.toContain("display: none");
		expect(answerRule).not.toContain("visibility: hidden");
		expect(answerRule).not.toContain("max-height");

		const controlsRule = ruleFor(".firstrecall-editor-study-controls");
		expect(controlsRule).toContain("position: sticky");
		expect(controlsRule).toContain("top: 0");
		expect(controlsRule).toContain("z-index: 10");
		expect(controlsRule).toContain("width: 100%");
		expect(controlsRule).toContain("background: var(--background-secondary)");
		expect(controlsRule).toContain(
			"border: 1px solid var(--background-modifier-border)"
		);

		const cueRule = ruleFor(".firstrecall-editor-study-cue");
		expect(cueRule).toContain("position: relative");
		expect(ruleFor("button.firstrecall-study-section-toggle")).toContain(
			"border: 1px solid var(--background-modifier-border)"
		);
		expect(ruleFor("button.firstrecall-study-section-toggle")).toContain(
			"inset-inline-end: -14px"
		);
	});

	it("styles inline-only Reading Study without the Cornell review launcher", () => {
		const answerRule = ruleFor(
			".firstrecall-reading-study-answer.is-hidden"
		);
		expect(answerRule).toContain("visibility: hidden");
		expect(answerRule).not.toContain("display: none");

		const controlsRule = ruleFor(".firstrecall-reading-study-controls");
		expect(controlsRule).toContain("position: sticky");
		expect(controlsRule).toContain("top: 0");
		expect(controlsRule).toContain("z-index: 10");
		expect(controlsRule).toContain("width: 100%");
		expect(controlsRule).toContain("background: var(--background-secondary)");
		expect(styles).toContain(".firstrecall-study-progress-track");
		expect(styles).toContain(".firstrecall-study-progress-fill");
		expect(ruleFor(".firstrecall-study-help")).toContain(
			"background: var(--background-primary)"
		);
		expect(ruleFor(".firstrecall-study-help-copy")).toContain(
			"flex-direction: column"
		);
		expect(ruleFor(".firstrecall-study-progress-track")).toContain(
			"flex: 1 1 120px"
		);
		expect(ruleFor(".firstrecall-study-actions")).toContain(
			"margin-inline-start: auto"
		);

		const cueRule = ruleFor(".firstrecall-reading-study-cue");
		expect(cueRule).toContain("position: relative");
		expect(styles).not.toContain(".firstrecall-reading-review");
	});

	it("outlines the OpenRouter icon so its bright brand color stays legible in light mode", () => {
		const rule = ruleFor(
			'.firstrecall-provider-icon[data-provider="openrouter"] svg path'
		);
		expect(rule).toContain("stroke:");
		expect(rule).toContain("stroke-width:");
	});
});
