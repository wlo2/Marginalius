// Minimal stand-ins for the `obsidian` runtime, which only exists inside the app.
import { StateField } from "@codemirror/state";

export class Component {
	load(): void {}
	unload(): void {}
}

export class MarkdownRenderChild extends Component {
	constructor(public containerEl: HTMLElement) {
		super();
	}
}

export class TFile {}

export const notices: string[] = [];
export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

export class MarkdownRenderer {
	static render(): Promise<void> {
		return Promise.resolve();
	}
}

export const editorInfoField = StateField.define<{ file: { path: string } | null }>({
	create: () => ({ file: { path: "notes/a.md" } }),
	update: (value) => value,
});
