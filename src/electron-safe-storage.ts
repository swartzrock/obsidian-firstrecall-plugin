import type { DataAdapter } from "obsidian";
import type {
	CredentialFileAdapter,
	SafeStorageAdapter,
} from "./secure-credential-store";

type ElectronLike = {
	safeStorage?: SafeStorageAdapter;
};

export async function loadElectronSafeStorage(): Promise<SafeStorageAdapter | null> {
	try {
		if (typeof require !== "function") return null;
		// Obsidian exposes Electron through CommonJS in the plugin runtime.
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const electron = require("electron") as ElectronLike;
		return electron.safeStorage ?? null;
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
