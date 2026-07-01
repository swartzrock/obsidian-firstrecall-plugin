import type {
	ByokListedModel,
	ByokProviderId,
	ByokProviderStatus,
} from "@cuecraft/byok";
import type { CueGenerationOptions } from "./cue-generation";
import type { CueOutput, SummaryOutput } from "./schemas";

export type CueCraftCueConfidence = "high" | "medium" | "low";
export type CueCraftCueOutput = CueOutput;
export type CueCraftSummaryOutput = SummaryOutput;

export interface CueCraftCueInput {
	heading: string;
	content: string;
	noteContext?: string;
	preset: string;
	options?: Partial<CueGenerationOptions>;
}

export interface CueCraftCueBatchResult {
	cue?: CueOutput;
	error?: string;
}

export interface CueCraftSummaryInput {
	noteTitle: string;
	fullText: string;
	sectionQuestions: string[];
}

export interface CueCraftCueProviderRuntime {
	id: ByokProviderId;
	label: string;
	requiresNetwork: boolean;
	requiresDownload: boolean;
	sectionConcurrencyLimit?: number;
	testConnection(): Promise<ByokProviderStatus>;
	listModels?(): Promise<ByokListedModel[]>;
	generateCue(
		input: CueCraftCueInput,
		signal?: AbortSignal
	): Promise<CueOutput>;
	generateCues?(
		inputs: CueCraftCueInput[],
		signal?: AbortSignal
	): Promise<CueCraftCueBatchResult[]>;
	generateSummary(
		input: CueCraftSummaryInput,
		signal?: AbortSignal
	): Promise<SummaryOutput>;
}
