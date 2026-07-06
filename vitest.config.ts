import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const byokRuntimeMain = fileURLToPath(
	new URL("./node_modules/@swartzrock/byok-runtime/src/index.ts", import.meta.url)
);
const byokRuntimeNode = fileURLToPath(
	new URL("./node_modules/@swartzrock/byok-runtime/src/node.ts", import.meta.url)
);
const obsidianMock = fileURLToPath(new URL("./tests/mocks/obsidian.ts", import.meta.url));

export default defineConfig({
	resolve: {
		alias: [
			{ find: "obsidian", replacement: obsidianMock },
			{ find: "@swartzrock/byok-runtime/node", replacement: byokRuntimeNode },
			{ find: "@swartzrock/byok-runtime", replacement: byokRuntimeMain },
		],
	},
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
	},
});
