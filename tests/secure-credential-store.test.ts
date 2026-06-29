import { describe, expect, it } from "vitest";
import {
	createSecureCredentialStore,
	type CredentialFileAdapter,
	type SafeStorageAdapter,
} from "../src/secure-credential-store";

function memoryFile(initial: string | null = null): CredentialFileAdapter & {
	get value(): string | null;
	failRead?: Error;
	failWrite?: Error;
} {
	let value = initial;
	return {
		get value() {
			return value;
		},
		async read() {
			if (this.failRead) throw this.failRead;
			return value;
		},
		async write(contents) {
			if (this.failWrite) throw this.failWrite;
			value = contents;
		},
	};
}

function fakeSafeStorage(overrides: Partial<SafeStorageAdapter> = {}): SafeStorageAdapter {
	return {
		isEncryptionAvailable: () => true,
		getSelectedStorageBackend: () => "os_crypt",
		encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
		decryptString: (encrypted) =>
			encrypted.toString("utf8").replace(/^encrypted:/, ""),
		...overrides,
	};
}

describe("createSecureCredentialStore", () => {
	it("encrypts saved credentials and decrypts them on read", async () => {
		const file = memoryFile();
		const store = createSecureCredentialStore({
			safeStorage: fakeSafeStorage(),
			file,
			now: () => new Date("2026-06-29T12:00:00.000Z"),
		});

		await expect(store.save("openai", "sk-openai-test")).resolves.toEqual({
			ok: true,
			metadata: {
				saved: true,
				token: "2026-06-29T12:00:00.000Z",
			},
		});

		expect(file.value).not.toContain("sk-openai-test");
		await expect(store.read("openai")).resolves.toMatchObject({
			ok: true,
			value: "sk-openai-test",
			metadata: {
				saved: true,
				token: "2026-06-29T12:00:00.000Z",
			},
		});
	});

	it("removes only the cleared provider entry", async () => {
		const file = memoryFile();
		const store = createSecureCredentialStore({
			safeStorage: fakeSafeStorage(),
			file,
			now: () => new Date("2026-06-29T12:00:00.000Z"),
		});

		await store.save("openai", "sk-openai-test");
		await store.save("openrouter", "sk-or-test");
		await expect(store.clear("openai")).resolves.toEqual({
			ok: true,
			metadata: { saved: false, token: "" },
		});

		await expect(store.read("openai")).resolves.toMatchObject({
			ok: false,
			reason: "missing-credential",
		});
		await expect(store.read("openrouter")).resolves.toMatchObject({
			ok: true,
			value: "sk-or-test",
		});
	});

	it("refuses to write when safeStorage is unavailable", async () => {
		const file = memoryFile();
		const store = createSecureCredentialStore({
			safeStorage: fakeSafeStorage({
				isEncryptionAvailable: () => false,
			}),
			file,
		});

		await expect(store.save("openai", "sk-openai-test")).resolves.toMatchObject({
			ok: false,
			reason: "safe-storage-unavailable",
		});
		expect(file.value).toBeNull();
	});

	it("refuses Electron basic_text backend", async () => {
		const file = memoryFile();
		const store = createSecureCredentialStore({
			safeStorage: fakeSafeStorage({
				getSelectedStorageBackend: () => "basic_text",
			}),
			file,
		});

		await expect(store.save("openai", "sk-openai-test")).resolves.toMatchObject({
			ok: false,
			reason: "basic-text",
		});
		expect(file.value).toBeNull();
	});

	it("fails closed for corrupt credential files", async () => {
		const store = createSecureCredentialStore({
			safeStorage: fakeSafeStorage(),
			file: memoryFile("{ nope"),
		});

		await expect(store.read("openai")).resolves.toMatchObject({
			ok: false,
			reason: "invalid-file",
		});
	});

	it("preserves an existing file value when a write fails", async () => {
		const file = memoryFile();
		const store = createSecureCredentialStore({
			safeStorage: fakeSafeStorage(),
			file,
		});
		await store.save("openai", "old-key");
		const before = file.value;
		file.failWrite = new Error("disk full");

		await expect(store.save("openai", "new-key")).resolves.toMatchObject({
			ok: false,
			reason: "write-failed",
		});
		expect(file.value).toBe(before);
	});
});
