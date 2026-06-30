import { describe, expect, it, vi } from "vitest";
import {
	createSecureCredentialStore,
	cueCraftCredentialSecretId,
	type SecretStorageAdapter,
} from "../src/secure-credential-store";

function memorySecretStorage(initial: Record<string, string> = {}): SecretStorageAdapter & {
	readonly secrets: Record<string, string>;
	failGet?: Error;
	failSet?: Error;
} {
	const secrets = { ...initial };
	return {
		get secrets() {
			return secrets;
		},
		getSecret(id) {
			if (this.failGet) throw this.failGet;
			return secrets[id] ?? null;
		},
		setSecret(id, secret) {
			if (this.failSet) throw this.failSet;
			secrets[id] = secret;
		},
		listSecrets() {
			return Object.keys(secrets);
		},
	};
}

describe("createSecureCredentialStore", () => {
	it("saves credentials to Obsidian secret storage and reads them back", async () => {
		const secretStorage = memorySecretStorage();
		const store = createSecureCredentialStore({
			secretStorage,
			now: () => new Date("2026-06-29T12:00:00.000Z"),
		});

		await expect(store.save("openai", "sk-openai-test")).resolves.toEqual({
			ok: true,
			metadata: {
				saved: true,
				token: "2026-06-29T12:00:00.000Z",
			},
		});

		expect(Object.keys(secretStorage.secrets)).toEqual([
			"cuecraft-openai-api-key",
		]);
		await expect(store.read("openai")).resolves.toMatchObject({
			ok: true,
			value: "sk-openai-test",
			metadata: {
				saved: true,
				token: "2026-06-29T12:00:00.000Z",
			},
		});
	});

	it("overwrites only the cleared provider entry with an empty secret", async () => {
		const secretStorage = memorySecretStorage();
		const store = createSecureCredentialStore({
			secretStorage,
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

	it("refuses to write when Obsidian secret storage is unavailable", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const store = createSecureCredentialStore({ secretStorage: null });

		await expect(store.save("openai", "sk-openai-test")).resolves.toMatchObject({
			ok: false,
			reason: "secret-storage-unavailable",
		});
		expect(warn).toHaveBeenCalledWith(
			"CueCraft secure storage unavailable.",
			expect.objectContaining({
				reason: "secret-storage-unavailable",
				hasSecretStorage: false,
				hasGetSecret: false,
				hasSetSecret: false,
			})
		);
		warn.mockRestore();
	});

	it("fails closed for corrupt secret values", async () => {
		const store = createSecureCredentialStore({
			secretStorage: memorySecretStorage({
				[cueCraftCredentialSecretId("openai")]: "{ nope",
			}),
		});

		await expect(store.read("openai")).resolves.toMatchObject({
			ok: false,
			reason: "invalid-secret",
		});
	});

	it("preserves an existing secret value when a write fails", async () => {
		const secretStorage = memorySecretStorage();
		const store = createSecureCredentialStore({ secretStorage });
		await store.save("openai", "old-key");
		const before = secretStorage.secrets[cueCraftCredentialSecretId("openai")];
		secretStorage.failSet = new Error("secret service unavailable");

		await expect(store.save("openai", "new-key")).resolves.toMatchObject({
			ok: false,
			reason: "write-failed",
		});
		expect(secretStorage.secrets[cueCraftCredentialSecretId("openai")]).toBe(
			before
		);
	});
});
