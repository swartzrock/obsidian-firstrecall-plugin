import { describe, expect, it } from "vitest";
import type { DataAdapter } from "obsidian";
import {
	createObsidianCredentialFileAdapter,
	loadElectronSafeStorage,
} from "../src/electron-safe-storage";

type FakeDataAdapter = DataAdapter & { files: Map<string, string> };

function fakeDataAdapter(): FakeDataAdapter {
	const files = new Map<string, string>();
	return {
		files,
		getName: () => "fake",
		exists: async (path: string) => files.has(path),
		stat: async () => null,
		list: async () => ({ files: [], folders: [] }),
		read: async (path: string) => {
			const value = files.get(path);
			if (value === undefined) throw new Error("missing");
			return value;
		},
		readBinary: async () => new ArrayBuffer(0),
		write: async (path: string, data: string) => {
			files.set(path, data);
		},
		writeBinary: async () => undefined,
		append: async () => undefined,
		process: async () => "",
		getResourcePath: () => "",
		mkdir: async () => undefined,
		trashSystem: async () => true,
		trashLocal: async () => undefined,
		rmdir: async () => undefined,
		remove: async () => undefined,
		rename: async () => undefined,
		copy: async () => undefined,
	} as FakeDataAdapter;
}

describe("loadElectronSafeStorage", () => {
	it("returns null when Electron is not available in the test runtime", async () => {
		await expect(loadElectronSafeStorage()).resolves.toBeNull();
	});
});

describe("createObsidianCredentialFileAdapter", () => {
	it("reads null before the file exists and then round-trips contents", async () => {
		const adapter = fakeDataAdapter();
		const file = createObsidianCredentialFileAdapter(
			adapter,
			"vault-config/plugins/cuecraft/credentials.json"
		);

		await expect(file.read()).resolves.toBeNull();
		await file.write("{\"version\":1}");
		await expect(file.read()).resolves.toBe("{\"version\":1}");
	});
});
