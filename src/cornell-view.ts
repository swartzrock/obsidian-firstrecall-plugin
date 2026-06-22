import { ItemView, MarkdownRenderer, Menu, TFile, type WorkspaceLeaf } from "obsidian";
import type CueCraftPlugin from "./main";
import { TONE_OPTIONS } from "./main";
import {
	buildCornellAnswerPresentation,
	buildCornellSupportPresentation,
	failedCueCount,
	buildCornellTakeawayPresentation,
	pickCornellFile,
	type CornellModel,
	type CornellRow,
} from "./cornell";
import {
	applyShortFormHookFocusState,
	buildShortFormHookModel,
	shortFormHookCardState,
	shortFormHookFocusLabel,
	shortFormHookStatusIcon,
	shortFormHookTitleDensity,
	type ShortFormHookModel,
	type ShortFormHookRailCard,
} from "./short-form-hook";
import {
	CORNELL_STYLES,
	cornellStyleClass,
	type CornellStyle,
} from "./cornell-style";
import {
	CUE_COLUMN_WIDTHS,
	CUE_FONT_SIZES,
	cueColumnWidthClass,
	cueFontSizeClass,
	type CueColumnWidth,
	type CueFontSize,
} from "./cornell-layout";
import { CUE_ACCENTS, cueAccentClass } from "./cornell-accent";
import { CORNELL_DISPLAY_MODES, type CornellDisplayMode } from "./cornell-display";

export const VIEW_TYPE_CORNELL = "cuecraft-cornell";

/**
 * A dedicated pane that lays out the active note as Cornell-style study notes:
 * Title -> left cue column (questions + supports) | right main notes ->
 * Summary band. Study Mode blurs note-side answers until revealed, so the
 * recall interaction lives entirely in the cue column.
 */
export class CornellView extends ItemView {
	private studyMode = false;
	/** Section ids whose note-side answers have been revealed in the current study pass. */
	private revealed = new Set<string>();
	/** When true, all note-side answers are shown regardless of per-cue reveal state. */
	private revealAll = false;
	/** When true, the in-view display-controls row (style/width/font) is shown. */
	private displayOpen = false;
	private focusedHookSectionId: string | null = null;
	/** The last Markdown note we rendered, used as a fallback on restart. */
	private lastFile: TFile | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: CueCraftPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_CORNELL;
	}

	getDisplayText(): string {
		return "CueCraft — Cornell";
	}

	getIcon(): string {
		return "graduation-cap";
	}

	async onOpen(): Promise<void> {
		this.registerEvent(
			this.app.workspace.on("file-open", () => void this.render())
		);
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => void this.render())
		);
		await this.render();
	}

	/**
	 * Turn on this view's Study Mode (questions visible, note-side answers blurred
	 * until revealed) and re-render. Used by "Review This Note" so the command
	 * lands the user in an actually-studying state instead of a no-op toggle.
	 */
	async enterStudyMode(): Promise<void> {
		this.focusedHookSectionId = null;
		this.studyMode = true;
		this.revealed.clear();
		this.revealAll = false;
		await this.render();
	}

	/** Re-render from the active note's cache. Safe to call repeatedly. */
	async render(): Promise<void> {
		const root = this.contentEl;
		const hookMode = this.isHookMode();
		root.empty();
		root.addClass("cuecraft-cornell");
		root.toggleClass("cuecraft-cornell-study", this.studyMode);
		root.toggleClass("cuecraft-hook-mode", hookMode);
		root.toggleClass(
			"cuecraft-cornell-hide-keywords",
			!this.plugin.settings.generateKeywords
		);
		root.toggleClass(
			"cuecraft-cornell-compact-chips",
			this.plugin.settings.compactChips
		);
		root.toggleClass(
			"cuecraft-cornell-no-border",
			!this.plugin.settings.showCueBorder
		);
		root.toggleClass(
			"cuecraft-cornell-fold-mobile",
			this.plugin.settings.foldCueColumnOnMobile
		);
		// Apply the selected visual preset; only one style class at a time.
		for (const s of CORNELL_STYLES) root.removeClass(cornellStyleClass(s.id));
		root.addClass(cornellStyleClass(this.plugin.settings.cornellStyle));
		// Apply the typography/layout controls (width + font size), one each.
		for (const w of CUE_COLUMN_WIDTHS)
			root.removeClass(cueColumnWidthClass(w.id));
		root.addClass(cueColumnWidthClass(this.plugin.settings.cueColumnWidth));
		for (const f of CUE_FONT_SIZES) root.removeClass(cueFontSizeClass(f.id));
		root.addClass(cueFontSizeClass(this.plugin.settings.cueFontSize));
		// Apply the cue accent color (tints cue questions, rail, and supports).
		for (const a of CUE_ACCENTS) root.removeClass(cueAccentClass(a.id));
		root.addClass(cueAccentClass(this.plugin.settings.cueAccent));

		const file = this.resolveTargetFile();
		if (!file) {
			this.renderEmpty(root, "Open a Markdown note to see its Cornell study layout.");
			return;
		}

		const built = await this.plugin.buildCornellFor(file);
		if (!built) {
			this.renderEmpty(
				root,
				`No cues yet for “${file.basename}”. Run “CueCraft: Generate Cues for This Note”.`
			);
			return;
		}

		this.renderToolbar(root, file);
		if (this.displayOpen) this.renderDisplayRow(root);
		if (!hookMode) this.renderFailedBanner(root, built.model, file);
		root.createEl("div", { cls: "cuecraft-cornell-title", text: built.title });
		const hookModel = hookMode
			? buildShortFormHookModel(built.model)
			: null;
		await this.renderGrid(root, built.model, file, hookModel);
		if (hookModel) this.renderHookSummary(root, hookModel);
		else this.renderSummary(root, built.model);
	}

	/**
	 * Decide which note to render. Prefers the active Markdown note; otherwise
	 * falls back to the last one we showed, then to the most recently opened
	 * note with cues. This keeps the view populated after an Obsidian restart,
	 * where the restored active leaf is the Cornell view itself (no active md).
	 */
	private resolveTargetFile(): TFile | null {
		const { workspace, vault } = this.app;
		const recentMd: TFile[] = [];
		for (const path of workspace.getLastOpenFiles()) {
			const f = vault.getAbstractFileByPath(path);
			if (f instanceof TFile && f.extension === "md") recentMd.push(f);
		}
		const picked = pickCornellFile({
			active: workspace.getActiveFile(),
			last: this.lastFile,
			lastExists: Boolean(
				this.lastFile && vault.getAbstractFileByPath(this.lastFile.path)
			),
			recentMd,
			hasCache: (path) => this.plugin.hasCueCache(path),
			hasUsableCache: (path) => this.plugin.hasUsableCueCache(path),
		});
		// pickCornellFile only ever returns one of the TFile inputs (or null).
		this.lastFile = (picked as TFile | null) ?? null;
		return this.lastFile;
	}

	private renderEmpty(root: HTMLElement, message: string): void {
		root.createEl("div", { cls: "cuecraft-cornell-empty", text: message });
	}

	private renderToolbar(root: HTMLElement, file: TFile): void {
		const bar = root.createEl("div", { cls: "cuecraft-cornell-toolbar" });
		const study = bar.createEl("label", {
			cls: "cuecraft-cornell-study-toggle",
		});
		study.createEl("span", {
			cls: "cuecraft-cornell-study-label",
			text: "Study mode",
		});
		const toggle = study.createEl("span", { cls: "checkbox-container" });
		toggle.toggleClass("is-enabled", this.studyMode);
		const input = toggle.createEl("input");
		input.type = "checkbox";
		input.checked = this.studyMode;
		input.setAttr("aria-label", "Study mode");
		input.addEventListener("change", () => {
			this.studyMode = input.checked;
			if (this.studyMode) this.focusedHookSectionId = null;
			this.revealed.clear();
			this.revealAll = false;
			void this.render();
		});

		if (!this.studyMode) {
			const refresh = bar.createEl("button", {
				cls: "cuecraft-cornell-btn",
				text: "\u21bb Refresh stale",
			});
			refresh.addEventListener("click", () => {
				void this.plugin.regenerateStaleSections(file);
			});
		}

		bar.createEl("span", { cls: "cuecraft-cornell-spacer" });
		const display = bar.createEl("button", {
			cls: "cuecraft-cornell-btn",
			text: `\u2699 Display ${this.displayOpen ? "\u25b4" : "\u25be"}`,
		});
		display.toggleClass("is-active", this.displayOpen);
		display.addEventListener("click", () => {
			this.displayOpen = !this.displayOpen;
			void this.render();
		});
	}

	/**
	 * The Hybrid display-controls row: an in-view (no overlay) strip of Mode /
	 * Style / cue-column-width / cue-font-size controls that the ⚙ Display button
	 * expands. Each control writes straight to settings and live-rerenders, so the
	 * effect is visible immediately under the controls.
	 */
	private renderDisplayRow(root: HTMLElement): void {
		const row = root.createEl("div", { cls: "cuecraft-cornell-display" });

		this.renderHookModeControl(row);

		const styleCtl = row.createEl("div", { cls: "cuecraft-cornell-ctl" });
		styleCtl.createEl("label", {
			cls: "cuecraft-cornell-ctl-label",
			text: "Style",
		});
		const select = styleCtl.createEl("select", {
			cls: "cuecraft-cornell-select dropdown",
		});
		for (const s of CORNELL_STYLES) {
			const opt = select.createEl("option", { text: s.label });
			opt.value = s.id;
		}
		select.value = this.plugin.settings.cornellStyle;
		select.addEventListener("change", () => {
			this.plugin.settings.cornellStyle = select.value as CornellStyle;
			void this.commitDisplayChange();
		});

		this.renderSegmented(
			row,
			"Width",
			CUE_COLUMN_WIDTHS,
			this.plugin.settings.cueColumnWidth,
			(id) => {
				this.plugin.settings.cueColumnWidth = id as CueColumnWidth;
			}
		);
		this.renderSegmented(
			row,
			"Font",
			CUE_FONT_SIZES,
			this.plugin.settings.cueFontSize,
			(id) => {
				this.plugin.settings.cueFontSize = id as CueFontSize;
			}
		);
	}

	private renderHookModeControl(row: HTMLElement): void {
		const ctl = row.createEl("div", { cls: "cuecraft-cornell-ctl" });
		ctl.createEl("label", {
			cls: "cuecraft-cornell-ctl-label",
			text: "Mode",
		});
		const seg = ctl.createEl("div", { cls: "cuecraft-cornell-seg" });
		for (const opt of CORNELL_DISPLAY_MODES) {
			const btn = seg.createEl("button", {
				cls: "cuecraft-cornell-seg-btn",
				text: opt.label,
			});
			const isHook = opt.id === "hook";
			btn.toggleClass("is-on", this.isHookMode() === isHook);
			btn.addEventListener("click", () => {
				void this.setDisplayMode(opt.id);
			});
		}
	}

	/** A small segmented-button group used by the display-controls row. */
	private renderSegmented(
		parent: HTMLElement,
		label: string,
		options: readonly { id: string; label: string }[],
		current: string,
		set: (id: string) => void
	): void {
		const ctl = parent.createEl("div", { cls: "cuecraft-cornell-ctl" });
		ctl.createEl("label", {
			cls: "cuecraft-cornell-ctl-label",
			text: label,
		});
		const seg = ctl.createEl("div", { cls: "cuecraft-cornell-seg" });
		for (const o of options) {
			const btn = seg.createEl("button", {
				cls: "cuecraft-cornell-seg-btn",
				text: o.label,
			});
			btn.toggleClass("is-on", o.id === current);
			btn.addEventListener("click", () => {
				set(o.id);
				void this.commitDisplayChange();
			});
		}
	}

	/** Persist a display-control change and live-re-render open Cornell views. */
	private async commitDisplayChange(): Promise<void> {
		await this.plugin.saveSettings();
		this.plugin.refreshCornellViews();
	}

	/** Banner shown when one or more sections failed to generate. */
	private renderFailedBanner(
		root: HTMLElement,
		model: CornellModel,
		file: TFile
	): void {
		const failed = failedCueCount(model);
		if (failed === 0) return;
		const banner = root.createEl("div", { cls: "cuecraft-cornell-failbanner" });
		banner.createEl("span", {
			cls: "cuecraft-cornell-failbanner-text",
			text: `\u26a0 ${failed} section${failed === 1 ? "" : "s"} failed to generate.`,
		});
		const retry = banner.createEl("button", {
			cls: "cuecraft-cornell-btn",
			text: "\u21bb Retry failed",
		});
		retry.addEventListener("click", () => {
			void this.plugin.regenerateStaleSections(file);
		});
	}

	private async renderGrid(
		root: HTMLElement,
		model: CornellModel,
		file: TFile,
		hookModel: ShortFormHookModel | null = null
	): Promise<void> {
		const grid = root.createEl("div", { cls: "cuecraft-cornell-grid" });
		const hookCardsBySection = hookModel
			? new Map(hookModel.cards.map((card) => [card.sectionId, card]))
			: null;
		for (const row of model.rows) {
			if (hookCardsBySection) {
				this.renderHookCell(grid, row, hookCardsBySection.get(row.id), file);
			} else {
				this.renderCueCell(grid, row, file);
			}
			await this.renderNoteCell(grid, row, file);
		}
	}

	private renderHookCell(
		grid: HTMLElement,
		row: CornellRow,
		card: ShortFormHookRailCard | undefined,
		file: TFile
	): void {
		const cell = grid.createEl("div", {
			cls: "cuecraft-cornell-cuecell cuecraft-hook-cell",
		});
		if (!card) return;

		const state = shortFormHookCardState(card, this.focusedHookSectionId);
		const cue = cell.createEl("button", {
			cls: "cuecraft-hook-card cuecraft-hook-card-action",
			attr: {
				type: "button",
				"aria-label": shortFormHookFocusLabel(card),
				"aria-current": state === "current" ? "location" : "false",
			},
		});
		cue.dataset.section = row.id;
		cue.toggleClass("is-current", state === "current");
		cue.addEventListener("click", () => this.focusHookSection(row.id));
		cue.createEl("span", {
			cls: "cuecraft-hook-status",
			text: shortFormHookStatusIcon(state),
			attr: { "aria-hidden": "true" },
		});
		if (card.kind === "hook") {
			if (card.confidence) cue.dataset.confidence = card.confidence;
			cue.dataset.titleDensity = shortFormHookTitleDensity(card.hookTitle);
			cue.setAttr("title", card.originalQuestion);
			cue.createEl("div", {
				cls: "cuecraft-hook-title",
				text: card.hookTitle,
				attr: { "aria-label": card.originalQuestion },
			});
			return;
		}

		cue.addClass("cuecraft-hook-card-failed");
		cue.setAttr("title", card.error);
		cue.createEl("div", {
			cls: "cuecraft-hook-title",
			text: card.label,
		});
		const regen = cell.createEl("button", {
			cls: "cuecraft-hook-regen",
			text: "Retry",
			attr: {
				"aria-label": `Regenerate cue for ${row.heading || "section"}`,
				title: "Regenerate cue",
			},
		});
		regen.addEventListener("click", (e) => {
			e.stopPropagation();
			this.showToneMenu(e, file, row.id);
		});
	}

	private renderCueCell(grid: HTMLElement, row: CornellRow, file: TFile): void {
		const cell = grid.createEl("div", { cls: "cuecraft-cornell-cuecell" });
		if (!row.hasCue || !row.question) {
			// Attempted but failed: surface it as an actionable state instead of a
			// silent blank cell. Sections never generated stay empty.
			if (row.error) this.renderErrorCue(cell, row, file);
			return;
		}

		const cue = cell.createEl("div", { cls: "cuecraft-cornell-cue" });
		if (row.confidence) cue.dataset.confidence = row.confidence;

		// Only low-confidence cues get an explicit warning. High/medium
		// confidence stays quiet because it is not actionable.
		if (row.confidence === "low") {
			cue.createEl("button", {
				cls: "cuecraft-cornell-lowconf",
				text: "\u26a0",
				attr: {
					"aria-label": "Low confidence",
					title: row.rationale
						? `Low confidence: ${row.rationale}`
						: "Low confidence: this cue may need review.",
				},
			});
		}
		// Circle-arrow regenerate icon: appears on hover, and stays visible for
		// low-confidence cues as a nudge to regenerate them. Hidden in Study Mode.
		if (!this.studyMode) {
			const regen = cue.createEl("button", {
				cls: "cuecraft-cornell-regen",
				text: "\u21bb",
				attr: {
					"aria-label": "Regenerate cue",
					title: "Regenerate cue",
				},
			});
			regen.addEventListener("click", (e) => {
				e.stopPropagation();
				this.showToneMenu(e, file, row.id);
			});
		}

		cue.createEl("div", { cls: "cuecraft-cornell-q", text: row.question });

		const supports = buildCornellSupportPresentation({
			keywords: row.keywords,
		});
		if (this.plugin.settings.generateKeywords && supports.terms.length) {
			const kw = cue.createEl("div", { cls: "cuecraft-cornell-kw" });
			kw.createEl("span", {
				cls: "cuecraft-cornell-support-text",
				text: supports.terms.join(" \u00b7 "),
			});
		}

		// In Study Mode, clicking a cue toggles the note-side answer reveal.
		cue.addEventListener("click", () => {
			if (!this.studyMode) return;
			if (this.revealed.has(row.id)) this.revealed.delete(row.id);
			else this.revealed.add(row.id);
			this.applyReveal(this.contentEl);
		});
	}

	/** Render a failed section's cue as a warning + regenerate action. */
	private renderErrorCue(cell: HTMLElement, row: CornellRow, file: TFile): void {
		const cue = cell.createEl("div", { cls: "cuecraft-cornell-cue cuecraft-cornell-cue-error" });
		cue.createEl("div", {
			cls: "cuecraft-cornell-q",
			text: "\u26a0 Generation failed",
		});
		if (row.error) cue.setAttr("title", row.error);
		const regen = cue.createEl("button", {
			cls: "cuecraft-cornell-regen-action",
			text: "\u21bb Regenerate",
		});
		regen.addEventListener("click", (e) => {
			e.stopPropagation();
			this.showToneMenu(e, file, row.id);
		});
	}

	private async renderNoteCell(
		grid: HTMLElement,
		row: CornellRow,
		file: TFile
	): Promise<void> {
		const cell = grid.createEl("div", { cls: "cuecraft-cornell-notecell" });
		if (row.heading) {
			const h = cell.createEl("div", { cls: "cuecraft-cornell-heading" });
			h.dataset.level = String(row.level);
			h.setText(row.heading);
		}
		const body = cell.createEl("div", { cls: "cuecraft-cornell-body" });
		body.dataset.section = row.id;
		if (this.isHookMode()) body.tabIndex = -1;
		const answer = buildCornellAnswerPresentation({
			sectionId: row.id,
			studyMode: this.studyMode,
			revealAll: this.revealAll,
			revealedSectionIds: this.revealed,
		});
		if (answer.hidden) body.addClass("is-hidden");
		if (row.content.trim()) {
			await MarkdownRenderer.render(this.app, row.content, body, file.path, this);
		} else {
			body.addClass("cuecraft-cornell-body-empty");
			body.setText("—");
		}
	}

	private renderSummary(root: HTMLElement, model: CornellModel): void {
		const takeaway = buildCornellTakeawayPresentation({
			summary: model.summary,
			learningObjective: model.learningObjective,
		});
		if (!takeaway.takeaway && !takeaway.objective) return;
		const wrap = root.createEl("div", { cls: "cuecraft-cornell-summary" });
		wrap.createEl("div", {
			cls: "cuecraft-cornell-summary-label",
			text: takeaway.label,
		});
		if (takeaway.takeaway) {
			wrap.createEl("div", {
				cls: "cuecraft-cornell-summary-body",
				text: takeaway.takeaway,
			});
		}
		if (takeaway.objective) {
			const obj = wrap.createEl("div", { cls: "cuecraft-cornell-objective" });
			obj.createEl("strong", { text: "Objective: " });
			obj.appendText(takeaway.objective);
		}
	}

	private renderHookSummary(
		root: HTMLElement,
		model: ShortFormHookModel
	): void {
		const summary = model.summary;
		if (!summary) return;
		const wrap = root.createEl("div", { cls: "cuecraft-hook-summary" });
		wrap.createEl("div", {
			cls: "cuecraft-hook-summary-label",
			text: summary.label,
		});
		if (summary.takeaway) {
			wrap.createEl("div", {
				cls: "cuecraft-hook-summary-body",
				text: summary.takeaway,
			});
		}
		if (summary.objective) {
			const obj = wrap.createEl("div", { cls: "cuecraft-hook-objective" });
			obj.createEl("strong", { text: "Objective: " });
			obj.appendText(summary.objective);
		}
	}

	private isHookMode(): boolean {
		return (
			!this.studyMode &&
			this.plugin.settings.cornellDisplayMode === "hook"
		);
	}

	private async setDisplayMode(mode: CornellDisplayMode): Promise<void> {
		this.focusedHookSectionId = null;
		this.plugin.settings.cornellDisplayMode = mode;
		if (mode === "hook") {
			this.studyMode = false;
			this.revealed.clear();
			this.revealAll = false;
		}
		await this.plugin.saveSettings();
		this.plugin.refreshCornellViews();
	}

	private focusHookSection(sectionId: string): void {
		this.focusedHookSectionId = sectionId;
		applyShortFormHookFocusState(this.contentEl, this.focusedHookSectionId);
		const target = this.findSectionBody(sectionId);
		if (!target) return;
		target.scrollIntoView({
			block: "center",
			behavior: this.prefersReducedMotion() ? "auto" : "smooth",
		});
		target.focus({ preventScroll: true });
	}

	private findSectionBody(sectionId: string): HTMLElement | null {
		const bodies =
			this.contentEl.querySelectorAll<HTMLElement>(".cuecraft-cornell-body");
		for (const body of bodies) {
			if (body.dataset.section === sectionId) return body;
		}
		return null;
	}

	private prefersReducedMotion(): boolean {
		return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
	}

	/** Show a tone picker menu then regenerate the chosen section with that tone. */
	private showToneMenu(e: MouseEvent, file: TFile, sectionId: string): void {
		const menu = new Menu();
		for (const tone of TONE_OPTIONS) {
			menu.addItem((item) =>
				item.setTitle(tone.label).onClick(() =>
					void this.plugin.regenerateSection(file, sectionId, tone.id)
				)
			);
		}
		menu.showAtMouseEvent(e);
	}

	/** Apply current reveal state to already-rendered note-side answers (no full re-render). */
	private applyReveal(root: HTMLElement): void {
		const answers = root.querySelectorAll<HTMLElement>(".cuecraft-cornell-body");
		answers.forEach((el) => {
			const id = el.dataset.section ?? "";
			const show = !this.studyMode || this.revealAll || this.revealed.has(id);
			el.toggleClass("is-hidden", !show);
		});
	}
}
