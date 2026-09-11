import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function prepareRelease(version: string, manifestVersion: string, changelog: string) {
	const directory = mkdtempSync(join(tmpdir(), "firstrecall-prepare-release-"));

	try {
		cpSync("prepare-release.mjs", join(directory, "prepare-release.mjs"));
		writeFileSync(join(directory, "package.json"), JSON.stringify({ version }));
		writeFileSync(join(directory, "manifest.json"), JSON.stringify({ version: manifestVersion }));
		writeFileSync(join(directory, "CHANGELOG.md"), changelog);
		return spawnSync(process.execPath, ["prepare-release.mjs"], { cwd: directory, encoding: "utf8" });
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
}

describe("prepare-release", () => {
	it.each(["0.8.0", "0.7.4", "0.7.3"])("extracts only the notes for %s", (version) => {
		const changelog = "# firstrecall\n\n" + ["0.8.0", "0.7.4", "0.7.3"]
			.map((entry) => `## ${entry}\n\n### Patch Changes\n\n- Notes for ${entry}.\n\n  More detail.\n`)
			.join("\n");
		const result = prepareRelease(version, version, changelog);

		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`### Patch Changes\n\n- Notes for ${version}.\n\n  More detail.\n`);
	});

	it("supports Windows line endings", () => {
		const result = prepareRelease("0.7.4", "0.7.4", "# firstrecall\r\n\r\n## 0.7.4\r\n\r\n- Fix study mode.\r\n");

		expect(result.status).toBe(0);
		expect(result.stdout).toBe("- Fix study mode.\n");
	});

	it("rejects mismatched versions before producing notes", () => {
		const result = prepareRelease("0.7.4", "0.7.3", "## 0.7.4\n\n- Fix study mode.\n");

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("Release version mismatch: package.json is 0.7.4, manifest.json is 0.7.3");
		expect(result.stdout).toBe("");
	});

	it.each(["## 0.7.40\n\n- Another release.\n", "## 0.7.4\n\n## 0.7.3\n\n- Older release.\n"])(
		"rejects a missing or empty release entry",
		(changelog) => {
			const result = prepareRelease("0.7.4", "0.7.4", changelog);

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain("Missing or empty CHANGELOG.md entry for 0.7.4");
			expect(result.stdout).toBe("");
		},
	);
});
