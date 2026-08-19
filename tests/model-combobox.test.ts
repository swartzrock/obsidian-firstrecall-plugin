import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildModelComboboxOptions,
	buildModelComboboxSuggestions,
	filterModelOptions,
	modelOptionSearchText,
	renderModelCombobox,
} from "../src/model-combobox";
import { normalizeStringId, type ModelOption } from "../src/byok-model-options";

function opt(
	id: string,
	overrides: Partial<ModelOption> = {}
): ModelOption {
	return { ...normalizeStringId(id), ...overrides };
}

type ObsidianDomOptions = {
	cls?: string;
	text?: string;
	attr?: Record<string, string>;
};

type ObsidianElementPrototype = HTMLElement & {
	createDiv(opts?: ObsidianDomOptions): HTMLDivElement;
	createEl(tag: string, opts?: ObsidianDomOptions): HTMLElement;
	addClass(cls: string): void;
	removeClass(cls: string): void;
	setAttr(name: string, value: string): void;
};

type TestGlobals = typeof globalThis & {
	window?: Window;
	document?: Document;
};

const testGlobals = globalThis as TestGlobals;
const originalWindow = testGlobals.window;
const originalDocument = testGlobals.document;

function applyDomOptions(el: HTMLElement, opts: ObsidianDomOptions = {}) {
	if (opts.cls) el.className = opts.cls;
	if (opts.text) el.textContent = opts.text;
	for (const [name, value] of Object.entries(opts.attr ?? {})) {
		el.setAttribute(name, value);
	}
}

function setupComboboxDom(): JSDOM {
	const dom = new JSDOM("<div id=\"root\"></div>", {
		pretendToBeVisual: true,
	});
	testGlobals.window = dom.window as unknown as Window;
	testGlobals.document = dom.window.document;
	const proto = dom.window.HTMLElement
		.prototype as unknown as ObsidianElementPrototype;
	proto.createDiv = function (
		this: HTMLElement,
		opts?: ObsidianDomOptions
	): HTMLDivElement {
		const el = this.ownerDocument.createElement("div");
		applyDomOptions(el, opts);
		this.appendChild(el);
		return el;
	};
	proto.createEl = function (
		this: HTMLElement,
		tag: string,
		opts?: ObsidianDomOptions
	): HTMLElement {
		const el = this.ownerDocument.createElement(tag);
		applyDomOptions(el, opts);
		this.appendChild(el);
		return el;
	};
	proto.addClass = function (this: HTMLElement, cls: string): void {
		this.classList.add(...cls.split(" "));
	};
	proto.removeClass = function (this: HTMLElement, cls: string): void {
		this.classList.remove(...cls.split(" "));
	};
	proto.setAttr = function (
		this: HTMLElement,
		name: string,
		value: string
	): void {
		this.setAttribute(name, value);
	};
	return dom;
}

afterEach(() => {
	if (originalWindow) {
		testGlobals.window = originalWindow;
	} else {
		delete testGlobals.window;
	}
	if (originalDocument) {
		testGlobals.document = originalDocument;
	} else {
		delete testGlobals.document;
	}
});

describe("buildModelComboboxOptions", () => {
	it("keeps the current custom model visible when it is not in fetched options", () => {
		const options = buildModelComboboxOptions({
			options: [opt("openai/gpt-4o"), opt("anthropic/claude-sonnet-4")],
			currentModelId: "custom-provider/private-model",
		});
		expect(options[0]).toMatchObject({
			id: "custom-provider/private-model",
			label: "custom-provider/private-model",
		});
		expect(options.map((option) => option.id)).toContain("openai/gpt-4o");
	});

	it("preserves fetched labels for the current model", () => {
		const options = buildModelComboboxOptions({
			options: [
				opt("openai/gpt-4o", {
					label: "OpenAI: GPT-4o",
				}),
			],
			currentModelId: "openai/gpt-4o",
		});
		expect(options[0]).toMatchObject({
			id: "openai/gpt-4o",
			label: "OpenAI: GPT-4o",
		});
	});

	it("does not create an empty custom option when no model is selected", () => {
		expect(
			buildModelComboboxOptions({
				options: [],
				currentModelId: "   ",
			})
		).toEqual([]);
	});
});

describe("filterModelOptions", () => {
	const options = [
		opt("anthropic/claude-sonnet-4", {
			label: "Anthropic: Claude Sonnet 4",
		}),
		opt("openai/gpt-4o", {
			label: "OpenAI: GPT-4o",
		}),
		opt("google/gemini-pro", {
			label: "Google: Gemini Pro",
		}),
	];

	it("matches by model ID and label", () => {
		expect(filterModelOptions(options, "gpt").map((o) => o.id)).toEqual([
			"openai/gpt-4o",
		]);
		expect(filterModelOptions(options, "sonnet").map((o) => o.id)).toEqual([
			"anthropic/claude-sonnet-4",
		]);
		expect(filterModelOptions(options, "google").map((o) => o.id)).toEqual([
			"google/gemini-pro",
		]);
	});

	it("returns all options for an empty query", () => {
		expect(filterModelOptions(options, "  ")).toHaveLength(3);
	});
});

describe("buildModelComboboxSuggestions", () => {
	it("filters by query without adding the transient search text as a custom option", () => {
		const suggestions = buildModelComboboxSuggestions({
			options: [
				opt("qwen/qwen3-8b", { label: "Qwen: Qwen3 8B" }),
				opt("qwen/qwen3-14b", { label: "Qwen: Qwen3 14B" }),
			],
			selectedModelId: "",
			query: "qwen3",
		});
		expect(suggestions.map((option) => option.id)).toEqual([
			"qwen/qwen3-8b",
			"qwen/qwen3-14b",
		]);
		expect(suggestions.map((option) => option.id)).not.toContain("qwen3");
	});

	it("still preserves a saved custom model when it matches the query", () => {
		const suggestions = buildModelComboboxSuggestions({
			options: [opt("qwen/qwen3-8b")],
			selectedModelId: "custom/private-model",
			query: "custom",
		});
		expect(suggestions.map((option) => option.id)).toEqual([
			"custom/private-model",
		]);
	});
});

describe("modelOptionSearchText", () => {
	it("includes model ID and label", () => {
		expect(
			modelOptionSearchText(
				opt("openai/gpt-4o", { label: "OpenAI: GPT-4o" })
			)
		).toBe("openai/gpt-4o openai: gpt-4o");
	});
});

describe("renderModelCombobox", () => {
	it("renders a leading option above a divider", () => {
		const dom = setupComboboxDom();
		const container = dom.window.document.getElementById("root");
		if (!container) throw new Error("Missing test root");

		renderModelCombobox({
			containerEl: container,
			value: "claude-sonnet-5",
			options: [
				normalizeStringId("claude-opus-4-8"),
				normalizeStringId("claude-sonnet-5"),
			],
			leadingOption: {
				id: "",
				label: "CLI Default",
			},
			placeholder: "CLI default",
			emptyMessage: "No matching models.",
			onCommit: () => {},
		});

		const input = container.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("Missing combobox input");
		input.dispatchEvent(new dom.window.Event("focus"));

		const listChildren = [
			...container.querySelector<HTMLElement>("[role='listbox']")!.children,
		];
		expect(listChildren.map((child) => child.textContent)).toEqual([
			"CLI Default",
			"",
			"claude-sonnet-5",
			"claude-opus-4-8",
		]);
		expect(
			listChildren[1].classList.contains("firstrecall-model-combobox-divider")
		).toBe(true);
		expect(listChildren[1].getAttribute("role")).toBe("separator");
	});

	it("commits an empty value when the leading default option is selected", () => {
		const dom = setupComboboxDom();
		const container = dom.window.document.getElementById("root");
		if (!container) throw new Error("Missing test root");
		const commits: string[] = [];

		renderModelCombobox({
			containerEl: container,
			value: "claude-sonnet-5",
			options: [normalizeStringId("claude-sonnet-5")],
			leadingOption: {
				id: "",
				label: "CLI Default",
			},
			placeholder: "CLI default",
			emptyMessage: "No matching models.",
			onCommit: (value) => {
				commits.push(value);
			},
		});

		const input = container.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("Missing combobox input");
		input.dispatchEvent(new dom.window.Event("focus"));
		const defaultOption = container.querySelector<HTMLButtonElement>(
			"[role='option']"
		);
		if (!defaultOption) throw new Error("Missing default option");
		defaultOption.dispatchEvent(
			new dom.window.MouseEvent("mousedown", {
				bubbles: true,
				cancelable: true,
			})
		);

		expect(input.value).toBe("");
		expect(commits).toEqual([""]);
	});

	it("shows all options on open when a selected model is displayed", () => {
		const dom = setupComboboxDom();
		const container = dom.window.document.getElementById("root");
		if (!container) throw new Error("Missing test root");

		renderModelCombobox({
			containerEl: container,
			value: "claude-sonnet-5",
			options: [
				normalizeStringId("claude-fable-5"),
				normalizeStringId("claude-haiku-4-5"),
				normalizeStringId("claude-opus-4-8"),
				normalizeStringId("claude-sonnet-5"),
			],
			placeholder: "Choose a model...",
			emptyMessage: "No matching models.",
			onCommit: () => {},
		});

		const input = container.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("Missing combobox input");
		input.dispatchEvent(new dom.window.Event("focus"));

		expect(
			[...container.querySelectorAll<HTMLButtonElement>("[role='option']")].map(
				(option) => option.textContent
			)
		).toEqual([
			"claude-sonnet-5",
			"claude-fable-5",
			"claude-haiku-4-5",
			"claude-opus-4-8",
		]);
	});

	it("filters options after the user types in the model input", () => {
		const dom = setupComboboxDom();
		const container = dom.window.document.getElementById("root");
		if (!container) throw new Error("Missing test root");

		renderModelCombobox({
			containerEl: container,
			value: "claude-sonnet-5",
			options: [
				normalizeStringId("claude-fable-5"),
				normalizeStringId("claude-haiku-4-5"),
				normalizeStringId("claude-opus-4-8"),
				normalizeStringId("claude-sonnet-5"),
			],
			placeholder: "Choose a model...",
			emptyMessage: "No matching models.",
			onCommit: () => {},
		});

		const input = container.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("Missing combobox input");
		input.dispatchEvent(new dom.window.Event("focus"));
		input.value = "opus";
		input.dispatchEvent(new dom.window.Event("input"));

		expect(
			[...container.querySelectorAll<HTMLButtonElement>("[role='option']")].map(
				(option) => option.textContent
			)
		).toEqual(["claude-opus-4-8"]);
	});

	it("does not preselect the first option when the menu opens", () => {
		const dom = setupComboboxDom();
		const container = dom.window.document.getElementById("root");
		if (!container) throw new Error("Missing test root");

		renderModelCombobox({
			containerEl: container,
			value: "",
			options: [
				normalizeStringId("Entire vault"),
				normalizeStringId("ClaudeNotes"),
			],
			placeholder: "Choose a scope...",
			emptyMessage: "No matching scopes.",
			onCommit: () => {},
		});

		const input = container.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("Missing combobox input");
		input.dispatchEvent(new dom.window.Event("focus"));

		const selectedStates = () =>
			[...container.querySelectorAll<HTMLButtonElement>("[role='option']")].map(
				(option) => option.getAttribute("aria-selected")
			);
		expect(selectedStates()).toEqual(["false", "false"]);

		input.dispatchEvent(
			new dom.window.KeyboardEvent("keydown", {
				key: "ArrowDown",
				bubbles: true,
				cancelable: true,
			})
		);
		expect(selectedStates()).toEqual(["true", "false"]);
	});

	it("commits a selected option once when blur follows mouse selection", async () => {
		const dom = setupComboboxDom();
		const container = dom.window.document.getElementById("root");
		if (!container) throw new Error("Missing test root");
		const commits: string[] = [];

		renderModelCombobox({
			containerEl: container,
			value: "",
			options: [normalizeStringId("ClaudeNotes")],
			placeholder: "Choose a folder...",
			emptyMessage: "No matching folders.",
			onCommit: (value) => {
				commits.push(value);
			},
		});

		const input = container.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("Missing combobox input");
		input.dispatchEvent(new dom.window.Event("focus"));
		const option = container.querySelector<HTMLButtonElement>("[role='option']");
		if (!option) throw new Error("Missing combobox option");

		expect(option.getAttribute("title")).toBeNull();
		option.dispatchEvent(
			new dom.window.MouseEvent("mousedown", {
				bubbles: true,
				cancelable: true,
			})
		);
		input.dispatchEvent(new dom.window.FocusEvent("blur"));
		await new Promise((resolve) => dom.window.setTimeout(resolve, 150));

		expect(commits).toEqual(["ClaudeNotes"]);
	});
});
