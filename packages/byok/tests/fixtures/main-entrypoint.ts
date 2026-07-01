import {
	createByokProvider,
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
