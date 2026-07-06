# SVG to TikZ Converter for Obsidian

Convert SVG images to TikZ code directly inside Obsidian.

## Features

- **Import SVG** from local files, clipboard, or vault files
- **Convert to TikZ** with customizable output settings
- **Live preview** of generated TikZ code
- **One-click insert** into your notes in TikZJax-compatible format
- **Configurable** output unit, scale, decimal precision, Y-axis direction, and more

## Usage

1. Open the converter via the command palette: **"Open SVG to TikZ converter"**
2. Paste SVG code or import from a file/clipboard/vault
3. Click **Convert** to generate TikZ code
4. Copy the output or click **Insert to Document** to add it directly to your note

### Insert Format

The plugin inserts TikZ code in the format required by the TikZJax plugin:

~~~tikz
\begin{document}
[converted TikZ code]
\end{document}
~~~

## Settings

| Setting | Description |
|---------|-------------|
| Output mode | Standalone document, figure only, or code only |
| Output unit | cm, mm, in, pt, px, etc. |
| Scale | Global scale factor |
| Decimal places | Precision for coordinates |
| Reverse Y axis | Flip Y coordinates (SVG origin is top-left, TikZ is bottom-left) |
| Indent output | Add indentation to generated code |
| Ignore text | Skip text elements during conversion |
| Markings mode | Handle arrow markers |
| Arrow style | latex, stealth, to, or > |

## Installation

### From Obsidian Community Plugins (once approved)

1. Open **Settings → Community Plugins**
2. Disable **Restricted Mode**
3. Click **Browse** and search for "SVG to TikZ Converter"
4. Install and enable the plugin

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Copy them to `<vault>/.obsidian/plugins/svg2tikz/`
3. Enable the plugin in Obsidian settings

## Requirements

- Obsidian v0.15.0 or higher

## License

GNU GPL

## Credits

This plugin is a port of the [svg2tikz](https://github.com/xyz2tex/svg2tikz) project by xyz2tex to the Obsidian platform.# obsidian-svg2tikz
