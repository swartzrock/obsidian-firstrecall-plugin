declare module "electron" {
	export const safeStorage:
		| import("./secure-credential-store").SafeStorageAdapter
		| undefined;
}
