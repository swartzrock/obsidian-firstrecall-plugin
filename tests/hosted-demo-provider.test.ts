import { describe, expect, it, vi } from "vitest";
import {
	createHostedDemoProvider,
	HostedDemoApiError,
	HostedDemoProtocolError,
	type HostedDemoBundleInput,
	type HostedDemoErrorCode,
} from "../src/hosted-demo-provider";
import { INSUFFICIENT_SOURCE_ERROR } from "../src/schemas";

const INSTALLATION_ID = "7f4b9f2c-2f2c-4e90-a8b7-5ac2e40dc40a";
const SESSION_ID = "c1f63499-1afd-4462-bb71-c816679b0e22";
const OPERATION_ID = "9ac782b9-edde-41c0-91d0-6ec020224b6a";
const NEXT_OPERATION_ID = "87a94e31-a69f-4325-9230-897c25ac003f";

function input(overrides: Partial<HostedDemoBundleInput> = {}): HostedDemoBundleInput {
	return {
		note: {
			title: "Effective Learning Techniques",
			contextMarkdown: "# Retrieval practice\nActively recalling information strengthens memory.",
		},
		sections: [
			{
				sectionId: "retrieval-practice",
				contentHash: "deadbeef",
				heading: "Retrieval practice",
				content: "Actively recalling information strengthens memory.",
			},
		],
		...overrides,
	};
}

function noteBrief() {
	return {
		overview: "Retrieval practice strengthens memory. Feedback repairs errors.",
		whatMatters: {
			title: "Effort strengthens access",
			detail: "Recalling an answer makes the memory easier to retrieve later.",
		},
		reviewFirst: {
			title: "Retrieval before rereading",
			detail: "Try to recall the answer before looking back at the source.",
		},
		sayItBack: {
			title: "How does retrieval practice strengthen memory?",
			detail: "Explain the role of effortful recall and corrective feedback.",
		},
	};
}

function completeSection(
	sectionId = "retrieval-practice",
	contentHash = "deadbeef"
) {
	return {
		sectionId,
		contentHash,
		question: "How does retrieval practice strengthen memory?",
		keywords: ["active recall", "feedback"],
		summary: "Effortful recall strengthens later access to a memory.",
	};
}

function trialLimitSection(sectionId: string, contentHash: string) {
	return {
		...completeSection(sectionId, contentHash),
		placeholderReason: "trial_limit",
	};
}

function successResponse(
	sections: unknown[] = [completeSection()],
	operationId = OPERATION_ID
) {
	return {
		contractVersion: "v1",
		status: "success",
		operationId,
		attemptConsumed: true,
		bundle: { sections, noteBrief: noteBrief() },
	};
}

type FailureScope =
	| "network_burst"
	| "session"
	| "installation_hour"
	| "installation_day"
	| "global_attempts"
	| "global_neurons"
	| "operation";

function failureResponse(
	code: HostedDemoErrorCode,
	overrides: {
		attemptConsumed?: boolean;
		retryable?: boolean;
		scope?: FailureScope | null;
		retryAt?: string | null;
		resetAt?: string | null;
		minimumClientVersion?: string | null;
	} = {}
) {
	return {
		contractVersion: "v1",
		status: "error",
		operationId: OPERATION_ID,
		attemptConsumed: overrides.attemptConsumed ?? false,
		error: {
			code,
			message: `Failure: ${code}`,
			retryable: overrides.retryable ?? false,
			scope: overrides.scope ?? null,
			retryAt: overrides.retryAt ?? null,
			resetAt: overrides.resetAt ?? null,
			minimumClientVersion: overrides.minimumClientVersion ?? null,
		},
	};
}

function providerWithResponse(body: unknown, operationIds = [OPERATION_ID]) {
	const transport = vi.fn(async () =>
		new Response(JSON.stringify(body), {
			status: 200,
			headers: { "content-type": "application/json" },
		})
	);
	return {
		provider: createHostedDemoProvider({
			transport,
			clientVersion: "0.5.0",
			installationId: INSTALLATION_ID,
			sessionId: SESSION_ID,
			createOperationId: vi.fn(() => operationIds.shift() ?? NEXT_OPERATION_ID),
		}),
		transport,
	};
}

describe("hosted demo provider", () => {
	it("retries one HTTP 429 after Retry-After with a fresh operation id", async () => {
		const sleep = vi.fn(async () => {});
		const operationIds = [OPERATION_ID, NEXT_OPERATION_ID];
		const transport = vi.fn(async () => {
			if (transport.mock.calls.length === 1) {
				return new Response("rate limited", {
					status: 429,
					headers: { "retry-after": "2" },
				});
			}
			return new Response(JSON.stringify(successResponse(undefined, NEXT_OPERATION_ID)), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		});
		const provider = createHostedDemoProvider({
			transport,
			clientVersion: "0.5.0",
			installationId: INSTALLATION_ID,
			sessionId: SESSION_ID,
			createOperationId: () => operationIds.shift() ?? NEXT_OPERATION_ID,
			sleep,
		});

		await expect(provider.generateBundle(input())).resolves.toMatchObject({
			operationId: NEXT_OPERATION_ID,
		});
		expect(sleep).toHaveBeenCalledWith(2_000, undefined);
		expect(transport).toHaveBeenCalledTimes(2);
		const requestBodies = await Promise.all(
			transport.mock.calls.map(async ([request]) =>
				(await request.clone().json()) as {
					identity: { operationId: string };
				}
			)
		);
		expect(
			requestBodies.map((body) => body.identity.operationId)
		).toEqual([OPERATION_ID, NEXT_OPERATION_ID]);
	});

	it("honors an HTTP-date Retry-After value", async () => {
		const now = Date.parse("Mon, 31 Aug 2026 12:00:00 GMT");
		const sleep = vi.fn(async () => {});
		const transport = vi.fn(async () =>
			transport.mock.calls.length === 1
				? new Response("rate limited", {
						status: 429,
						headers: { "retry-after": "Mon, 31 Aug 2026 12:00:03 GMT" },
					})
				: new Response(JSON.stringify(successResponse()), {
						status: 200,
						headers: { "content-type": "application/json" },
					})
		);
		const provider = createHostedDemoProvider({
			transport,
			clientVersion: "0.5.0",
			installationId: INSTALLATION_ID,
			sessionId: SESSION_ID,
			createOperationId: () => OPERATION_ID,
			now: () => now,
			sleep,
		});

		await expect(provider.generateBundle(input())).resolves.toBeDefined();
		expect(sleep).toHaveBeenCalledWith(3_000, undefined);
	});

	it("uses the fallback delay for a malformed Retry-After value", async () => {
		const sleep = vi.fn(async () => {});
		const transport = vi.fn(async () =>
			transport.mock.calls.length === 1
				? new Response("rate limited", {
						status: 429,
						headers: { "retry-after": "-1" },
					})
				: new Response(JSON.stringify(successResponse()), {
						status: 200,
						headers: { "content-type": "application/json" },
					})
		);
		const provider = createHostedDemoProvider({
			transport,
			clientVersion: "0.5.0",
			installationId: INSTALLATION_ID,
			sessionId: SESSION_ID,
			createOperationId: () => OPERATION_ID,
			sleep,
		});

		await expect(provider.generateBundle(input())).resolves.toBeDefined();
		expect(sleep).toHaveBeenCalledWith(10_000, undefined);
	});

	it("uses a ten-second fallback and stops after one 429 retry", async () => {
		const sleep = vi.fn(async () => {});
		const transport = vi.fn(async () => new Response("rate limited", { status: 429 }));
		const provider = createHostedDemoProvider({
			transport,
			clientVersion: "0.5.0",
			installationId: INSTALLATION_ID,
			sessionId: SESSION_ID,
			createOperationId: () => OPERATION_ID,
			sleep,
		});

		await expect(provider.generateBundle(input())).rejects.toThrow(
			"rate limit persisted after retry"
		);
		expect(sleep).toHaveBeenCalledOnce();
		expect(sleep).toHaveBeenCalledWith(10_000, undefined);
		expect(transport).toHaveBeenCalledTimes(2);
	});

	it("posts one bounded bundle and maps a complete success", async () => {
		const { provider, transport } = providerWithResponse(successResponse());

		await expect(provider.generateBundle(input())).resolves.toEqual({
			operationId: OPERATION_ID,
			sections: [
				{
					cue: {
						question: "How does retrieval practice strengthen memory?",
						keywords: ["active recall", "feedback"],
						summary: "Effortful recall strengthens later access to a memory.",
					},
				},
			],
			noteBrief: noteBrief(),
		});
		expect(transport).toHaveBeenCalledTimes(1);
		const request = transport.mock.calls[0][0];
		expect(request.url).toBe("https://api.firstrecall.ai/v1/demo-bundles");
		expect(request.method).toBe("POST");
		expect(request.headers.get("content-type")).toBe("application/json");
		expect(request.headers.has("authorization")).toBe(false);
		expect(await request.json()).toEqual({
			contractVersion: "v1",
			client: { name: "first-recall-obsidian", version: "0.5.0" },
			identity: {
				installationId: INSTALLATION_ID,
				sessionId: SESSION_ID,
				operationId: OPERATION_ID,
			},
			note: input().note,
			sections: input().sections,
		});
	});

	it("accepts and correlates a seven-section bundle", async () => {
		const sections = Array.from({ length: 7 }, (_, index) => ({
			...input().sections[0],
			sectionId: `section-${index + 1}`,
			contentHash: index.toString(16).padStart(8, "0"),
		}));
		const responseSections = sections.map((section) =>
			completeSection(section.sectionId, section.contentHash)
		);
		const { provider, transport } = providerWithResponse(
			successResponse(responseSections)
		);

		const result = await provider.generateBundle(input({ sections }));

		expect(result.sections).toHaveLength(7);
		expect(transport).toHaveBeenCalledTimes(1);
		const request = transport.mock.calls[0][0];
		expect((await request.json()).sections).toEqual(sections);
	});

	it("maps insufficientSource to FirstRecall's standard item error", async () => {
		const { provider } = providerWithResponse(
			successResponse([
				{
					sectionId: "retrieval-practice",
					contentHash: "deadbeef",
					insufficientSource: true,
				},
			])
		);

		const result = await provider.generateBundle(input());

		expect(result.sections).toEqual([{ error: INSUFFICIENT_SOURCE_ERROR }]);
		expect(result.noteBrief).toEqual(noteBrief());
	});

	it("maps trial-limit placeholders to provider-limit unavailable results", async () => {
		const sections = Array.from({ length: 7 }, (_, index) => ({
			...input().sections[0],
			sectionId: `section-${index + 1}`,
			contentHash: index.toString(16).padStart(8, "0"),
		}));
		const responseSections = sections.map((section, index) =>
			index < 5
				? completeSection(section.sectionId, section.contentHash)
				: trialLimitSection(section.sectionId, section.contentHash)
		);
		const { provider } = providerWithResponse(successResponse(responseSections));

		const result = await provider.generateBundle(input({ sections }));

		expect(result.sections.slice(0, 5)).toEqual(
			responseSections.slice(0, 5).map((section) => ({
				cue: {
					question: section.question,
					keywords: section.keywords,
					summary: section.summary,
				},
			}))
		);
		expect(result.sections.slice(5)).toEqual([
			{
				unavailable: {
					reason: "provider-limit",
					providerId: "hosted-demo",
					providerLabel: "FirstRecall trial",
					maxSections: 5,
				},
			},
			{
				unavailable: {
					reason: "provider-limit",
					providerId: "hosted-demo",
					providerLabel: "FirstRecall trial",
					maxSections: 5,
				},
			},
		]);
	});

	it.each([
		["start at the first section", [0, 1, 2]],
		["do not form a suffix", [1]],
	])("rejects trial-limit placeholders that %s", async (_label, placeholderIndexes) => {
		const sections = Array.from({ length: 3 }, (_, index) => ({
			...input().sections[0],
			sectionId: `section-${index + 1}`,
			contentHash: index.toString(16).padStart(8, "0"),
		}));
		const responseSections = sections.map((section, index) =>
			placeholderIndexes.includes(index)
				? trialLimitSection(section.sectionId, section.contentHash)
				: completeSection(section.sectionId, section.contentHash)
		);
		const { provider } = providerWithResponse(successResponse(responseSections));

		await expect(provider.generateBundle(input({ sections }))).rejects.toBeInstanceOf(
			HostedDemoProtocolError
		);
	});

	it.each([
		["operation id", successResponse([completeSection()], NEXT_OPERATION_ID)],
		["section count", successResponse([completeSection(), completeSection("extra", "cafebabe")])],
		["section order", successResponse([completeSection("other", "deadbeef")])],
		["content hash", successResponse([completeSection("retrieval-practice", "cafebabe")])],
	])("rejects a %s correlation mismatch without returning local results", async (_label, body) => {
		const { provider, transport } = providerWithResponse(body);

		await expect(provider.generateBundle(input())).rejects.toBeInstanceOf(
			HostedDemoProtocolError
		);
		expect(transport).toHaveBeenCalledTimes(1);
	});

	it.each([
		...([
			"INVALID_REQUEST",
			"NOT_FOUND",
			"METHOD_NOT_ALLOWED",
			"REQUEST_TOO_LARGE",
			"UNSUPPORTED_MEDIA_TYPE",
		] as const).map((code) => [`simple unconsumed: ${code}`, failureResponse(code)] as const),
		...([
			"INFERENCE_FAILED",
			"MODEL_OUTPUT_INVALID",
			"MODEL_OUTPUT_INSUFFICIENT",
			"INFERENCE_TIMEOUT",
		] as const).map(
			(code) =>
				[
					`consumed inference: ${code}`,
					failureResponse(code, { attemptConsumed: true }),
				] as const
		),
		[
			"unsupported contract",
			failureResponse("UNSUPPORTED_CONTRACT_VERSION", {
				minimumClientVersion: "0.6.0",
			}),
		],
		[
			"client update",
			failureResponse("CLIENT_UPDATE_REQUIRED", {
				minimumClientVersion: "0.6.0",
			}),
		],
		[
			"burst",
			failureResponse("BURST_LIMITED", {
				retryable: true,
				scope: "network_burst",
				retryAt: "2026-08-24T20:30:00Z",
			}),
		],
		["quota: session", failureResponse("QUOTA_EXHAUSTED", { scope: "session" })],
		[
			"quota: installation hour",
			failureResponse("QUOTA_EXHAUSTED", {
				retryable: true,
				scope: "installation_hour",
				retryAt: "2026-08-24T21:00:00Z",
			}),
		],
		...([
			"installation_day",
			"global_attempts",
			"global_neurons",
		] as const).map(
			(scope) =>
				[
					`quota: ${scope}`,
					failureResponse("QUOTA_EXHAUSTED", {
						retryable: true,
						scope,
						retryAt: "2026-08-25T00:00:00Z",
						resetAt: "2026-08-25T00:00:00Z",
					}),
				] as const
		),
		...(["OPERATION_IN_PROGRESS", "OPERATION_ALREADY_CONSUMED"] as const).map(
			(code) =>
				[
					`operation: ${code}`,
					failureResponse(code, {
						attemptConsumed: true,
						scope: "operation",
					}),
				] as const
		),
		[
			"service unavailable",
			failureResponse("SERVICE_UNAVAILABLE", {
				retryable: true,
				retryAt: "2026-08-24T20:30:00Z",
			}),
		],
		[
			"internal error",
			failureResponse("INTERNAL_ERROR", { attemptConsumed: true }),
		],
	])("accepts a valid failure envelope: %s", async (_label, body) => {
		const { provider, transport } = providerWithResponse(body);

		const error = await provider.generateBundle(input()).catch((reason: unknown) => reason);

		expect(error).toBeInstanceOf(HostedDemoApiError);
		expect(error).toMatchObject({
			message: body.error.message,
			code: body.error.code,
			attemptConsumed: body.attemptConsumed,
			retryable: body.error.retryable,
			scope: body.error.scope,
			retryAt: body.error.retryAt,
			resetAt: body.error.resetAt,
			minimumClientVersion: body.error.minimumClientVersion,
		});
		expect(transport).toHaveBeenCalledTimes(1);
	});

	it.each([
		[
			"simple unconsumed",
			failureResponse("INVALID_REQUEST", { attemptConsumed: true }),
		],
		[
			"consumed inference",
			failureResponse("INFERENCE_FAILED", { attemptConsumed: false }),
		],
		[
			"unsupported contract",
			failureResponse("UNSUPPORTED_CONTRACT_VERSION", { retryable: true }),
		],
		["client update", failureResponse("CLIENT_UPDATE_REQUIRED")],
		[
			"burst",
			failureResponse("BURST_LIMITED", {
				retryable: true,
				scope: "network_burst",
			}),
		],
		[
			"quota: session",
			failureResponse("QUOTA_EXHAUSTED", {
				retryable: true,
				scope: "session",
			}),
		],
		[
			"quota: installation hour",
			failureResponse("QUOTA_EXHAUSTED", {
				retryable: true,
				scope: "installation_hour",
				retryAt: "2026-08-24T21:00:00Z",
				resetAt: "2026-08-24T21:00:00Z",
			}),
		],
		[
			"quota: reset-bearing scopes",
			failureResponse("QUOTA_EXHAUSTED", {
				retryable: true,
				scope: "installation_day",
				retryAt: "2026-08-25T00:00:00Z",
			}),
		],
		[
			"operation",
			failureResponse("OPERATION_IN_PROGRESS", {
				attemptConsumed: true,
			}),
		],
		[
			"service unavailable",
			failureResponse("SERVICE_UNAVAILABLE", {
				retryable: true,
				scope: "network_burst",
			}),
		],
		[
			"internal error",
			failureResponse("INTERNAL_ERROR", { retryable: true }),
		],
	])("rejects an invalid failure envelope: %s", async (_label, body) => {
		const { provider, transport } = providerWithResponse(body);

		await expect(provider.generateBundle(input())).rejects.toBeInstanceOf(
			HostedDemoProtocolError
		);
		expect(transport).toHaveBeenCalledTimes(1);
	});

	it.each([
		["unknown envelope field", { ...successResponse(), unexpected: true }],
		[
			"out-of-bounds cue",
			successResponse([{ ...completeSection(), question: "q".repeat(501) }]),
		],
		[
			"punctuation-only question",
			successResponse([{ ...completeSection(), question: "???" }]),
		],
		[
			"question without a question mark",
			successResponse([
				{
					...completeSection(),
					question: "Retrieval practice strengthens memory.",
				},
			]),
		],
		[
			"punctuation-only say-it-back question",
			{
				...successResponse(),
				bundle: {
					...successResponse().bundle,
					noteBrief: {
						...noteBrief(),
						sayItBack: { ...noteBrief().sayItBack, title: "???" },
					},
				},
			},
		],
		[
			"legacy summary object",
			successResponse([
				{
					...completeSection(),
					summary: {
						takeaway: "Effortful recall strengthens later access to a memory.",
						keyPhrase: "retrieval practice",
						explanation:
							"The act of recall is what produces the learning benefit.",
					},
				},
			]),
		],
	])("rejects a malformed response: %s", async (_label, body) => {
		const { provider } = providerWithResponse(body);

		await expect(provider.generateBundle(input())).rejects.toBeInstanceOf(
			HostedDemoProtocolError
		);
	});

	it.each([
		["no sections", { sections: [] }],
		["invalid section id", { sections: [{ ...input().sections[0], sectionId: "Not Valid" }] }],
		["invalid content hash", { sections: [{ ...input().sections[0], contentHash: "too-long-1" }] }],
		["heading containing Markdown heading syntax", { sections: [{ ...input().sections[0], heading: "## Hidden heading" }] }],
		["section content over 4,000 characters", { sections: [{ ...input().sections[0], content: "x".repeat(4_001) }] }],
		["note context over 12,000 characters", { note: { ...input().note, contextMarkdown: "x".repeat(12_001) } }],
	])("rejects bounded input before transport: %s", async (_label, overrides) => {
		const { provider, transport } = providerWithResponse(successResponse());

		await expect(provider.generateBundle(input(overrides))).rejects.toBeInstanceOf(
			HostedDemoProtocolError
		);
		expect(transport).not.toHaveBeenCalled();
	});

	it("passes aborts through and creates a fresh operation id for every attempt", async () => {
		const operationIds = [OPERATION_ID, NEXT_OPERATION_ID];
		const seenOperationIds: string[] = [];
		const transport = vi.fn(async (request: Request) => {
			const requestBody = (await request.clone().json()) as {
				identity: { operationId: string };
			};
			seenOperationIds.push(requestBody.identity.operationId);
			if (request.signal.aborted) throw request.signal.reason;
			return new Response(
				JSON.stringify(successResponse(undefined, requestBody.identity.operationId)),
				{ status: 200, headers: { "content-type": "application/json" } }
			);
		});
		const provider = createHostedDemoProvider({
			transport,
			clientVersion: "0.5.0",
			installationId: INSTALLATION_ID,
			sessionId: SESSION_ID,
			createOperationId: () => operationIds.shift() ?? NEXT_OPERATION_ID,
		});
		const controller = new AbortController();
		const abortReason = new DOMException("Canceled", "AbortError");
		controller.abort(abortReason);

		await expect(provider.generateBundle(input(), controller.signal)).rejects.toBe(
			abortReason
		);
		await expect(provider.generateBundle(input())).resolves.toMatchObject({
			operationId: NEXT_OPERATION_ID,
		});
		expect(seenOperationIds).toEqual([OPERATION_ID, NEXT_OPERATION_ID]);
		expect(transport).toHaveBeenCalledTimes(2);
	});

	it("maps a realistic three-section request and mixed service response atomically", async () => {
		const realisticInput = input({
			note: {
				title: "Effective Learning Techniques",
				contextMarkdown:
					"# Retrieval practice\nRetrieval practice requires actively recalling information.\n\n# Spaced practice\nSpaced practice distributes review across sessions.\n\n# Interleaving\nInterleaving mixes related problem types.",
			},
			sections: [
				input().sections[0],
				{
					sectionId: "spaced-practice",
					contentHash: "beefdead",
					heading: "Spaced practice",
					content: "Spaced practice distributes review across multiple sessions.",
				},
				{
					sectionId: "interleaving",
					contentHash: "cafebabe",
					heading: "Interleaving",
					content: "Interleaving mixes related problem types during practice.",
				},
			],
		});
		const response = successResponse([
			completeSection(),
			completeSection("spaced-practice", "beefdead"),
			{
				sectionId: "interleaving",
				contentHash: "cafebabe",
				insufficientSource: true,
			},
		]);
		const { provider, transport } = providerWithResponse(response);

		const result = await provider.generateBundle(realisticInput);

		expect(result.sections).toHaveLength(3);
		expect(result.sections[0].cue?.summary).toBe(
			"Effortful recall strengthens later access to a memory."
		);
		expect(result.sections[1].cue?.question).toContain("retrieval practice");
		expect(result.sections[2]).toEqual({ error: INSUFFICIENT_SOURCE_ERROR });
		expect(result.noteBrief.sayItBack.title).toBe(
			"How does retrieval practice strengthen memory?"
		);
		expect(transport).toHaveBeenCalledTimes(1);
	});
});
