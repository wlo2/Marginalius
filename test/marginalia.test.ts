import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorInfoField, notices } from "obsidian";
import { findMarginalia, markerLength } from "../src/parser";
import { createMarginaliaLivePreview } from "../src/live-preview";
import { anchorFor, itemAt, textOutsideNotes } from "../src/reading-view";
import { insertMarginalia } from "../src/commands";
import { measure, place, refreshPlacement } from "../src/placement";

/** Single-line stand-in for Obsidian's Editor: a position's `ch` is its offset. */
function fakeEditor(text: string, selections: [number, number][]) {
	let doc = text;
	let cursors: number[] = [];
	const editor = {
		getValue: () => doc,
		listSelections: () =>
			selections.map(([anchor, head]) => ({ anchor: { line: 0, ch: anchor }, head: { line: 0, ch: head } })),
		posToOffset: (pos: { ch: number }) => pos.ch,
		offsetToPos: (ch: number) => ({ line: 0, ch }),
		transaction: ({ changes }: { changes: { from: { ch: number }; to: { ch: number }; text: string }[] }) => {
			for (const c of [...changes].reverse()) doc = doc.slice(0, c.from.ch) + c.text + doc.slice(c.to.ch);
		},
		setSelections: (sels: { anchor: { ch: number } }[]) => {
			cursors = sels.map((s) => s.anchor.ch);
		},
	};
	return { editor: editor as never, doc: () => doc, cursors: () => cursors };
}

test("parser: offsets, sides, multi-line, base offset, nbsp", () => {
	const text = "a %%> left\u00A0note %% b %%< two\nlines %%";
	assert.deepEqual(findMarginalia(text, 100), [
		{ from: 102, to: 118, side: "left", content: "left note" },
		{ from: 121, to: 137, side: "right", content: "two\nlines" },
	]);
	assert.deepEqual(findMarginalia("%% plain comment %%"), []);
});

test("parser: markers inside code stay literal", () => {
	const text = [
		"use `%%> x %%` inline",
		"```md",
		"%%> in fence %%",
		"```",
		"%%> real %%",
	].join("\n");
	assert.deepEqual(
		findMarginalia(text).map((m) => m.content),
		["real"]
	);
	// An unclosed fence runs to the end of the text, like in Markdown.
	assert.deepEqual(findMarginalia("~~~\n%%> x %%"), []);
	// Backticks inside a note do not hide it.
	assert.deepEqual(
		findMarginalia("%%> run `npm test` %%").map((m) => m.content),
		["run `npm test`"]
	);
});

test("click target: cursor goes after the marker and its spaces", () => {
	assert.equal(markerLength("%%< next %%"), 4);
	assert.equal(markerLength("%%>next %%"), 3);
	assert.equal(markerLength("%%>   spaced %%"), 6);
	assert.equal(markerLength("plain"), 0);
});

test("reading view: a note goes on the list item holding its line", () => {
	// Stand-ins for a rendered section: anchorFor only reads li[data-line].
	const li = (line: number) => ({ dataset: { line: String(line) } });
	const items = [li(0), li(1), li(3)]; // item 1 wraps onto line 2
	const list = { querySelectorAll: () => items } as unknown as HTMLElement;
	assert.equal(anchorFor(list, 0), items[0]);
	assert.equal(anchorFor(list, 2), items[1]);
	assert.equal(anchorFor(list, 5), items[2]);

	const paragraph = { querySelectorAll: () => [] } as unknown as HTMLElement;
	assert.equal(anchorFor(paragraph, 1), paragraph);
});

test("reading view: a note crossing a blank line is cut from each section it spans", () => {
	const text = "Second para. %%< right note\n\nwith two paragraphs %% after\n\nThird %%> x %% end";
	const notes = findMarginalia(text);
	const firstEnd = text.indexOf("\n");
	const second = firstEnd + 2;
	const secondEnd = text.indexOf("\n", second);
	assert.equal(textOutsideNotes(text, notes, 0, firstEnd), "Second para. ");
	assert.equal(textOutsideNotes(text, notes, second, secondEnd), " after");
	// A section the note does not touch keeps everything but its own notes.
	assert.equal(textOutsideNotes(text, notes, secondEnd + 2, text.length), "Third  end");

	// A re-rendered list has no data-line: the note goes on the item started last before it.
	const items = ["a", "b", "c"];
	const list = { querySelectorAll: () => items } as unknown as HTMLElement;
	assert.equal(itemAt(list, "- item "), "a");
	assert.equal(itemAt(list, "- item \n  - nested\n- next "), "c");
	assert.equal(itemAt(list, "Para "), list);
});

test("insert command: each selection keeps its own text", () => {
	// "bar" selected backwards: anchor after it, head before it.
	const two = fakeEditor("foo and bar", [[0, 3], [11, 8]]);
	insertMarginalia(two.editor, "left");
	assert.equal(two.doc(), "%%> foo %% and %%> bar %%");
	assert.deepEqual(two.cursors(), [10, 25]);

	const empty = fakeEditor("ab", [[1, 1]]);
	insertMarginalia(empty.editor, "right");
	assert.equal(empty.doc(), "a%%<  %%b");
	assert.deepEqual(empty.cursors(), [5]);

	const nested = fakeEditor("a %%> b %% c", [[0, 12]]);
	insertMarginalia(nested.editor, "left");
	assert.equal(nested.doc(), "a %%> b %% c");
	assert.deepEqual(notices, ["Selection already contains a marginalia note"]);
});

test("live preview: note drawn at its line start, marker hidden, cursor reveal, rebuild on edit", () => {
	const field = createMarginaliaLivePreview({} as never);
	const ranges = (state: EditorState) => {
		const out: [number, number][] = [];
		state.field(field).between(0, state.doc.length, (from, to) => {
			out.push([from, to]);
		});
		return out;
	};

	const doc = "before\n%%> line one\nline two %%\nafter %%< right %%";
	let state = EditorState.create({ doc, extensions: [editorInfoField, field] });
	// Each note: the line class and the drawn note at the start of its line, then
	// the hidden marker. The second marker starts at 38 on the line that starts at 32.
	assert.deepEqual(ranges(state), [[7, 7], [7, 7], [7, 31], [32, 32], [32, 32], [38, 50]]);
	assert.equal(state.facet(EditorView.decorations).length, 1);
	assert.deepEqual(state.facet(EditorView.contentAttributes), [{ class: "marginalia-has-notes" }]);

	state = state.update({ selection: EditorSelection.cursor(10) }).state;
	assert.deepEqual(ranges(state), [[32, 32], [32, 32], [38, 50]]);

	state = state.update({
		changes: { from: 0, insert: "xx" },
		selection: EditorSelection.cursor(0),
	}).state;
	assert.deepEqual(ranges(state), [[9, 9], [9, 9], [9, 33], [34, 34], [34, 34], [40, 52]]);

	// No notes left: the editor loses its class.
	state = state.update({ changes: { from: 0, to: state.doc.length, insert: "plain" } }).state;
	assert.deepEqual(state.facet(EditorView.contentAttributes), [{}]);
});

/** Stand-ins for the browser layout APIs placement.ts reads. */
function fakeBox<T extends object>(left: number, right: number, extra = {} as T) {
	const props = new Map<string, string>();
	let rect = { left, right };
	return {
		...extra,
		isConnected: true,
		padding: "0px",
		getBoundingClientRect: () => rect,
		move: (l: number, r: number) => (rect = { left: l, right: r }),
		setCssProps: (p: Record<string, string>) => Object.entries(p).forEach(([k, v]) => props.set(k, v)),
		cssProp: (k: string) => props.get(k) ?? "",
	};
}

function fakeNote(side: "left" | "right", left: number, right: number) {
	const classes = new Set(["marginalia", `marginalia-${side}`]);
	return fakeBox(left, right, {
		classList: {
			contains: (c: string) => classes.has(c),
			toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)),
			remove: (c: string) => classes.delete(c),
		},
	});
}

test("placement: free space leaves the pane edge gap; a note that no longer fits becomes a box", () => {
	const g = globalThis as Record<string, unknown>;
	g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
	g.getComputedStyle = (el: { padding: string }) => ({
		paddingLeft: el.padding,
		getPropertyValue: (name: string) => (name === "--marginalius-pane-gap" ? "30px" : ""),
	});

	// A 1200px pane with a 700px column: 250px each side, 220px after the 30px gap.
	const column = fakeBox(250, 950, { closest: () => ({}) });
	const section = fakeBox(250, 950);
	const item = fakeBox(284, 950); // a list item, indented 34px inside the column
	const right = fakeNote("right", 970, 1170); // reaches 220px out: just fits
	const left = fakeNote("left", 64, 230); // in the list item, reaches 186px out
	const notes = [right, left];
	const view = fakeBox(0, 1200, { querySelector: () => column, querySelectorAll: () => notes });
	Object.assign(right, { parentElement: { closest: () => section }, closest: (s: string) => (s.includes("markdown-source-view") ? view : section) });
	Object.assign(left, { parentElement: { closest: () => item }, closest: (s: string) => (s.includes("markdown-source-view") ? view : section) });
	const isBox = (n: ReturnType<typeof fakeNote>) => n.classList.contains("marginalia-intrudes");

	measure(right as never);
	measure(left as never);
	assert.equal(view.cssProp("--marginalius-room-right"), "220px");
	assert.equal(left.cssProp("--marginalius-list-indent"), "34px");
	assert.equal(isBox(right), false);
	assert.equal(isBox(left), false);

	// A sidebar widens: 1150px pane leaves 170px on the right, so the right note becomes a box.
	view.move(0, 1150);
	place(view as never);
	assert.equal(view.cssProp("--marginalius-room-right"), "170px");
	assert.equal(isBox(right), true);
	assert.equal(isBox(left), false);

	// The note gets narrower (a smaller width setting): re-measured, it fits again.
	right.move(970, 1100);
	refreshPlacement([{ querySelectorAll: () => [view] } as never]);
	assert.equal(isBox(right), false);
});
