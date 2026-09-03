import type { ByokProviderId } from "@swartzrock/byok-runtime";
import anthropicSvg from "@lobehub/icons-static-svg/icons/claude-color.svg?raw";
import openaiSvg from "@lobehub/icons-static-svg/icons/openai.svg?raw";
import googleSvg from "@lobehub/icons-static-svg/icons/gemini-color.svg?raw";
import xaiSvg from "@lobehub/icons-static-svg/icons/grok.svg?raw";
import openrouterSvg from "@lobehub/icons-static-svg/icons/openrouter-color.svg?raw";
import groqSvg from "@lobehub/icons-static-svg/icons/groq.svg?raw";
import mistralSvg from "@lobehub/icons-static-svg/icons/mistral-color.svg?raw";
import deepseekSvg from "@lobehub/icons-static-svg/icons/deepseek-color.svg?raw";
import deepinfraSvg from "@lobehub/icons-static-svg/icons/deepinfra-color.svg?raw";
import togetherSvg from "@lobehub/icons-static-svg/icons/together-color.svg?raw";
import fireworksSvg from "@lobehub/icons-static-svg/icons/fireworks-color.svg?raw";
import ollamaSvg from "@lobehub/icons-static-svg/icons/ollama.svg?raw";
import lmStudioSvg from "@lobehub/icons-static-svg/icons/lmstudio.svg?raw";
import codexCliSvg from "@lobehub/icons-static-svg/icons/codex-color.svg?raw";
import claudeCliSvg from "@lobehub/icons-static-svg/icons/claudecode-color.svg?raw";
import firstRecallHostedSvg from "../logo-light.svg?raw";

// Third-party icons come from the @lobehub/icons-static-svg package
// (https://github.com/lobehub/lobe-icons) as full raw <svg> markup. Consumers parse the
// viewBox, <path> elements, and any gradient <defs> out of it (see
// parseProviderIconViewBox / parseProviderIconGradients) rather than us hand-copying path
// data into this file.
export interface FirstRecallProviderIconDefinition {
	source: "firstrecall" | "lobehub";
	sourceUrl: string;
	svg: string;
}

const LOBEHUB_ICONS_LIBRARY =
	"https://github.com/lobehub/lobe-icons/blob/master/packages/static-svg/icons";

export const HOSTED_DEMO_PROVIDER_ICON = {
	source: "firstrecall",
	sourceUrl: "logo-light.svg",
	svg: firstRecallHostedSvg,
} as const satisfies FirstRecallProviderIconDefinition;

function lobehubIcon(fileName: string, svg: string): FirstRecallProviderIconDefinition {
	return {
		source: "lobehub",
		sourceUrl: `${LOBEHUB_ICONS_LIBRARY}/${fileName}`,
		svg,
	};
}

export const BYOK_PROVIDER_ICONS = {
	anthropic: lobehubIcon("claude-color.svg", anthropicSvg),
	openai: lobehubIcon("openai.svg", openaiSvg),
	google: lobehubIcon("gemini-color.svg", googleSvg),
	xai: lobehubIcon("grok.svg", xaiSvg),
	openrouter: lobehubIcon("openrouter-color.svg", openrouterSvg),
	groq: lobehubIcon("groq.svg", groqSvg),
	mistral: lobehubIcon("mistral-color.svg", mistralSvg),
	deepseek: lobehubIcon("deepseek-color.svg", deepseekSvg),
	deepinfra: lobehubIcon("deepinfra-color.svg", deepinfraSvg),
	together: lobehubIcon("together-color.svg", togetherSvg),
	fireworks: lobehubIcon("fireworks-color.svg", fireworksSvg),
	ollama: lobehubIcon("ollama.svg", ollamaSvg),
	"lm-studio": lobehubIcon("lmstudio.svg", lmStudioSvg),
	"codex-cli": lobehubIcon("codex-color.svg", codexCliSvg),
	"claude-cli": lobehubIcon("claudecode-color.svg", claudeCliSvg),
} as const satisfies Partial<Record<ByokProviderId, FirstRecallProviderIconDefinition>>;

const DEFAULT_ICON_VIEW_BOX = "0 0 24 24";

export function parseProviderIconViewBox(svg: string): string {
	return /<svg\b[^>]*\sviewBox="([^"]*)"/i.exec(svg)?.[1] ?? DEFAULT_ICON_VIEW_BOX;
}

export interface FirstRecallProviderIconGradientStop {
	color: string;
	offset?: string;
	opacity?: string;
}

export interface FirstRecallProviderIconGradient {
	id: string;
	x1: string;
	y1: string;
	x2: string;
	y2: string;
	stops: FirstRecallProviderIconGradientStop[];
}

function parseTagAttributes(raw: string): Record<string, string> {
	const attributes: Record<string, string> = {};
	for (const match of raw.matchAll(/([a-zA-Z0-9-]+)="([^"]*)"/g)) {
		const [, name, value] = match;
		if (name && value !== undefined) attributes[name] = value;
	}
	return attributes;
}

// A handful of colored LobeHub icons (Codex, Gemini) use SVG gradients rather than a flat
// fill. Only <defs><linearGradient>...<stop/></linearGradient></defs> is supported since
// that's all the icons we use need; the DOM renderer gives each parsed gradient a unique
// id per render so multiple instances of the same icon on a page don't collide.
export function parseProviderIconGradients(svg: string): FirstRecallProviderIconGradient[] {
	const defsMarkup = /<defs>([\s\S]*?)<\/defs>/.exec(svg)?.[1];
	if (!defsMarkup) return [];
	const gradients: FirstRecallProviderIconGradient[] = [];
	for (const gradientMatch of defsMarkup.matchAll(
		/<linearGradient\s+([^>]*)>([\s\S]*?)<\/linearGradient>/g
	)) {
		const attributes = parseTagAttributes(gradientMatch[1] ?? "");
		const id = attributes.id;
		if (!id) continue;
		const stops: FirstRecallProviderIconGradientStop[] = [];
		for (const stopMatch of (gradientMatch[2] ?? "").matchAll(/<stop\s*([^>]*)\/?>/g)) {
			const stopAttributes = parseTagAttributes(stopMatch[1] ?? "");
			const color = stopAttributes["stop-color"];
			if (!color) continue;
			stops.push({
				color,
				offset: stopAttributes.offset,
				opacity: stopAttributes["stop-opacity"],
			});
		}
		if (stops.length === 0) continue;
		gradients.push({
			id,
			x1: attributes.x1 ?? "0",
			y1: attributes.y1 ?? "0",
			x2: attributes.x2 ?? "0",
			y2: attributes.y2 ?? "0",
			stops,
		});
	}
	return gradients;
}
