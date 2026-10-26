import { App, Component, MarkdownRenderer } from "obsidian";
import type { MarginaliaSide } from "./parser";

/**
 * Build the floated note element shared by Live Preview and Reading view.
 * `component` owns whatever the rendered markdown loads (embeds etc.); the
 * caller unloads it when the note goes away.
 */
export function renderNote(
	app: App,
	side: MarginaliaSide,
	content: string,
	sourcePath: string,
	component: Component
): HTMLElement {
	const note = createSpan({ cls: `marginalia marginalia-${side}` });
	const inner = note.createDiv({ cls: "marginalia-content" });

	// Not awaited: the note appears at once and fills in when rendering finishes.
	void (async () => {
		try {
			await MarkdownRenderer.render(app, content, inner, sourcePath, component);
		} catch {
			inner.textContent = content;
		}
	})();

	return note;
}
