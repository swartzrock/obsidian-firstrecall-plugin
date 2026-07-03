import {
	createByok,
	createByokProvider,
	generateText,
	type ByokCoreProviderConfig,
	type ByokHttpClient,
	type ByokProviderDeps,
	type ByokProviderRuntime,
} from "../../src";

const http: ByokHttpClient = async () => ({
	status: 200,
	text: "{}",
	json: {},
});
const fetchImpl = (async () => new Response("{}")) as typeof fetch;

const deps: ByokProviderDeps = {
	fetchImpl,
	http,
};

const config: ByokCoreProviderConfig = {
	provider: "openai",
	apiKey: "sk-test",
	model: "gpt-4o-mini",
};

const provider: ByokProviderRuntime = createByokProvider(config, deps);

void provider.testConnection;

const text = generateText({
	provider: "openai",
	apiKey: "sk-test",
	model: "gpt-4o-mini",
	prompt: "Explain BYOK in one sentence.",
	deps,
});

const openRouterText = generateText({
	provider: "openrouter",
	apiKey: "sk-test",
	model: "openai/gpt-4o",
	prompt: "Explain BYOK in one sentence.",
	appInfo: {
		name: "Fixture App",
		url: "https://example.com",
	},
	deps,
});

void generateText({
	provider: "openai",
	apiKey: "sk-test",
	model: "gpt-4o-mini",
	prompt: "Explain BYOK in one sentence.",
	// @ts-expect-error appInfo is OpenRouter-specific on the simple facade.
	appInfo: {
		name: "Fixture App",
	},
	deps,
});

void generateText({
	provider: "openai",
	apiKey: "sk-test",
	model: "gpt-4o-mini",
	prompt: "Explain BYOK in one sentence.",
	// @ts-expect-error provider-specific schema hints belong on the lower-level runtime.
	jsonSchema: "{}",
	deps,
});

const client = createByok({
	provider: "openai",
	apiKey: "sk-test",
	deps,
});

const clientText = client.generateText({
	model: "gpt-4o-mini",
	prompt: "Explain BYOK in one sentence.",
});

void text;
void openRouterText;
void clientText;
