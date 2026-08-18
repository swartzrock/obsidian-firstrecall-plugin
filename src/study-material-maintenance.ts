import {
	buildNoteCache,
	reconcileCacheSections,
	type NoteCache,
} from "./cache";
import type { CueGenerationOptions } from "./cue-generation";
import type { CueCraftCueProviderRuntime } from "./cue-provider";
import {
	generateNoteBriefForSections,
	generateSectionCueBatch,
	resolveEffectiveSectionConcurrency,
	type SectionResult,
} from "./generator";
import { cueEligibleSections, parseSections, type Section } from "./parser";
import {
	cacheContentRevision,
	createCurrentMaintenanceState,
	createMissingMaintenanceState,
	hasMaintenanceComponents,
	noteSourceRevision,
	reduceMaintenanceState,
	type ComponentSet,
	type NoteMaintenanceState,
} from "./study-material-state";
import {
	scheduleAutoGenerationTimer,
	type AutoGenerationSettleDelaySeconds,
	type AutoGenerationTimerApi,
} from "./auto-generation-delay";

export type MaintenanceOperationKind =
	| "automatic"
	| "catch-up"
	| "update"
	| "retry"
	| "command";

export interface MaintenanceSource {
	path: string;
	noteTitle: string;
	markdown: string;
	modifiedAt: number;
}

export interface MaintenanceRequest {
	path: string;
	kind: MaintenanceOperationKind;
	sectionIds?: readonly string[];
}

export interface StudyMaterialMaintenancePlan {
	revision: string;
	components: ComponentSet;
	sections: Section[];
	terminal: boolean;
}

export type MaintenanceOutcome =
	| {
			status: "completed" | "failed";
			path: string;
			revision: string;
			components: ComponentSet;
			errors: string[];
	  }
	| {
			status: "skipped";
			path: string;
			reason: "missing" | "not-authorized" | "no-work";
	  }
	| { status: "canceled" | "stale"; path: string };

export interface MaintenanceProviderMetadata {
	provider: string;
	model: string;
	preset: string;
	generationMode: "per-section" | "whole-note-context";
}

export interface StudyMaterialMaintenanceDependencies {
	readSource(path: string): Promise<MaintenanceSource | null>;
	isAutomaticAllowed(path: string): boolean;
	getCache(path: string): NoteCache | null;
	getState(path: string): NoteMaintenanceState | null;
	commit(
		path: string,
		cache: NoteCache | null,
		state: NoteMaintenanceState | null
	): Promise<void>;
	renamePath?(from: string, to: string): Promise<void>;
	deletePath?(path: string): Promise<void>;
	makeProvider(automatic: boolean): Promise<CueCraftCueProviderRuntime | null>;
	providerMetadata(): MaintenanceProviderMetadata;
	generationOptions(): Partial<CueGenerationOptions>;
	sectionConcurrency(): number;
	onCommitted?(path: string): void | Promise<void>;
	timerApi?: AutoGenerationTimerApi;
}

interface QueuedRequest {
	request: MaintenanceRequest;
	source: MaintenanceSource;
	epoch: number;
	components: ComponentSet;
	waiters: Array<(outcome: MaintenanceOutcome) => void>;
}

interface ActiveRequest {
	revision: string;
	components: ComponentSet;
	promise: Promise<MaintenanceOutcome>;
}

interface InternalOutcome {
	public: MaintenanceOutcome;
	latestSource?: MaintenanceSource;
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function mergeComponents(a: ComponentSet, b: ComponentSet): ComponentSet {
	return {
		noteBrief: a.noteBrief || b.noteBrief,
		sectionIds: unique([...a.sectionIds, ...b.sectionIds]),
	};
}

function subtractComponents(a: ComponentSet, b: ComponentSet): ComponentSet {
	const removed = new Set(b.sectionIds);
	return {
		noteBrief: a.noteBrief && !b.noteBrief,
		sectionIds: a.sectionIds.filter((id) => !removed.has(id)),
	};
}

function preferredRequestKind(
	a: MaintenanceOperationKind,
	b: MaintenanceOperationKind
): MaintenanceOperationKind {
	const priority: MaintenanceOperationKind[] = [
		"retry",
		"command",
		"update",
		"catch-up",
		"automatic",
	];
	return priority.indexOf(a) <= priority.indexOf(b) ? a : b;
}

function componentErrorMessages(results: readonly SectionResult[]): string[] {
	return unique(
		results.flatMap((result) => result.error ? [result.error] : [])
	);
}

function sourceComponents(
	eligible: readonly Section[],
	revision: string,
	cache: NoteCache | null,
	state: NoteMaintenanceState | null,
	forcedSectionIds?: readonly string[]
): ComponentSet {
	const currentIds = new Set(eligible.map((section) => section.id));
	const cachedById = new Map(
		(cache?.sections ?? []).map((section) => [section.id, section])
	);
	const changedIds = eligible
		.filter((section) => {
			const cached = cachedById.get(section.id);
			return !cached || cached.error || cached.contentHash !== section.contentHash;
		})
		.map((section) => section.id);
	const sectionIds = forcedSectionIds
		? unique(forcedSectionIds.filter((id) => currentIds.has(id)))
		: changedIds;
	const cacheIds = (cache?.sections ?? []).map((section) => section.id);
	const currentOrder = eligible.map((section) => section.id);
	const structureChanged =
		cacheIds.length !== currentOrder.length ||
		cacheIds.some((id, index) => id !== currentOrder[index]);
	return {
		noteBrief:
			!cache?.noteBrief ||
			state?.noteBriefRevision !== revision ||
			structureChanged ||
			sectionIds.length > 0,
		sectionIds,
	};
}

export function planStudyMaterialMaintenance(params: {
	source: MaintenanceSource;
	cache: NoteCache | null;
	state: NoteMaintenanceState | null;
	kind: MaintenanceOperationKind;
	sectionIds?: readonly string[];
}): StudyMaterialMaintenancePlan {
	const sections = parseSections(params.source.markdown);
	const eligible = cueEligibleSections(sections);
	const revision = noteSourceRevision(
		params.source.noteTitle,
		params.source.markdown
	);
	if (!eligible.length) {
		return {
			revision,
			components: { noteBrief: false, sectionIds: [] },
			sections,
			terminal: true,
		};
	}

	let forced = params.sectionIds;
	if (
		params.kind === "retry" &&
		params.state?.sourceRevision === revision &&
		params.state.failure
	) {
		forced = params.state.failure.components.sectionIds;
	}
	const components = sourceComponents(
		eligible,
		revision,
		params.cache,
		params.state,
		forced
	);
	if (
		params.kind === "retry" &&
		params.state?.sourceRevision === revision &&
		params.state.failure
	) {
		components.noteBrief = params.state.failure.components.noteBrief;
	}
	return { revision, components, sections, terminal: false };
}

class CapacityOneProviderScheduler {
	private tail: Promise<void> = Promise.resolve();

	run<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.tail.then(operation, operation);
		this.tail = result.then(() => undefined, () => undefined);
		return result;
	}
}

export class StudyMaterialMaintenance {
	private readonly providerScheduler = new CapacityOneProviderScheduler();
	private readonly active = new Map<string, ActiveRequest>();
	private readonly queued = new Map<string, QueuedRequest>();
	private readonly epochs = new Map<string, number>();
	private readonly timers = new Map<string, number>();

	constructor(private readonly deps: StudyMaterialMaintenanceDependencies) {}

	async observe(path: string): Promise<void> {
		const source = await this.deps.readSource(path);
		if (!source) return;
		const cache = this.deps.getCache(path);
		const existing = this.deps.getState(path);
		if (!cache && !existing && !this.deps.isAutomaticAllowed(path)) return;
		const plan = planStudyMaterialMaintenance({
			source,
			cache,
			state: existing,
			kind: "automatic",
		});
		if (plan.terminal) return;
		const base = existing ?? (cache
			? createCurrentMaintenanceState(source.noteTitle, source.markdown, cache)
			: createMissingMaintenanceState(source.noteTitle, source.markdown));
		const state = reduceMaintenanceState(base, {
			type: "source-observed",
			revision: plan.revision,
			affected: plan.components,
			hasEligibleSections: true,
		});
		const latest = await this.deps.readSource(path);
		if (!latest || noteSourceRevision(latest.noteTitle, latest.markdown) !== plan.revision) {
			return;
		}
		await this.deps.commit(path, cache, state);
	}

	scheduleAutomatic(
		path: string,
		delaySeconds: AutoGenerationSettleDelaySeconds
	): void {
		const timerApi = this.deps.timerApi;
		if (!timerApi) throw new Error("Automatic scheduling requires a timer API.");
		scheduleAutoGenerationTimer({
			timers: this.timers,
			key: path,
			delaySeconds,
			timerApi,
			shouldRun: () => this.deps.isAutomaticAllowed(path),
			onRun: () => void this.request({ path, kind: "automatic" }),
		});
	}

	async request(request: MaintenanceRequest): Promise<MaintenanceOutcome> {
		const source = await this.deps.readSource(request.path);
		if (!source) {
			return { status: "skipped", path: request.path, reason: "missing" };
		}
		if (request.kind === "automatic" && !this.deps.isAutomaticAllowed(request.path)) {
			return {
				status: "skipped",
				path: request.path,
				reason: "not-authorized",
			};
		}
		return this.queueKnown(request, source);
	}

	async rename(from: string, to: string): Promise<void> {
		this.invalidate(from);
		this.invalidate(to);
		if (this.deps.renamePath) {
			await this.deps.renamePath(from, to);
		} else {
			const cache = this.deps.getCache(from);
			const state = this.deps.getState(from);
			await this.deps.commit(to, cache, state);
			await this.deps.commit(from, null, null);
		}
		const transferred = this.deps.getState(to);
		if (transferred && hasMaintenanceComponents(transferred.updating)) {
			const recovered = reduceMaintenanceState(transferred, {
				type: "update-canceled",
				revision: transferred.sourceRevision,
				components: transferred.updating,
			});
			await this.deps.commit(to, this.deps.getCache(to), recovered);
		}
	}

	async delete(path: string): Promise<void> {
		this.invalidate(path);
		if (this.deps.deletePath) await this.deps.deletePath(path);
		else await this.deps.commit(path, null, null);
	}

	dispose(): void {
		for (const timer of this.timers.values()) {
			this.deps.timerApi?.clearTimeout(timer);
		}
		this.timers.clear();
		for (const path of new Set([...this.active.keys(), ...this.queued.keys()])) {
			this.invalidate(path);
		}
	}

	private epoch(path: string): number {
		return this.epochs.get(path) ?? 0;
	}

	private invalidate(path: string): void {
		this.epochs.set(path, this.epoch(path) + 1);
		const timer = this.timers.get(path);
		if (timer !== undefined) this.deps.timerApi?.clearTimeout(timer);
		this.timers.delete(path);
		const queued = this.queued.get(path);
		if (queued) {
			const outcome: MaintenanceOutcome = { status: "stale", path };
			queued.waiters.forEach((resolve) => resolve(outcome));
			this.queued.delete(path);
		}
	}

	private queueKnown(
		request: MaintenanceRequest,
		source: MaintenanceSource
	): Promise<MaintenanceOutcome> {
		const revision = noteSourceRevision(source.noteTitle, source.markdown);
		const components = this.componentsFor(request, source);
		const active = this.active.get(request.path);
		const remaining = active?.revision === revision
			? subtractComponents(components, active.components)
			: components;
		if (active?.revision === revision && !hasMaintenanceComponents(remaining)) {
			return active.promise;
		}
		if (active) {
			return new Promise((resolve) => {
				const existing = this.queued.get(request.path);
				if (existing?.source && noteSourceRevision(
					existing.source.noteTitle,
					existing.source.markdown
				) === revision) {
					existing.components = mergeComponents(existing.components, remaining);
					existing.request = {
						path: request.path,
						kind: preferredRequestKind(existing.request.kind, request.kind),
						sectionIds: existing.components.sectionIds,
					};
					existing.waiters.push(resolve);
					return;
				}
				const waiters = existing?.waiters ?? [];
				waiters.push(resolve);
				this.queued.set(request.path, {
					request: {
						...request,
						sectionIds: remaining.sectionIds,
					},
					source,
					epoch: this.epoch(request.path),
					components: remaining,
					waiters,
				});
			});
		}

		const promise = this.start({
			request,
			source,
			epoch: this.epoch(request.path),
			components,
			waiters: [],
		});
		this.active.set(request.path, { revision, components, promise });
		return promise;
	}

	private componentsFor(
		request: MaintenanceRequest,
		source: MaintenanceSource
	): ComponentSet {
		return planStudyMaterialMaintenance({
			source,
			cache: this.deps.getCache(request.path),
			state: this.deps.getState(request.path),
			kind: request.kind,
			sectionIds: request.sectionIds,
		}).components;
	}

	private start(item: QueuedRequest): Promise<MaintenanceOutcome> {
		const promise = this.providerScheduler
			.run(() => this.execute(item))
			.then(async (outcome) => {
				if (
					outcome.public.status === "stale" &&
					outcome.latestSource &&
					this.epoch(item.request.path) === item.epoch
				) {
					const queued = this.queued.get(item.request.path);
					const latestRevision = noteSourceRevision(
						outcome.latestSource.noteTitle,
						outcome.latestSource.markdown
					);
					if (!queued || noteSourceRevision(
						queued.source.noteTitle,
						queued.source.markdown
					) !== latestRevision) {
						const components = this.componentsFor(
							item.request,
							outcome.latestSource
						);
						this.queued.set(item.request.path, {
							request: item.request,
							source: outcome.latestSource,
							epoch: item.epoch,
							components,
							waiters: queued?.waiters ?? [],
						});
					}
				}
				return outcome.public;
			})
			.finally(() => {
				const current = this.active.get(item.request.path);
				if (current?.promise === promise) this.active.delete(item.request.path);
				const next = this.queued.get(item.request.path);
				if (!next || this.active.has(item.request.path)) return;
				this.queued.delete(item.request.path);
				const nextPromise = this.start(next);
				const nextRevision = noteSourceRevision(
					next.source.noteTitle,
					next.source.markdown
				);
				this.active.set(item.request.path, {
					revision: nextRevision,
					components: next.components,
					promise: nextPromise,
				});
				void nextPromise.then((outcome) => {
					next.waiters.forEach((resolve) => resolve(outcome));
				});
			});
		return promise;
	}

	private async execute(item: QueuedRequest): Promise<InternalOutcome> {
		const { request } = item;
		if (this.epoch(request.path) !== item.epoch) {
			return { public: { status: "stale", path: request.path } };
		}
		if (request.kind === "automatic" && !this.deps.isAutomaticAllowed(request.path)) {
			return {
				public: {
					status: "skipped",
					path: request.path,
					reason: "not-authorized",
				},
			};
		}
		const source = await this.deps.readSource(request.path);
		if (!source) {
			return {
				public: { status: "skipped", path: request.path, reason: "missing" },
			};
		}
		const requestedRevision = noteSourceRevision(
			item.source.noteTitle,
			item.source.markdown
		);
		const revision = noteSourceRevision(source.noteTitle, source.markdown);
		if (revision !== requestedRevision) {
			return {
				public: { status: "stale", path: request.path },
				latestSource: source,
			};
		}

		const cache = this.deps.getCache(request.path);
		const existingState = this.deps.getState(request.path);
		const plan = planStudyMaterialMaintenance({
			source,
			cache,
			state: existingState,
			kind: request.kind,
			sectionIds: request.sectionIds,
		});
		if (plan.terminal) {
			if (!await this.canCommit(item, plan.revision)) {
				return { public: { status: "stale", path: request.path } };
			}
			await this.deps.commit(request.path, null, null);
			await this.deps.onCommitted?.(request.path);
			return {
				public: {
					status: "completed",
					path: request.path,
					revision: plan.revision,
					components: plan.components,
					errors: [],
				},
			};
		}
		if (!hasMaintenanceComponents(plan.components)) {
			return {
				public: { status: "skipped", path: request.path, reason: "no-work" },
			};
		}

		const baseState = existingState ?? (cache
			? createCurrentMaintenanceState(source.noteTitle, source.markdown, cache)
			: createMissingMaintenanceState(source.noteTitle, source.markdown));
		let state = reduceMaintenanceState(baseState, {
			type: "source-observed",
			revision: plan.revision,
			affected: plan.components,
			hasEligibleSections: true,
		});
		state = reduceMaintenanceState(state, {
			type: "update-started",
			revision: plan.revision,
			components: plan.components,
		});
		if (!await this.canCommitSource(item, plan.revision)) {
			return { public: { status: "stale", path: request.path } };
		}
		if (request.kind === "automatic" && !this.deps.isAutomaticAllowed(request.path)) {
			return {
				public: {
					status: "skipped",
					path: request.path,
					reason: "not-authorized",
				},
			};
		}
		await this.deps.commit(request.path, cache, state);
		if (request.kind === "automatic" && !this.deps.isAutomaticAllowed(request.path)) {
			await this.cancelStartedUpdate(item, plan.revision, plan.components);
			return {
				public: {
					status: "skipped",
					path: request.path,
					reason: "not-authorized",
				},
			};
		}

		let provider: CueCraftCueProviderRuntime | null;
		try {
			provider = await this.deps.makeProvider(request.kind === "automatic");
		} catch (error) {
			return this.commitProviderFailure(
				item,
				source,
				cache,
				state,
				plan.components,
				error instanceof Error ? error.message : String(error)
			);
		}
		if (!provider) {
			return this.commitProviderFailure(
				item,
				source,
				cache,
				state,
				plan.components,
				"Provider is unavailable."
			);
		}

		const eligibleById = new Map(
			cueEligibleSections(plan.sections).map((section) => [section.id, section])
		);
		const targets = plan.components.sectionIds
			.map((id) => eligibleById.get(id))
			.filter((section): section is Section => Boolean(section));
		const generated: SectionResult[] = [];
		const concurrency = resolveEffectiveSectionConcurrency(
			this.deps.sectionConcurrency(),
			provider
		);
		for (let start = 0; start < targets.length; start += concurrency) {
			const results = await generateSectionCueBatch({
				sections: targets.slice(start, start + concurrency),
				provider,
				options: this.deps.generationOptions(),
				noteContext: source.markdown,
			});
			generated.push(...results);
		}

		const successful = generated.filter((result) => !result.error);
		const failed = generated.filter((result) => Boolean(result.error));
		const metadata = this.deps.providerMetadata();
		let nextCache = cache;
		if (!nextCache && successful.length) {
			nextCache = buildNoteCache({
				result: {
					sections: successful,
					noteBrief: null,
					canceled: false,
				},
				...metadata,
				noteModifiedAt: source.modifiedAt,
			});
		}
		if (nextCache) {
			nextCache = reconcileCacheSections(
				nextCache,
				plan.sections,
				successful,
				{ noteModifiedAt: source.modifiedAt }
			);
		}

		let briefError: string | null = null;
		let briefSucceeded = false;
		let canceled = false;
		if (plan.components.noteBrief) {
			const briefOutcome = await generateNoteBriefForSections({
				noteTitle: source.noteTitle,
				markdown: source.markdown,
				provider,
				sections: nextCache?.sections ?? [],
			});
			if (briefOutcome.status === "success" && nextCache) {
				nextCache = { ...nextCache, noteBrief: briefOutcome.noteBrief };
				briefSucceeded = true;
			} else if (briefOutcome.status === "failed") {
				briefError = briefOutcome.error;
			} else if (briefOutcome.status === "canceled") {
				canceled = true;
			}
		}

		const successfulComponents: ComponentSet = {
			noteBrief: briefSucceeded,
			sectionIds: successful.map((result) => result.id),
		};
		const failedComponents: ComponentSet = {
			noteBrief: briefError !== null,
			sectionIds: failed.map((result) => result.id),
		};
		const unresolvedComponents: ComponentSet = {
			noteBrief:
				plan.components.noteBrief &&
				!successfulComponents.noteBrief &&
				!failedComponents.noteBrief,
			sectionIds: plan.components.sectionIds.filter(
				(id) =>
					!successfulComponents.sectionIds.includes(id) &&
					!failedComponents.sectionIds.includes(id)
			),
		};
		const errors = [
			...componentErrorMessages(failed),
			...(briefError ? [briefError] : []),
		];

		if (!await this.canCommitSource(item, plan.revision)) {
			const latestSource = await this.deps.readSource(request.path);
			return {
				public: { status: "stale", path: request.path },
				latestSource: latestSource ?? undefined,
			};
		}
		if (request.kind === "automatic" && !this.deps.isAutomaticAllowed(request.path)) {
			await this.cancelStartedUpdate(item, plan.revision, plan.components);
			return {
				public: {
					status: "skipped",
					path: request.path,
					reason: "not-authorized",
				},
			};
		}
		const nextCacheRevision = nextCache ? cacheContentRevision(nextCache) : null;
		if (hasMaintenanceComponents(successfulComponents)) {
			state = reduceMaintenanceState(state, {
				type: "update-succeeded",
				revision: plan.revision,
				components: successfulComponents,
				cacheRevision: nextCacheRevision,
			});
		}
		if (hasMaintenanceComponents(failedComponents)) {
			state = reduceMaintenanceState(state, {
				type: "update-failed",
				revision: plan.revision,
				components: failedComponents,
				message: errors.join("; "),
			});
		}
		if (hasMaintenanceComponents(unresolvedComponents)) {
			state = reduceMaintenanceState(state, {
				type: "update-canceled",
				revision: plan.revision,
				components: unresolvedComponents,
			});
		}
		await this.deps.commit(request.path, nextCache, state);
		await this.deps.onCommitted?.(request.path);

		if (canceled) {
			return { public: { status: "canceled", path: request.path } };
		}
		return {
			public: {
				status: errors.length ? "failed" : "completed",
				path: request.path,
				revision: plan.revision,
				components: plan.components,
				errors,
			},
		};
	}

	private async commitProviderFailure(
		item: QueuedRequest,
		source: MaintenanceSource,
		cache: NoteCache | null,
		state: NoteMaintenanceState | null,
		components: ComponentSet,
		message: string
	): Promise<InternalOutcome> {
		const revision = noteSourceRevision(source.noteTitle, source.markdown);
		if (!await this.canCommit(item, revision)) {
			return { public: { status: "stale", path: item.request.path } };
		}
		const failed = reduceMaintenanceState(state, {
			type: "update-failed",
			revision,
			components,
			message,
		});
		await this.deps.commit(item.request.path, cache, failed);
		await this.deps.onCommitted?.(item.request.path);
		return {
			public: {
				status: "failed",
				path: item.request.path,
				revision,
				components,
				errors: [message],
			},
		};
	}

	private async canCommit(item: QueuedRequest, revision: string): Promise<boolean> {
		if (
			item.request.kind === "automatic" &&
			!this.deps.isAutomaticAllowed(item.request.path)
		) {
			return false;
		}
		return this.canCommitSource(item, revision);
	}

	private async canCommitSource(
		item: QueuedRequest,
		revision: string
	): Promise<boolean> {
		if (this.epoch(item.request.path) !== item.epoch) return false;
		const latest = await this.deps.readSource(item.request.path);
		return Boolean(
			latest &&
			latest.path === item.request.path &&
				noteSourceRevision(latest.noteTitle, latest.markdown) === revision
		);
	}

	private async cancelStartedUpdate(
		item: QueuedRequest,
		revision: string,
		components: ComponentSet
	): Promise<void> {
		if (!await this.canCommitSource(item, revision)) return;
		const current = this.deps.getState(item.request.path);
		if (!current || current.sourceRevision !== revision) return;
		const canceled = reduceMaintenanceState(current, {
			type: "update-canceled",
			revision,
			components,
		});
		await this.deps.commit(
			item.request.path,
			this.deps.getCache(item.request.path),
			canceled
		);
		await this.deps.onCommitted?.(item.request.path);
	}
}
