import { ItemView, MarkdownRenderer, Menu, TFile, type WorkspaceLeaf } from "obsidian";
import type CueCraftPlugin from "./main";
import { TONE_OPTIONS } from "./main";
import {
	failedCueCount,
	pickCornellFile,
	type CornellModel,
	type CornellRow,
} from "./cornell";
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

export const VIEW_TYPE_CORNELL = "cuecraft-cornell";

/**
 * A dedicated pane that lays out the active note as Cornell-style study notes:
 * Title -> left cue column (questions + keyword hints) | right main notes ->
 * Summary band. Study Mode blurs the left keyword hints until revealed, so the
 * recall interaction lives entirely in the cue column.
 */
export class CornellView extends ItemView {
	private studyMode = false;
	/** Section ids whose hints have been revealed in the current study pass. */
	private revealed = new Set<string>();
	/** When true, all hints are shown regardless of per-cue reveal state. */
	private revealAll = false;
	/** When true, the in-view display-controls row (style/width/font) is shown. */
	private displayOpen = false;
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
	 * Turn on this view's Study Mode (questions visible, keyword hints blurred
	 * until revealed) and re-render. Used by "Review This Note" so the command
	 * lands the user in an actually-studying state instead of a no-op toggle.
	 */
	async enterStudyMode(): Promise<void> {
		this.studyMode = true;
		this.revealed.clear();
		this.revealAll = false;
		await this.render();
	}

	/** Re-render from the active note's cache. Safe to call repeatedly. */
	async render(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("cuecraft-cornell");
		root.toggleClass("cuecraft-cornell-study", this.studyMode);
		// Apply the selected visual preset; only one style class at a time.
		for (const s of CORNELL_STYLES) root.removeClass(cornellStyleClass(s.id));
		root.addClass(cornellStyleClass(this.plugin.settings.cornellStyle));
		// Apply the typography/layout controls (width + font size), one each.
		for (const w of CUE_COLUMN_WIDTHS)
			root.removeClass(cueColumnWidthClass(w.id));
		root.addClass(cueColumnWidthClass(this.plugin.settings.cueColumnWidth));
		for (const f of CUE_FONT_SIZES) root.removeClass(cueFontSizeClass(f.id));
		root.addClass(cueFontSizeClass(this.plugin.settings.cueFontSize));

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
		this.renderFailedBanner(root, built.model, file);
		root.createEl("div", { cls: "cuecraft-cornell-title", text: built.title });
		await this.renderGrid(root, built.model, file);
		this.renderSummary(root, built.model);
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
		const study = bar.createEl("button", {
			cls: "cuecraft-cornell-btn",
			text: this.studyMode ? "Study Mode: on" : "Study Mode: off",
		});
		study.toggleClass("is-active", this.studyMode);
		study.addEventListener("click", () => {
			this.studyMode = !this.studyMode;
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

		if (this.studyMode) {
			const revealAll = bar.createEl("button", {
				cls: "cuecraft-cornell-btn",
				text: "Reveal all",
			});
			revealAll.addEventListener("click", () => {
				this.revealAll = true;
				this.applyReveal(root);
			});
			const hideAll = bar.createEl("button", {
				cls: "cuecraft-cornell-btn",
				text: "Hide all",
			});
			hideAll.addEventListener("click", () => {
				this.revealAll = false;
				this.revealed.clear();
				this.applyReveal(root);
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
	 * The Hybrid display-controls row: an in-view (no overlay) strip of Style /
	 * cue-column-width / cue-font-size controls that the ⚙ Display button expands.
	 * Each control writes straight to settings and live-re-renders, so the effect
	 * is visible immediately under the controls. Settings remains the place to set
	 * the saved default.
	 */
	private renderDisplayRow(root: HTMLElement): void {
		const row = root.createEl("div", { cls: "cuecraft-cornell-display" });

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
		file: TFile
	): Promise<void> {
		const grid = root.createEl("div", { cls: "cuecraft-cornell-grid" });
		for (const row of model.rows) {
			this.renderCueCell(grid, row, file);
			await this.renderNoteCell(grid, row, file);
		}
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
		cue.createEl("div", { cls: "cuecraft-cornell-q", text: row.question });

		if (row.keywords.length) {
			const kw = cue.createEl("div", { cls: "cuecraft-cornell-kw" });
			kw.dataset.section = row.id;
			for (const word of row.keywords) {
				kw.createEl("span", { cls: "cuecraft-cornell-chip", text: word });
			}
			if (this.studyMode && !this.revealed.has(row.id) && !this.revealAll) {
				kw.addClass("is-hidden");
			}
		}

		// Regenerate button (visible when not in Study Mode).
		if (!this.studyMode) {
			const regen = cue.createEl("button", {
				cls: "cuecraft-cornell-regen",
				text: "\u21bb Regenerate",
			});
			regen.addEventListener("click", (e) => {
				e.stopPropagation();
				this.showToneMenu(e, file, row.id);
			});
		}

		// In Study Mode, clicking a cue toggles its hint's reveal.
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
			cls: "cuecraft-cornell-regen",
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
		if (row.content.trim()) {
			await MarkdownRenderer.render(this.app, row.content, body, file.path, this);
		} else {
			body.addClass("cuecraft-cornell-body-empty");
			body.setText("—");
		}
	}

	private renderSummary(root: HTMLElement, model: CornellModel): void {
		if (!model.summary && !model.learningObjective) return;
		const wrap = root.createEl("div", { cls: "cuecraft-cornell-summary" });
		wrap.createEl("div", { cls: "cuecraft-cornell-summary-label", text: "Summary" });
		if (model.summary) {
			wrap.createEl("div", { cls: "cuecraft-cornell-summary-body", text: model.summary });
		}
		if (model.learningObjective) {
			const obj = wrap.createEl("div", { cls: "cuecraft-cornell-objective" });
			obj.createEl("strong", { text: "Objective: " });
			obj.appendText(model.learningObjective);
		}
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

	/** Apply current reveal state to already-rendered keyword hints (no full re-render). */
	private applyReveal(root: HTMLElement): void {
		const hints = root.querySelectorAll<HTMLElement>(".cuecraft-cornell-kw");
		hints.forEach((el) => {
			const id = el.dataset.section ?? "";
			const show = !this.studyMode || this.revealAll || this.revealed.has(id);
			el.toggleClass("is-hidden", !show);
		});
	}
}
