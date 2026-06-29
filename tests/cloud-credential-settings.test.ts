import { describe, expect, it } from "vitest";
import { cloudCredentialDisplayState } from "../src/cloud-credential-settings";

describe("cloudCredentialDisplayState", () => {
	it("does not render a saved key into the input value", () => {
		const state = cloudCredentialDisplayState({
			fieldDescription: "OpenAI API key.",
			fieldPlaceholder: "sk-...",
			saved: true,
			storageStatus: { ok: true },
		});

		expect(state).toMatchObject({
			inputValue: "",
			placeholder: "Saved - enter a new key to replace it",
			saveButtonLabel: "Replace key",
			canEdit: true,
		});
		expect(state.description).toContain("API key saved");
	});

	it("uses the provider placeholder for an unsaved key", () => {
		expect(
			cloudCredentialDisplayState({
				fieldDescription: "OpenAI API key.",
				fieldPlaceholder: "sk-...",
				saved: false,
				storageStatus: { ok: true },
			})
		).toMatchObject({
			inputValue: "",
			placeholder: "sk-...",
			saveButtonLabel: "Save key",
			canEdit: true,
		});
	});

	it("disables editing when secure storage is unavailable", () => {
		const state = cloudCredentialDisplayState({
			fieldDescription: "OpenAI API key.",
			fieldPlaceholder: "sk-...",
			saved: false,
			storageStatus: {
				ok: false,
				reason: "basic-text",
				message: "Electron basic_text is unsafe.",
			},
		});

		expect(state.canEdit).toBe(false);
		expect(state.description).toContain("Secure storage unavailable");
		expect(state.description).toContain("Electron basic_text is unsafe.");
	});
});
