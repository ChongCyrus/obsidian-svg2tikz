const { Plugin, PluginSettingTab, Setting, Modal, Notice, TFile, MarkdownView } = require('obsidian');

const DEFAULT_SETTINGS = {
	outputMode: 'figonly',
	outputUnit: 'cm',
	scale: 1.0,
	roundNumber: 4,
	reverseY: true,
	indent: true,
	ignoreText: false,
	markings: 'arrows',
	arrowStyle: 'latex',
	includeColors: true,
	clipboardOutput: false
};

class Svg2TikzPlugin extends Plugin {
	async onload() {
		await this.loadSettings();

		// Main command: open the converter modal
		this.addCommand({
			id: 'open-svg2tikz-converter',
			name: 'Open SVG to TikZ converter',
			callback: () => new Svg2TikzMainModal(this.app, this).open()
		});

		// Settings tab
		this.addSettingTab(new Svg2TikzSettingTab(this.app, this));

		// Right-click menu for SVG files in vault
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'svg') {
					menu.addItem((item) => {
						item.setTitle('Convert to TikZ')
							.setIcon('code')
							.onClick(() => {
								new Svg2TikzMainModal(this.app, this, file).open();
							});
					});
				}
			})
		);
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// ==================== Main Converter Modal ====================

class Svg2TikzMainModal extends Modal {
	constructor(app, plugin, preselectedFile = null) {
		super(app);
		this.plugin = plugin;
		this.preselectedFile = preselectedFile;
		this.currentTikz = '';
		this.currentFigonly = '';
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('svg2tikz-modal');
		contentEl.empty();

		// Header
		contentEl.createEl('div', { cls: 'svg2tikz-header', text: 'SVG → TikZ Converter' });

		const body = contentEl.createEl('div', { cls: 'svg2tikz-body' });

		// --- Input Section ---
		body.createEl('div', { cls: 'svg2tikz-section-title', text: 'Input SVG' });

		// Textarea for SVG code
		this.svgInput = body.createEl('textarea', { cls: 'svg2tikz-input-area' });
		this.svgInput.placeholder = 'Paste SVG code here, or use the buttons below to import...';

		// If preselected file, load it
		if (this.preselectedFile) {
			this.loadVaultFile(this.preselectedFile);
		}

		// Button row
		const btnRow = body.createEl('div', { cls: 'svg2tikz-btn-row' });

		// Local file button (works on both desktop and mobile)
		const localBtn = btnRow.createEl('button', { text: '📁 Local File' });
		localBtn.addEventListener('click', () => this.pickLocalFile());

		// Clipboard button
		const clipBtn = btnRow.createEl('button', { text: '📋 From Clipboard' });
		clipBtn.addEventListener('click', () => this.loadFromClipboard());

		// Vault file button
		const vaultBtn = btnRow.createEl('button', { text: '🗂️ Vault File' });
		vaultBtn.addEventListener('click', () => this.pickVaultFile());

		// Convert button
		const convertBtn = btnRow.createEl('button', { text: '⚡ Convert', cls: 'mod-cta' });
		convertBtn.addEventListener('click', () => this.doConvert());

		// --- Status / Error ---
		this.statusEl = body.createEl('div', { cls: 'svg2tikz-status' });
		this.errorEl = body.createEl('div', { cls: 'svg2tikz-error' });
		this.errorEl.style.display = 'none';
		this.successEl = body.createEl('div', { cls: 'svg2tikz-success' });
		this.successEl.style.display = 'none';

		// --- Preview Section ---
		body.createEl('div', { cls: 'svg2tikz-section-title', text: 'TikZ Output' });
		this.previewEl = body.createEl('pre', { cls: 'svg2tikz-preview', text: '(Click "Convert" to generate TikZ code)' });

		// --- Action Bar ---
		const actionBar = body.createEl('div', { cls: 'svg2tikz-action-bar' });

		this.copyBtn = actionBar.createEl('button', { text: '📋 Copy Output' });
		this.copyBtn.disabled = true;
		this.copyBtn.addEventListener('click', () => this.copyToClipboard());

		this.insertBtn = actionBar.createEl('button', { text: '⬇️ Insert to Document', cls: 'mod-cta' });
		this.insertBtn.disabled = true;
		this.insertBtn.addEventListener('click', () => this.insertToDocument());

		const closeBtn = actionBar.createEl('button', { text: 'Close' });
		closeBtn.addEventListener('click', () => this.close());
	}

	// ==================== File Import Methods ====================

	pickLocalFile() {
		// Create a hidden file input that works on both desktop and mobile
		const fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = '.svg,image/svg+xml';
		fileInput.style.display = 'none';
		document.body.appendChild(fileInput);

		fileInput.addEventListener('change', (evt) => {
			const file = evt.target.files[0];
			if (!file) {
				document.body.removeChild(fileInput);
				return;
			}
			const reader = new FileReader();
			reader.onload = (e) => {
				this.svgInput.value = e.target.result;
				this.showStatus(`Loaded local file: ${file.name} (${this.formatBytes(file.size)})`);
				document.body.removeChild(fileInput);
				// Auto-convert
				this.doConvert();
			};
			reader.onerror = () => {
				this.showError('Failed to read local file.');
				document.body.removeChild(fileInput);
			};
			reader.readAsText(file);
		});

		// Trigger file picker
		fileInput.click();
	}

	async loadFromClipboard() {
		try {
			const text = await navigator.clipboard.readText();
			if (!text || !text.trim()) {
				this.showError('Clipboard is empty.');
				return;
			}
			if (!text.includes('<svg')) {
				this.showError('Clipboard does not contain valid SVG content (no <svg> tag found).');
				return;
			}
			this.svgInput.value = text;
			this.showStatus('Loaded SVG code from clipboard.');
			this.doConvert();
		} catch (e) {
			this.showError('Failed to read clipboard: ' + e.message);
		}
	}

	pickVaultFile() {
		const files = this.app.vault.getFiles().filter(f => f.extension === 'svg');
		if (files.length === 0) {
			this.showError('No SVG files found in vault.');
			return;
		}
		new SvgVaultFileModal(this.app, files, (file) => {
			this.loadVaultFile(file);
		}).open();
	}

	async loadVaultFile(file) {
		try {
			const content = await this.app.vault.read(file);
			this.svgInput.value = content;
			this.showStatus(`Loaded vault file: ${file.path}`);
			this.doConvert();
		} catch (e) {
			this.showError('Error reading vault file: ' + e.message);
		}
	}

	// ==================== Conversion ====================

	doConvert() {
		const svgSource = this.svgInput.value.trim();
		if (!svgSource) {
			this.showError('Please provide SVG content first.');
			return;
		}
		if (!svgSource.includes('<svg')) {
			this.showError('Input does not appear to be valid SVG (no <svg> tag found).');
			return;
		}

		try {
			const parser = new DOMParser();
			const doc = parser.parseFromString(svgSource, 'image/svg+xml');
			const svg = doc.querySelector('svg');
			if (!svg) {
				this.showError('Could not parse <svg> element.');
				return;
			}

			// Generate preview using current settings
			const converter = new SvgToTikzConverter(this.plugin.settings);
			this.currentTikz = converter.convert(svg);

			// Also generate figonly version for insertion
			const figSettings = { ...this.plugin.settings, outputMode: 'figonly' };
			const figConverter = new SvgToTikzConverter(figSettings);
			this.currentFigonly = figConverter.convert(svg);

			this.previewEl.textContent = this.currentTikz;
			this.copyBtn.disabled = false;
			this.insertBtn.disabled = false;
			this.errorEl.style.display = 'none';
			this.showSuccess('Conversion successful!');
		} catch (e) {
			this.showError('Conversion error: ' + e.message);
			this.copyBtn.disabled = true;
			this.insertBtn.disabled = true;
		}
	}

	// ==================== Output Actions ====================

	async copyToClipboard() {
		if (!this.currentTikz) return;
		try {
			await navigator.clipboard.writeText(this.currentTikz);
			this.showSuccess('TikZ code copied to clipboard!');
		} catch (e) {
			this.showError('Failed to copy: ' + e.message);
		}
	}

	insertToDocument() {
		if (!this.currentFigonly) {
			this.showError('No converted code available. Please convert first.');
			return;
		}

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			this.showError('No active markdown editor. Please open a markdown note first.');
			return;
		}

		const editor = activeView.editor;
		const cursor = editor.getCursor();

		// Build the insert text in the exact format requested:
		// ~~~tikz
		// \begin{document}
		// c (converted figonly code)
		// \end{document}
		//
		// ~~~
		const c = this.currentFigonly;
		const insertText = `~~~tikz
\\begin{document}
${c}
\\end{document}

~~~
`;

		editor.replaceRange(insertText, cursor);
		this.showSuccess('Inserted into document at cursor position!');
		this.close();
	}

	// ==================== Helpers ====================

	showStatus(msg) {
		this.statusEl.textContent = msg;
		this.statusEl.style.display = 'block';
	}

	showError(msg) {
		this.errorEl.textContent = msg;
		this.errorEl.style.display = 'block';
		this.successEl.style.display = 'none';
		setTimeout(() => { this.errorEl.style.display = 'none'; }, 5000);
	}

	showSuccess(msg) {
		this.successEl.textContent = msg;
		this.successEl.style.display = 'block';
		this.errorEl.style.display = 'none';
		setTimeout(() => { this.successEl.style.display = 'none'; }, 3000);
	}

	formatBytes(bytes) {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ==================== Vault File Picker Modal ====================

class SvgVaultFileModal extends Modal {
	constructor(app, files, onSelect) {
		super(app);
		this.files = files;
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: 'Select SVG from Vault' });

		for (const file of this.files) {
			const item = contentEl.createEl('div');
			item.style.padding = '10px 8px';
			item.style.cursor = 'pointer';
			item.style.borderRadius = '6px';
			item.style.borderBottom = '1px solid var(--background-modifier-border)';
			item.textContent = file.path;
			item.addEventListener('click', () => {
				this.onSelect(file);
				this.close();
			});
			item.addEventListener('mouseenter', () => {
				item.style.background = 'var(--background-modifier-hover)';
			});
			item.addEventListener('mouseleave', () => {
				item.style.background = '';
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ==================== Core SVG to TikZ Converter ====================

class SvgToTikzConverter {
	constructor(settings) {
		this.settings = settings;
		this.colors = [];
		this.colorCode = '';
		this.indent = settings.indent ? '  ' : '';
		this.height = 0;
		this.width = 0;
	}

	convert(svg) {
		const vb = svg.getAttribute('viewBox');
		if (vb) {
			const parts = vb.split(/\s+/).map(parseFloat);
			this.width = parts[2];
			this.height = parts[3];
		} else {
			this.width = parseFloat(svg.getAttribute('width')) || 100;
			this.height = parseFloat(svg.getAttribute('height')) || 100;
		}

		let code = this.processNode(svg, 0);

		const mode = this.settings.outputMode;
		const unit = this.settings.outputUnit;
		const scale = this.settings.scale;
		const ysign = ''; // Fixed: removed '-' to avoid double Y-flip with coord()

		if (mode === 'standalone') {
			return `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{tikz}
${this.colorCode}\\def\\globalscale {${scale}}
\\begin{document}
\\begin{tikzpicture}[y=1${unit}, x=1${unit}, yscale=${ysign}\\globalscale, xscale=\\globalscale, every node/.append style={scale=\\globalscale}, inner sep=0pt, outer sep=0pt]
${code}\\end{tikzpicture}
\\end{document}`;
		} else if (mode === 'figonly') {
			return `${this.colorCode}\\def\\globalscale {${scale}}
\\begin{tikzpicture}[y=1${unit}, x=1${unit}, yscale=${ysign}\\globalscale, xscale=\\globalscale, every node/.append style={scale=\\globalscale}, inner sep=0pt, outer sep=0pt]
${code}\\end{tikzpicture}`;
		} else {
			return code;
		}
	}

	processNode(node, depth) {
		if (node.nodeType !== 1) return '';
		const tag = node.tagName.toLowerCase();

		if (['defs', 'title', 'desc', 'metadata', 'style', 'script'].includes(tag)) {
			return '';
		}

		const indent = this.indent.repeat(depth);
		let result = '';

		if (tag === 'g') {
			result += this.processGroup(node, depth);
		} else if (tag === 'path') {
			result += this.processPath(node, indent);
		} else if (tag === 'rect') {
			result += this.processRect(node, indent);
		} else if (tag === 'circle') {
			result += this.processCircle(node, indent);
		} else if (tag === 'ellipse') {
			result += this.processEllipse(node, indent);
		} else if (tag === 'line') {
			result += this.processLine(node, indent);
		} else if (tag === 'polyline' || tag === 'polygon') {
			result += this.processPoly(node, indent, tag === 'polygon');
		} else if (tag === 'text') {
			result += this.processText(node, indent);
		} else if (tag === 'svg' || tag === 'switch') {
			for (const child of node.children) {
				result += this.processNode(child, depth);
			}
		}

		return result;
	}

	processGroup(node, depth) {
		const options = this.getStyleOptions(node) + this.getTransformOptions(node);
		let code = '';
		for (const child of node.children) {
			code += this.processNode(child, depth + 1);
		}
		if (!code) return '';

		const indent = this.indent.repeat(depth);
		if (options) {
			return `${indent}\\begin{scope}[${options}]\n${code}${indent}\\end{scope}\n`;
		}
		return code;
	}

	processPath(node, indent) {
		const d = node.getAttribute('d');
		if (!d) return '';

		const options = this.getStyleOptions(node) + this.getTransformOptions(node);
		const pathCode = this.convertPathData(d);
		return `${indent}\\path[${options}] ${pathCode};\n`;
	}

	processRect(node, indent) {
		const x = parseFloat(node.getAttribute('x')) || 0;
		const y = parseFloat(node.getAttribute('y')) || 0;
		const w = parseFloat(node.getAttribute('width')) || 0;
		const h = parseFloat(node.getAttribute('height')) || 0;
		const rx = parseFloat(node.getAttribute('rx')) || 0;
		const ry = parseFloat(node.getAttribute('ry')) || 0;

		const p1 = this.coord(x, y);
		const p2 = this.coord(x + w, y + h);

		let options = this.getStyleOptions(node) + this.getTransformOptions(node);
		if (rx > 0 || ry > 0) {
			const r = Math.max(rx, ry);
			options += (options ? ',' : '') + `rounded corners=${this.round(this.toUnit(r))}${this.settings.outputUnit}`;
		}

		return `${indent}\\path[${options}] ${p1} rectangle ${p2};\n`;
	}

	processCircle(node, indent) {
		const cx = parseFloat(node.getAttribute('cx')) || 0;
		const cy = parseFloat(node.getAttribute('cy')) || 0;
		const r = parseFloat(node.getAttribute('r')) || 0;

		const options = this.getStyleOptions(node) + this.getTransformOptions(node);
		const center = this.coord(cx, cy);
		const radius = this.round(this.toUnit(r));

		return `${indent}\\path[${options}] ${center} circle (${radius}${this.settings.outputUnit});\n`;
	}

	processEllipse(node, indent) {
		const cx = parseFloat(node.getAttribute('cx')) || 0;
		const cy = parseFloat(node.getAttribute('cy')) || 0;
		const rx = parseFloat(node.getAttribute('rx')) || 0;
		const ry = parseFloat(node.getAttribute('ry')) || 0;

		const options = this.getStyleOptions(node) + this.getTransformOptions(node);
		const center = this.coord(cx, cy);
		const rxu = this.round(this.toUnit(rx));
		const ryu = this.round(this.toUnit(ry));

		return `${indent}\\path[${options}] ${center} ellipse (${rxu}${this.settings.outputUnit} and ${ryu}${this.settings.outputUnit});\n`;
	}

	processLine(node, indent) {
		const x1 = parseFloat(node.getAttribute('x1')) || 0;
		const y1 = parseFloat(node.getAttribute('y1')) || 0;
		const x2 = parseFloat(node.getAttribute('x2')) || 0;
		const y2 = parseFloat(node.getAttribute('y2')) || 0;

		const options = this.getStyleOptions(node) + this.getTransformOptions(node);
		const p1 = this.coord(x1, y1);
		const p2 = this.coord(x2, y2);

		return `${indent}\\path[${options}] ${p1} -- ${p2};\n`;
	}

	processPoly(node, indent, close) {
		const points = node.getAttribute('points');
		if (!points) return '';

		const coords = points.trim().split(/[\s,]+/).filter(s => s).map(parseFloat);
		let path = '';
		for (let i = 0; i < coords.length; i += 2) {
			if (i > 0) path += ' -- ';
			path += this.coord(coords[i], coords[i + 1]);
		}
		if (close) path += ' -- cycle';

		const options = this.getStyleOptions(node) + this.getTransformOptions(node);
		return `${indent}\\path[${options}] ${path};\n`;
	}

	processText(node, indent) {
		if (this.settings.ignoreText) return '';

		const x = parseFloat(node.getAttribute('x')) || 0;
		const y = parseFloat(node.getAttribute('y')) || 0;
		const text = node.textContent || '';
		const escaped = this.escapeTex(text);

		let options = this.getStyleOptions(node) + this.getTransformOptions(node, true);
		if (!options.includes('anchor=')) {
			options += (options ? ',' : '') + 'anchor=south west';
		}

		const pos = this.coord(x, y);
		return `${indent}\\node[${options}] at ${pos} {${escaped}};\n`;
	}

	// ==================== Path Data Parser ====================

	convertPathData(d) {
		const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) || [];
		let result = '';
		let current = { x: 0, y: 0 };
		let start = { x: 0, y: 0 };
		let lastCubicCp = null;
		let lastQuadCp = null;

		for (const token of tokens) {
			const cmd = token[0];
			const nums = token.slice(1).trim().split(/[\s,]+/).filter(s => s).map(parseFloat);
			let i = 0;
			const abs = cmd === cmd.toUpperCase();

			switch (cmd.toUpperCase()) {
				case 'M':
					while (i < nums.length) {
						const x = abs ? nums[i] : current.x + nums[i];
						const y = abs ? nums[i + 1] : current.y + nums[i + 1];
						if (i === 0) {
							result += this.coord(x, y);
							start = { x, y };
						} else {
							result += ` -- ${this.coord(x, y)}`;
						}
						current = { x, y };
						i += 2;
					}
					lastCubicCp = null;
					lastQuadCp = null;
					break;

				case 'L':
					while (i < nums.length) {
						const x = abs ? nums[i] : current.x + nums[i];
						const y = abs ? nums[i + 1] : current.y + nums[i + 1];
						result += ` -- ${this.coord(x, y)}`;
						current = { x, y };
						i += 2;
					}
					break;

				case 'H':
					while (i < nums.length) {
						const x = abs ? nums[i] : current.x + nums[i];
						result += ` -- ${this.coord(x, current.y)}`;
						current.x = x;
						i++;
					}
					break;

				case 'V':
					while (i < nums.length) {
						const y = abs ? nums[i] : current.y + nums[i];
						result += ` -- ${this.coord(current.x, y)}`;
						current.y = y;
						i++;
					}
					break;

				case 'C':
					while (i < nums.length) {
						const x1 = abs ? nums[i] : current.x + nums[i];
						const y1 = abs ? nums[i + 1] : current.y + nums[i + 1];
						const x2 = abs ? nums[i + 2] : current.x + nums[i + 2];
						const y2 = abs ? nums[i + 3] : current.y + nums[i + 3];
						const x = abs ? nums[i + 4] : current.x + nums[i + 4];
						const y = abs ? nums[i + 5] : current.y + nums[i + 5];
						result += ` .. controls ${this.coord(x1, y1)} and ${this.coord(x2, y2)} .. ${this.coord(x, y)}`;
						lastCubicCp = { x: x2, y: y2 };
						current = { x, y };
						i += 6;
					}
					break;

				case 'S':
					while (i < nums.length) {
						const x2 = abs ? nums[i] : current.x + nums[i];
						const y2 = abs ? nums[i + 1] : current.y + nums[i + 1];
						const x = abs ? nums[i + 2] : current.x + nums[i + 2];
						const y = abs ? nums[i + 3] : current.y + nums[i + 3];
						const x1 = lastCubicCp ? 2 * current.x - lastCubicCp.x : current.x;
						const y1 = lastCubicCp ? 2 * current.y - lastCubicCp.y : current.y;
						result += ` .. controls ${this.coord(x1, y1)} and ${this.coord(x2, y2)} .. ${this.coord(x, y)}`;
						lastCubicCp = { x: x2, y: y2 };
						current = { x, y };
						i += 4;
					}
					break;

				case 'Q':
					while (i < nums.length) {
						const x1 = abs ? nums[i] : current.x + nums[i];
						const y1 = abs ? nums[i + 1] : current.y + nums[i + 1];
						const x = abs ? nums[i + 2] : current.x + nums[i + 2];
						const y = abs ? nums[i + 3] : current.y + nums[i + 3];
						const cp1x = current.x + (2 / 3) * (x1 - current.x);
						const cp1y = current.y + (2 / 3) * (y1 - current.y);
						const cp2x = cp1x + (x - current.x) / 3;
						const cp2y = cp1y + (y - current.y) / 3;
						result += ` .. controls ${this.coord(cp1x, cp1y)} and ${this.coord(cp2x, cp2y)} .. ${this.coord(x, y)}`;
						lastQuadCp = { x: x1, y: y1 };
						current = { x, y };
						i += 4;
					}
					break;

				case 'T':
					while (i < nums.length) {
						const x = abs ? nums[i] : current.x + nums[i];
						const y = abs ? nums[i + 1] : current.y + nums[i + 1];
						const x1 = lastQuadCp ? 2 * current.x - lastQuadCp.x : current.x;
						const y1 = lastQuadCp ? 2 * current.y - lastQuadCp.y : current.y;
						const cp1x = current.x + (2 / 3) * (x1 - current.x);
						const cp1y = current.y + (2 / 3) * (y1 - current.y);
						const cp2x = cp1x + (x - current.x) / 3;
						const cp2y = cp1y + (y - current.y) / 3;
						result += ` .. controls ${this.coord(cp1x, cp1y)} and ${this.coord(cp2x, cp2y)} .. ${this.coord(x, y)}`;
						lastQuadCp = { x: x1, y: y1 };
						current = { x, y };
						i += 2;
					}
					break;

				case 'A':
					while (i < nums.length) {
						const x = abs ? nums[i + 5] : current.x + nums[i + 5];
						const y = abs ? nums[i + 6] : current.y + nums[i + 6];
						result += ` -- ${this.coord(x, y)}`;
						current = { x, y };
						i += 7;
					}
					break;

				case 'Z':
					result += ' -- cycle';
					current = { ...start };
					break;
			}
		}

		return result;
	}

	// ==================== Style & Transform ====================

	getStyleOptions(node) {
		const style = node.getAttribute('style') || '';
		const props = this.parseStyle(style);
		const options = [];

		const fill = node.getAttribute('fill') || props.fill;
		if (fill && fill !== 'none') {
			if (fill.startsWith('url(')) {
				options.push('fill=black');
			} else {
				options.push(`fill=${this.convertColor(fill)}`);
			}
		} else if (fill === 'none') {
			options.push('fill=none');
		} else if (['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline'].includes(node.tagName.toLowerCase())) {
			options.push('fill=black');
		}

		const stroke = node.getAttribute('stroke') || props.stroke;
		if (stroke && stroke !== 'none') {
			options.push(`draw=${this.convertColor(stroke)}`);
		}

		const sw = node.getAttribute('stroke-width') || props['stroke-width'];
		if (sw) {
			options.push(`line width=${this.round(this.toUnit(parseFloat(sw)))}${this.settings.outputUnit}`);
		}

		const op = node.getAttribute('opacity') || props.opacity;
		if (op && parseFloat(op) < 1) {
			options.push(`opacity=${op}`);
		}

		const fop = node.getAttribute('fill-opacity') || props['fill-opacity'];
		if (fop && parseFloat(fop) < 1) {
			options.push(`fill opacity=${fop}`);
		}

		const sop = node.getAttribute('stroke-opacity') || props['stroke-opacity'];
		if (sop && parseFloat(sop) < 1) {
			options.push(`draw opacity=${sop}`);
		}

		const cap = node.getAttribute('stroke-linecap') || props['stroke-linecap'];
		if (cap) {
			options.push(`line cap=${cap}`);
		}

		const join = node.getAttribute('stroke-linejoin') || props['stroke-linejoin'];
		if (join) {
			options.push(`line join=${join}`);
		}

		const dash = node.getAttribute('stroke-dasharray') || props['stroke-dasharray'];
		if (dash && dash !== 'none') {
			const parts = dash.split(/[\s,]+/).map(parseFloat);
			const dashes = [];
			for (let j = 0; j < parts.length; j++) {
				const val = this.round(this.toUnit(parts[j]));
				dashes.push(`${j % 2 === 0 ? 'on' : 'off'} ${val}${this.settings.outputUnit}`);
			}
			options.push(`dash pattern=${dashes.join(' ')}`);
		}

		if (this.settings.markings !== 'ignore') {
			const ms = node.getAttribute('marker-start') || props['marker-start'];
			const me = node.getAttribute('marker-end') || props['marker-end'];
			if (ms || me) {
				const start = ms ? (ms.includes('end') ? `${this.settings.arrowStyle} reversed` : this.settings.arrowStyle) : '';
				const end = me ? (me.includes('start') ? `${this.settings.arrowStyle} reversed` : this.settings.arrowStyle) : '';
				if (start && end) {
					options.push(`${start}-${end}`);
				} else if (start) {
					options.push(`${start}-`);
				} else if (end) {
					options.push(`-${end}`);
				}
			}
		}

		return options.join(',');
	}

	getTransformOptions(node, isNode = false) {
		const transform = node.getAttribute('transform');
		if (!transform) return '';

		const options = [];
		const regex = /(translate|rotate|scale|matrix)\(([^)]+)\)/g;
		let match;

		while ((match = regex.exec(transform)) !== null) {
			const type = match[1];
			const vals = match[2].split(/[\s,]+/).map(parseFloat);

			switch (type) {
				case 'translate':
					const tx = this.round(this.toUnit(vals[0]));
					const ty = vals[1] !== undefined ? this.round(this.toUnit(vals[1])) : 0;
					const tyFinal = this.settings.reverseY && !isNode ? -ty : ty;
					options.push(`shift={(${tx}${this.settings.outputUnit}, ${tyFinal}${this.settings.outputUnit})}`);
					break;
				case 'rotate':
					const ang = this.round(-vals[0]);
					if (vals.length >= 3) {
						const rx = this.round(this.toUnit(vals[1]));
						const ry = this.round(this.toUnit(vals[2]));
						const ryFinal = this.settings.reverseY ? this.height - ry : ry;
						options.push(`rotate around={${ang}:(${rx}${this.settings.outputUnit}, ${ryFinal}${this.settings.outputUnit})}`);
					} else {
						options.push(`rotate=${ang}`);
					}
					break;
				case 'scale':
					const sx = this.round(vals[0]);
					const sy = vals[1] !== undefined ? this.round(vals[1]) : sx;
					if (sx === sy) {
						options.push(`scale=${sx}`);
					} else {
						options.push(`xscale=${sx},yscale=${sy}`);
					}
					break;
				case 'matrix':
					const a = this.round(vals[0]);
					const b = this.round(vals[1]);
					const c = this.round(vals[2]);
					const d = this.round(vals[3]);
					const e = this.round(this.toUnit(vals[4]));
					const f = this.round(this.toUnit(vals[5]));
					const fFinal = this.settings.reverseY && !isNode ? -f : f;
					options.push(`cm={${a},${b},${c},${d},(${e}${this.settings.outputUnit}, ${fFinal}${this.settings.outputUnit})}`);
					break;
			}
		}

		return options.join(',');
	}

	parseStyle(styleStr) {
		const props = {};
		if (!styleStr) return props;
		const parts = styleStr.split(';');
		for (const part of parts) {
			const [k, v] = part.split(':');
			if (k && v) props[k.trim()] = v.trim();
		}
		return props;
	}

	convertColor(color) {
		if (!color) return 'black';
		color = color.trim().toLowerCase();

		const namedColors = ['black', 'red', 'green', 'blue', 'cyan', 'yellow', 'magenta', 'white', 'gray', 'orange', 'purple', 'brown', 'pink', 'lime', 'teal', 'olive', 'violet'];
		if (namedColors.includes(color)) return color;

		if (color.startsWith('#')) {
			const hex = color.slice(1);
			let r, g, b;
			if (hex.length === 3) {
				r = parseInt(hex[0] + hex[0], 16);
				g = parseInt(hex[1] + hex[1], 16);
				b = parseInt(hex[2] + hex[2], 16);
			} else if (hex.length === 6) {
				r = parseInt(hex.slice(0, 2), 16);
				g = parseInt(hex.slice(2, 4), 16);
				b = parseInt(hex.slice(4, 6), 16);
			} else {
				return 'black';
			}
			const name = `c${hex}`;
			if (!this.colors.includes(name)) {
				this.colors.push(name);
				this.colorCode += `\\definecolor{${name}}{RGB}{${r},${g},${b}}\n`;
			}
			return name;
		}

		const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
		if (rgbMatch) {
			const r = parseInt(rgbMatch[1]);
			const g = parseInt(rgbMatch[2]);
			const b = parseInt(rgbMatch[3]);
			const name = `crgb${r}${g}${b}`;
			if (!this.colors.includes(name)) {
				this.colors.push(name);
				this.colorCode += `\\definecolor{${name}}{RGB}{${r},${g},${b}}\n`;
			}
			return name;
		}

		return color;
	}

	coord(x, y) {
		const ux = this.round(this.toUnit(x));
		const uy = this.settings.reverseY ? this.round(this.toUnit(this.height - y)) : this.round(this.toUnit(y));
		return `(${ux}, ${uy})`;
	}

	toUnit(val) {
		const unit = this.settings.outputUnit;
		if (unit === 'cm') return val * 0.026458;
		if (unit === 'mm') return val * 0.26458;
		if (unit === 'in') return val * 0.010416;
		if (unit === 'pt') return val * 0.75;
		if (unit === 'px') return val;
		if (unit === 'pc') return val * 0.0625;
		if (unit === 'm') return val * 0.00026458;
		if (unit === 'Q') return val * 0.705;
		return val;
	}

	round(val) {
		if (typeof val !== 'number') return val;
		const factor = Math.pow(10, this.settings.roundNumber);
		return Math.round(val * factor) / factor;
	}

	escapeTex(str) {
		return str
			.replace(/\\/g, '\\textbackslash{}')
			.replace(/\$/g, '\\$')
			.replace(/%/g, '\\%')
			.replace(/_/g, '\\_')
			.replace(/#/g, '\\#')
			.replace(/&/g, '\\&')
			.replace(/{/g, '\\{')
			.replace(/}/g, '\\}')
			.replace(/\^/g, '\\^{}')
			.replace(/~/g, '\\textasciitilde{}');
	}
}

// ==================== Settings Tab ====================

class Svg2TikzSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'SVG to TikZ Converter Settings' });

		new Setting(containerEl)
			.setName('Output mode')
			.setDesc('How much boilerplate code to generate in the preview')
			.addDropdown(dropdown => dropdown
				.addOption('standalone', 'Standalone document')
				.addOption('figonly', 'Figure only (tikzpicture)')
				.addOption('codeonly', 'Code only (paths only)')
				.setValue(this.plugin.settings.outputMode)
				.onChange(async (value) => {
					this.plugin.settings.outputMode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Output unit')
			.setDesc('Unit for TikZ coordinates')
			.addDropdown(dropdown => dropdown
				.addOption('cm', 'cm')
				.addOption('mm', 'mm')
				.addOption('in', 'in')
				.addOption('pt', 'pt')
				.addOption('px', 'px')
				.setValue(this.plugin.settings.outputUnit)
				.onChange(async (value) => {
					this.plugin.settings.outputUnit = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Scale')
			.setDesc('Global scale factor')
			.addSlider(slider => slider
				.setLimits(0.1, 5, 0.1)
				.setValue(this.plugin.settings.scale)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.scale = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Decimal places')
			.setDesc('Number of decimal places for coordinates')
			.addSlider(slider => slider
				.setLimits(1, 6, 1)
				.setValue(this.plugin.settings.roundNumber)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.roundNumber = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Reverse Y axis')
			.setDesc('Flip Y coordinates (SVG origin is top-left, TikZ is bottom-left)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.reverseY)
				.onChange(async (value) => {
					this.plugin.settings.reverseY = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Indent output')
			.setDesc('Add indentation to generated code')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.indent)
				.onChange(async (value) => {
					this.plugin.settings.indent = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Ignore text')
			.setDesc('Skip text elements during conversion')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.ignoreText)
				.onChange(async (value) => {
					this.plugin.settings.ignoreText = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Markings mode')
			.setDesc('How to handle arrow markers')
			.addDropdown(dropdown => dropdown
				.addOption('ignore', 'Ignore')
				.addOption('arrows', 'Convert to TikZ arrows')
				.setValue(this.plugin.settings.markings)
				.onChange(async (value) => {
					this.plugin.settings.markings = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Arrow style')
			.setDesc('Default arrow tip style')
			.addDropdown(dropdown => dropdown
				.addOption('latex', 'latex')
				.addOption('stealth', 'stealth')
				.addOption('to', 'to')
				.addOption('>', '>')
				.setValue(this.plugin.settings.arrowStyle)
				.onChange(async (value) => {
					this.plugin.settings.arrowStyle = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-copy to clipboard')
			.setDesc('Automatically copy output to clipboard after conversion')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.clipboardOutput)
				.onChange(async (value) => {
					this.plugin.settings.clipboardOutput = value;
					await this.plugin.saveSettings();
				}));
	}
}

module.exports = Svg2TikzPlugin;
