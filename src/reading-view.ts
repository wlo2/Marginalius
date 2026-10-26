import { MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownRenderer } from "obsidian";
import type MarginaliusPlugin from "./main";
import { renderNote } from "./note";
import { trackNote, untrackNote } from "./placement";
import { findMarginalia } from "./parser";

type Match = ReturnType<typeof findMarginalia>[number];

/**
 * Reading-view rendering of the inline `%%> … %%` syntax.
 *
 * Obsidian strips comments before rendering, so the marker is gone from the
 * rendered DOM. We find the marginalia in the raw markdown of the whole note
 * and, for each section (block) `getSectionInfo()` reports, inject the notes
 * that start in it into the list item they sit in, or into the block
 * otherwise. In the margin layout styles.css centers the note on the height
 * of that element.
 *
 * Obsidian only strips a comment within one paragraph. A note that crosses a
 * blank line shows as text: in each section it spans, or in the list item
 * holding it. Those sections are rendered again without the note.
 */
export function registerReadingView(plugin: MarginaliusPlugin): void {
	// Every section of a render shares one document text; parse it once.
	let cachedText: string | undefined;
	let lineStarts: number[] = [];
	let matches: Match[] = [];

	plugin.registerMarkdownPostProcessor(
		async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			const info = ctx.getSectionInfo(el);
			if (!info) return;

			// A full re-render (e.g. after a settings change) passes empty text.
			const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
			const text = info.text || (file ? await plugin.app.vault.cachedRead(file) : "");
			if (text !== cachedText) {
				cachedText = text;
				lineStarts = [0];
				for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) lineStarts.push(i + 1);
				matches = findMarginalia(text);
			}
			const from = lineStarts[info.lineStart] ?? text.length;
			const to = (lineStarts[info.lineEnd + 1] ?? text.length + 1) - 1;

			const inSection = matches.filter((m) => m.from < to && m.to > from);
			if (inSection.length === 0) return;

			// Obsidian unloads this once the section is re-rendered or removed.
			const child = new MarkdownRenderChild(el);
			ctx.addChild(child);

			const rerender = inSection.some(
				(m) => m.from < from || m.to > to || /\n[ \t]*\n/.test(text.slice(m.from, m.to))
			);
			if (rerender) {
				const visible = textOutsideNotes(text, inSection, from, to);
				el.empty();
				if (!visible.trim()) {
					el.addClass("marginalia-hidden");
				} else {
					await MarkdownRenderer.render(plugin.app, visible, el, ctx.sourcePath, child);
				}
			}

			// Insert in reverse so successive insertBefore calls keep source order.
			const starting = inSection.filter((m) => m.from >= from);
			for (let i = starting.length - 1; i >= 0; i--) {
				const match = starting[i];
				if (!match) continue;
				const anchor = rerender
					? itemAt(el, textOutsideNotes(text, inSection, from, match.from))
					: anchorFor(el, lineOf(lineStarts, match.from) - info.lineStart);
				const note = renderNote(
					plugin.app,
					match.side,
					match.content,
					ctx.sourcePath,
					child
				);
				// Classes instead of `:has()` in styles.css, which is slow to restyle.
				anchor.addClass("marginalia-anchor");
				if (anchor.querySelector(":scope > ul, :scope > ol")) note.addClass("marginalia-on-sublist");
				anchor.insertBefore(note, anchor.firstChild);
				trackNote(note);
				child.register(() => untrackNote(note));
			}
		}
	);
}

/** The markdown of `text[from, to)` with every note in it cut out. */
export function textOutsideNotes(text: string, notes: Match[], from: number, to: number): string {
	let visible = "";
	let pos = from;
	for (const note of notes) {
		visible += text.slice(pos, Math.min(note.from, to));
		pos = Math.max(pos, note.to);
	}
	return visible + text.slice(pos, to);
}

/** Index of the line holding `offset`, given each line's start offset. */
function lineOf(lineStarts: number[], offset: number): number {
	let lo = 0;
	let hi = lineStarts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if ((lineStarts[mid] ?? 0) <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/**
 * A whole list is one section, so anchor a note to the list item holding its
 * line: the last `li` whose `data-line` (relative to the section) is not past it.
 */
export function anchorFor(section: HTMLElement, line: number): HTMLElement {
	let anchor = section;
	section.querySelectorAll<HTMLElement>("li[data-line]").forEach((li) => {
		if (Number(li.dataset.line) <= line) anchor = li;
	});
	return anchor;
}

/**
 * `MarkdownRenderer` output has no `data-line`, so in a re-rendered section
 * the note goes on the list item started last in the markdown before it.
 * shortcut: counts lines that look like list items, also inside code blocks
 * or block quotes; read the list structure if that misplaces notes.
 */
export function itemAt(section: HTMLElement, markdownBefore: string): HTMLElement {
	const started = markdownBefore.split("\n").filter((l) => /^\s*(?:[-*+]|\d+[.)])\s/.test(l)).length;
	return section.querySelectorAll<HTMLElement>("li")[started - 1] ?? section;
}
