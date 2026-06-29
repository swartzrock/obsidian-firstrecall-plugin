import type { DataAdapter } from "obsidian";
import type {
	CredentialFileAdapter,
	SafeStorageAdapter,
} from "./secure-credential-store";

type ElectronLike = {
	safeStorage?: SafeStorageAdapter;
};

export function loadElectronSafeStorage(): SafeStorageAdapter | null {
	try {
		const requireElectron = Function("return require")() as (
			id: string
		) => ElectronLike;
		return requireElectron("electron").safeStorage ?? null;
	} catch {
		return null;
	}
}

export function createObsidianCredentialFileAdapter(
	adapter: DataAdapter,
	path: string
): CredentialFileAdapter {
	const normalizedPath = normalizeVaultPath(path);
	return {
		async read(): Promise<string | null> {
			return (await adapter.exists(normalizedPath))
				? adapter.read(normalizedPath)
				: null;
		},
		async write(contents: string): Promise<void> {
			await adapter.write(normalizedPath, contents);
		},
	};
}

function normalizeVaultPath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "");
}
