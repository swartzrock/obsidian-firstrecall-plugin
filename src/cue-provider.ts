import type {
	ByokModelOption,
	ByokProviderId,
	ByokProviderStatus,
} from "@swartzrock/byok-runtime";
import type { CueGenerationOptions } from "./cue-generation";
import type { CueOutput, NoteBriefOutput } from "./schemas";

export type FirstRecallCueOutput = CueOutput;
export type FirstRecallNoteBriefOutput = NoteBriefOutput;
export type FirstRecallProviderId = ByokProviderId;

export interface FirstRecallCueInput {
	heading: string;
	content: string;
	noteContext?: string;
	options: CueGenerationOptions;
}

export interface FirstRecallSectionUnavailable {
	reason: "provider-limit";
	providerId: FirstRecallProviderId;
	providerLabel: string;
	maxSections: number;
}

export type FirstRecallCueBatchResult =
	| { cue: CueOutput }
	| { error: string }
	| { unavailable: FirstRecallSectionUnavailable };

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
	id: FirstRecallProviderId;
	label: string;
	requiresNetwork: boolean;
	requiresDownload: boolean;
	sectionConcurrencyLimit?: number;
	/** Maximum cards this provider can generate for one note, in document order. */
	maxGeneratedSections?: number;
	testConnection(): Promise<ByokProviderStatus>;
	listModels(): Promise<ByokModelOption[]>;
	generateCue?(
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
