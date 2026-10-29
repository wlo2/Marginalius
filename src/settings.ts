import { App, PluginSettingTab, SettingDefinitionItem } from "obsidian";
import type MarginaliusPlugin from "./main";

export interface MarginaliusSettings {
	sidenoteWidth: string;
	sidenoteMargin: string;
	intrusiveWidth: string;
	paneGap: string;
}

export const DEFAULT_SETTINGS: MarginaliusSettings = {
	sidenoteWidth: "200px",
	sidenoteMargin: "20px",
	intrusiveWidth: "200px",
	paneGap: "30px",
};

type SettingKey = keyof MarginaliusSettings;

/**
 * Every setting is a CSS length; a number without a unit ("200") is not, and
 * neither is a percentage or a keyword like `auto` (the pane edge gap is
 * registered as a length, and keywords break the width math). Empty means
 * the default. `border-width` takes only lengths, also inside `calc()`.
 */
function isLength(value: string): boolean {
	return value.trim() === "" || CSS.supports("border-top-width", `calc(${value} + 0px)`);
}

/** Values saved by an older version are not validated by the tab; reset invalid ones to the default. */
export function repairSettings(settings: MarginaliusSettings): void {
	for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
		const value = settings[key];
		if (typeof value !== "string" || !value.trim() || !isLength(value)) {
			settings[key] = DEFAULT_SETTINGS[key];
		}
	}
}

export class MarginaliusSettingTab extends PluginSettingTab {
	plugin: MarginaliusPlugin;

	constructor(app: App, plugin: MarginaliusPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const fields: [SettingKey, string, string][] = [
			["sidenoteWidth", "Margin note width", "The maximum width of a note in the margin. Short notes take less."],
			["sidenoteMargin", "Gap to text", "The gap between a margin note and the text."],
			["paneGap", "Pane edge gap", "The space kept between a note and the edge of the pane, such as a sidebar. A note that would come closer becomes a box in the text."],
			["intrusiveWidth", "Box width", "The maximum width of a note shown as a box in the text, when it does not fit in the margin. Short notes take less."],
		];

		return fields.map(([key, name, desc]) => ({
			name,
			desc: `${desc} Any CSS length, such as ${DEFAULT_SETTINGS[key]}.`,
			control: {
				type: "text",
				key,
				defaultValue: DEFAULT_SETTINGS[key],
				placeholder: DEFAULT_SETTINGS[key],
				validate: (value: string) =>
					isLength(value) ? undefined : `Use a CSS length, such as ${DEFAULT_SETTINGS[key]}.`,
			},
		}));
	}

	/** Save through the plugin, so the CSS variables and note placement update too. */
	async setControlValue(key: string, value: unknown): Promise<void> {
		const settingKey = key as SettingKey;
		this.plugin.settings[settingKey] = String(value).trim() || DEFAULT_SETTINGS[settingKey];
		await this.plugin.saveSettings();
	}
}
