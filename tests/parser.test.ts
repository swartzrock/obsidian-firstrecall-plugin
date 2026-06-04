import { describe, it, expect } from "vitest";
import { parseSections, lightHash } from "../src/parser";

describe("parseSections", () => {
	it("creates one section per heading (B1.1)", () => {
		const md = "# A\nalpha\n## B\nbeta\n### C\ngamma";
		const s = parseSections(md);
		expect(s.map((x) => x.heading)).toEqual(["A", "B", "C"]);
		expect(s.map((x) => x.level)).toEqual([1, 2, 3]);
		expect(s[0].content).toBe("alpha");
		expect(s[1].content).toBe("beta");
	});

	it("captures content before the first heading as an intro section (B1.2)", () => {
		const md = "intro line\nmore intro\n\n# First\nbody";
		const s = parseSections(md);
		expect(s[0].level).toBe(0);
		expect(s[0].heading).toBe("");
		expect(s[0].content).toBe("intro line\nmore intro");
		expect(s[1].heading).toBe("First");
	});

	it("treats a note with no headings as a single section (B1.3)", () => {
		const s = parseSections("just some text\nwith lines");
		expect(s).toHaveLength(1);
		expect(s[0].content).toBe("just some text\nwith lines");
	});

	it("does not treat # inside fenced code as a heading (B1.4)", () => {
		const md = "# Real\nbody\n\n```\n# not a heading\n```\n\n## Also Real\nmore";
		const s = parseSections(md);
		expect(s.map((x) => x.heading)).toEqual(["Real", "Also Real"]);
		// The fenced "# not a heading" stays inside the first section's content.
		expect(s[0].content).toContain("# not a heading");
	});

	it("exposes stable id, lineNumber and contentHash (B1.5)", () => {
		const s = parseSections("# Title\nbody text");
		expect(s[0].id).toBe("title");
		expect(s[0].lineNumber).toBe(1);
		expect(s[0].contentHash).toMatch(/^[0-9a-f]{8}$/);
	});

	it("gives duplicate headings unique stable ids", () => {
		const s = parseSections("# Notes\na\n# Notes\nb");
		expect(s.map((x) => x.id)).toEqual(["notes", "notes-2"]);
	});

	it("contentHash changes when content changes but not when unrelated text differs elsewhere", () => {
		const a = parseSections("# H\nbody one")[0].contentHash;
		const b = parseSections("# H\nbody two")[0].contentHash;
		expect(a).not.toBe(b);
	});

	it("strips closing hashes in ATX headings", () => {
		const s = parseSections("## Heading ##\nx");
		expect(s[0].heading).toBe("Heading");
	});
});

describe("lightHash", () => {
	it("is deterministic and 8 hex chars", () => {
		expect(lightHash("abc")).toBe(lightHash("abc"));
		expect(lightHash("abc")).toMatch(/^[0-9a-f]{8}$/);
		expect(lightHash("abc")).not.toBe(lightHash("abd"));
	});
});
