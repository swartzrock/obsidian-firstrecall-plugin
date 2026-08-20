import { describe, expect, it } from "vitest";
import {
	BYOK_PROVIDER_ICONS,
	parseProviderIconGradients,
	parseProviderIconViewBox,
} from "../src/provider-icons";

describe("parseProviderIconViewBox", () => {
	it("reads the viewBox from raw svg markup", () => {
		expect(
			parseProviderIconViewBox('<svg viewBox="0 0 32 32"><path d="M0 0"/></svg>')
		).toBe("0 0 32 32");
	});

	it("falls back to a default when no viewBox is present", () => {
		expect(parseProviderIconViewBox('<svg><path d="M0 0"/></svg>')).toBe("0 0 24 24");
	});
});

describe("parseProviderIconGradients", () => {
	it("returns an empty array when there is no <defs> block", () => {
		expect(parseProviderIconGradients('<svg><path fill="#fff" d="M0 0"/></svg>')).toEqual(
			[]
		);
	});

	it("parses gradient coordinates whose attribute names contain digits (x1/y1/x2/y2)", () => {
		const svg =
			'<svg viewBox="0 0 24 24"><path fill="url(#g)" d="M0 0"/>' +
			'<defs><linearGradient gradientUnits="userSpaceOnUse" id="g" x1="12" x2="12" y1="3" y2="21">' +
			'<stop stop-color="#B1A7FF"></stop>' +
			'<stop offset=".5" stop-color="#7A9DFF"></stop>' +
			'<stop offset="1" stop-color="#3941FF"></stop>' +
			"</linearGradient></defs></svg>";

		expect(parseProviderIconGradients(svg)).toEqual([
			{
				id: "g",
				x1: "12",
				y1: "3",
				x2: "12",
				y2: "21",
				stops: [
					{ color: "#B1A7FF" },
					{ color: "#7A9DFF", offset: ".5" },
					{ color: "#3941FF", offset: "1" },
				],
			},
		]);
	});

	it("parses stop-opacity alongside offset and color", () => {
		const svg =
			'<svg viewBox="0 0 24 24"><path fill="url(#g)" d="M0 0"/>' +
			'<defs><linearGradient id="g" x1="7" y1="15.5" x2="11" y2="12">' +
			'<stop stop-color="#08B962"></stop>' +
			'<stop offset="1" stop-color="#08B962" stop-opacity="0"></stop>' +
			"</linearGradient></defs></svg>";

		expect(parseProviderIconGradients(svg)).toEqual([
			{
				id: "g",
				x1: "7",
				y1: "15.5",
				x2: "11",
				y2: "12",
				stops: [
					{ color: "#08B962" },
					{ color: "#08B962", offset: "1", opacity: "0" },
				],
			},
		]);
	});

	it("resolves every gradient icon's real coordinates to a non-degenerate vector", () => {
		// A gradient whose start and end points are equal renders as a single flat color
		// (typically the last stop, which is often fully transparent for these icons) --
		// so every real gradient we ship must have a non-zero-length vector.
		for (const [provider, definition] of Object.entries(BYOK_PROVIDER_ICONS)) {
			for (const gradient of parseProviderIconGradients(definition.svg)) {
				const isDegenerate = gradient.x1 === gradient.x2 && gradient.y1 === gradient.y2;
				expect(isDegenerate, `${provider} gradient ${gradient.id}`).toBe(false);
			}
		}
	});
});
