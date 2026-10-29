import { Component, MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { EditorView } from "@codemirror/view";
import type MarginaliusPlugin from "./main";
import { renderNote } from "./note";
import { pinAsBox, trackNote, untrackNote } from "./placement";
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
 * Obsidian only strips a comment within one paragraph. Where a note crosses a
 * paragraph break (a blank line, a callout's `>` line, a nested list), its
 * text stays in the rendering. It is cut out of Obsidian's own elements, not
 * rendered again, so list items keep the line numbers task checkboxes need.
 */
export function registerReadingView(plugin: MarginaliusPlugin): void {
	// Every section of a render shares one document text; parse it once.
	let cachedText: string | undefined;
	let lineStarts: number[] = [];
	let matches: Match[] = [];

	plugin.registerMarkdownPostProcessor(
		async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			const info = ctx.getSectionInfo(el);
			if (!info) {
				if (el.querySelector(":scope > .callout")) await addCalloutNotes(plugin, el, ctx);
				return;
			}

			// A full re-render (e.g. after a settings change) passes empty text.
			const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
			const text = info.text || (file ? await plugin.app.vault.cachedRead(file) : "");
			if (text !== cachedText) {
				cachedText = text;
				lineStarts = [0];
				for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) lineStarts.push(i + 1);
				matches = findMarginalia(text);
			}

			const section = planSection(matches, lineStarts, info.lineStart, info.lineEnd, text.length);
			if (section.covered) {
				el.addClass("marginalia-hidden");
				return;
			}
			if (section.starting.length === 0 && !section.continued) return;

			cutLeftovers(el, section.continued, section.starting.length);
			if (section.starting.length === 0) {
				// Only the end of a note was here.
				if (isEmpty(el)) el.addClass("marginalia-hidden");
				return;
			}

			// Obsidian unloads this once the section is re-rendered or removed.
			const child = new MarkdownRenderChild(el);
			ctx.addChild(child);
			// Insert in reverse so successive insertBefore calls keep source order.
			for (const match of [...section.starting].reverse()) {
				const anchor = anchorFor(el, lineOf(lineStarts, match.from) - info.lineStart);
				addNote(plugin, anchor, match, ctx.sourcePath, child);
			}
		}
	);
}

/**
 * Live Preview draws a callout as one block, rendered like a section here but
 * without section info, over the lines that hold the plugin's own note
 * widgets. Find the callout's lines in the editor and add its notes here, as
 * boxes: Obsidian clips the block to its own area, so not in the margin.
 */
async function addCalloutNotes(
	plugin: MarginaliusPlugin,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext
): Promise<void> {
	// The block is attached to the editor right after it is rendered.
	if (!el.isConnected) await sleep(0);
	const editor = el.closest<HTMLElement>(".cm-editor");
	const view = editor && EditorView.findFromDOM(editor);
	if (!view) return;

	const doc = view.state.doc;
	const quoted = (line: number) => /^\s*>/.test(doc.line(line).text);
	const first = doc.lineAt(view.posAtDOM(el));
	if (!quoted(first.number)) return;
	let last = first.number;
	while (last < doc.lines && quoted(last + 1)) last++;
	const notes = findMarginalia(doc.sliceString(first.from, doc.line(last).to), first.from);
	if (notes.length === 0) return;

	cutLeftovers(el, false, notes.length);
	const child = new MarkdownRenderChild(el);
	ctx.addChild(child);
	for (const match of [...notes].reverse()) pinAsBox(addNote(plugin, el, match, ctx.sourcePath, child));
}

function addNote(
	plugin: MarginaliusPlugin,
	anchor: HTMLElement,
	match: Match,
	sourcePath: string,
	owner: Component
): HTMLElement {
	const note = renderNote(plugin.app, match.side, match.content, sourcePath, owner);
	// Classes instead of `:has()` in styles.css, which is slow to restyle.
	anchor.addClass("marginalia-anchor");
	if (anchor.querySelector(":scope > ul, :scope > ol")) note.addClass("marginalia-on-sublist");
	anchor.insertBefore(note, anchor.firstChild);
	trackNote(note);
	owner.register(() => untrackNote(note));
	return note;
}

/**
 * The notes a section (lines `lineStart` to `lineEnd`) holds: those starting
 * in it, whether a note from an earlier section ends in it (`continued`), and
 * whether one goes on past it, so it is all note text (`covered`).
 * Exported for tests.
 */
export function planSection(
	matches: Match[],
	lineStarts: number[],
	lineStart: number,
	lineEnd: number,
	length: number
) {
	const from = lineStarts[lineStart] ?? length;
	const to = (lineStarts[lineEnd + 1] ?? length + 1) - 1;
	const earlier = matches.filter((m) => m.from < from && m.to > from);
	return {
		starting: matches.filter((m) => m.from >= from && m.from < to),
		continued: earlier.some((m) => m.to <= to),
		covered: earlier.some((m) => m.to > to),
	};
}

/**
 * Spans of a section's rendered text that are note text Obsidian did not
 * hide: up to the first `%%` when a note from an earlier section ends here,
 * and from each of the first `notes` raw `%%>`/`%%<` markers to its closing
 * `%%`, or to the end when the note goes on. Exported for tests.
 */
export function leftovers(text: string, continued: boolean, notes: number): [number, number][] {
	const spans: [number, number][] = [];
	let pos = 0;
	if (continued) {
		const close = text.indexOf("%%");
		pos = close === -1 ? text.length : close + 2;
		if (pos > 0) spans.push([0, pos]);
	}
	const marker = /%%[><]/g;
	for (let left = notes; left > 0; left--) {
		marker.lastIndex = pos;
		const start = marker.exec(text)?.index;
		if (start === undefined) break;
		const close = text.indexOf("%%", start + 3);
		pos = close === -1 ? text.length : close + 2;
		spans.push([start, pos]);
	}
	return spans;
}

/** Delete the `leftovers` from `el`'s text, outside code and the notes themselves. */
function cutLeftovers(el: HTMLElement, continued: boolean, notes: number): void {
	const pieces: { node: Text; start: number }[] = [];
	let text = "";
	const walker = el.doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.parentElement?.closest("code, pre, .marginalia")) continue;
		const piece = { node: node as Text, start: text.length };
		pieces.push(piece);
		text += piece.node.data;
	}
	// The text node holding `offset`; an end offset belongs to the node before it.
	const at = (offset: number, end: boolean) => {
		let hit = pieces[0];
		for (const piece of pieces) if (end ? piece.start < offset : piece.start <= offset) hit = piece;
		return hit;
	};

	// From the last span back, so earlier offsets stay valid.
	for (const [from, to] of leftovers(text, continued, notes).reverse()) {
		const start = at(from, false);
		const stop = at(to, true);
		if (!start || !stop) continue;
		const range = el.doc.createRange();
		range.setStart(start.node, from - start.start);
		range.setEnd(stop.node, to - stop.start);
		range.deleteContents();
		prune(start.node, el);
		prune(stop.node, el);
	}
}

/** A paragraph or list item the cut left empty would still take up a line. */
function prune(node: Node, root: HTMLElement): void {
	const block = node.parentElement?.closest("p, li");
	if (!block || !root.contains(block) || !isEmpty(block)) return;
	const list = block.parentElement;
	block.remove();
	if (list && (list.tagName === "UL" || list.tagName === "OL") && list.children.length === 0) list.remove();
}

function isEmpty(el: Element): boolean {
	return !el.textContent?.trim() && !el.querySelector("img, input, iframe, video, audio");
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
