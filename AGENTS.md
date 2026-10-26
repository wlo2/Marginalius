# Obsidian plugin rules for coding agents

These rules apply to any Obsidian community plugin. Follow them when you write or change code, and check the whole list before a release. They summarize Obsidian's official guidance:

- [Plugin guidelines checklist](https://docs.obsidian.md/oo/plugin)
- [Submission requirements for plugins](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)
- [Migrate to declarative settings](https://docs.obsidian.md/plugins/guides/migrate-declarative-settings)

When a rule here and the official docs disagree, the docs win. Update this file.

## 0. This project

- TypeScript in `src/`, bundled by esbuild into `main.js`, which Obsidian loads. Package manager: npm (Node 18+).
- `npm install`, then:
  - `npm run dev`: build and watch.
  - `npm run build`: type check with `tsc`, then a minified production build.
  - `npm test`: Node's test runner against a small stub of the `obsidian` API (`test/obsidian-stub.ts`).
  - `npm run lint`: ESLint with `eslint-plugin-obsidianmd`'s recommended rules, the same guidelines Obsidian's automated review checks. Test and build files run in Node, so `eslint.config.mjs` turns off the Node-module and `globalThis` rules for them.
- Release files: `main.js`, `manifest.json` and `styles.css`. To test by hand, copy them to `<Vault>/.obsidian/plugins/<plugin-id>/`, reload Obsidian and enable the plugin in **Settings → Community plugins**.
- Keep `main.ts` to the plugin lifecycle (load, unload, registering things). Give every other file one job, and split a file that grows past roughly 200–300 lines by job.
- Releases: tag each one exactly as the manifest `version` (next `0.2.2`), with no `v` (the earlier `v0.1` tag broke that rule).
- Release only by pushing that tag. `.github/workflows/release.yml` runs the tests and Obsidian's `obsidian-workflows` action, which builds, attests `main.js` and `styles.css`, and creates a draft release; then publish the draft. Never upload release files by hand: they would have no artifact attestation, which the directory's scorecard checks.
- Decision: `onload()` sets the CSS variables and registers the editor extension and Reading view processor directly, not in `onLayoutReady()`. It's cheap, and waiting would draw notes with default sizes first and then make them jump (see section 9).

## 1. Manifest, versions and releases

- `manifest.json`:
  - `id`, `name`, `author` and `description` must be your own. Remove every placeholder from the sample plugin.
  - The `id` contains only lowercase letters and hyphens, never contains `obsidian`, and never ends with `plugin`. Never change it after the plugin is in the community directory. For local testing the plugin folder name matches it.
  - `name` leaves out "Obsidian" unless the word really adds meaning. The plugin must never look first-party.
  - `minAppVersion` is the oldest Obsidian version the plugin really works on. If you don't know it, use the latest stable version.
  - `isDesktopOnly` must be `true` if the plugin uses Node.js or Electron APIs (see section 4).
  - Add `fundingUrl` only if you accept donations (for example Buy Me a Coffee or GitHub Sponsors). Otherwise leave it out.
- The description:
  - Starts with an action, for example "Translate selected text into…". Never "This is a plugin…".
  - Is at most 250 characters and ends with a period.
  - Has no emoji or special characters.
  - Spells names correctly: Obsidian, Markdown, PDF, and so on.
- Versions and releases:
  - Use plain `x.y.z` versions.
  - The Git tag of a release must equal the manifest `version` exactly, with no `v` prefix.
  - Attach `main.js` and `manifest.json` to every GitHub release, plus `styles.css` if the plugin has one.
  - When `minAppVersion` goes up, also bump `version` and add `"<version>": "<minAppVersion>"` to `versions.json`. Obsidian uses that file to give users on older app versions the last release that still works for them.
- Keep the built `main.js` out of Git (list it in `.gitignore`), and `node_modules/` and other generated files too. `main.js` belongs only in releases.
- Delete all sample-plugin code before you submit.

## 2. Commands and UI text

- Add commands with `this.addCommand(...)`. Keep command IDs stable once released.
- Use sentence case for all UI text: command names, setting names, descriptions, notices, buttons.
- Command names and command IDs never include the plugin name or ID. Obsidian adds them itself.
- Don't give commands default hotkeys.
- Settings headings:
  - Use them only when the settings tab has more than one section.
  - Never put the words "settings" or "options" in a heading.
  - Never add a top-level heading with the plugin's name.
  - Use Obsidian's heading APIs (a declarative group `heading`, or `Setting.setHeading()`), never raw `<h1>`/`<h2>` elements.
- Remove console logging that production doesn't need. Keep `console.error` for real failures.
- In docs and step-by-step text: short, plain, action-oriented sentences; **bold** for literal UI labels; "select" for interactions; arrows for navigation, as in **Settings → Community plugins**.

## 3. Compatibility and styling

- Replace every deprecated API your editor flags.
- Never override Obsidian's core styles. Scope all CSS to your own class names.
- Keep styles in `styles.css`. Don't set styles from JavaScript or inline in HTML. Values that must come from code (settings, measured sizes) go into the plugin's own CSS variables with `el.setCssProps()`, and `styles.css` uses them. Use Obsidian's CSS variables (`--text-normal`, `--background-secondary`, …) for colors and spacing.
- Use `Vault.configDir`, never a hard-coded `.obsidian` folder.

## 4. Mobile support (when `isDesktopOnly` is `false`)

- Node.js modules (`fs`, `crypto`, `os`, …) and Electron APIs exist only on desktop.
  - If you need them, set `isDesktopOnly: true`, or load them dynamically behind a `Platform.isDesktop` check. Never import them at the top level.
  - Prefer web APIs: `SubtleCrypto` instead of `crypto`, and `navigator.clipboard.readText()` / `writeText()` for the clipboard.
- No regex lookbehinds (`(?<=…)`, `(?<!…)`) if the plugin supports iOS older than 16.4.
- Check `adapter instanceof FileSystemAdapter` before using `FileSystemAdapter`.
- Use Obsidian's `Platform`, not `process.platform`.
- Use `requestUrl`, not `fetch` or `axios`.
- Test on iOS and Android where you can, and keep in-memory data small.

## 5. Coding style

- TypeScript with strict checks.
- `const`/`let`, never `var`.
- Use `this.app`, never the global `app`. Avoid other global variables too.
- Split a large `main.ts` into files by job.
- Prefer `async`/`await` over `.then()` chains, and handle errors.
- Check with `instanceof` before treating something as `TFile`, `TFolder` and so on.
- No `as any`. Type things properly.
- Bundle everything into `main.js`; no runtime dependencies outside it.

## 6. Security, privacy and disclosures

- Never allowed:
  - Obfuscated code that hides what it does. Minified third-party code is fine if its source and version are documented.
  - Client-side telemetry.
  - Ads loaded over the internet, or any ads outside the plugin's own UI.
  - A plugin that installs or updates itself or its dependencies, or runs code fetched from the network.
- Allowed only if the README clearly says so:
  - Payment needed for full access.
  - Account needed for full access.
  - Network use: name each remote service and say why it's needed.
  - Access to files outside the vault: say why.
  - Static ads inside the plugin's own UI.
  - Server-side telemetry: link to a privacy policy.
  - Closed-source code, which Obsidian reviews case by case.
- Work locally by default. Read and write only what the feature needs, and never collect or send vault contents or personal data without clear consent.
- Keep dependencies to a minimum.
- Commit the lock file (`package-lock.json` or similar).

## 7. Licensing, copyright and forks

- The repository must have a `LICENSE` file, and the README must state the license.
- Follow the license of every piece of code you ship. If you bundle or vendor third-party code:
  - Name its package, version, source and license in the README.
  - Keep its license notice in the shipped `main.js`. A `/*! … */` comment survives esbuild bundling and minifying.
  - Write down any local changes you made to it.
- Respect Obsidian's trademark policy. Nothing may suggest the plugin is made by Obsidian.
- Forks are allowed in the directory only if:
  - the original author has approved in writing, publicly, or
  - the original author is unreachable, the project has had no update for 6 months, and 30 days have passed after contacting them publicly.
- Either way, a fork credits the original author.

## 8. API usage

- Change the open note through the `Editor`. For background changes use `Vault.process`, never `Vault.modify`.
- Change frontmatter with `FileManager.processFrontMatter`.
- Delete with `FileManager.trashFile`, never `Vault.delete`.
- Prefer the Vault API over the Adapter API.
- Store plugin data with `Plugin.loadData()` / `Plugin.saveData()`.
- Pass every user-entered path through `normalizePath()`.
- Find files with `Vault.getFileByPath()` and friends, never by looping over all files.

## 9. Performance

- Keep `onload()` small. Start UI work and anything heavy in `workspace.onLayoutReady()`, or load it the first time it's needed.
- Load big libraries lazily, not at the top of a module.
- Support deferred views (Obsidian 1.7.2+) if the plugin has custom views.
- Import `moment` from `obsidian` instead of bundling your own copy.
- Minify `main.js` for releases (esbuild: `minify: true` in production).
- Batch disk access, avoid scanning the whole vault, and debounce or throttle expensive work triggered by file events.
- Free what the plugin creates in `onunload()`: models, workers, intervals, DOM. Prefer `register…` helpers (`registerEvent`, `registerDomEvent`, `registerInterval`, `register`), which clean up on their own, so reloading the plugin never leaks listeners.

## 10. Settings: use declarative settings

Obsidian 1.13.0 added declarative settings. The plugin describes its settings, and Obsidian draws them, saves them, checks input and makes them searchable. Use them in every new settings tab. `display()` is deprecated.

### Rules

- Override `getSettingDefinitions()` on your `PluginSettingTab` subclass and return a list of definitions.
- It runs on every refresh and once at start-up for search, so it must be quick. No file, network or other slow work in it.
- Set `minAppVersion` to at least `1.13.0`, or `1.13.1` if you use a slider's `displayFormat`. Raise the plugin version and update `versions.json` with it (section 1).
- Only keep `display()` next to it if many users are still on Obsidian below 1.13.0. Then both versions must stay in sync. Drop `display()` as soon as you can.
- After changing settings in code (a reset button, say), call `this.update()` to redraw. Calling `display()` does nothing on 1.13.0 and later.
- Call `this.refreshDomState()` when only `visible`/`disabled` conditions changed. It's cheaper than `update()`.
- `validate` only blocks bad input in the UI and shows its error message. It never fixes saved data, so check old saved values in `loadSettings()`.
- Give every setting a sensible default.
- Sibling pages must have unique names.

### Definition types

Every definition has `name`, and optionally `desc` (text or a `DocumentFragment`), `aliases` (extra search words), `searchable` and `visible`. Then it uses exactly one of these:

- `control: { type, key, defaultValue?, validate?, disabled? }`: a built-in control. Obsidian reads `this.plugin.settings[key]`, writes changes back and saves. Types:
  - `toggle`
  - `dropdown` (with `options`)
  - `text` (with `placeholder`)
  - `textarea`
  - `number`
  - `slider` (with `min`, `max`, `step` and `displayFormat`)
  - `color`
  - `secret`
  - `file`
  - `folder`
- `render(setting, group)`: draw a row yourself, for custom suggesters, side effects or values stored in a different shape. Nothing is saved for you: call `saveData()` yourself. It can return a clean-up function.
- `action(el, index)`: a clickable row, for example "Reset to defaults". It takes `disabled`. In lists, use the `index` argument, never an index captured earlier, because rows move.

Containers:

- `{ type: "group", heading, items, search?: { placeholder, match }, cls?, visible? }`: a section with a heading. `search` adds a filter box for long groups.
- `{ type: "list", … }`: for user-edited collections. Takes `emptyState`, `onReorder(old, new)`, `onDelete(index)` and `addItem: { name, action }`.
- `{ type: "page", name, … }`: a sub-page that opens from the settings tab.

### Data that isn't stored under its own key

When a control's value is stored differently (for example many toggles that write to one array), override `getControlValue(key)` and `setControlValue(key, value)` on the tab. Handle your own keys there and pass everything else to `super`. Override `setControlValue` too when a change must do more than save (this plugin's tab saves through `plugin.saveSettings()`, which also updates CSS variables and note placement).

```ts
getSettingDefinitions(): SettingDefinitionItem[] {
  return [
    {
      name: "Confidence threshold",
      control: { type: "slider", key: "threshold", min: 0, max: 1, step: 0.05, displayFormat: (v) => v.toFixed(2) },
    },
    {
      type: "group",
      heading: "Languages",
      search: { placeholder: "Filter languages", match: (d, q) => d.name.toLowerCase().includes(q.toLowerCase()) },
      items: LANGUAGES.map((l) => ({ name: l.label, control: { type: "toggle", key: `language:${l.id}` } })),
    },
    { name: "Reset to defaults", action: async () => { /* reset */ await this.plugin.saveSettings(); this.update(); } },
  ];
}
```

### Moving an old `display()` tab over

1. Raise `minAppVersion` (and `version` and `versions.json`).
2. Add `getSettingDefinitions()`.
3. Turn each `new Setting(...)` into a `control` definition.
4. Move checks out of `onChange` into `validate`.
5. Use `render` only for what controls can't do.
6. Delete `display()` and the imports it no longer needs.

## 11. Before every release

- [ ] Type check, tests, lint and production build pass. `main.js` is minified.
- [ ] `manifest.json` `version` is bumped, `versions.json` has the new entry, and the Git tag equals the version.
- [ ] The release has `main.js` and `manifest.json` attached, plus `styles.css` if it exists.
- [ ] `LICENSE` exists. The README states the license, credits bundled code, and covers every disclosure from section 6.
- [ ] No sample code, debug logging, deprecated APIs, `var`, `as any` or default hotkeys.
- [ ] If `isDesktopOnly` is `false`: no top-level Node or Electron imports, and no regex lookbehinds.

## Troubleshooting

- The plugin doesn't load: `main.js` and `manifest.json` must sit directly in `<Vault>/.obsidian/plugins/<plugin-id>/`.
- `main.js` is missing: run `npm run build` or `npm run dev`.
- Commands don't appear: `addCommand` must run in `onload()`, and command IDs must be unique.
- Settings don't persist: `await` `loadData()` / `saveData()`.
- Problems only on mobile: look for desktop-only APIs and check `isDesktopOnly`.

## References

- [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [API documentation](https://docs.obsidian.md)
- [Obsidian style guide](https://help.obsidian.md/style-guide)
