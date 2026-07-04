import type {
	ByokModelOption,
	ByokProviderId,
	ByokProviderStatus,
} from "@cuecraft/byok";
import type { CueGenerationOptions } from "./cue-generation";
import type { CueOutput, NoteBriefOutput, SummaryOutput } from "./schemas";

export type CueCraftCueConfidence = "high" | "medium" | "low";
export type CueCraftCueOutput = CueOutput;
export type CueCraftSummaryOutput = SummaryOutput;
export type CueCraftNoteBriefOutput = NoteBriefOutput;

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

export interface CueCraftNoteBriefSectionInput {
	heading: string;
	question: string;
	keywords: string[];
}

export interface CueCraftNoteBriefInput {
	noteTitle: string;
	fullText: string;
	sections: CueCraftNoteBriefSectionInput[];
}

export interface CueCraftCueProviderRuntime {
	id: ByokProviderId;
	label: string;
	requiresNetwork: boolean;
	requiresDownload: boolean;
	sectionConcurrencyLimit?: number;
	testConnection(): Promise<ByokProviderStatus>;
	listModels(): Promise<ByokModelOption[]>;
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
	generateNoteBrief?(
		input: CueCraftNoteBriefInput,
		signal?: AbortSignal
	): Promise<NoteBriefOutput>;
}
