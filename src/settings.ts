import { App, PluginSettingTab, Setting } from "obsidian";
import type MarginaliusPlugin from "./main";

export interface MarginaliusSettings {
	sidenoteWidth: string;
	sidenoteMargin: string;
	intrusiveWidth: string;
}

export const DEFAULT_SETTINGS: MarginaliusSettings = {
	sidenoteWidth: "200px",
	sidenoteMargin: "20px",
	intrusiveWidth: "200px",
};

export class MarginaliusSettingTab extends PluginSettingTab {
	plugin: MarginaliusPlugin;

	constructor(app: App, plugin: MarginaliusPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Marginalius settings" });

		new Setting(containerEl)
			.setName("Sidenote width")
			.setDesc("The width of the marginalia blocks when there is enough space in the margins.")
			.addText((text) =>
				text
					.setPlaceholder("220px")
					.setValue(this.plugin.settings.sidenoteWidth)
					.onChange(async (value) => {
						this.plugin.settings.sidenoteWidth = value || "220px";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sidenote margin")
			.setDesc("The spacing between the marginalia and the main document text.")
			.addText((text) =>
				text
					.setPlaceholder("20px")
					.setValue(this.plugin.settings.sidenoteMargin)
					.onChange(async (value) => {
						this.plugin.settings.sidenoteMargin = value || "20px";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Intrusive width")
			.setDesc("The width of the marginalia blocks when they are half-embedded (intrusive) in the text.")
			.addText((text) =>
				text
					.setPlaceholder("200px")
					.setValue(this.plugin.settings.intrusiveWidth)
					.onChange(async (value) => {
						this.plugin.settings.intrusiveWidth = value || "200px";
						await this.plugin.saveSettings();
					})
			);
	}
}
