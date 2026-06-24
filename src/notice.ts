export function formatCueCraftNotice(message: string): string {
	const trimmed = message.trim();
	return trimmed.startsWith("CueCraft:") ? trimmed : `CueCraft: ${trimmed}`;
}
