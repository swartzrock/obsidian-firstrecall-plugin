import type { CueCraftSettings } from "../settings";
import {
	cueCraftProviderConfigFromSettings,
	makeCueCraftByokProvider,
	type ByokProviderConfig,
	type ByokProviderDeps,
} from "../byok-cuecraft-adapter";
import type { AiProvider, HttpClient } from "./types";

export interface ProviderFactoryDeps extends ByokProviderDeps {
	fetchImpl: typeof fetch;
	http: HttpClient;
}

export function providerConfigFromSettings(
	settings: CueCraftSettings
): ByokProviderConfig {
	return cueCraftProviderConfigFromSettings(settings);
}

export function makeProviderFromSettings(
	settings: CueCraftSettings,
	deps: ProviderFactoryDeps
): AiProvider {
	return makeCueCraftByokProvider(settings, deps) as AiProvider;
}
