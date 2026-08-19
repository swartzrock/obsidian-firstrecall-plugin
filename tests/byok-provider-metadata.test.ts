import {
	BYOK_PROVIDER_IDS,
	type ByokProviderId,
} from "@swartzrock/byok-runtime";
import { describe, expect, it } from "vitest";
import {
	byokProviderDefinition,
	byokProviderDefinitions,
} from "../src/byok-provider-metadata";
import { BYOK_PROVIDER_ICONS } from "../src/provider-icons";

describe("FirstRecall BYOK provider metadata", () => {
	it("covers every provider supported by the runtime", () => {
		expect(byokProviderDefinitions().map((definition) => definition.id)).toEqual(
			BYOK_PROVIDER_IDS
		);
	});

	it("uses a supplied icon for every provider", () => {
		for (const provider of Object.keys(BYOK_PROVIDER_ICONS)) {
			expect(byokProviderDefinition(provider as ByokProviderId).icon).toBe(
				BYOK_PROVIDER_ICONS[
					provider as keyof typeof BYOK_PROVIDER_ICONS
				]
			);
		}
		expect(
			BYOK_PROVIDER_IDS.filter(
				(provider) => !(provider in BYOK_PROVIDER_ICONS)
			)
		).toEqual([]);
	});

	it.each([
		["anthropic", "api-key"],
		["openai", "api-key"],
		["google", "api-key"],
		["xai", "api-key"],
		["openrouter", "api-key"],
		["groq", "api-key"],
		["mistral", "api-key"],
		["deepseek", "api-key"],
		["deepinfra", "api-key"],
		["ollama", "url"],
		["lm-studio", "url"],
		["codex-cli", "command"],
		["claude-cli", "command"],
	] as const)("classifies %s credentials as %s", (provider, credentialKind) => {
		expect(byokProviderDefinition(provider).credentialKind).toBe(credentialKind);
	});
});
