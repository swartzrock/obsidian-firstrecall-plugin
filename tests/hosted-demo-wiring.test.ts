import { describe, expect, it, vi } from "vitest";
import FirstRecallPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/settings";

const VALID_INSTALLATION_ID = "7f4b9f2c-2f2c-4e90-a8b7-5ac2e40dc40a";

function bundleInput() {
	return {
		note: { title: "Learning", contextMarkdown: "# Recall\nRecall strengthens memory." },
		sections: [
			{
				sectionId: "recall",
				contentHash: "deadbeef",
				heading: "Recall",
				content: "Recall strengthens memory.",
			},
		],
	};
}

function pluginHarness(installationId?: unknown) {
	const saveData = vi.fn(async () => {});
	const requests: Request[] = [];
	const plugin = new FirstRecallPlugin({} as never, {} as never);
	const settings = structuredClone(DEFAULT_SETTINGS);
	settings.byok.selectedProvider = "hosted-demo";
	Object.assign(plugin as unknown as Record<string, unknown>, {
		settings,
		manifest: { version: "0.5.0" },
		data: {
			settings,
			caches: {},
			maintenanceStates: {},
			hidden: {},
			cueSectionCollapse: {},
			...(installationId === undefined ? {} : { installationId }),
		},
		retainedCaches: {},
		saveData,
		makeTransport: () => async (request: Request) => {
			requests.push(request);
			throw new Error("stop after request capture");
		},
	});
	return { plugin, requests, saveData };
}

async function captureIdentity(plugin: FirstRecallPlugin) {
	const provider = await plugin.makeProvider();
	await expect(provider.generateBundle?.(bundleInput())).rejects.toThrow(
		"stop after request capture"
	);
	return provider;
}

describe("hosted trial plugin wiring", () => {
	it("creates a hosted runtime and lazily persists one stable installation id", async () => {
		const { plugin, requests, saveData } = pluginHarness();

		const first = await captureIdentity(plugin);
		const second = await captureIdentity(plugin);

		expect(first.id).toBe("hosted-demo");
		expect(second.id).toBe("hosted-demo");
		expect(saveData).toHaveBeenCalledTimes(1);
		const identities = await Promise.all(
			requests.map(async (request) =>
				(await request.clone().json() as { identity: Record<string, string> })
					.identity
			)
		);
		expect(identities[0].installationId).toBe(identities[1].installationId);
		expect(identities[0].sessionId).toBe(identities[1].sessionId);
		expect(identities[0].operationId).not.toBe(identities[1].operationId);
	});

	it("reuses a valid installation id and replaces an invalid one", async () => {
		const valid = pluginHarness(VALID_INSTALLATION_ID);
		await captureIdentity(valid.plugin);
		expect(valid.saveData).not.toHaveBeenCalled();
		expect(
			(await valid.requests[0].clone().json() as { identity: { installationId: string } })
				.identity.installationId
		).toBe(VALID_INSTALLATION_ID);

		const invalid = pluginHarness("not-a-uuid");
		await captureIdentity(invalid.plugin);
		expect(invalid.saveData).toHaveBeenCalledTimes(1);
		expect(
			(await invalid.requests[0].clone().json() as { identity: { installationId: string } })
				.identity.installationId
		).not.toBe("not-a-uuid");
	});

	it("canonicalizes a stored installation id once and reuses it", async () => {
		const uppercaseInstallationId = VALID_INSTALLATION_ID.toUpperCase();
		const { plugin, requests, saveData } = pluginHarness(uppercaseInstallationId);

		await captureIdentity(plugin);
		await captureIdentity(plugin);

		const identities = await Promise.all(
			requests.map(async (request) =>
				(await request.clone().json() as { identity: Record<string, string> })
					.identity
			)
		);
		expect(identities[0].installationId).toBe(VALID_INSTALLATION_ID);
		expect(identities[1].installationId).toBe(VALID_INSTALLATION_ID);
		expect(saveData).toHaveBeenCalledTimes(1);
		expect(saveData).toHaveBeenCalledWith(
			expect.objectContaining({ installationId: VALID_INSTALLATION_ID })
		);
	});

	it("keeps session ids scoped to a plugin load", async () => {
		const first = pluginHarness(VALID_INSTALLATION_ID);
		const second = pluginHarness(VALID_INSTALLATION_ID);
		await captureIdentity(first.plugin);
		await captureIdentity(second.plugin);
		const firstIdentity = (await first.requests[0].clone().json() as {
			identity: Record<string, string>;
		}).identity;
		const secondIdentity = (await second.requests[0].clone().json() as {
			identity: Record<string, string>;
		}).identity;
		expect(firstIdentity.installationId).toBe(secondIdentity.installationId);
		expect(firstIdentity.sessionId).not.toBe(secondIdentity.sessionId);
	});
});
