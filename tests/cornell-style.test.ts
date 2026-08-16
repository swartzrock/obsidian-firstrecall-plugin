import { describe, it, expect } from "vitest";
import { EDITOR_CORNELL_STYLE_CLASS } from "../src/cornell-style";

describe("editor Cornell style", () => {
	it("uses the fixed classic editor-card style", () => {
		expect(EDITOR_CORNELL_STYLE_CLASS).toBe("cuecraft-style-classic");
	});
});
