import { describe, expect, it } from "vitest";
import type {
	ByokProviderId,
	ByokProviderStoredSettings,
} from "@swartzrock/byok-runtime";
import { DEFAULT_SETTINGS, type FirstRecallSettings } from "../src/settings";
import {
	makeFirstRecallByokProvider,
	firstRecallProviderConfigFromSettings,
	type FirstRecallTransport,
} from "../src/byok-firstrecall-adapter";

function settings(
	provider: ByokProviderId = "ollama",
	overrides: Partial<ByokProviderStoredSettings> = {}
): FirstRecallSettings {
	const current = structuredClone(DEFAULT_SETTINGS);
	current.byok.selectedProvider = provider;
	current.byok.providers[provider] = {
		credential: "",
		credentialSaved: false,
		credentialUpdatedAt: "",
		credentialLength: 0,
		model: "",
		modelSelection: "",
		availableModels: [],
		modelOptions: [],
		hasFetchedModels: false,
		modelRefreshMessage: "",
		...current.byok.providers[provider],
		...overrides,
	};
	return current;
}

const transport: FirstRecallTransport = async () => new Response("{}");

describe("makeFirstRecallByokProvider", () => {
	it("requires the user to select a provider", () => {
		expect(() =>
			firstRecallProviderConfigFromSettings(structuredClone(DEFAULT_SETTINGS))
		).toThrow();
	});

	it.each([
		["codex-cli", "codex"],
		["claude-cli", "claude"],
	] as const)("creates the %s batch provider without a sequential concurrency cap", (providerId, command) => {
		const provider = makeFirstRecallByokProvider(
			settings(providerId, { credential: command }),
			{ transport }
		);
		expect(provider.id).toBe(providerId);
		expect(typeof provider.listModels).toBe("function");
		expect(typeof provider.generateCue).toBe("function");
		expect(typeof provider.generateCues).toBe("function");
		expect(typeof provider.generateNoteBrief).toBe("function");
		expect(provider.sectionConcurrencyLimit).toBeUndefined();
	});
});
