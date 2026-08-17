import type {
	ByokModelOption,
	ByokProviderId,
	ByokProviderStatus,
} from "@swartzrock/byok-runtime";
import type { CueGenerationOptions } from "./cue-generation";
import type { CueOutput, NoteBriefOutput } from "./schemas";

export type CueCraftCueOutput = CueOutput;
export type CueCraftNoteBriefOutput = NoteBriefOutput;

export interface CueCraftCueInput {
	heading: string;
	content: string;
	noteContext?: string;
	options: CueGenerationOptions;
}

export interface CueCraftCueBatchResult {
	cue?: CueOutput;
	error?: string;
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
	generateNoteBrief?(
		input: CueCraftNoteBriefInput,
		signal?: AbortSignal
	): Promise<NoteBriefOutput>;
}
