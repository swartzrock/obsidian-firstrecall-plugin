import { describe, expect, it } from "vitest";
import {
	SAVED_CLOUD_CREDENTIAL_MASK,
	cloudCredentialDisplayState,
} from "../src/cloud-credential-settings";

describe("cloudCredentialDisplayState", () => {
	it("renders a non-secret mask for a saved key", () => {
		const state = cloudCredentialDisplayState({
			fieldDescription: "OpenAI API key.",
			fieldPlaceholder: "sk-...",
			saved: true,
			storageStatus: { ok: true },
		});

		expect(state).toMatchObject({
			inputValue: SAVED_CLOUD_CREDENTIAL_MASK,
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
				reason: "secret-storage-unavailable",
				message: "Obsidian secret storage requires Obsidian 1.11.4 or newer.",
			},
		});

		expect(state.canEdit).toBe(false);
		expect(state.description).toContain("Secure storage unavailable");
		expect(state.description).toContain("Obsidian secret storage requires");
	});
});
