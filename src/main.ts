import { Plugin, MarkdownView } from "obsidian";
import { MarginaliusSettings, DEFAULT_SETTINGS, MarginaliusSettingTab } from "./settings";
import { registerWrapFix } from "./wrap-fix";

export default class MarginaliusPlugin extends Plugin {
	settings!: MarginaliusSettings;
	styleEl: HTMLStyleElement | null = null;

	async onload() {
		// Load settings
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		// Add settings tab
		this.addSettingTab(new MarginaliusSettingTab(this.app, this));

		// Apply dynamic CSS variables
		this.updateStyles();

		// Normalize non-breaking spaces so marginalia text wraps on word boundaries
		registerWrapFix(this);

		// Register click handler to open editing when clicking anywhere on the marginalia
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			const target = evt.target as HTMLElement;
			const calloutEl = target.closest('.callout[data-callout="margin"], .callout[data-callout="margin-r"]');
			if (calloutEl) {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView && activeView.getMode() === "source") {
					// Prevent default and stop propagation so standard click is captured
					evt.preventDefault();
					evt.stopPropagation();

					const cmView = (activeView.editor as any).cm;
					if (cmView) {
						try {
							// Determine character position of the callout node in the document
							const pos = cmView.posAtDOM(calloutEl);
							cmView.focus();
							cmView.dispatch({
								selection: { anchor: pos, head: pos },
								scrollIntoView: true
							});
						} catch (e) {
							// Fallback to closest CodeMirror block widget if exact posAtDOM fails
							const embedBlock = calloutEl.closest(".cm-embed-block, .cm-callout");
							if (embedBlock) {
								try {
									const pos = cmView.posAtDOM(embedBlock);
									cmView.focus();
									cmView.dispatch({
										selection: { anchor: pos, head: pos },
										scrollIntoView: true
									});
								} catch (innerErr) {
									// No-op if CodeMirror is still warming up
								}
							}
						}
					}
				}
			}
		});
	}

	onunload() {
		// Clean up injected styles
		if (this.styleEl) {
			this.styleEl.remove();
			this.styleEl = null;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateStyles();
	}

	updateStyles() {
		if (!this.styleEl) {
			this.styleEl = document.createElement("style");
			this.styleEl.id = "marginalius-dynamic-styles";
			document.head.appendChild(this.styleEl);
		}

		this.styleEl.textContent = `
			:root {
				--marginalius-width: ${this.settings.sidenoteWidth};
				--marginalius-margin: ${this.settings.sidenoteMargin};
				--marginalius-intrusive-width: ${this.settings.intrusiveWidth};
			}
		`;
	}
}
