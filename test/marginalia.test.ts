import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorInfoField, notices } from "obsidian";
import { findMarginalia, markerLength } from "../src/parser";
import { createMarginaliaLivePreview } from "../src/live-preview";
import { anchorFor, leftovers, planSection } from "../src/reading-view";
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

test("reading view: which notes each section holds", () => {
	// Lines: 0 start of a note, 2 inside it, 4 its end, 6 a note of its own.
	const text = "Second para. %%< right note\n\nmiddle\n\nwith two paragraphs %% after\n\nThird %%> x %% end";
	const lineStarts = [0];
	for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) lineStarts.push(i + 1);
	const plan = (line: number) => {
		const { starting, continued, covered } = planSection(findMarginalia(text), lineStarts, line, line, text.length);
		return { starting: starting.map((m) => m.content), continued, covered };
	};
	assert.deepEqual(plan(0), { starting: ["right note\n\nmiddle\n\nwith two paragraphs"], continued: false, covered: false });
	assert.deepEqual(plan(2), { starting: [], continued: false, covered: true });
	assert.deepEqual(plan(4), { starting: [], continued: true, covered: false });
	assert.deepEqual(plan(6), { starting: ["x"], continued: false, covered: false });
});

test("reading view: the note text Obsidian left in a section is found for cutting", () => {
	// Obsidian hid a note within one paragraph: nothing to cut.
	assert.deepEqual(leftovers("Third  end", false, 1), []);
	// A note crossing a blank line: its start goes to the end of the section...
	assert.deepEqual(leftovers("Second para. %%< right note", false, 1), [[13, 27]]);
	// ...and its end, in a later section, up to the closing %%.
	assert.deepEqual(leftovers("with two paragraphs %% after", true, 0), [[0, 22]]);
	// A callout paragraph break (`>` line) or a nested list: marker to closing %%.
	const callout = "NoteCallout para %%> callout notestill callout note %%";
	assert.deepEqual(leftovers(callout, false, 1), [[17, callout.length]]);
	// Only as many raw markers as there are notes; code is not part of the text.
	assert.deepEqual(leftovers("a %%> b %% c %%> d", false, 1), [[2, 10]]);
	assert.deepEqual(leftovers("no markers", false, 2), []);
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

	// Wrapping a note, or inserting with the cursor or a selection inside one, is refused.
	for (const selection of [[0, 12], [7, 7], [6, 7]] as [number, number][]) {
		const nested = fakeEditor("a %%> b %% c", [selection]);
		insertMarginalia(nested.editor, "left");
		assert.equal(nested.doc(), "a %%> b %% c");
	}
	assert.deepEqual(notices, Array(3).fill("A marginalia note can't go inside another note or comment"));

	// Right before or after a note is fine.
	const beside = fakeEditor("a %%> b %% c", [[2, 2], [10, 10]]);
	insertMarginalia(beside.editor, "right");
	assert.equal(beside.doc(), "a %%<  %%%%> b %%%%<  %% c");
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
	const observed = new Set<unknown>();
	let resized: (entries: { target: unknown }[]) => void = () => {};
	g.ResizeObserver = class {
		constructor(callback: typeof resized) {
			resized = callback;
		}
		observe(target: unknown) {
			observed.add(target);
		}
		unobserve() {}
		disconnect() {}
	};
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

	// "Readable line length" off and on resizes only the column, which is watched too.
	assert.ok(observed.has(column));
	let readable = false;
	Object.assign(column, {
		classList: { contains: () => false },
		closest: (s: string) => (s.includes("markdown-source-view") ? view : readable ? {} : null),
	});
	column.move(0, 1150);
	resized([{ target: column }]);
	assert.equal(isBox(right), true);
	assert.equal(isBox(left), true);
	readable = true;
	column.move(250, 950);
	resized([{ target: column }]);
	assert.equal(isBox(right), false);
	assert.equal(isBox(left), false);
});
