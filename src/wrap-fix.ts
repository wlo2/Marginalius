import { Plugin } from "obsidian";

/**
 * Characters that prevent line breaks and therefore cause whole phrases to be
 * treated as one unbreakable "word" inside the narrow marginalia box:
 *   U+00A0 no-break space        -> regular space
 *   U+202F narrow no-break space -> regular space
 *   U+2007 figure space          -> regular space
 *   U+2060 word joiner           -> removed
 *   U+FEFF zero-width no-break   -> removed
 *   U+2011 non-breaking hyphen   -> regular hyphen
 * They are typically introduced by `Option+Space` on macOS or by pasting from
 * rich-text sources, and are visually identical to ordinary spaces/hyphens.
 */
const NON_BREAKING_REGEX = /[\u00A0\u202F\u2007\u2060\uFEFF\u2011]/g;

const MARGIN_SELECTOR =
	'.callout[data-callout="margin"], .callout[data-callout="margin-r"]';

function replaceNonBreaking(value: string): string {
	return value.replace(NON_BREAKING_REGEX, (ch) => {
		if (ch === "\u2011") return "-";
		if (ch === "\u2060" || ch === "\uFEFF") return "";
		return " ";
	});
}

/**
 * Replace non-breaking characters in every text node under `root` so the
 * rendered text can wrap on word boundaries. Only the rendered DOM is changed;
 * the underlying note is left untouched.
 */
function normalizeNonBreakingChars(root: HTMLElement): void {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const textNodes: Text[] = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		textNodes.push(node as Text);
	}
	for (const node of textNodes) {
		const original = node.nodeValue;
		if (original == null) continue;
		const normalized = replaceNonBreaking(original);
		if (normalized !== original) {
			node.nodeValue = normalized;
		}
	}
}

/**
 * Register a markdown post-processor that keeps marginalia text wrapping on
 * word boundaries. Runs for both Reading view and Live Preview rendered
 * callouts (embedded blocks go through the same renderer).
 */
export function registerWrapFix(plugin: Plugin): void {
	plugin.registerMarkdownPostProcessor((el) => {
		const callouts = Array.from(
			el.querySelectorAll<HTMLElement>(MARGIN_SELECTOR)
		);
		if (callouts.length > 0) {
			callouts.forEach(normalizeNonBreakingChars);
			return;
		}
		// When the callout body itself is the processed fragment, the
		// `.callout` wrapper is an ancestor rather than a descendant.
		const host = el.closest(MARGIN_SELECTOR) as HTMLElement | null;
		if (host) {
			normalizeNonBreakingChars(el);
		}
	});
}
