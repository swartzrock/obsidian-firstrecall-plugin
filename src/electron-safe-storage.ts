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
		if (typeof require !== "function") {
			console.warn("CueCraft secure storage: Electron require bridge is unavailable.", {
				typeofRequire: typeof require,
			});
			return null;
		}
		// Obsidian exposes Electron through CommonJS in the plugin runtime.
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const electron = require("electron") as ElectronLike & Record<string, unknown>;
		if (!electron.safeStorage) {
			console.warn("CueCraft secure storage: electron.safeStorage is unavailable.", {
				electronKeys: Object.keys(electron).sort(),
			});
			return null;
		}
		return electron.safeStorage;
	} catch (error) {
		console.warn(
			"CueCraft secure storage: require(\"electron\") failed.",
			errorDetails(error)
		);
		return null;
	}
}

function errorDetails(error: unknown): Record<string, string> {
	return error instanceof Error
		? {
			name: error.name,
			message: error.message,
			stack: error.stack ?? "",
		}
		: { message: String(error) };
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
