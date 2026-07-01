import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

const NODE_BUILTIN_IMPORTS = [
	"node:child_process",
	"node:os",
	"node:stream",
] as const;

function readJson(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function localImports(path: string): string[] {
	const source = readFileSync(path, "utf8");
	const imports: string[] = [];
	const importPattern =
		/(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
	for (const match of source.matchAll(importPattern)) {
		const specifier = match[1];
		if (specifier?.startsWith(".")) imports.push(specifier);
	}
	return imports;
}

function resolveSourcePath(fromPath: string, specifier: string): string | null {
	const base = normalize(join(dirname(fromPath), specifier));
	for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

function transitiveLocalSources(entrypoint: string): string[] {
	const seen = new Set<string>();
	const queue = [entrypoint];
	while (queue.length) {
		const current = queue.shift();
		if (!current || seen.has(current)) continue;
		seen.add(current);
		for (const specifier of localImports(current)) {
			const resolved = resolveSourcePath(current, specifier);
			if (resolved) queue.push(resolved);
		}
	}
	return [...seen].sort();
}

describe("BYOK package readiness", () => {
	it("drafts package exports, declarations, and publish metadata", () => {
		const manifest = readJson("byok.package.json");
		expect(manifest).toMatchObject({
			type: "module",
			sideEffects: false,
			main: "./dist/index.js",
			types: "./dist/index.d.ts",
			publishConfig: {
				access: "public",
				provenance: true,
			},
		});
		expect(manifest.exports).toEqual({
			".": {
				types: "./dist/index.d.ts",
				import: "./dist/index.js",
			},
			"./node": {
				types: "./dist/node.d.ts",
				import: "./dist/node.js",
			},
		});
		expect(manifest.files).toEqual([
			"dist",
			"README.md",
			"LICENSE",
			"package.json",
		]);
	});

	it("declares BYOK-only type output", () => {
		const config = readJson("tsconfig.byok.json");
		expect(config.include).toEqual(["src/byok/**/*.ts"]);
		expect(config.compilerOptions).toMatchObject({
			declaration: true,
			declarationMap: true,
			emitDeclarationOnly: true,
			outDir: ".tmp/byok-types",
			rootDir: "src/byok",
		});
	});

	it("keeps the main entrypoint away from Node-only local CLI files", () => {
		const files = transitiveLocalSources("src/byok/index.ts");
		expect(files).not.toContain("src/byok/node.ts");
		expect(files).not.toContain("src/byok/providers/local-command-runner.ts");
		expect(files).not.toContain("src/byok/providers/codex-cli-provider.ts");
		expect(files).not.toContain("src/byok/providers/claude-cli-provider.ts");
		for (const file of files) {
			const source = readFileSync(file, "utf8");
			for (const nodeImport of NODE_BUILTIN_IMPORTS) {
				expect(source, file).not.toContain(nodeImport);
			}
		}
	});

	it("keeps the Node subpath as the only local CLI entrypoint", () => {
		const nodeSource = readFileSync("src/byok/node.ts", "utf8");
		expect(nodeSource).toContain("./providers/local-command-runner");
		expect(nodeSource).toContain("./providers/codex-cli-provider");
		expect(nodeSource).toContain("./providers/claude-cli-provider");
	});
});
