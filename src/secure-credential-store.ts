import {
	BYOK_PROVIDER_IDS,
	type ByokProviderConfig,
	type ByokProviderId,
} from "@swartzrock/byok-runtime";
import { byokProviderDefinition } from "./byok-provider-metadata";

export type FirstRecallCloudCredentialProvider = Extract<
	ByokProviderConfig,
	{ apiKey: string }
>["provider"];

export interface SecretStorageAdapter {
	setSecret(id: string, secret: string): void;
	getSecret(id: string): string | null;
	listSecrets?(): string[];
}

export type CredentialStoreUnavailableReason =
	| "secret-storage-unavailable"
	| "missing-credential"
	| "invalid-secret"
	| "read-failed"
	| "write-failed";

export interface CredentialStoreAvailability {
	ok: boolean;
	reason?: CredentialStoreUnavailableReason;
	message?: string;
}

export interface StoredCredentialMetadata {
	saved: boolean;
	token: string;
	length: number;
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
		provider: FirstRecallCloudCredentialProvider
	): Promise<CredentialStoreReadResult>;
	read(
		provider: FirstRecallCloudCredentialProvider
	): Promise<CredentialStoreReadResult>;
	save(
		provider: FirstRecallCloudCredentialProvider,
		value: string
	): Promise<CredentialStoreWriteResult>;
	clear(
		provider: FirstRecallCloudCredentialProvider
	): Promise<CredentialStoreWriteResult>;
}

interface StoredCredentialPayload {
	version: 1;
	value: string;
	updatedAt: string;
}

type StoredCredentialPayloadResult =
	| { ok: true; payload: StoredCredentialPayload }
	| CredentialStoreReadResult;

export const FIRSTRECALL_SECRET_STORAGE_MIN_APP_VERSION = "1.11.4";

export const FIRSTRECALL_CLOUD_CREDENTIAL_PROVIDERS: readonly FirstRecallCloudCredentialProvider[] =
	(BYOK_PROVIDER_IDS as readonly ByokProviderId[]).filter(
		(provider): provider is FirstRecallCloudCredentialProvider =>
			byokProviderDefinition(provider).credentialKind === "api-key"
	);

export function isFirstRecallCloudCredentialProvider(
	provider: ByokProviderId
): provider is FirstRecallCloudCredentialProvider {
	return (FIRSTRECALL_CLOUD_CREDENTIAL_PROVIDERS as readonly string[]).includes(
		provider
	);
}

export function firstRecallCredentialSecretId(
	provider: FirstRecallCloudCredentialProvider
): string {
	return `firstrecall-${provider}-api-key`;
}

export function createSecureCredentialStore(opts: {
	secretStorage: SecretStorageAdapter | null | undefined;
	now?: () => Date;
}): SecureCredentialStore {
	const now = opts.now ?? (() => new Date());
	let reportedUnavailable = false;

	function availability(): CredentialStoreAvailability {
		if (!isUsableSecretStorage(opts.secretStorage)) {
			reportUnavailableOnce("secret-storage-unavailable");
			return {
				ok: false,
				reason: "secret-storage-unavailable",
				message: `Obsidian secret storage is unavailable. Update Obsidian to ${FIRSTRECALL_SECRET_STORAGE_MIN_APP_VERSION} or newer.`,
			};
		}
		return { ok: true };
	}

	function reportUnavailableOnce(reason: CredentialStoreUnavailableReason): void {
		if (reportedUnavailable) return;
		reportedUnavailable = true;
		const secretStorage = opts.secretStorage;
		console.warn("FirstRecall secure storage unavailable.", {
			reason,
			hasSecretStorage: Boolean(secretStorage),
			hasGetSecret: typeof secretStorage?.getSecret === "function",
			hasSetSecret: typeof secretStorage?.setSecret === "function",
			hasListSecrets: typeof secretStorage?.listSecrets === "function",
			minimumObsidianVersion: FIRSTRECALL_SECRET_STORAGE_MIN_APP_VERSION,
		});
	}

	function readPayload(
		provider: FirstRecallCloudCredentialProvider
	): StoredCredentialPayloadResult {
		const available = availability();
		if (!available.ok) return available;
		const secretStorage = opts.secretStorage;
		if (!isUsableSecretStorage(secretStorage)) return availability();
		let raw: string | null;
		try {
			raw = secretStorage.getSecret(firstRecallCredentialSecretId(provider));
		} catch (error) {
			return failure("read-failed", error);
		}
		if (!raw) {
			return {
				ok: false,
				reason: "missing-credential",
				message: "No saved credential.",
			};
		}
		try {
			const parsed = JSON.parse(raw) as Partial<StoredCredentialPayload>;
			if (
				parsed.version !== 1 ||
				typeof parsed.value !== "string" ||
				typeof parsed.updatedAt !== "string"
			) {
				return {
					ok: false,
					reason: "invalid-secret",
					message: "FirstRecall credential has an unsupported format.",
				};
			}
			if (!parsed.value) {
				return {
					ok: false,
					reason: "missing-credential",
					message: "No saved credential.",
				};
			}
			return {
				ok: true,
				payload: {
					version: 1,
					value: parsed.value,
					updatedAt: parsed.updatedAt,
				},
			};
		} catch (error) {
			return failure("invalid-secret", error);
		}
	}

	async function metadata(
		provider: FirstRecallCloudCredentialProvider
	): Promise<CredentialStoreReadResult> {
		const result = readPayload(provider);
		if (!("payload" in result)) return result;
		return {
			ok: true,
			metadata: {
				saved: true,
				token: result.payload.updatedAt,
				length: result.payload.value.length,
			},
		};
	}

	async function read(
		provider: FirstRecallCloudCredentialProvider
	): Promise<CredentialStoreReadResult> {
		const result = readPayload(provider);
		if (!("payload" in result)) return result;
		return {
			ok: true,
			value: result.payload.value,
			metadata: {
				saved: true,
				token: result.payload.updatedAt,
				length: result.payload.value.length,
			},
		};
	}

	async function save(
		provider: FirstRecallCloudCredentialProvider,
		value: string
	): Promise<CredentialStoreWriteResult> {
		const available = availability();
		if (!available.ok) return available;
		const secretStorage = opts.secretStorage;
		if (!isUsableSecretStorage(secretStorage)) return availability();
		const token = now().toISOString();
		try {
			secretStorage.setSecret(
				firstRecallCredentialSecretId(provider),
				JSON.stringify({
					version: 1,
					value,
					updatedAt: token,
				} satisfies StoredCredentialPayload)
			);
			return {
				ok: true,
				metadata: { saved: true, token, length: value.length },
			};
		} catch (error) {
			return failure("write-failed", error);
		}
	}

	async function clear(
		provider: FirstRecallCloudCredentialProvider
	): Promise<CredentialStoreWriteResult> {
		const available = availability();
		if (!available.ok) return available;
		const secretStorage = opts.secretStorage;
		if (!isUsableSecretStorage(secretStorage)) return availability();
		try {
			secretStorage.setSecret(
				firstRecallCredentialSecretId(provider),
				JSON.stringify({
					version: 1,
					value: "",
					updatedAt: now().toISOString(),
				} satisfies StoredCredentialPayload)
			);
			return { ok: true, metadata: { saved: false, token: "", length: 0 } };
		} catch (error) {
			return failure("write-failed", error);
		}
	}

	return { availability, metadata, read, save, clear };
}

function isUsableSecretStorage(
	secretStorage: SecretStorageAdapter | null | undefined
): secretStorage is SecretStorageAdapter {
	return (
		typeof secretStorage?.getSecret === "function" &&
		typeof secretStorage.setSecret === "function"
	);
}

function failure(
	reason: CredentialStoreUnavailableReason,
	error: unknown
): CredentialStoreReadResult & CredentialStoreWriteResult {
	const message = error instanceof Error ? error.message : String(error);
	return { ok: false, reason, message };
}
