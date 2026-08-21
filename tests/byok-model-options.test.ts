import { ByokProvider } from "@swartzrock/byok-runtime";
import { describe, expect, it } from "vitest";
import { displayModelOptions } from "../src/byok-model-options";

describe("displayModelOptions", () => {
	it("strips the accounts/.../models/ prefix from Fireworks labels", () => {
		expect(
			displayModelOptions(ByokProvider.Fireworks, [
				{
					id: "accounts/fireworks/models/llama-v3p1-70b-instruct",
					label: "accounts/fireworks/models/llama-v3p1-70b-instruct",
				},
			])
		).toEqual([
			{
				id: "accounts/fireworks/models/llama-v3p1-70b-instruct",
				label: "llama-v3p1-70b-instruct",
			},
		]);
	});

	it("strips the prefix for non-default Fireworks accounts", () => {
		expect(
			displayModelOptions(ByokProvider.Fireworks, [
				{
					id: "accounts/my-org/models/custom-model",
					label: "accounts/my-org/models/custom-model",
				},
			])
		).toEqual([{ id: "accounts/my-org/models/custom-model", label: "custom-model" }]);
	});

	it("leaves a Fireworks label unchanged when it does not match the prefix", () => {
		const options = [{ id: "some-other-id", label: "Some other label" }];
		expect(displayModelOptions(ByokProvider.Fireworks, options)).toEqual(options);
	});

	it("leaves other providers' options unchanged", () => {
		const options = [
			{
				id: "accounts/fireworks/models/llama-v3p1-70b-instruct",
				label: "accounts/fireworks/models/llama-v3p1-70b-instruct",
			},
		];
		expect(displayModelOptions(ByokProvider.Together, options)).toEqual(options);
	});
});
