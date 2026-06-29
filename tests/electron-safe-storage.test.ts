import { describe, expect, it } from "vitest";
import type { DataAdapter } from "obsidian";
import {
	createObsidianCredentialFileAdapter,
	loadElectronSafeStorage,
} from "../src/electron-safe-storage";

function fakeDataAdapter(): DataAdapter & { files: Map<string, string> } {
	const files = new Map<string, string>();
	return {
		files,
		getName: () => "fake",
		exists: async (path) => files.has(path),
		stat: async () => null,
		list: async () => ({ files: [], folders: [] }),
		read: async (path) => {
			const value = files.get(path);
			if (value === undefined) throw new Error("missing");
			return value;
		},
		readBinary: async () => new ArrayBuffer(0),
		write: async (path, data) => {
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
	} as unknown as DataAdapter & { files: Map<string, string> };
}

describe("loadElectronSafeStorage", () => {
	it("returns null when Electron is not available in the test runtime", () => {
		expect(loadElectronSafeStorage()).toBeNull();
	});
});

describe("createObsidianCredentialFileAdapter", () => {
	it("reads null before the file exists and then round-trips contents", async () => {
		const adapter = fakeDataAdapter();
		const file = createObsidianCredentialFileAdapter(
			adapter,
			".obsidian/plugins/cuecraft/credentials.json"
		);

		await expect(file.read()).resolves.toBeNull();
		await file.write("{\"version\":1}");
		await expect(file.read()).resolves.toBe("{\"version\":1}");
	});
});
