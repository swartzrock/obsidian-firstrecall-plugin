import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const byokMain = fileURLToPath(new URL("./packages/byok/src/index.ts", import.meta.url));
const byokNode = fileURLToPath(new URL("./packages/byok/src/node.ts", import.meta.url));
const obsidianMock = fileURLToPath(new URL("./tests/mocks/obsidian.ts", import.meta.url));

export default defineConfig({
	resolve: {
		alias: [
			{ find: "obsidian", replacement: obsidianMock },
			{ find: "@cuecraft/byok/node", replacement: byokNode },
			{ find: "@cuecraft/byok", replacement: byokMain },
		],
	},
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts", "packages/*/tests/**/*.test.ts"],
	},
});
