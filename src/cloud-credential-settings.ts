import type { CredentialStoreAvailability } from "./secure-credential-store";

export interface CloudCredentialDisplayState {
	description: string;
	placeholder: string;
	inputValue: string;
	saveButtonLabel: string;
	canEdit: boolean;
}

export const SAVED_CLOUD_CREDENTIAL_MASK = "********";

export function cloudCredentialDisplayState(opts: {
	fieldDescription: string;
	fieldPlaceholder: string;
	saved: boolean;
	storageStatus: CredentialStoreAvailability;
}): CloudCredentialDisplayState {
	const canEdit = opts.storageStatus.ok;
	return {
		description: canEdit
			? opts.saved
				? `${opts.fieldDescription} API key saved. Enter a new key to replace it.`
				: opts.fieldDescription
			: `${opts.fieldDescription} Secure storage unavailable: ${opts.storageStatus.message ?? opts.storageStatus.reason ?? "unknown error"}.`,
		placeholder: opts.saved
			? "Saved - enter a new key to replace it"
			: opts.fieldPlaceholder,
		inputValue: opts.saved ? SAVED_CLOUD_CREDENTIAL_MASK : "",
		saveButtonLabel: opts.saved ? "Replace key" : "Save key",
		canEdit,
	};
}
