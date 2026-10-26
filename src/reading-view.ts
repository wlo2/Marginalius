import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import type MarginaliusPlugin from "./main";
import { renderNote } from "./note";
import { trackNote, untrackNote } from "./placement";
import { findMarginalia } from "./parser";

/**
 * Reading-view rendering of the inline `%%> … %%` syntax.
 *
 * Obsidian strips comments before rendering, so the marker is gone from the
 * rendered DOM. We recover the raw markdown for the block via
 * `getSectionInfo()`, find any marginalia, and inject each note into the list
 * item it sits in, or into the block (paragraph) otherwise. In the margin
 * layout styles.css centers the note on the height of that element.
 */
export function registerReadingView(plugin: MarginaliusPlugin): void {
	// Every section of a render shares one document text; split it once.
	let cachedText = "";
	let cachedLines: string[] = [];

	plugin.registerMarkdownPostProcessor(
		async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			const info = ctx.getSectionInfo(el);
			if (!info) return;

			// A full re-render (e.g. after a settings change) passes empty text.
			const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
			const text = info.text || (file ? await plugin.app.vault.cachedRead(file) : "");
			if (text !== cachedText) {
				cachedText = text;
				cachedLines = text.split("\n");
			}
			const sectionText = cachedLines
				.slice(info.lineStart, info.lineEnd + 1)
				.join("\n");

			const matches = findMarginalia(sectionText);
			if (matches.length === 0) return;

			// Obsidian unloads this once the section is re-rendered or removed.
			const child = new MarkdownRenderChild(el);
			ctx.addChild(child);

			// Insert in reverse so successive insertBefore calls keep source order.
			for (let i = matches.length - 1; i >= 0; i--) {
				const match = matches[i];
				if (!match) continue;
				const line = sectionText.slice(0, match.from).split("\n").length - 1;
				const anchor = anchorFor(el, line);
				const note = renderNote(
					plugin.app,
					match.side,
					match.content,
					ctx.sourcePath,
					child
				);
				anchor.insertBefore(note, anchor.firstChild);
				trackNote(note);
				child.register(() => untrackNote(note));
			}
		}
	);
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
