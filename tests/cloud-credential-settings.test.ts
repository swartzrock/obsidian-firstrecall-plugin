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

		const unsaved = cloudCredentialDisplayState({
			fieldDescription: "OpenAI API key.",
			fieldPlaceholder: "sk-...",
			saved: false,
			credentialLength: 0,
			storageStatus: { ok: true },
		});

		expect(state.inputValue).toBe(cloudCredentialMask(14));
		expect(state.inputValue).toMatch(/^\*+$/);
		expect(state.canEdit).toBe(true);
		expect(state.saveButtonLabel).not.toBe(unsaved.saveButtonLabel);
	});

	it("uses the provider placeholder for an unsaved key", () => {
		const state = cloudCredentialDisplayState({
				fieldDescription: "OpenAI API key.",
				fieldPlaceholder: "sk-...",
				saved: false,
				credentialLength: 0,
				storageStatus: { ok: true },
			});
		expect(state).toMatchObject({
			inputValue: "",
			placeholder: "sk-...",
			canEdit: true,
		});
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
