import { z } from "zod/v3";
import type { FirstRecallCueBatchResult } from "./cue-provider";
import { firstRecallProviderDefinition } from "./byok-provider-metadata";
import {
	formatZodError,
	INSUFFICIENT_SOURCE_ERROR,
	type NoteBriefOutput,
} from "./schemas";
import { abortableDelay } from "./provider-request-rate";

export const HOSTED_DEMO_ENDPOINT =
	"https://api.firstrecall.ai/v1/demo-bundles";

const hostedDemoDefinition = firstRecallProviderDefinition("hosted-demo");

const uuidSchema = z.string().regex(
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
	"must be a lowercase UUID"
);
const sectionIdSchema = z.string().regex(/^[a-z0-9-]{1,256}$/);
const contentHashSchema = z.string().regex(/^[0-9a-f]{8}$/);
const headingSchema = z
	.string()
	.min(1)
	.max(200)
	.regex(
		/^(?![ \t]{0,3}#{1,6}(?:[ \t]+|$))(?![\s\S]*\n[ \t]{0,3}#{1,6}(?:[ \t]+|$))(?![\s\S]*[^\s\n][^\n]*\n[ \t]{0,3}(?:=+|-+)[ \t]*(?:\n|$))/,
		"must not contain Markdown heading syntax"
	);
const questionSchema = z
	.string()
	.min(1)
	.max(500)
	.regex(
		/^(?=(?:[^\p{L}\p{N}]*[\p{L}\p{N}]){2})[\s\S]*[?？؟]\s*$/u,
		"must contain at least two letters or numbers and end with a question mark"
	);

const hostedDemoSectionInputSchema = z
	.object({
		sectionId: sectionIdSchema,
		contentHash: contentHashSchema,
		heading: headingSchema,
		content: z.string().min(1).max(4_000),
	})
	.strict();

const hostedDemoRequestSchema = z
	.object({
		contractVersion: z.literal("v1"),
		client: z
			.object({
				name: z.literal("first-recall-obsidian"),
				version: z.string().min(1).max(64),
			})
			.strict(),
		identity: z
			.object({
				installationId: uuidSchema,
				sessionId: uuidSchema,
				operationId: uuidSchema,
			})
			.strict(),
		note: z
			.object({
				title: z.string().min(1).max(200),
				contextMarkdown: z.string().min(1).max(12_000),
			})
			.strict(),
		sections: z.array(hostedDemoSectionInputSchema).min(1),
	})
	.strict();

const completeSectionSchema = z
	.object({
		sectionId: sectionIdSchema,
		contentHash: contentHashSchema,
		question: questionSchema,
		keywords: z.array(z.string().min(1).max(80)).min(2).max(5),
		summary: z.string().min(1).max(500),
	})
	.strict();

const trialLimitSectionSchema = completeSectionSchema.extend({
	placeholderReason: z.literal("trial_limit"),
});

const insufficientSectionSchema = z
	.object({
		sectionId: sectionIdSchema,
		contentHash: contentHashSchema,
		insufficientSource: z.literal(true),
	})
	.strict();

const noteBriefCardSchema = z
	.object({
		title: z.string().min(1).max(200),
		detail: z.string().min(1).max(600),
	})
	.strict();

const sayItBackCardSchema = noteBriefCardSchema.extend({
	title: questionSchema.max(200),
});

const hostedDemoNoteBriefSchema = z
	.object({
		overview: z.string().min(1).max(1_200),
		whatMatters: noteBriefCardSchema,
		reviewFirst: noteBriefCardSchema,
		sayItBack: sayItBackCardSchema,
	})
	.strict();

const successResponseSchema = z
	.object({
		contractVersion: z.literal("v1"),
		status: z.literal("success"),
		operationId: uuidSchema,
		attemptConsumed: z.literal(true),
		bundle: z
			.object({
				sections: z
					.array(
						z.union([
							completeSectionSchema,
							trialLimitSectionSchema,
							insufficientSectionSchema,
						])
					)
					.min(1),
				noteBrief: hostedDemoNoteBriefSchema,
			})
			.strict(),
	})
	.strict();

const hostedDemoErrorCodeSchema = z.enum([
	"INVALID_REQUEST",
	"NOT_FOUND",
	"METHOD_NOT_ALLOWED",
	"REQUEST_TOO_LARGE",
	"UNSUPPORTED_MEDIA_TYPE",
	"UNSUPPORTED_CONTRACT_VERSION",
	"CLIENT_UPDATE_REQUIRED",
	"BURST_LIMITED",
	"QUOTA_EXHAUSTED",
	"OPERATION_IN_PROGRESS",
	"OPERATION_ALREADY_CONSUMED",
	"SERVICE_UNAVAILABLE",
	"INFERENCE_FAILED",
	"MODEL_OUTPUT_INVALID",
	"MODEL_OUTPUT_INSUFFICIENT",
	"INFERENCE_TIMEOUT",
	"INTERNAL_ERROR",
]);

const failureResponseSchema = z
	.object({
		contractVersion: z.literal("v1"),
		status: z.literal("error"),
		operationId: uuidSchema.nullable(),
		attemptConsumed: z.boolean(),
		error: z
			.object({
				code: hostedDemoErrorCodeSchema,
				message: z.string().min(1),
				retryable: z.boolean(),
				scope: z
					.enum([
						"network_burst",
						"session",
						"installation_hour",
						"installation_day",
						"global_attempts",
						"global_neurons",
						"operation",
					])
					.nullable(),
				retryAt: z.string().datetime({ offset: false }).nullable(),
				resetAt: z.string().datetime({ offset: false }).nullable(),
				minimumClientVersion: z.string().min(1).max(64).nullable(),
			})
			.strict(),
	})
	.strict()
	.superRefine((response, context) => {
		if (failureFieldsMatchContract(response)) return;
		context.addIssue({
			code: z.ZodIssueCode.custom,
			message: `fields do not match error code ${response.error.code}`,
		});
	});

type FailureResponse = z.infer<typeof failureResponseSchema>;
export type HostedDemoErrorCode = z.infer<typeof hostedDemoErrorCodeSchema>;

const SIMPLE_UNCONSUMED_CODES = new Set<HostedDemoErrorCode>([
	"INVALID_REQUEST",
	"NOT_FOUND",
	"METHOD_NOT_ALLOWED",
	"REQUEST_TOO_LARGE",
	"UNSUPPORTED_MEDIA_TYPE",
]);
const CONSUMED_INFERENCE_CODES = new Set<HostedDemoErrorCode>([
	"INFERENCE_FAILED",
	"MODEL_OUTPUT_INVALID",
	"MODEL_OUTPUT_INSUFFICIENT",
	"INFERENCE_TIMEOUT",
]);

function hasNoFailureMetadata(response: FailureResponse): boolean {
	return (
		response.error.retryable === false &&
		response.error.scope === null &&
		response.error.retryAt === null &&
		response.error.resetAt === null &&
		response.error.minimumClientVersion === null
	);
}

function failureFieldsMatchContract(response: FailureResponse): boolean {
	const { error } = response;
	if (SIMPLE_UNCONSUMED_CODES.has(error.code)) {
		return response.attemptConsumed === false && hasNoFailureMetadata(response);
	}
	if (CONSUMED_INFERENCE_CODES.has(error.code)) {
		return response.attemptConsumed === true && hasNoFailureMetadata(response);
	}
	if (error.code === "UNSUPPORTED_CONTRACT_VERSION") {
		return (
			response.attemptConsumed === false &&
			error.retryable === false &&
			error.scope === null &&
			error.retryAt === null &&
			error.resetAt === null
		);
	}
	if (error.code === "CLIENT_UPDATE_REQUIRED") {
		return (
			response.attemptConsumed === false &&
			error.retryable === false &&
			error.scope === null &&
			error.retryAt === null &&
			error.resetAt === null &&
			error.minimumClientVersion !== null
		);
	}
	if (error.code === "BURST_LIMITED") {
		return (
			response.attemptConsumed === false &&
			error.retryable === true &&
			error.scope === "network_burst" &&
			error.retryAt !== null &&
			error.resetAt === null &&
			error.minimumClientVersion === null
		);
	}
	if (error.code === "QUOTA_EXHAUSTED") {
		if (error.scope === "session") {
			return (
				response.attemptConsumed === false &&
				error.retryable === false &&
				error.retryAt === null &&
				error.resetAt === null &&
				error.minimumClientVersion === null
			);
		}
		const retryableScope =
			error.scope === "installation_hour" ||
			error.scope === "installation_day" ||
			error.scope === "global_attempts" ||
			error.scope === "global_neurons";
		const resetMatchesScope =
			error.scope === "installation_hour"
				? error.resetAt === null
				: error.resetAt !== null;
		return (
			response.attemptConsumed === false &&
			error.retryable === true &&
			retryableScope &&
			error.retryAt !== null &&
			resetMatchesScope &&
			error.minimumClientVersion === null
		);
	}
	if (
		error.code === "OPERATION_IN_PROGRESS" ||
		error.code === "OPERATION_ALREADY_CONSUMED"
	) {
		return (
			response.attemptConsumed === true &&
			error.retryable === false &&
			error.scope === "operation" &&
			error.retryAt === null &&
			error.resetAt === null &&
			error.minimumClientVersion === null
		);
	}
	if (error.code === "SERVICE_UNAVAILABLE") {
		return (
			response.attemptConsumed === false &&
			error.retryable === true &&
			error.scope === null &&
			error.resetAt === null &&
			error.minimumClientVersion === null
		);
	}
	return error.code === "INTERNAL_ERROR" && hasNoFailureMetadata(response);
}

const hostedDemoResponseSchema = z.union([
	successResponseSchema,
	failureResponseSchema,
]);

export interface HostedDemoSectionInput {
	sectionId: string;
	contentHash: string;
	heading: string;
	content: string;
}

export interface HostedDemoBundleInput {
	note: {
		title: string;
		contextMarkdown: string;
	};
	sections: HostedDemoSectionInput[];
}

export interface HostedDemoBundleResult {
	operationId: string;
	sections: FirstRecallCueBatchResult[];
	noteBrief: NoteBriefOutput;
}

export interface HostedDemoTransport {
	(request: Request): Promise<Response>;
}

export interface HostedDemoProviderDeps {
	transport: HostedDemoTransport;
	clientVersion: string;
	installationId: string;
	sessionId: string;
	createOperationId(): string;
	now?(): number;
	sleep?(milliseconds: number, signal?: AbortSignal): Promise<void>;
}

export interface HostedDemoProvider {
	generateBundle(
		input: HostedDemoBundleInput,
		signal?: AbortSignal
	): Promise<HostedDemoBundleResult>;
}

export class HostedDemoProtocolError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HostedDemoProtocolError";
	}
}

export class HostedDemoApiError extends Error {
	readonly code: HostedDemoErrorCode;
	readonly attemptConsumed: boolean;
	readonly retryable: boolean;
	readonly scope: FailureResponse["error"]["scope"];
	readonly retryAt: string | null;
	readonly resetAt: string | null;
	readonly minimumClientVersion: string | null;

	constructor(response: FailureResponse) {
		super(response.error.message);
		this.name = "HostedDemoApiError";
		this.code = response.error.code;
		this.attemptConsumed = response.attemptConsumed;
		this.retryable = response.error.retryable;
		this.scope = response.error.scope;
		this.retryAt = response.error.retryAt;
		this.resetAt = response.error.resetAt;
		this.minimumClientVersion = response.error.minimumClientVersion;
	}
}

function protocolError(message: string): HostedDemoProtocolError {
	return new HostedDemoProtocolError(`Hosted demo API ${message}`);
}

function logResponse(response: Response, body: unknown): void {
	// eslint-disable-next-line obsidianmd/rule-custom-message -- Trial API diagnostics are intentionally visible in Obsidian's developer console.
	console.log("[FirstRecall trial] Response", {
		status: response.status,
		headers: Object.fromEntries(response.headers.entries()),
		body,
	});
}

function retryAfterMilliseconds(value: string | null, now: number): number {
	if (value === null) return 10_000;
	if (/^\d+$/.test(value.trim())) return Number(value) * 1_000;
	const retryAt = Date.parse(value);
	return Number.isNaN(retryAt) || retryAt <= now ? 10_000 : retryAt - now;
}

function mapSuccessResponse(
	response: z.infer<typeof successResponseSchema>,
	input: HostedDemoBundleInput
): HostedDemoBundleResult {
	if (response.bundle.sections.length !== input.sections.length) {
		throw protocolError("returned a different section count");
	}
	for (let index = 0; index < input.sections.length; index++) {
		const expected = input.sections[index];
		const actual = response.bundle.sections[index];
		if (
			actual.sectionId !== expected.sectionId ||
			actual.contentHash !== expected.contentHash
		) {
			throw protocolError(`returned mismatched correlation for section ${index + 1}`);
		}
	}
	const trialLimitStart = response.bundle.sections.findIndex(
		(section) => "placeholderReason" in section
	);
	if (
		trialLimitStart === 0 ||
		(trialLimitStart > 0 &&
			response.bundle.sections
				.slice(trialLimitStart)
				.some((section) => !("placeholderReason" in section)))
	) {
		throw protocolError("returned invalid trial-limit placeholder ordering");
	}
	return {
		operationId: response.operationId,
		sections: response.bundle.sections.map((section) => {
			if ("placeholderReason" in section) {
				return {
					unavailable: {
						reason: "provider-limit",
						providerId: hostedDemoDefinition.id,
						providerLabel: hostedDemoDefinition.label,
						maxSections: trialLimitStart,
					},
				};
			}
			if ("insufficientSource" in section) {
				return { error: INSUFFICIENT_SOURCE_ERROR };
			}
			return {
				cue: {
					question: section.question,
					keywords: section.keywords,
					summary: section.summary,
				},
			};
		}),
		noteBrief: response.bundle.noteBrief,
	};
}

export function createHostedDemoProvider(
	deps: HostedDemoProviderDeps
): HostedDemoProvider {
	return {
		async generateBundle(input, signal) {
			for (let attempt = 0; attempt < 2; attempt++) {
				const operationId = deps.createOperationId();
				const requestBody = hostedDemoRequestSchema.safeParse({
					contractVersion: "v1",
					client: {
						name: "first-recall-obsidian",
						version: deps.clientVersion,
					},
					identity: {
						installationId: deps.installationId,
						sessionId: deps.sessionId,
						operationId,
					},
					note: input.note,
					sections: input.sections,
				});
				if (!requestBody.success) {
					throw protocolError(
						`request is invalid: ${formatZodError(requestBody.error)}`
					);
				}

				const request = new Request(HOSTED_DEMO_ENDPOINT, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(requestBody.data),
					signal,
				});
				// eslint-disable-next-line obsidianmd/rule-custom-message -- Trial API diagnostics are intentionally visible in Obsidian's developer console.
				console.log("[FirstRecall trial] Request", {
					url: request.url,
					method: request.method,
					headers: Object.fromEntries(request.headers.entries()),
					body: requestBody.data,
				});
				const response = await deps.transport(request);

				let responseText = await response.text();
				if (response.status === 429) {
					logResponse(response, responseText);
					if (attempt === 1) {
						throw protocolError("rate limit persisted after retry");
					}
					await (deps.sleep ?? abortableDelay)(
						retryAfterMilliseconds(
							response.headers.get("retry-after"),
							(deps.now ?? Date.now)()
						),
						signal
					);
					continue;
				}

				let rawResponse: unknown;
				try {
					rawResponse = JSON.parse(responseText) as unknown;
				} catch {
					logResponse(response, responseText);
					throw protocolError("returned a response that was not valid JSON");
				}
				responseText = "";
				logResponse(response, rawResponse);
				const parsed = hostedDemoResponseSchema.safeParse(rawResponse);
				if (!parsed.success) {
					throw protocolError(
						`response could not be validated: ${formatZodError(parsed.error)}`
					);
				}
				if (
					parsed.data.operationId !== null &&
					parsed.data.operationId !== operationId
				) {
					throw protocolError("returned a mismatched operation id");
				}
				if (parsed.data.status === "error") {
					throw new HostedDemoApiError(parsed.data);
				}
				return mapSuccessResponse(parsed.data, input);
			}
			throw protocolError("rate limit persisted after retry");
		},
	};
}
