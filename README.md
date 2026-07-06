# SVG to TikZ Converter for Obsidian

Convert SVG images to TikZ code and seamlessly integrate with **TikZJax** – insert generated code directly into your notes and render it as beautiful LaTeX-style graphics.

---

## Features

- **Import SVG** from local files, clipboard, or vault files  
- **Convert to TikZ** with full control over output settings  
- **Live preview** of the generated TikZ code before insertion  
- **One-click insert** into your note in the exact format required by the **TikZJax** plugin  
- **Works with TikZJax** – after insertion, your diagram renders natively in Obsidian (TikZJax must be installed and enabled)  
- **Customizable** output unit, scale, decimal precision, Y‑axis direction, arrow styles, and more  

---

## Usage

1. Open the converter via the command palette: **"Open SVG to TikZ converter"**  
2. Paste your SVG code or import from a file / clipboard / vault  
3. Click **Convert** to generate the TikZ code  
4. Preview the result, then either **copy** it or click **Insert to Document**  
5. The inserted code is wrapped in the `~~~tikz` block that **TikZJax** recognizes – it will be rendered automatically in your note (provided TikZJax is active)

> **Tip**: For the best experience, install the [TikZJax plugin](https://community.obsidian.md/plugins/obsidian-tikzjax) from the Obsidian community plugins. This converter produces code fully compatible with TikZJax's rendering engine.

---

### Insert Format

The plugin inserts TikZ code in the exact format required by TikZJax:

~~~tikz
\begin{document}
[converted TikZ code]
\end{document}
~~~

This ensures that once inserted, your diagram is immediately rendered by TikZJax without any manual tweaking.

---

## Settings

| Setting | Description |
|---------|-------------|
| Output mode | Standalone document, figure only, or code only |
| Output unit | cm, mm, in, pt, px, etc. |
| Scale | Global scale factor |
| Decimal places | Precision for coordinates |
| Reverse Y axis | Flip Y coordinates (SVG origin is top‑left, TikZ is bottom‑left) |
| Indent output | Add indentation to generated code |
| Ignore text | Skip text elements during conversion |
| Markings mode | Handle arrow markers |
| Arrow style | latex, stealth, to, or > |

---

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

---

## Requirements

- Obsidian v0.15.0 or higher  
- (Optional but recommended) **TikZJax** plugin for inline rendering – you can install it from the community plugins list  

---

## License

GNU GPL

---

## Credits

This plugin is a port of the [svg2tikz](https://github.com/xyz2tex/svg2tikz) project by xyz2tex to the Obsidian platform. The generated code is designed to be fully compatible with the TikZJax plugin.