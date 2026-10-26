import { Editor, Notice } from "obsidian";
import type MarginaliusPlugin from "./main";

/**
 * Turn each selection into a marginalia note, or insert an empty one at each
 * cursor: `%%> selection %%` (left) or `%%< selection %%` (right).
 */
export function insertMarginalia(editor: Editor, side: "left" | "right"): void {
	const marker = side === "left" ? ">" : "<";
	const doc = editor.getValue();
	// One edit per selection, so multi-cursor keeps each selection's own text.
	const edits = editor
		.listSelections()
		.map(({ anchor, head }) => {
			const a = editor.posToOffset(anchor);
			const h = editor.posToOffset(head);
			const from = Math.min(a, h);
			const to = Math.max(a, h);
			const text = doc.slice(from, to);
			return { from, to, text, note: `%%${marker} ${text} %%` };
		})
		.sort((x, y) => x.from - y.from);

	// Wrapping an existing note would nest the markers and break both.
	if (edits.some((edit) => edit.text.includes("%%"))) {
		new Notice("Selection already contains a marginalia note");
		return;
	}

	editor.transaction({
		changes: edits.map((edit) => ({
			from: editor.offsetToPos(edit.from),
			to: editor.offsetToPos(edit.to),
			text: edit.note,
		})),
	});

	// Cursor inside each empty note (after "%%> "), or after each wrapped one.
	let shift = 0;
	editor.setSelections(
		edits.map((edit) => {
			const start = edit.from + shift;
			shift += edit.note.length - edit.text.length;
			const at = edit.text ? start + edit.note.length : start + 4;
			return { anchor: editor.offsetToPos(at) };
		})
	);
}

export function registerCommands(plugin: MarginaliusPlugin): void {
	plugin.addCommand({
		id: "insert-marginalia-left",
		name: "Insert left marginalia (%%> … %%)",
		editorCallback: (editor) => insertMarginalia(editor, "left"),
	});

	plugin.addCommand({
		id: "insert-marginalia-right",
		name: "Insert right marginalia (%%< … %%)",
		editorCallback: (editor) => insertMarginalia(editor, "right"),
	});
}
