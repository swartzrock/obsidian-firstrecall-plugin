import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("version-bump", () => {
	it("uses the version written by Changesets instead of its inherited environment", () => {
		const directory = mkdtempSync(join(tmpdir(), "firstrecall-version-bump-"));

		try {
			cpSync("version-bump.mjs", join(directory, "version-bump.mjs"));
			writeFileSync(join(directory, "package.json"), '{"version":"0.4.1"}');
			writeFileSync(join(directory, "manifest.json"), '{"version":"0.4.0","minAppVersion":"1.11.4"}');
			writeFileSync(join(directory, "versions.json"), "{}");

			const result = spawnSync(process.execPath, ["version-bump.mjs"], {
				cwd: directory,
				env: { ...process.env, npm_package_version: "0.4.0" },
			});

			expect(result.status).toBe(0);
			expect(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"))).toMatchObject({
				version: "0.4.1",
			});
			expect(JSON.parse(readFileSync(join(directory, "versions.json"), "utf8"))).toMatchObject({
			"0.4.1": "1.11.4",
		});
		} finally {
			rmSync(directory, { force: true, recursive: true });
		}
	});
});
