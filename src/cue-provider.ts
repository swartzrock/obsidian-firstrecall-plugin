import type {
	ByokModelOption,
	ByokProviderId,
	ByokProviderStatus,
} from "@swartzrock/byok-runtime";
import type { CueGenerationOptions } from "./cue-generation";
import type { CueOutput, NoteBriefOutput } from "./schemas";

export type FirstRecallCueOutput = CueOutput;
export type FirstRecallNoteBriefOutput = NoteBriefOutput;

export interface FirstRecallCueInput {
	heading: string;
	content: string;
	noteContext?: string;
	options: CueGenerationOptions;
}

export interface FirstRecallCueBatchResult {
	cue?: CueOutput;
	error?: string;
}

export interface FirstRecallNoteBriefSectionInput {
	heading: string;
	question: string;
	keywords: string[];
}

export interface FirstRecallNoteBriefInput {
	noteTitle: string;
	fullText: string;
	sections: FirstRecallNoteBriefSectionInput[];
}

export interface FirstRecallCueProviderRuntime {
	id: ByokProviderId;
	label: string;
	requiresNetwork: boolean;
	requiresDownload: boolean;
	sectionConcurrencyLimit?: number;
	testConnection(): Promise<ByokProviderStatus>;
	listModels(): Promise<ByokModelOption[]>;
	generateCue(
		input: FirstRecallCueInput,
		signal?: AbortSignal
	): Promise<CueOutput>;
	generateCues?(
		inputs: FirstRecallCueInput[],
		signal?: AbortSignal
	): Promise<FirstRecallCueBatchResult[]>;
	generateNoteBrief?(
		input: FirstRecallNoteBriefInput,
		signal?: AbortSignal
	): Promise<NoteBriefOutput>;
}
