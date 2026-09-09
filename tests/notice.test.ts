import { describe, expect, it } from "vitest";
import { formatFirstRecallNotice } from "../src/notice";

describe("formatFirstRecallNotice", () => {
	it("preserves the message and adds the FirstRecall prefix only once", () => {
		const message = "Connection succeeded";
		const formatted = formatFirstRecallNotice(message);

		expect(formatted).toContain(message);
		expect(formatted.match(/FirstRecall:/g)).toHaveLength(1);
		expect(formatFirstRecallNotice(formatted)).toBe(formatted);
	});
});
