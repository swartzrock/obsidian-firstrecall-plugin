import type { ByokProviderId } from "./byok";

export type CueCraftCloudCredentialProvider = Extract<
	ByokProviderId,
	"anthropic" | "openai" | "google" | "xai" | "openrouter"
>;

export interface SafeStorageAdapter {
	isEncryptionAvailable(): boolean;
	getSelectedStorageBackend?(): string;
	encryptString(value: string): Buffer;
	decryptString(encrypted: Buffer): string;
	isAsyncEncryptionAvailable?(): boolean;
	encryptStringAsync?(value: string): Promise<Buffer>;
	decryptStringAsync?(
		encrypted: Buffer
	): Promise<string | { plaintext: string; shouldReEncrypt?: boolean }>;
}

export interface CredentialFileAdapter {
	read(): Promise<string | null>;
	write(contents: string): Promise<void>;
}

export type CredentialStoreUnavailableReason =
	| "safe-storage-unavailable"
	| "basic-text"
	| "missing-credential"
	| "invalid-file"
	| "read-failed"
	| "write-failed"
	| "decrypt-failed";

export interface CredentialStoreAvailability {
	ok: boolean;
	reason?: CredentialStoreUnavailableReason;
	message?: string;
}

export interface StoredCredentialMetadata {
	saved: boolean;
	token: string;
}

export interface CredentialStoreReadResult {
	ok: boolean;
	value?: string;
	metadata?: StoredCredentialMetadata;
	reason?: CredentialStoreUnavailableReason;
	message?: string;
}

export interface CredentialStoreWriteResult {
	ok: boolean;
	metadata?: StoredCredentialMetadata;
	reason?: CredentialStoreUnavailableReason;
	message?: string;
}

export interface SecureCredentialStore {
	availability(): CredentialStoreAvailability;
	metadata(
		provider: CueCraftCloudCredentialProvider
	): Promise<CredentialStoreReadResult>;
	read(
		provider: CueCraftCloudCredentialProvider
	): Promise<CredentialStoreReadResult>;
	save(
		provider: CueCraftCloudCredentialProvider,
		value: string
	): Promise<CredentialStoreWriteResult>;
	clear(
		provider: CueCraftCloudCredentialProvider
	): Promise<CredentialStoreWriteResult>;
}

interface CredentialFileEntry {
	ciphertext: string;
	updatedAt: string;
}

interface CredentialFileContents {
	version: 1;
	providers: Partial<Record<CueCraftCloudCredentialProvider, CredentialFileEntry>>;
}

export const CUECRAFT_CLOUD_CREDENTIAL_PROVIDERS: readonly CueCraftCloudCredentialProvider[] =
	["anthropic", "openai", "google", "xai", "openrouter"] as const;

const EMPTY_CREDENTIAL_FILE: CredentialFileContents = {
	version: 1,
	providers: {},
};

export function isCueCraftCloudCredentialProvider(
	provider: ByokProviderId
): provider is CueCraftCloudCredentialProvider {
	return (CUECRAFT_CLOUD_CREDENTIAL_PROVIDERS as readonly string[]).includes(
		provider
	);
}

export function createSecureCredentialStore(opts: {
	safeStorage: SafeStorageAdapter | null;
	file: CredentialFileAdapter;
	now?: () => Date;
}): SecureCredentialStore {
	const now = opts.now ?? (() => new Date());

	function availability(): CredentialStoreAvailability {
		const safeStorage = opts.safeStorage;
		if (!safeStorage?.isEncryptionAvailable()) {
			return {
				ok: false,
				reason: "safe-storage-unavailable",
				message: "Secure credential storage is unavailable.",
			};
		}
		if (safeStorage.getSelectedStorageBackend?.() === "basic_text") {
			return {
				ok: false,
				reason: "basic-text",
				message: "Secure credential storage is using Electron basic_text.",
			};
		}
		return { ok: true };
	}

	async function readFile(): Promise<CredentialFileContents | CredentialStoreReadResult> {
		let raw: string | null;
		try {
			raw = await opts.file.read();
		} catch (error) {
			return failure("read-failed", error);
		}
		if (!raw) return { ...EMPTY_CREDENTIAL_FILE, providers: {} };
		try {
			const parsed = JSON.parse(raw) as Partial<CredentialFileContents>;
			if (parsed.version !== 1 || !parsed.providers || typeof parsed.providers !== "object") {
				return {
					ok: false,
					reason: "invalid-file",
					message: "CueCraft credentials file has an unsupported format.",
				};
			}
			return {
				version: 1,
				providers: { ...parsed.providers },
			};
		} catch (error) {
			return failure("invalid-file", error);
		}
	}

	async function writeFile(contents: CredentialFileContents): Promise<CredentialStoreWriteResult | null> {
		try {
			await opts.file.write(JSON.stringify(contents, null, 2));
			return null;
		} catch (error) {
			return failure("write-failed", error);
		}
	}

	async function encrypt(value: string): Promise<Buffer> {
		const safeStorage = opts.safeStorage;
		if (!safeStorage) throw new Error("safeStorage is unavailable.");
		if (
			safeStorage.isAsyncEncryptionAvailable?.() &&
			safeStorage.encryptStringAsync
		) {
			return safeStorage.encryptStringAsync(value);
		}
		return safeStorage.encryptString(value);
	}

	async function decrypt(encrypted: Buffer): Promise<{
		value: string;
		shouldReEncrypt: boolean;
	}> {
		const safeStorage = opts.safeStorage;
		if (!safeStorage) throw new Error("safeStorage is unavailable.");
		if (
			safeStorage.isAsyncEncryptionAvailable?.() &&
			safeStorage.decryptStringAsync
		) {
			const result = await safeStorage.decryptStringAsync(encrypted);
			return typeof result === "string"
				? { value: result, shouldReEncrypt: false }
				: {
					value: result.plaintext,
					shouldReEncrypt: Boolean(result.shouldReEncrypt),
				};
		}
		return {
			value: safeStorage.decryptString(encrypted),
			shouldReEncrypt: false,
		};
	}

	async function metadata(
		provider: CueCraftCloudCredentialProvider
	): Promise<CredentialStoreReadResult> {
		const available = availability();
		if (!available.ok) return available;
		const file = await readFile();
		if (isCredentialFailure(file)) return file;
		const entry = file.providers[provider];
		if (!entry) {
			return {
				ok: false,
				reason: "missing-credential",
				message: "No saved credential.",
			};
		}
		return {
			ok: true,
			metadata: { saved: true, token: entry.updatedAt },
		};
	}

	async function read(
		provider: CueCraftCloudCredentialProvider
	): Promise<CredentialStoreReadResult> {
		const available = availability();
		if (!available.ok) return available;
		const file = await readFile();
		if (isCredentialFailure(file)) return file;
		const entry = file.providers[provider];
		if (!entry) {
			return {
				ok: false,
				reason: "missing-credential",
				message: "No saved credential.",
			};
		}
		try {
			const encrypted = Buffer.from(entry.ciphertext, "base64");
			const result = await decrypt(encrypted);
			if (result.shouldReEncrypt) {
				const reencrypted = await encrypt(result.value);
				file.providers[provider] = {
					ciphertext: reencrypted.toString("base64"),
					updatedAt: entry.updatedAt,
				};
				await writeFile(file);
			}
			return {
				ok: true,
				value: result.value,
				metadata: { saved: true, token: entry.updatedAt },
			};
		} catch (error) {
			return failure("decrypt-failed", error);
		}
	}

	async function save(
		provider: CueCraftCloudCredentialProvider,
		value: string
	): Promise<CredentialStoreWriteResult> {
		const available = availability();
		if (!available.ok) return available;
		const file = await readFile();
		if (isCredentialFailure(file)) return file;
		try {
			const token = now().toISOString();
			const encrypted = await encrypt(value);
			file.providers[provider] = {
				ciphertext: encrypted.toString("base64"),
				updatedAt: token,
			};
			const writeFailure = await writeFile(file);
			if (writeFailure) return writeFailure;
			return {
				ok: true,
				metadata: { saved: true, token },
			};
		} catch (error) {
			return failure("write-failed", error);
		}
	}

	async function clear(
		provider: CueCraftCloudCredentialProvider
	): Promise<CredentialStoreWriteResult> {
		const available = availability();
		if (!available.ok) return available;
		const file = await readFile();
		if (isCredentialFailure(file)) return file;
		delete file.providers[provider];
		const writeFailure = await writeFile(file);
		if (writeFailure) return writeFailure;
		return { ok: true, metadata: { saved: false, token: "" } };
	}

	return { availability, metadata, read, save, clear };
}

function failure(
	reason: CredentialStoreUnavailableReason,
	error: unknown
): CredentialStoreReadResult & CredentialStoreWriteResult {
	const message = error instanceof Error ? error.message : String(error);
	return { ok: false, reason, message };
}

function isCredentialFailure(
	value: CredentialFileContents | CredentialStoreReadResult
): value is CredentialStoreReadResult {
	return "ok" in value && !value.ok;
}
