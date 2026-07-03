import {
	ByokProviderError,
	type ByokHttpClient,
	type ByokProviderAppInfo,
	type ByokProviderDeps,
} from "../types";

const MAX_DEFAULT_HTTP_RESPONSE_BYTES = 1_000_000;

function globalFetch(): typeof fetch | undefined {
	const candidate = globalThis.fetch;
	if (typeof candidate !== "function") return undefined;
	return candidate.bind(globalThis) as typeof fetch;
}

function clearControlCharacters(value: string): string {
	let output = "";
	let lastWasSpace = false;
	for (const char of value) {
		const code = char.charCodeAt(0);
		const isControl = code <= 31 || code === 127;
		if (isControl) {
			if (!lastWasSpace) output += " ";
			lastWasSpace = true;
			continue;
		}
		output += char;
		lastWasSpace = /\s/.test(char);
	}
	return output.trim();
}

export function normalizeProviderAppInfo(
	appInfo: ByokProviderAppInfo | undefined
): ByokProviderAppInfo | undefined {
	if (!appInfo) return undefined;
	const name = appInfo.name ? clearControlCharacters(appInfo.name).slice(0, 120) : undefined;
	let url: string | undefined;
	if (appInfo.url) {
		try {
			const parsed = new URL(clearControlCharacters(appInfo.url));
			if (
				(parsed.protocol === "http:" || parsed.protocol === "https:") &&
				!parsed.username &&
				!parsed.password
			) {
				url = parsed.toString();
			}
		} catch {
			url = undefined;
		}
	}
	if (!name && !url) return undefined;
	return { ...(name ? { name } : {}), ...(url ? { url } : {}) };
}

export function normalizeOllamaHost(host: string): string {
	let parsed: URL;
	try {
		parsed = new URL(host);
	} catch {
		throw new ByokProviderError("Ollama host must be a valid http(s) URL.");
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new ByokProviderError("Ollama host must use http or https.");
	}
	if (parsed.username || parsed.password) {
		throw new ByokProviderError("Ollama host must not include credentials.");
	}
	return parsed.toString().replace(/\/+$/, "");
}

function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
	const out = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

async function readCappedText(response: Response): Promise<string> {
	const body = response.body;
	if (!body) {
		const text = await response.text();
		if (new TextEncoder().encode(text).byteLength > MAX_DEFAULT_HTTP_RESPONSE_BYTES) {
			throw new ByokProviderError("BYOK HTTP response exceeded the default size limit.");
		}
		return text;
	}
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		totalBytes += value.byteLength;
		if (totalBytes > MAX_DEFAULT_HTTP_RESPONSE_BYTES) {
			await reader.cancel();
			throw new ByokProviderError("BYOK HTTP response exceeded the default size limit.");
		}
		chunks.push(value);
	}
	return new TextDecoder().decode(concatChunks(chunks, totalBytes));
}

function parseJson(text: string): unknown {
	try {
		return text ? JSON.parse(text) : null;
	} catch {
		return null;
	}
}

export function createDefaultHttpClient(fetchImpl: typeof fetch): ByokHttpClient {
	return async (request) => {
		const response = await fetchImpl(request.url, {
			method: request.method,
			headers: request.headers,
			body: request.body,
			signal: request.signal,
		});
		const text = await readCappedText(response);
		return {
			status: response.status,
			text,
			json: parseJson(text),
		};
	};
}

export function resolveByokFetchDeps(
	deps: Partial<ByokProviderDeps> | undefined
): Pick<ByokProviderDeps, "fetchImpl"> {
	const fetchImpl = deps?.fetchImpl ?? globalFetch();
	if (!fetchImpl) {
		throw new ByokProviderError(
			"BYOK requires a fetch implementation. Pass deps.fetchImpl in this runtime."
		);
	}
	return { fetchImpl };
}

export function resolveOpenRouterDeps(
	deps: Partial<ByokProviderDeps> | undefined
): Pick<ByokProviderDeps, "fetchImpl" | "appInfo"> {
	return {
		...resolveByokFetchDeps(deps),
		appInfo: normalizeProviderAppInfo(deps?.appInfo),
	};
}

export function resolveOllamaDeps(
	deps: Partial<ByokProviderDeps> | undefined
): Pick<ByokProviderDeps, "http"> {
	if (deps?.http) return { http: deps.http };
	const { fetchImpl } = resolveByokFetchDeps(deps);
	return {
		http: createDefaultHttpClient(fetchImpl),
	};
}
