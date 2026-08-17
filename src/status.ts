/** Status-bar states from the v1.0 scope. `generating` carries N/M progress. */
export type CueStatus =
	| "setup"
	| "ready"
	| "generating"
	| "stale"
	| "study"
	| "hidden";

export function statusLabel(status: CueStatus): string {
	switch (status) {
		case "ready":
			return "up to date";
		case "stale":
			return "Section cues need updating";
		case "setup":
			return "setup needed";
		default:
			return status;
	}
}
