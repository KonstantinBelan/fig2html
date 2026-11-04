// src/decompiler/stylesheet.js
const { computeNodeStyles } = require('./css');

// Cyrillic to Latin transliteration table
const RU_MAP = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
};

/**
 * Converts a Figma layer name into a clean, valid CSS class name
 * @param {string} name Figma layer name
 * @param {string} [type='el'] Figma node type (e.g. FRAME, TEXT, RECTANGLE)
 * @returns {string} Sanitized CSS class identifier
 */
function toBaseClassName(name, type) {
    if (!name || typeof name !== 'string') {
        return type ? type.toLowerCase() : 'el';
    }
    const clean = name.trim();
    if (!clean) return type ? type.toLowerCase() : 'el';

    // Transliterate Cyrillic characters
    let s = clean.toLowerCase().split('').map(ch => RU_MAP[ch] !== undefined ? RU_MAP[ch] : ch).join('');

    // Replace spaces and invalid CSS characters with hyphens
    s = s.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

    // If starts with a number or is empty, prefix with node type or 'el'
    if (!s || /^[0-9]/.test(s)) {
        const prefix = type ? (type === 'TEXT' ? 'text' : type.toLowerCase()) : 'el';
        s = s ? `${prefix}-${s}` : prefix;
    }

    // Limit maximum class name length for readability
    return s.slice(0, 35).replace(/-+$/, '');
}

/**
 * Generates a deterministic signature string for a CSS style object
 * @param {Record<string, string>} styles
 * @returns {string}
 */
function styleSignature(styles) {
    return Object.entries(styles)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join(';');
}

/**
 * Manages CSS class naming, style deduplication, and :root variable extraction
 */
class StylesheetManager {
    constructor(options = {}) {
        this.options = options;
        this.classRegistry = new Map(); // baseName -> Array<{ signature, className, styles, count }>
        this.classesByNode = new Map(); // node reference -> className
        this.stylesByNode = new Map();  // node reference -> styles
        this.classesByNodeGuid = new Map(); // guidKey -> className
        this.stylesByNodeGuid = new Map();  // guidKey -> styles
        this.uniqueRules = new Map();   // className -> styles
        this.rootVariables = new Map(); // value -> varName

        // Frequencies for :root extraction
        this.colorCounts = {};
        this.fontCounts = {};
        this.radiusCounts = {};
        this.dimCounts = {};
    }

    /**
     * Helper to get a stable unique key for a node
     */
    getNodeKey(node) {
        if (node.guid && node.guid.sessionID !== undefined && node.guid.localID !== undefined) {
            return `${node.guid.sessionID}:${node.guid.localID}`;
        }
        return node.name || 'node';
    }

    /**
     * Registers a Figma node, computes its CSS styles, and assigns a deduplicated class name
     * @param {object} node
     * @param {object} parentNode
     * @param {Map<string, object>} imageRegistry
     * @param {object} options
     * @returns {string} Assigned CSS class name
     */
    registerNode(node, parentNode, imageRegistry, options = {}) {
        const styles = computeNodeStyles(node, parentNode, imageRegistry, options);
        const baseName = toBaseClassName(node.name, node.type);
        const sig = styleSignature(styles);

        if (!this.classRegistry.has(baseName)) {
            this.classRegistry.set(baseName, []);
        }

        const variants = this.classRegistry.get(baseName);
        let matched = variants.find(v => v.signature === sig);

        if (!matched) {
            // First variant takes the baseName; subsequent variants with different styles get -2, -3, etc.
            const className = variants.length === 0 ? baseName : `${baseName}-${variants.length + 1}`;
            matched = { signature: sig, className, styles, count: 1 };
            variants.push(matched);
            this.uniqueRules.set(className, styles);
        } else {
            matched.count++;
        }

        const key = this.getNodeKey(node);
        this.classesByNode.set(node, matched.className);
        this.stylesByNode.set(node, styles);
        this.classesByNodeGuid.set(key, matched.className);
        this.stylesByNodeGuid.set(key, styles);

        // Count recurring values for :root extraction
        for (const [prop, val] of Object.entries(styles)) {
            if (!val || val === 'transparent') continue;

            if (prop === 'color' || prop === 'background-color') {
                this.colorCounts[val] = (this.colorCounts[val] || 0) + 1;
            } else if (prop === 'font-family') {
                this.fontCounts[val] = (this.fontCounts[val] || 0) + 1;
            } else if (prop === 'border-radius') {
                this.radiusCounts[val] = (this.radiusCounts[val] || 0) + 1;
            } else if ((prop === 'width' || prop === 'height') && /^\d+px$/.test(val)) {
                const num = parseInt(val, 10);
                if (num >= 500) {
                    this.dimCounts[val] = (this.dimCounts[val] || 0) + 1;
                }
            }
        }

        return matched.className;
    }

    /**
     * Returns the assigned class name for a node
     * @param {object} node
     * @returns {string}
     */
    getNodeClass(node) {
        if (this.classesByNode.has(node)) {
            return this.classesByNode.get(node);
        }
        const key = this.getNodeKey(node);
        return this.classesByNodeGuid.get(key) || toBaseClassName(node.name, node.type);
    }

    /**
     * Returns the computed styles for a node
     * @param {object} node
     * @returns {Record<string, string>}
     */
    getNodeStyles(node) {
        if (this.stylesByNode.has(node)) {
            return this.stylesByNode.get(node);
        }
        const key = this.getNodeKey(node);
        return this.stylesByNodeGuid.get(key) || {};
    }

    /**
     * Identifies recurring values and builds the :root variable dictionary
     */
    buildRootVariables() {
        this.rootVariables.clear();

        // 1. Fonts (if used >= 2 times)
        for (const [font, count] of Object.entries(this.fontCounts)) {
            if (count >= 2) {
                const varName = font.includes('Mono') || font.includes('mono') ? '--font-mono' : '--font-display';
                this.rootVariables.set(font, varName);
            }
        }

        // 2. Colors (if used >= 2 times)
        let colorIndex = 1;
        for (const [col, count] of Object.entries(this.colorCounts).sort((a, b) => b[1] - a[1])) {
            if (count >= 2) {
                let varName;
                if (col === '#ffffff') varName = '--color-white';
                else if (col === '#000000') varName = '--color-black';
                else varName = `--color-${colorIndex++}`;
                this.rootVariables.set(col, varName);
            }
        }

        // 3. Border Radii (if used >= 2 times)
        for (const [rad, count] of Object.entries(this.radiusCounts)) {
            if (count >= 2) {
                const cleanRad = rad.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
                let varName = rad === '50%' ? '--radius-circle' : rad === '9999px' ? '--radius-pill' : `--radius-${cleanRad}`;
                this.rootVariables.set(rad, varName);
            }
        }

        // 4. Slide/Page Dimensions (if used >= 2 times, e.g. 1080px, 1350px)
        for (const [dim, count] of Object.entries(this.dimCounts).sort((a, b) => b[1] - a[1])) {
            if (count >= 2) {
                const cleanDim = dim.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
                let varName = dim === '1080px' ? '--slide-w' : dim === '1350px' ? '--slide-h' : `--dim-${cleanDim}`;
                this.rootVariables.set(dim, varName);
            }
        }
    }

    /**
     * Replaces a value with its var(--...) counterpart if present in :root
     * @param {string} value
     * @returns {string}
     */
    substituteVar(value) {
        if (this.rootVariables.has(value)) {
            return `var(${this.rootVariables.get(value)})`;
        }
        return value;
    }

    /**
     * Generates the entire CSS text including :root, base resets, and all class rules
     * @param {string} [rootBgColor='#0d1117']
     * @returns {string}
     */
    generateFullStylesheet(rootBgColor = '#0d1117') {
        this.buildRootVariables();

        const lines = [];

        // 1. :root block
        if (this.rootVariables.size > 0) {
            lines.push('  :root {');
            for (const [val, varName] of this.rootVariables.entries()) {
                lines.push(`    ${varName}: ${val};`);
            }
            lines.push('  }\n');
        }

        // 2. Base resets
        lines.push('  *, *::before, *::after {');
        lines.push('    box-sizing: border-box;');
        lines.push('  }\n');

        const primaryFont = Object.keys(this.fontCounts)[0] || "'Inter', sans-serif";
        const fontVal = this.substituteVar(primaryFont);
        const bgVal = this.substituteVar(rootBgColor);

        lines.push('  body {');
        lines.push('    margin: 0;');
        lines.push('    padding: 0;');
        lines.push(`    font-family: ${fontVal};`);
        lines.push('    -webkit-font-smoothing: antialiased;');
        lines.push('    -moz-osx-font-smoothing: grayscale;');
        lines.push(`    background-color: ${bgVal};`);
        lines.push('    color: #c9d1d9;');
        lines.push('  }\n');

        lines.push('  img {');
        lines.push('    max-width: 100%;');
        lines.push('    display: block;');
        lines.push('  }\n');

        // 3. Class rules
        for (const [className, styles] of this.uniqueRules.entries()) {
            lines.push(`  .${className} {`);
            for (const [prop, val] of Object.entries(styles)) {
                const finalVal = this.substituteVar(String(val).replace(/"/g, "'"));
                lines.push(`    ${prop}: ${finalVal};`);
            }
            lines.push('  }\n');
        }

        return lines.join('\n');
    }
}

module.exports = {
    toBaseClassName,
    styleSignature,
    StylesheetManager
};
