import { describe, expect, it } from "vitest";
import {
	buildNoteBriefPrompt,
	NOTE_BRIEF_PROMPT,
} from "../src/review-artifact-prompts";

describe("note brief prompt", () => {
	it("requests an overview of exactly two concise sentences", () => {
		expect(NOTE_BRIEF_PROMPT).toContain("exactly 2 concise sentences");
		expect(NOTE_BRIEF_PROMPT).toContain(
			'never use or begin with the category labels "Core idea", "Review first", or "Self-test"'
		);
		expect(NOTE_BRIEF_PROMPT).toContain(
			'Make the "sayItBack" title the recall question itself'
		);
		expect(
			buildNoteBriefPrompt({
				noteTitle: "Agents",
				fullText: "# Agents\nAgents use tools.",
				sections: [
					{
						heading: "Agents",
						question: "How do agents use tools?",
						keywords: ["agents", "tools"],
					},
				],
			})
		).toContain("exactly 2 concise sentences");
	});
});
