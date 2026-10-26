import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { EditorState, Range, StateField } from "@codemirror/state";
import { App, Component, editorInfoField } from "obsidian";
import { renderNote } from "./note";
import { trackNote, untrackNote } from "./placement";
import { findMarginalia, MarginaliaSide, markerLength } from "./parser";

/**
 * Owner of each rendered note's markdown children. Keyed by DOM, not widget:
 * when a new widget is eq() to the old one CodeMirror keeps the DOM and later
 * calls destroy() on the new widget.
 */
const components = new WeakMap<HTMLElement, Component>();

/**
 * Inline widget that renders a marginalia note in place of its `%%> … %%`
 * source. It floats into the margin and is anchored to the line where the
 * marker sits.
 */
class MarginaliaWidget extends WidgetType {
	constructor(
		private readonly content: string,
		private readonly side: MarginaliaSide,
		private readonly app: App,
		private readonly sourcePath: string
	) {
		super();
	}

	eq(other: MarginaliaWidget): boolean {
		return (
			other.content === this.content &&
			other.side === this.side &&
			other.sourcePath === this.sourcePath
		);
	}

	toDOM(view: EditorView): HTMLElement {
		const component = new Component();
		component.load();
		const el = renderNote(
			this.app,
			this.side,
			this.content,
			this.sourcePath,
			component
		);
		el.setAttribute("contenteditable", "false");
		// Clicking a note puts the cursor at the start of its text, which
		// reveals the source for editing.
		el.addEventListener("mousedown", (evt) => {
			// Links inside the note and right/middle clicks behave as usual.
			if (evt.button !== 0 || (evt.target as HTMLElement).closest("a")) return;
			evt.preventDefault();
			// The widget sits at the start of the marker's line; find the marker.
			const line = view.state.doc.lineAt(view.posAtDOM(el));
			const marker = findMarginalia(view.state.sliceDoc(line.from), line.from).find(
				(m) => m.side === this.side && m.content === this.content
			);
			if (!marker) return;
			const from = marker.from;
			const anchor = from + markerLength(view.state.sliceDoc(from, from + 64));
			view.focus();
			view.dispatch({ selection: { anchor }, scrollIntoView: true });
		});
		components.set(el, component);
		trackNote(el);
		return el;
	}

	destroy(dom: HTMLElement): void {
		components.get(dom)?.unload();
		components.delete(dom);
		untrackNote(dom);
	}

	ignoreEvent(): boolean {
		// The mousedown handler above places the cursor; CodeMirror stays out.
		return true;
	}
}

const noteLine = Decoration.line({ class: "marginalia-line" });

// shortcut: rescans the whole note on every edit or cursor move; fine for
// notes up to ~1 MB, switch to incremental parsing if huge notes lag.
function buildDecorations(state: EditorState, app: App): DecorationSet {
	const decorations: Range<Decoration>[] = [];
	const selection = state.selection;
	// The file this editor shows, not the active one (split panes, popovers).
	const sourcePath = state.field(editorInfoField, false)?.file?.path ?? "";

	let previousEnd = 0;
	for (const match of findMarginalia(state.doc.toString())) {
		// Reveal the raw source whenever the cursor/selection touches the
		// marginalia so it can be edited.
		const isBeingEdited = selection.ranges.some(
			(range) => range.from <= match.to && range.to >= match.from
		);
		if (isBeingEdited) continue;

		// Hide the marker where it is, and draw the note at the start of its
		// line: a box then floats from the top of the paragraph instead of
		// from wherever the marker sits in it. The margin note is centered on
		// the line either way. (After an earlier note ending on this line, so
		// the widget is not inside that note's hidden range.)
		const lineStart = Math.max(state.doc.lineAt(match.from).from, previousEnd);
		const widget = new MarginaliaWidget(match.content, match.side, app, sourcePath);
		// The class lets styles.css open the line's overflow without `:has()`.
		decorations.push(noteLine.range(state.doc.lineAt(lineStart).from));
		decorations.push(Decoration.widget({ widget, side: -1 }).range(lineStart));
		decorations.push(Decoration.replace({}).range(match.from, match.to));
		previousEnd = match.to;
	}

	return Decoration.set(decorations, true);
}

/**
 * A StateField, not a ViewPlugin: CodeMirror only accepts decorations that
 * replace line breaks (multi-line notes) from a state field.
 */
export function createMarginaliaLivePreview(app: App) {
	return StateField.define<DecorationSet>({
		create: (state) => buildDecorations(state, app),
		update: (decorations, tr) =>
			tr.docChanged || tr.selection
				? buildDecorations(tr.state, app)
				: decorations,
		provide: (field) => [
			EditorView.decorations.from(field),
			// Marks an editor showing notes, so styles.css can open its overflow.
			EditorView.contentAttributes.compute([field], (state): Record<string, string> =>
				state.field(field).size ? { class: "marginalia-has-notes" } : {}
			),
		],
	});
}
