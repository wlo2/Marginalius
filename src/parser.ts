export type MarginaliaSide = "left" | "right";

interface MarginaliaMatch {
	/** Document offset of the opening `%%`. */
	from: number;
	/** Document offset just after the closing `%%`. */
	to: number;
	side: MarginaliaSide;
	/** Cleaned marginalia text (markdown). */
	content: string;
}

/**
 * Inline marginalia syntax, reusing Obsidian's comment delimiters so the text
 * stays hidden if the plugin is disabled:
 *   %%> left margin note %%
 *   %%< right margin note %%
 * The `>` / `<` marker right after the opening `%%` distinguishes a marginalia
 * from an ordinary `%% comment %%`.
 *
 * The first two alternatives consume fenced code blocks and inline code spans
 * so markers written inside code (e.g. docs about this syntax) stay literal.
 * A fence may sit in a quote or be indented. A line with more backticks after
 * its opening run is inline code, not a fence.
 * Groups: 1 fence, 2 backtick run, 3 marker, 4 body.
 * The first `%%` ends a note, even inside its inline code: Reading view ends
 * the comment there, so a later one would leave the rest of the note on show.
 * shortcut: inline code only on one line, no backticks inside a span; indented
 * code without a fence and a fence on a list bullet's line are not skipped; a
 * fence in a quote or list runs to its closing fence, even past the quote.
 */
const MARGINALIA_PATTERN =
	/^[ \t>]*(`{3,}(?=[^`\n]*$)|~{3,})[^\n]*(?:\n[\s\S]*?(?:\n[ \t>]*\1[^\n]*|$(?![\s\S]))|$(?![\s\S]))|(`+)[^`\n]*?\2|%%([><])([\s\S]*?)%%/gm;

/** Characters that prevent line breaks; normalized so narrow notes wrap. */
const NON_BREAKING_REGEX = /[\u00A0\u202F\u2007\u2060\uFEFF\u2011]/g;

function normalizeContent(raw: string): string {
	return raw
		.replace(NON_BREAKING_REGEX, (ch) => {
			if (ch === "\u2011") return "-";
			if (ch === "\u2060" || ch === "\uFEFF") return "";
			return " ";
		})
		.trim();
}

/** In a quote or callout every line of a note starts with the quote's `>`, which is not note text. */
function unquote(body: string, lineStart: string): string {
	return /^[ \t]*>/.test(lineStart) ? body.replace(/\n[ \t]*(?:>[ \t]?)+/g, "\n") : body;
}

/** Length of the `%%>` / `%%<` marker plus following spaces in `source`: where the note's text starts. */
export function markerLength(source: string): number {
	return /^%%[><]\s*/.exec(source)?.[0].length ?? 0;
}

/**
 * Find every marginalia occurrence in `text`. Offsets are returned relative to
 * the document by adding `baseOffset` (the document position of `text[0]`).
 */
export function findMarginalia(text: string, baseOffset = 0): MarginaliaMatch[] {
	const matches: MarginaliaMatch[] = [];
	MARGINALIA_PATTERN.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = MARGINALIA_PATTERN.exec(text)) !== null) {
		const marker = match[3];
		if (marker === undefined) continue; // code, skipped
		const lineStart = text.slice(text.lastIndexOf("\n", match.index) + 1, match.index);
		matches.push({
			from: baseOffset + match.index,
			to: baseOffset + match.index + match[0].length,
			side: marker === ">" ? "left" : "right",
			content: normalizeContent(unquote(match[4] ?? "", lineStart)),
		});
	}
	return matches;
}
