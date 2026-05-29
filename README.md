# Marginalius

https://github.com/wlo2/Marginalius/raw/main/Demonstration.mov

An Obsidian plugin for **adaptive marginalia** — Tufte/Cornell-style side notes that live in the page margins on wide screens and gracefully fall back to compact, embedded note boxes when space is tight.

Write a note once with a simple callout, and Marginalius decides how to present it based on the available width of the editor pane.

## Features

- **Two adaptive layouts from one syntax:**
  - **Cornell / margin view** (wide panes): the note is pulled out of the text column into the side gutter, borderless and muted, like a printed margin note.
  - **Embedded view** (narrow panes): the note becomes a compact, rounded, floated box that sits inline with the text.
- **Left and right margins:** `[!margin]` floats into the left gutter, `[!margin-r]` into the right.
- **Responsive width:** in the wide view the note width is computed from the *actual* gutter space, so resizing the pane (or opening a sidebar) shrinks the note to stay flush against the pane edge instead of being clipped. When the gutter gets too small it automatically switches to the embedded view.
- **Word-safe wrapping:** text in a narrow margin never splits mid-word. Non-breaking spaces in your notes (commonly typed with `Option+Space` on macOS, or pasted from rich text) are normalized at render time so phrases wrap on real word boundaries — your source file is never modified.
- **Click-to-edit:** clicking a rendered margin note in the editor places the cursor at that note's position in the document.
- **Configurable** widths and spacing via a settings tab.
- **Theme-friendly:** uses theme variables (text colors, borders, readable line width) and works in both Reading view and Live Preview.

## Usage

Use a callout with the `margin` (left) or `margin-r` (right) type:

```markdown
> [!margin]
> Result: only the mysql-backup pod can assume that role and write to S3;
> other pods cannot. So yes: it's access control and least privilege.

Your main body text goes here. On a wide screen the note above is rendered
in the left margin next to this paragraph.

> [!margin-r]
> This note is pulled into the right-hand margin instead.
```

- On a **wide** pane the notes appear in the margins, borderless and muted.
- On a **narrow** pane the same notes render as compact, rounded boxes floated into the text.

## Settings

**Settings → Community plugins → Marginalius**

| Setting | Description | Default |
| --- | --- | --- |
| **Sidenote width** | Maximum width of a margin note in the wide (Cornell) view. The note may render narrower if the gutter is smaller than this. | `200px` |
| **Sidenote margin** | Gap between a margin note and the main document text. | `20px` |
| **Intrusive width** | Width of the embedded note box in the narrow (half-embedded) view. | `200px` |

These map to the CSS custom properties `--marginalius-width`, `--marginalius-margin`, and `--marginalius-intrusive-width`.

## How it works

Marginalius is intentionally small and split into focused modules under `src/`:

- **`main.ts`** — plugin lifecycle. Loads settings, injects the dynamic CSS variables from settings, registers the wrap fix, and wires up the click-to-edit handler.
- **`settings.ts`** — settings interface, defaults, and the settings tab.
- **`wrap-fix.ts`** — a markdown post-processor that replaces non-breaking characters (`U+00A0`, `U+202F`, `U+2007`, the word joiner/ZWNBSP, and the non-breaking hyphen) with their breaking equivalents inside margin callouts only, so narrow notes can wrap normally. It runs for both Reading view and Live Preview.
- **`styles.css`** — all presentation:
  - Strips the default callout chrome (title, icon, border, background) for `margin` / `margin-r`.
  - Forces word-integrity wrapping (`word-break: normal`, `overflow-wrap: break-word`) across the callout and its descendants, including the CodeMirror internals used in Live Preview.
  - Defines the **narrow / embedded** layout as the default.
  - Uses a CSS **container query** on the markdown view (`container-type: inline-size`) to switch to the **wide / Cornell** layout at `width >= 1000px`.

### Adaptive width math (wide view)

The body is centered at the readable line width (`--file-line-width`), leaving a gutter on each side. Using container query units, the plugin computes:

```text
gutter = (100cqi - var(--file-line-width)) / 2
fit    = max(0, min(configured width, gutter - margin - edge))
```

`fit` drives both the note's `width` and its negative pull-out margin, so the box and its offset always stay in sync. As the pane narrows, `fit` shrinks; below the breakpoint the note reverts to the embedded layout. Reading view adds a small extra `--marginalius-edge` of separation because its rendered text sits a little closer to the gutter than the editor's.

> Note: the wide view relies on **Readable line length** being enabled (the default), which is what creates the side gutters.

## Development

Requirements: Node.js 18+ and npm.

```bash
# install dependencies
npm install

# development build with watch
npm run dev

# production build (type-check + bundle)
npm run build
```

The build type-checks with `tsc` and bundles `src/main.ts` into `main.js` with esbuild (see `esbuild.config.mjs`).

### Manual install / testing

Copy the release artifacts into your vault's plugin folder, then reload Obsidian and enable the plugin in **Settings → Community plugins**:

```bash
cp main.js manifest.json styles.css "<Vault>/.obsidian/plugins/obsidian-marginalius/"
```

Required artifacts: `main.js`, `manifest.json`, `styles.css`.

## Privacy

Marginalius runs entirely locally. It makes no network requests, collects no telemetry, and never modifies your notes on disk — the non-breaking-space normalization only affects the rendered DOM.

## License

MIT
