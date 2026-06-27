import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

interface SourceFile {
	path: string;
	source: string;
}

const FORBIDDEN_BARE_IMPORTS = new Set(["obsidian"]);
const FORBIDDEN_LOCAL_MODULES = new Set([
	"appearance-thumbnail-controls",
	"main",
	"model-combobox",
	"settings",
]);

function importedSpecifiers(source: string): string[] {
	const specifiers: string[] = [];
	const importPattern =
		/(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
	for (const match of source.matchAll(importPattern)) {
		const specifier = match[1] ?? match[2];
		if (specifier) specifiers.push(specifier);
	}
	return specifiers;
}

function localModuleName(specifier: string): string {
	const withoutExtension = specifier.replace(/\.(ts|tsx|js|jsx)$/, "");
	const parts = withoutExtension.split("/");
	return parts[parts.length - 1] ?? "";
}

function findForbiddenByokImports(files: SourceFile[]): string[] {
	const violations: string[] = [];
	for (const file of files) {
		for (const specifier of importedSpecifiers(file.source)) {
			if (FORBIDDEN_BARE_IMPORTS.has(specifier)) {
				violations.push(`${file.path} imports ${specifier}`);
				continue;
			}
			if (
				specifier.startsWith(".") &&
				FORBIDDEN_LOCAL_MODULES.has(localModuleName(specifier))
			) {
				violations.push(`${file.path} imports ${specifier}`);
			}
		}
	}
	return violations;
}

function collectTypeScriptFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectTypeScriptFiles(path));
			continue;
		}
		if (entry.isFile() && path.endsWith(".ts")) files.push(path);
	}
	return files;
}

function readByokSources(): SourceFile[] {
	const root = join(process.cwd(), "src", "byok");
	return collectTypeScriptFiles(root).map((path) => ({
		path: relative(process.cwd(), path),
		source: readFileSync(path, "utf8"),
	}));
}

describe("BYOK import boundary", () => {
	it("detects forbidden imports in fixture sources", () => {
		expect(
			findForbiddenByokImports([
				{
					path: "src/byok/bad.ts",
					source:
						'import { App } from "obsidian";\n' +
						'import type { CueCraftSettings } from "../settings";\n' +
						'import { renderModelCombobox } from "../model-combobox";\n',
				},
			])
		).toEqual([
			"src/byok/bad.ts imports obsidian",
			"src/byok/bad.ts imports ../settings",
			"src/byok/bad.ts imports ../model-combobox",
		]);
	});

	it("keeps current BYOK files free of Obsidian, settings, and UI imports", () => {
		expect(findForbiddenByokImports(readByokSources())).toEqual([]);
	});
});
