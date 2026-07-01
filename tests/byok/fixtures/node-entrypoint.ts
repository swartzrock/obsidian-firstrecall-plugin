import {
	createByokNodeProvider,
	type ByokHttpClient,
	type ByokProviderConfig,
	type ByokProviderDeps,
} from "../../../src/byok/node";

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

const config: ByokProviderConfig = {
	provider: "codex-cli",
	command: "codex",
};

const provider = createByokNodeProvider(config, deps);

void provider.testConnection;
