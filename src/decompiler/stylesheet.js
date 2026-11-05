// src/decompiler/stylesheet.js
const { computeNodeStyles, formatColor } = require('./css');

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

        // Typed variable maps to prevent cross-property pollution
        this.colorVariables = new Map();  // color -> varName
        this.fontVariables = new Map();   // font -> varName
        this.radiusVariables = new Map(); // radius -> varName
        this.dimVariables = new Map();    // dim -> varName

        // Frequencies for :root extraction
        this.colorCounts = {};
        this.fontCounts = {};
        this.radiusCounts = {};
        this.dimCounts = {};

        // Native Figma Variables & Design Tokens
        this.nativeVariables = new Map(); // varName -> { name, rawName, type, value, modes }
        this.themeModeRules = new Map();  // modeName -> Map<varName, value>
        this.pseudoClassRules = new Map(); // `${className}:${pseudo}` -> styles
    }

    /**
     * Registers native Figma variables and variable sets
     * @param {Array<object>} variables
     * @param {Array<object>} variableSets
     */
    registerFigmaVariables(variables = [], variableSets = []) {
        if (!Array.isArray(variables) || variables.length === 0) return;

        // Map modeID -> modeName from variable sets
        const modeMap = new Map();
        for (const vs of variableSets) {
            if (Array.isArray(vs.variableSetModes)) {
                for (const mode of vs.variableSetModes) {
                    const mKey = mode.id ? `${mode.id.sessionID}:${mode.id.localID}` : mode.name;
                    modeMap.set(mKey, mode.name);
                }
            }
        }

        for (const v of variables) {
            if (!v.name || !v.variableDataValues?.entries?.length) continue;
            const cleanName = v.name
                .toLowerCase()
                .replace(/[^a-z0-9_-]+/g, '-')
                .replace(/^-+|-+$/g, '');
            const varName = `--${cleanName}`;

            const entries = v.variableDataValues.entries;
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const vData = entry.variableData;
                if (!vData || !vData.value) continue;

                let val = null;
                const rType = v.variableResolvedType || vData.resolvedDataType;
                if (rType === 'COLOR' && vData.value.colorValue) {
                    val = formatColor(vData.value.colorValue, vData.value.colorValue.a);
                } else if (rType === 'FLOAT' && vData.value.floatValue !== undefined) {
                    val = `${vData.value.floatValue}px`;
                } else if (vData.value.textValue !== undefined) {
                    val = vData.value.textValue;
                } else if (vData.value.boolValue !== undefined) {
                    val = vData.value.boolValue ? 'true' : 'false';
                }

                if (val !== null) {
                    const modeIdKey = entry.modeID ? `${entry.modeID.sessionID}:${entry.modeID.localID}` : null;
                    const modeName = (modeIdKey && modeMap.get(modeIdKey)) || `Mode ${i + 1}`;

                    if (i === 0) {
                        this.rootVariables.set(val, varName);
                        this.nativeVariables.set(varName, {
                            name: varName,
                            rawName: v.name,
                            type: rType,
                            value: val,
                            modes: { [modeName]: val }
                        });
                        if (rType === 'COLOR') {
                            this.colorVariables.set(val, varName);
                        } else if (rType === 'FLOAT') {
                            if (cleanName.includes('radius')) {
                                this.radiusVariables.set(val, varName);
                            } else if (cleanName.includes('dim') || cleanName.includes('slide') || cleanName.includes('screen') || cleanName.includes('width') || cleanName.includes('height')) {
                                this.dimVariables.set(val, varName);
                            }
                        }
                    } else {
                        if (!this.themeModeRules.has(modeName)) {
                            this.themeModeRules.set(modeName, new Map());
                        }
                        this.themeModeRules.get(modeName).set(varName, val);
                        if (this.nativeVariables.has(varName)) {
                            this.nativeVariables.get(varName).modes[modeName] = val;
                        }
                    }
                }
            }
        }
    }

    /**
     * Exports design tokens dictionary (by category: colors, spacing, radius, typography, other)
     * @returns {object} Tokens object
     */
    exportDesignTokens() {
        const tokens = {
            colors: {},
            spacing: {},
            radius: {},
            typography: {},
            other: {}
        };

        for (const [varName, info] of this.nativeVariables.entries()) {
            const shortKey = varName.replace(/^--/, '');
            if (info.type === 'COLOR') {
                tokens.colors[shortKey] = { value: info.value, modes: info.modes };
            } else if (shortKey.includes('space') || shortKey.includes('gap') || shortKey.includes('pad')) {
                tokens.spacing[shortKey] = { value: info.value, modes: info.modes };
            } else if (shortKey.includes('radius')) {
                tokens.radius[shortKey] = { value: info.value, modes: info.modes };
            } else if (shortKey.includes('font') || shortKey.includes('text') || shortKey.includes('line')) {
                tokens.typography[shortKey] = { value: info.value, modes: info.modes };
            } else {
                tokens.other[shortKey] = { value: info.value, modes: info.modes };
            }
        }

        return tokens;
    }

    /**
     * Registers component variants and generates pseudo-class CSS rules (:hover, :active, :focus)
     * @param {object} containerNode
     * @param {Map<string, object>} imageRegistry
     * @param {object} options
     */
    registerVariants(containerNode, imageRegistry, options = {}) {
        if (!containerNode || !Array.isArray(containerNode.children) || containerNode.children.length < 2) return;

        const variantChildren = containerNode.children.filter(c => {
            const name = (c.name || '').toLowerCase();
            return c.type === 'SYMBOL' || name.includes('=') || /hover|active|focus|disabled|pressed/i.test(name);
        });

        if (variantChildren.length < 2) return;

        let defaultVariant = variantChildren.find(c => /state=default|status=default|default/i.test((c.name || '').toLowerCase())) || variantChildren[0];
        const defaultStyles = computeNodeStyles(defaultVariant, containerNode, imageRegistry, options);
        const baseClassName = this.classesByNode.get(defaultVariant) || this.classesByNode.get(containerNode) || toBaseClassName(containerNode.name);

        for (const variant of variantChildren) {
            if (variant === defaultVariant) continue;
            const vName = (variant.name || '').toLowerCase();
            let pseudo = null;
            if (vName.includes('hover')) pseudo = 'hover';
            else if (vName.includes('active') || vName.includes('pressed')) pseudo = 'active';
            else if (vName.includes('focus')) pseudo = 'focus';
            else if (vName.includes('disabled')) pseudo = 'disabled';

            if (!pseudo) continue;

            const variantStyles = computeNodeStyles(variant, containerNode, imageRegistry, options);
            const diffStyles = {};
            for (const [prop, val] of Object.entries(variantStyles)) {
                if (defaultStyles[prop] !== val && !['position', 'left', 'top', 'right', 'bottom'].includes(prop)) {
                    diffStyles[prop] = val;
                }
            }

            if (Object.keys(diffStyles).length > 0) {
                const pseudoKey = `${baseClassName}:${pseudo}`;
                this.pseudoClassRules.set(pseudoKey, diffStyles);
            }
        }
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
        if (!node || node.visible === false || node.mask === true || node.isMask === true) {
            return '';
        }

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
     * Identifies recurring values and builds typed :root variable dictionaries
     */
    buildRootVariables() {
        this.rootVariables.clear();
        this.colorVariables.clear();
        this.fontVariables.clear();
        this.radiusVariables.clear();
        this.dimVariables.clear();

        // 1. Fonts (if used >= 2 times)
        for (const [font, count] of Object.entries(this.fontCounts)) {
            if (count >= 2) {
                const varName = font.includes('Mono') || font.includes('mono') ? '--font-mono' : '--font-display';
                this.fontVariables.set(font, varName);
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
                this.colorVariables.set(col, varName);
                this.rootVariables.set(col, varName);
            }
        }

        // 3. Border Radii (if used >= 2 times)
        for (const [rad, count] of Object.entries(this.radiusCounts)) {
            if (count >= 2) {
                const cleanRad = rad.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
                let varName = rad === '50%' ? '--radius-circle' : rad === '9999px' ? '--radius-pill' : `--radius-${cleanRad}`;
                this.radiusVariables.set(rad, varName);
                this.rootVariables.set(rad, varName);
            }
        }

        // 4. Slide/Page Dimensions (if used >= 2 times, e.g. 1080px, 1350px)
        for (const [dim, count] of Object.entries(this.dimCounts).sort((a, b) => b[1] - a[1])) {
            if (count >= 2) {
                const cleanDim = dim.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
                let varName = dim === '1080px' ? '--slide-w' : dim === '1350px' ? '--slide-h' : `--dim-${cleanDim}`;
                this.dimVariables.set(dim, varName);
                this.rootVariables.set(dim, varName);
            }
        }

        // 5. Re-inject Native Figma Variables and Design Tokens
        for (const [varName, info] of this.nativeVariables.entries()) {
            this.rootVariables.set(info.value, varName);
            if (info.type === 'COLOR') {
                this.colorVariables.set(info.value, varName);
            } else if (info.type === 'FLOAT') {
                if (varName.includes('radius')) {
                    this.radiusVariables.set(info.value, varName);
                } else if (varName.includes('dim') || varName.includes('slide') || varName.includes('screen') || varName.includes('width') || varName.includes('height')) {
                    this.dimVariables.set(info.value, varName);
                }
            }
        }
    }

    /**
     * Context-aware variable substitution: only substitutes variables matching the property type
     * @param {string} propOrValue CSS property name or raw value
     * @param {string} [maybeValue] CSS property value if prop is provided
     * @returns {string}
     */
    substituteVar(propOrValue, maybeValue) {
        let prop = null;
        let value = null;
        if (maybeValue !== undefined) {
            prop = propOrValue;
            value = maybeValue;
        } else {
            value = propOrValue;
        }

        if (!value || typeof value !== 'string') return value;

        if (prop) {
            if (prop === 'font-family') {
                return this.fontVariables.has(value) ? `var(${this.fontVariables.get(value)})` : value;
            }
            if (prop === 'border-radius') {
                return this.radiusVariables.has(value) ? `var(${this.radiusVariables.get(value)})` : value;
            }
            if (prop === 'color' || prop === 'background-color' || prop === 'border-color' || prop === 'fill' || prop === 'stroke') {
                return this.colorVariables.has(value) ? `var(${this.colorVariables.get(value)})` : value;
            }
            if ((prop === 'width' || prop === 'height' || prop === 'min-height') && this.dimVariables.has(value)) {
                return `var(${this.dimVariables.get(value)})`;
            }
            if (prop.startsWith('border')) {
                let s = value;
                for (const [col, vName] of this.colorVariables.entries()) {
                    if (s.includes(col)) {
                        s = s.replace(col, `var(${vName})`);
                    }
                }
                return s;
            }
            if (prop === 'box-shadow') {
                let s = value;
                for (const [col, vName] of this.colorVariables.entries()) {
                    if (s.includes(col)) {
                        s = s.replace(col, `var(${vName})`);
                    }
                }
                return s;
            }
            // All other properties (gap, padding, margin, font-size, width < 500px, etc.): preserve original value
            return value;
        }

        // Single argument fallback: only replace if matched in color or font variables
        if (this.colorVariables.has(value)) {
            return `var(${this.colorVariables.get(value)})`;
        }
        if (this.fontVariables.has(value)) {
            return `var(${this.fontVariables.get(value)})`;
        }
        return value;
    }

    /**
     * Generates the entire CSS text including :root, complete reset.css, and all class rules
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

        // 1.1 Theme Mode Blocks (e.g. Dark theme / Mode overrides)
        if (this.themeModeRules.size > 0) {
            for (const [modeName, vars] of this.themeModeRules.entries()) {
                const isDark = /dark/i.test(modeName);
                const selector = isDark
                    ? `[data-theme="${modeName}"], @media (prefers-color-scheme: dark)`
                    : `[data-theme="${modeName}"]`;
                lines.push(`  ${selector} {`);
                for (const [varName, val] of vars.entries()) {
                    lines.push(`    ${varName}: ${val};`);
                }
                lines.push('  }\n');
            }
        }

        // 2. Comprehensive Modern CSS Resets
        const primaryFont = Object.keys(this.fontCounts)[0] || "'Inter', sans-serif";
        const fontVal = this.substituteVar('font-family', primaryFont);
        const bgVal = this.substituteVar('background-color', rootBgColor);

        lines.push('  *, *::before, *::after {');
        lines.push('    box-sizing: border-box;');
        lines.push('    margin: 0;');
        lines.push('    padding: 0;');
        lines.push('  }\n');

        lines.push('  body {');
        lines.push('    margin: 0;');
        lines.push('    padding: 0;');
        lines.push(`    font-family: ${fontVal};`);
        lines.push('    -webkit-font-smoothing: antialiased;');
        lines.push('    -moz-osx-font-smoothing: grayscale;');
        lines.push(`    background-color: ${bgVal};`);
        lines.push('    color: #c9d1d9;');
        lines.push('    line-height: 1.5;');
        lines.push('  }\n');

        lines.push('  button, input, optgroup, select, textarea {');
        lines.push('    font-family: inherit;');
        lines.push('    font-size: 100%;');
        lines.push('    line-height: inherit;');
        lines.push('    color: inherit;');
        lines.push('    margin: 0;');
        lines.push('    padding: 0;');
        lines.push('    border: 0;');
        lines.push('    background: transparent;');
        lines.push('    vertical-align: baseline;');
        lines.push('  }\n');

        lines.push('  button, [type="button"], [type="reset"], [type="submit"] {');
        lines.push('    -webkit-appearance: button;');
        lines.push('    appearance: button;');
        lines.push('    cursor: pointer;');
        lines.push('    background: transparent;');
        lines.push('    border: none;');
        lines.push('    outline: none;');
        lines.push('  }\n');

        lines.push('  input, textarea {');
        lines.push('    outline: none;');
        lines.push('    background: transparent;');
        lines.push('    border: none;');
        lines.push('  }\n');

        lines.push('  h1, h2, h3, h4, h5, h6, p {');
        lines.push('    margin: 0;');
        lines.push('    font-size: inherit;');
        lines.push('    font-weight: inherit;');
        lines.push('  }\n');

        lines.push('  ul, ol {');
        lines.push('    list-style: none;');
        lines.push('    margin: 0;');
        lines.push('    padding: 0;');
        lines.push('  }\n');

        lines.push('  img, svg {');
        lines.push('    display: block;');
        lines.push('    max-width: 100%;');
        lines.push('  }\n');

        lines.push('  a {');
        lines.push('    color: inherit;');
        lines.push('    text-decoration: inherit;');
        lines.push('  }\n');

        // 3. Class rules
        for (const [className, styles] of this.uniqueRules.entries()) {
            lines.push(`  .${className} {`);
            for (const [prop, val] of Object.entries(styles)) {
                const finalVal = this.substituteVar(prop, String(val).replace(/"/g, "'"));
                lines.push(`    ${prop}: ${finalVal};`);
            }
            lines.push('  }\n');
        }

        // 3.1 Pseudo-class variant rules (:hover, :active, :focus, etc.)
        for (const [pseudoSelector, styles] of this.pseudoClassRules.entries()) {
            lines.push(`  .${pseudoSelector} {`);
            for (const [prop, val] of Object.entries(styles)) {
                const finalVal = this.substituteVar(prop, String(val).replace(/"/g, "'"));
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
