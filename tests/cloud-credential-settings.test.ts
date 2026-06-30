import { describe, expect, it } from "vitest";
import {
	SAVED_CLOUD_CREDENTIAL_MASK,
	cloudCredentialMask,
	cloudCredentialDisplayState,
} from "../src/cloud-credential-settings";

describe("cloudCredentialDisplayState", () => {
	it("renders a non-secret mask for a saved key", () => {
		const state = cloudCredentialDisplayState({
			fieldDescription: "OpenAI API key.",
			fieldPlaceholder: "sk-...",
			saved: true,
			credentialLength: 14,
			storageStatus: { ok: true },
		});

		expect(state).toMatchObject({
			inputValue: cloudCredentialMask(14),
			placeholder: "Saved - enter a new key to replace it",
			saveButtonLabel: "Replace key",
			canEdit: true,
		});
		expect(state.description).toContain("Obsidian Secret Storage");
		expect(state.description).toContain("Enter a new key");
	});

	it("uses the provider placeholder for an unsaved key", () => {
		expect(
			cloudCredentialDisplayState({
				fieldDescription: "OpenAI API key.",
				fieldPlaceholder: "sk-...",
				saved: false,
				credentialLength: 0,
				storageStatus: { ok: true },
			})
		).toMatchObject({
			inputValue: "",
			placeholder: "sk-...",
			saveButtonLabel: "Save key",
			canEdit: true,
		});
		expect(
			cloudCredentialDisplayState({
				fieldDescription: "OpenAI API key.",
				fieldPlaceholder: "sk-...",
				saved: false,
				credentialLength: 0,
				storageStatus: { ok: true },
			}).description
		).toContain("Obsidian Secret Storage");
	});

	it("disables editing when secure storage is unavailable", () => {
		const state = cloudCredentialDisplayState({
			fieldDescription: "OpenAI API key.",
			fieldPlaceholder: "sk-...",
			saved: false,
			credentialLength: 0,
			storageStatus: {
				ok: false,
				reason: "secret-storage-unavailable",
				message: "Obsidian secret storage requires Obsidian 1.11.4 or newer.",
			},
		});

		expect(state.canEdit).toBe(false);
		expect(state.description).toContain("Obsidian Secret Storage unavailable");
		expect(state.description).toContain("Obsidian secret storage requires");
	});

	it("falls back to the standard mask when saved length is unknown", () => {
		expect(cloudCredentialMask(0)).toBe(SAVED_CLOUD_CREDENTIAL_MASK);
	});
});
