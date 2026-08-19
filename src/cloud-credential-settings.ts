import type { CredentialStoreAvailability } from "./secure-credential-store";

export interface CloudCredentialDisplayState {
	description: string;
	placeholder: string;
	inputValue: string;
	saveButtonLabel: string;
	canEdit: boolean;
}

export const SAVED_CLOUD_CREDENTIAL_MASK = "********";

export function cloudCredentialMask(length: number): string {
	const safeLength = Number.isFinite(length) && length > 0 ? Math.floor(length) : 8;
	return "*".repeat(safeLength);
}

export function cloudCredentialDisplayState(opts: {
	fieldDescription: string;
	fieldPlaceholder: string;
	saved: boolean;
	credentialLength: number;
	storageStatus: CredentialStoreAvailability;
}): CloudCredentialDisplayState {
	const canEdit = opts.storageStatus.ok;
	return {
		description: canEdit
			? opts.saved
				? "Stored securely in Obsidian Secret Storage on this device. Enter a new key to replace it."
				: "FirstRecall stores this key in Obsidian Secret Storage on this device."
			: `${opts.fieldDescription} Obsidian Secret Storage unavailable: ${opts.storageStatus.message ?? opts.storageStatus.reason ?? "unknown error"}.`,
		placeholder: opts.saved
			? "Saved - enter a new key to replace it"
			: opts.fieldPlaceholder,
		inputValue: opts.saved
			? cloudCredentialMask(opts.credentialLength)
			: "",
		saveButtonLabel: opts.saved ? "Replace key" : "Save key",
		canEdit,
	};
}
