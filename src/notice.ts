export function formatFirstRecallNotice(message: string): string {
	const trimmed = message.trim();
	return trimmed.startsWith("FirstRecall:") ? trimmed : `FirstRecall: ${trimmed}`;
}
