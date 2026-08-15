export const CUE_SECTION_KINDS = ["summary", "question", "terms"] as const;

export type CueSectionKind = (typeof CUE_SECTION_KINDS)[number];
export type CueSectionCollapseMap = Record<
	string,
	Record<string, Partial<Record<CueSectionKind, true>>>
>;
export type PersistCueSectionCollapseFn = (
	map: CueSectionCollapseMap
) => Promise<void>;

export interface CueSectionCollapseController {
	isCollapsed(
		notePath: string,
		sectionId: string,
		kind: CueSectionKind
	): boolean;
	setCollapsed(
		notePath: string,
		sectionId: string,
		kind: CueSectionKind,
		collapsed: boolean
	): Promise<void>;
}

function isNonEmptyKey(value: string): boolean {
	return value.length > 0 && value.trim() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Coerce arbitrary stored data into a sparse collapsed-section map. */
export function loadCueSectionCollapseMap(
	raw: unknown
): CueSectionCollapseMap {
	if (!isRecord(raw)) return {};

	const out: CueSectionCollapseMap = {};
	for (const [notePath, rawSections] of Object.entries(raw)) {
		if (!isNonEmptyKey(notePath) || !isRecord(rawSections)) continue;

		const sections: CueSectionCollapseMap[string] = {};
		for (const [sectionId, rawKinds] of Object.entries(rawSections)) {
			if (!isNonEmptyKey(sectionId) || !isRecord(rawKinds)) continue;

			const kinds: Partial<Record<CueSectionKind, true>> = {};
			for (const kind of CUE_SECTION_KINDS) {
				if (rawKinds[kind] === true) kinds[kind] = true;
			}
			if (Object.keys(kinds).length > 0) sections[sectionId] = kinds;
		}
		if (Object.keys(sections).length > 0) out[notePath] = sections;
	}
	return out;
}

/**
 * Tracks sparse collapsed overrides. Memory changes synchronously so live cue
 * widgets can update before the injected persistence promise settles.
 */
export class CueSectionCollapseStore
	implements CueSectionCollapseController
{
	private collapsed: CueSectionCollapseMap;

	constructor(
		initial: CueSectionCollapseMap | undefined,
		private readonly persist: PersistCueSectionCollapseFn
	) {
		this.collapsed = initial ?? {};
	}

	isCollapsed(
		notePath: string,
		sectionId: string,
		kind: CueSectionKind
	): boolean {
		return this.collapsed[notePath]?.[sectionId]?.[kind] === true;
	}

	async setCollapsed(
		notePath: string,
		sectionId: string,
		kind: CueSectionKind,
		collapsed: boolean
	): Promise<void> {
		if (!isNonEmptyKey(notePath) || !isNonEmptyKey(sectionId)) return;
		if (this.isCollapsed(notePath, sectionId, kind) === collapsed) return;

		if (collapsed) {
			const sections = (this.collapsed[notePath] ??= {});
			const kinds = (sections[sectionId] ??= {});
			kinds[kind] = true;
		} else {
			const sections = this.collapsed[notePath];
			const kinds = sections?.[sectionId];
			if (!sections || !kinds) return;
			delete kinds[kind];
			if (Object.keys(kinds).length === 0) delete sections[sectionId];
			if (Object.keys(sections).length === 0) delete this.collapsed[notePath];
		}

		await this.persist(this.snapshot());
	}

	snapshot(): CueSectionCollapseMap {
		const out: CueSectionCollapseMap = {};
		for (const [notePath, sections] of Object.entries(this.collapsed)) {
			out[notePath] = {};
			for (const [sectionId, kinds] of Object.entries(sections)) {
				out[notePath][sectionId] = { ...kinds };
			}
		}
		return out;
	}
}
