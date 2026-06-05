import { ItemView, MarkdownRenderer, TFile, type WorkspaceLeaf } from "obsidian";
import type CueCraftPlugin from "./main";
import type { CornellModel, CornellRow } from "./cornell";

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

	/** Re-render from the active note's cache. Safe to call repeatedly. */
	async render(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("cuecraft-cornell");
		root.toggleClass("cuecraft-cornell-study", this.studyMode);

		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
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

		this.renderToolbar(root);
		root.createEl("div", { cls: "cuecraft-cornell-title", text: built.title });
		await this.renderGrid(root, built.model, file);
		this.renderSummary(root, built.model);
	}

	private renderEmpty(root: HTMLElement, message: string): void {
		root.createEl("div", { cls: "cuecraft-cornell-empty", text: message });
	}

	private renderToolbar(root: HTMLElement): void {
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
	}

	private async renderGrid(
		root: HTMLElement,
		model: CornellModel,
		file: TFile
	): Promise<void> {
		const grid = root.createEl("div", { cls: "cuecraft-cornell-grid" });
		for (const row of model.rows) {
			this.renderCueCell(grid, row);
			await this.renderNoteCell(grid, row, file);
		}
	}

	private renderCueCell(grid: HTMLElement, row: CornellRow): void {
		const cell = grid.createEl("div", { cls: "cuecraft-cornell-cuecell" });
		if (!row.hasCue || !row.question) return;

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

		// In Study Mode, clicking a cue toggles its hint's reveal.
		cue.addEventListener("click", () => {
			if (!this.studyMode) return;
			if (this.revealed.has(row.id)) this.revealed.delete(row.id);
			else this.revealed.add(row.id);
			this.applyReveal(this.contentEl);
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
