/**
 * Decides, per note, whether it fits in the margin beside the text column or
 * has to become a box in the text. A note switches only when its outer edge
 * would come closer to the pane edge than the "Pane edge gap" setting, and
 * styles.css lets the box stick out into the margin by the free space there
 * (--marginalius-room-left/right, which leave that gap), so the box
 * appears where the margin note was and slides into the text as the pane
 * narrows. The margin layout needs "Readable line length", which makes the
 * side gutters.
 */

const INTRUDES = "marginalia-intrudes";

/** Distance from the column edge to the note's outer edge in the margin layout. */
const outerEdges = new WeakMap<HTMLElement, number>();

/** Notes whose block indent has been measured (once per note). */
const indented = new WeakSet<HTMLElement>();

/** Watches notes (first layout, size changes) and the panes they sit in. Created on first use. */
let observer: ResizeObserver | null = null;

function watcher(): ResizeObserver {
	observer ??= new ResizeObserver((entries) => {
		for (const { target } of entries) {
			const el = target as HTMLElement;
			if (el.classList.contains("marginalia")) measure(el);
			else place(el);
		}
	});
	return observer;
}

export function trackNote(note: HTMLElement): void {
	watcher().observe(note);
}

export function untrackNote(note: HTMLElement): void {
	observer?.unobserve(note);
}

/**
 * Settings changed (a width, the margin or the pane edge gap): measure every
 * note in these windows again in the margin layout, then place it. Done in
 * one go, before the next paint, so nothing flickers.
 */
export function refreshPlacement(bodies: Iterable<HTMLElement>): void {
	for (const body of bodies) {
		body.querySelectorAll<HTMLElement>(".markdown-source-view, .markdown-reading-view").forEach((view) => {
			place(view); // pane room, even if the view has no notes
			view.querySelectorAll<HTMLElement>(".marginalia").forEach((note) => {
				note.classList.remove(INTRUDES);
				outerEdges.delete(note);
				measure(note);
			});
		});
	}
}

export function stopPlacement(): void {
	observer?.disconnect();
	observer = null;
}

function viewOf(el: HTMLElement): HTMLElement | null {
	return el.closest<HTMLElement>(".markdown-source-view, .markdown-reading-view");
}

function columnOf(view: HTMLElement): HTMLElement | null {
	return view.querySelector<HTMLElement>(".cm-content, .markdown-preview-sizer");
}

/** First layout of a note (or a size change): measure it, then place it. Exported for tests. */
export function measure(note: HTMLElement): void {
	const view = viewOf(note);
	const column = view && columnOf(view);
	if (!view || !column) return;

	// Left notes are positioned from their block, which may be indented from
	// the column: a Reading view list item, or an editor list line with a
	// hanging indent. styles.css adds these back so a left note lines up with
	// the column edge in both layouts. Measured once per note.
	const base = note.closest<HTMLElement>(".cm-line, .markdown-preview-section > div");
	const block = note.parentElement?.closest<HTMLElement>(".cm-line, li, .markdown-preview-section > div");
	if (base && block && !indented.has(note)) {
		indented.add(note);
		const indent = block.getBoundingClientRect().left - base.getBoundingClientRect().left;
		const padding = parseFloat(getComputedStyle(block).paddingLeft) || 0;
		note.setCssProps({
			"--marginalius-list-indent": `${indent}px`, // margin note: from the block's edge
			"--marginalius-box-indent": `${indent + padding}px`, // box: from its content
		});
	}

	// Only the margin layout tells how far out the note reaches.
	const readable = column.closest(".is-readable-line-width") !== null;
	if (readable && !note.classList.contains(INTRUDES)) {
		const n = note.getBoundingClientRect();
		const c = column.getBoundingClientRect();
		const left = note.classList.contains("marginalia-left");
		outerEdges.set(note, left ? c.left - n.left : n.right - c.right);
	}

	watcher().observe(view); // no-op if already observed
	place(view, [note]);
}

/** The pane resized (or a note was measured): switch notes that stopped or started fitting. Exported for tests. */
export function place(view: HTMLElement, notes?: HTMLElement[]): void {
	const column = columnOf(view);
	if (!view.isConnected || !column) {
		observer?.unobserve(view);
		return;
	}
	const v = view.getBoundingClientRect();
	const c = column.getBoundingClientRect();
	const readable = column.closest(".is-readable-line-width") !== null;
	// Keep the "Pane edge gap" setting free between a note and the pane edge.
	const gap = parseFloat(getComputedStyle(view).getPropertyValue("--marginalius-pane-gap")) || 0;
	const room = {
		left: readable ? Math.max(0, c.left - v.left - gap) : 0,
		right: readable ? Math.max(0, v.right - c.right - gap) : 0,
	};
	view.setCssProps({
		"--marginalius-room-left": `${room.left}px`,
		"--marginalius-room-right": `${room.right}px`,
	});

	for (const note of notes ?? Array.from(view.querySelectorAll<HTMLElement>(".marginalia"))) {
		const outer = outerEdges.get(note);
		if (outer === undefined) continue;
		const side = note.classList.contains("marginalia-left") ? "left" : "right";
		note.classList.toggle(INTRUDES, outer > room[side]);
	}
}
