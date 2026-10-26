import { MarkdownView, Plugin } from "obsidian";
import { MarginaliusSettings, DEFAULT_SETTINGS, MarginaliusSettingTab, repairSettings } from "./settings";
import { createMarginaliaLivePreview } from "./live-preview";
import { registerReadingView } from "./reading-view";
import { registerCommands } from "./commands";
import { refreshPlacement, stopPlacement } from "./placement";

export default class MarginaliusPlugin extends Plugin {
	settings!: MarginaliusSettings;

	async onload() {
		// Load settings
		const saved = (await this.loadData()) as Partial<MarginaliusSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
		repairSettings(this.settings);

		// Add settings tab
		this.addSettingTab(new MarginaliusSettingTab(this.app, this));

		// Apply dynamic CSS variables, also to popout windows opened later
		this.updateStyles();
		this.registerEvent(
			this.app.workspace.on("window-open", (_win, win) =>
				this.applyStyles(win.document.body)
			)
		);

		// Inline `%%> … %%` / `%%< … %%` marginalia syntax
		this.registerEditorExtension(createMarginaliaLivePreview(this.app));
		registerReadingView(this);

		// Command palette: insert marginalia markers
		registerCommands(this);

		this.register(stopPlacement);
	}

	onunload() {
		const cleared: Record<string, string> = {};
		for (const name of Object.keys(this.cssVariables())) cleared[name] = "";
		for (const body of this.windowBodies()) body.setCssProps(cleared);
		// Notes inserted into open Reading views would stay as stray text;
		// redraw them now that the post-processor is gone.
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
		});
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateStyles();
		refreshPlacement(this.windowBodies());
	}

	updateStyles() {
		for (const body of this.windowBodies()) this.applyStyles(body);
	}

	private applyStyles(body: HTMLElement) {
		body.setCssProps(this.cssVariables());
	}

	/** The main window's body plus the body of every open popout window. */
	private windowBodies(): Set<HTMLElement> {
		const bodies = new Set([document.body]);
		this.app.workspace.iterateAllLeaves((leaf) => {
			bodies.add(leaf.view.containerEl.ownerDocument.body);
		});
		return bodies;
	}

	private cssVariables(): Record<string, string> {
		return {
			"--marginalius-width": this.settings.sidenoteWidth,
			"--marginalius-margin": this.settings.sidenoteMargin,
			"--marginalius-intrusive-width": this.settings.intrusiveWidth,
			"--marginalius-pane-gap": this.settings.paneGap,
		};
	}
}
