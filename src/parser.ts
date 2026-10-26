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
 * Groups: 1 fence, 2 backtick run, 3 marker, 4 body.
 * shortcut: inline code only on one line, no backticks inside a span.
 */
const MARGINALIA_PATTERN =
	/^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n[\s\S]*?(?:\n {0,3}\1[^\n]*|$(?![\s\S]))|$(?![\s\S]))|(`+)[^`\n]*?\2|%%([><])([\s\S]*?)%%/gm;

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
		const body = match[4] ?? "";
		matches.push({
			from: baseOffset + match.index,
			to: baseOffset + match.index + match[0].length,
			side: marker === ">" ? "left" : "right",
			content: normalizeContent(body),
		});
	}
	return matches;
}
