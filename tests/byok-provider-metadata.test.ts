import {
	BYOK_PROVIDER_IDS,
	type ByokProviderId,
} from "@swartzrock/byok-runtime";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	byokProviderDefinition,
	byokProviderDefinitions,
	firstRecallProviderDefinition,
	firstRecallProviderDefinitions,
} from "../src/byok-provider-metadata";
import {
	BYOK_PROVIDER_ICONS,
	HOSTED_DEMO_PROVIDER_ICON,
} from "../src/provider-icons";

describe("FirstRecall BYOK provider metadata", () => {
	it("registers the plugin-owned trial separately from BYOK providers", () => {
		expect(firstRecallProviderDefinitions().map(({ id }) => id)).toEqual([
			"hosted-demo",
			...BYOK_PROVIDER_IDS,
		]);
		expect(byokProviderDefinitions().map(({ id }) => id)).toEqual(
			BYOK_PROVIDER_IDS
		);
		expect(firstRecallProviderDefinition("hosted-demo")).toMatchObject({
			icon: HOSTED_DEMO_PROVIDER_ICON,
			credentialKind: "trial",
			modelBehavior: "included",
		});
	});

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
		["together", "api-key"],
		["fireworks", "api-key"],
		["ollama", "url"],
		["lm-studio", "url"],
		["codex-cli", "command"],
		["claude-cli", "command"],
	] as const)("classifies %s credentials as %s", (provider, credentialKind) => {
		expect(byokProviderDefinition(provider).credentialKind).toBe(credentialKind);
	});

	it("links every cloud provider to its API key guide section", () => {
		const guideUrl =
			"https://github.com/swartzrock/obsidian-firstrecall-plugin/blob/main/docs/cloud-api-keys.md";
		const guide = readFileSync("docs/cloud-api-keys.md", "utf8");
		const guideSections = new Set<string>();
		for (const line of guide.split("\n")) {
			if (!line.startsWith("## ")) continue;
			guideSections.add(
				line.slice(3).trim().toLowerCase().replace(/ /g, "-")
			);
		}
		const cloudProviders = BYOK_PROVIDER_IDS.filter(
			(provider) =>
				byokProviderDefinition(provider).credentialKind === "api-key"
		);

		for (const provider of cloudProviders) {
				expect(
					byokProviderDefinition(provider).credentialField.helpUrl
				).toBe(`${guideUrl}#${provider}`);
			expect(guideSections).toContain(provider);
		}
	});
});
