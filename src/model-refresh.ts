/**
 * Pick the description shown next to the model-refresh button.
 * If the stored refresh message starts with an error/status prefix, show that;
 * otherwise fall back to the caller-supplied default.
 */
export function resolveModelRefreshDescription(
	refreshMessage: string,
	defaultDescription: string
): string {
	const message = refreshMessage.trim();
	if (
		message.startsWith("Could not ") ||
		message.startsWith("No ") ||
		message.startsWith("CueCraft:")
	) {
		return message;
	}
	return defaultDescription;
}
