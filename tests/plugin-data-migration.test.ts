import { describe, expect, it, vi } from "vitest";
import CueCraftPlugin from "../src/main";
import { CACHE_SCHEMA_VERSION, migrateCache } from "../src/cache";
import type { SecureCredentialStore } from "../src/secure-credential-store";

function richV5Cache() {
	return {
		schemaVersion: 5,
		generatedAt: "2026-08-01T12:00:00.000Z",
		noteModifiedAt: 1234,
		provider: "openai",
		model: "gpt-5-mini",
		generationMode: "whole-note-context",
		preset: "exam-prep",
		outline: {
			learningObjective: "Explain how retrieval strengthens memory.",
			keyThemes: ["retrieval", "memory"],
		},
		sections: [
			{
				id: "retrieval-practice",
				heading: "Retrieval Practice",
				level: 2,
				lineNumber: 7,
				contentHash: "abc123",
				keywords: ["retrieval", "testing effect"],
				question: "Why does retrieval practice strengthen memory?",
				confidence: "high",
				category: "sequences",
				rationale: "The section states the causal relationship directly.",
				sectionLens: {
					takeaway: "Practice recalling an idea instead of rereading it.",
					keyPhrase: "retrieval practice",
					explanation: "Active recall makes the memory easier to access later.",
				},
				error: null,
			},
		],
		summary: "Retrieval practice improves later access to learned material.",
		noteBrief: {
			overview: "Retrieval strengthens memory. Repeated recall improves access.",
			whatMatters: {
				title: "Recall beats rereading",
				detail: "Effortful retrieval produces more durable learning.",
			},
			reviewFirst: {
				title: "Retrieval practice",
				detail: "Start with the mechanism that strengthens recall.",
			},
			sayItBack: {
				title: "Why does retrieval strengthen memory?",
				detail: "Explain the testing effect without looking at the note.",
			},
		},
	};
}

function unavailableCredentialStore(): SecureCredentialStore {
	const missing = async () => ({
		ok: false as const,
		reason: "missing-credential" as const,
	});
	return {
		availability: () => ({ ok: true }),
		metadata: missing,
		read: missing,
		save: missing,
		clear: missing,
	};
}

describe("plugin data cache migration", () => {
	it("persists a category-free v6 cache without discarding an invalid cache entry", async () => {
		const v5 = richV5Cache();
		const invalid = { schemaVersion: 99, sections: ["unknown"] };
		const loaded = {
			settings: {},
			caches: {
				"notes/retrieval.md": v5,
				"notes/unrecognized.md": invalid,
			},
			hidden: { "notes/hidden.md": true },
		};
		const saveData = vi.fn(async () => {});
		const plugin = new CueCraftPlugin({} as never, {} as never);
		Object.assign(plugin as unknown as Record<string, unknown>, {
			credentialStore: unavailableCredentialStore(),
			loadData: vi.fn(async () => loaded),
			saveData,
		});

		await (
			plugin as unknown as { loadPluginData(): Promise<void> }
		).loadPluginData();

		expect(saveData).toHaveBeenCalledTimes(1);
		const persisted = saveData.mock.calls[0][0] as typeof loaded;
		expect(persisted.caches["notes/retrieval.md"]).toEqual(migrateCache(v5));
		expect(persisted.caches["notes/retrieval.md"].schemaVersion).toBe(
			CACHE_SCHEMA_VERSION
		);
		expect(persisted.caches["notes/retrieval.md"].sections[0]).not.toHaveProperty(
			"category"
		);
		expect(persisted.caches["notes/unrecognized.md"]).toEqual(invalid);
		expect(persisted.hidden).toEqual(loaded.hidden);
	});
});
