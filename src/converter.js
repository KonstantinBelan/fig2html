// src/converter.js
const { JSDOM } = require('jsdom');
const { GuidGenerator, FractionalIndexer } = require('./utils/guid');
const { parseColor, clamp01 } = require('./parsers/color');
const { parseGradient, splitTopLevelCommas } = require('./parsers/gradient');
const { parseAllEffects } = require('./parsers/effects');
const {
    parseFontStyle,
    parseLineHeight,
    parseLetterSpacing,
    parseTextDecoration,
    parseTextTransform,
    estimateTextDimensions,
    extractWebFonts
} = require('./parsers/typography');
const { ImageRegistry } = require('./parsers/images');
const { serializeSvgElement, getSvgDimensions, renderSvgToPng } = require('./parsers/svg');

function cloneNode(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Parses CSS grid-template-columns into an array of column size definitions
 * @param {string} gridCols
 * @returns {string[]}
 */
function parseGridColumns(gridCols) {
    if (!gridCols || gridCols === 'none') return ['1fr'];
    const clean = String(gridCols).trim();

    const repeatMatch = clean.match(/repeat\((\d+),\s*([^)]+)\)/i);
    if (repeatMatch) {
        const count = parseInt(repeatMatch[1], 10) || 1;
        const val = repeatMatch[2].trim();
        return Array(count).fill(val);
    }

    const tokens = clean.split(/\s+/).filter(Boolean);
    return tokens.length > 0 ? tokens : ['1fr'];
}

const BLEND_MODE_MAP = {
    'normal': 'NORMAL',
    'multiply': 'MULTIPLY',
    'screen': 'SCREEN',
    'overlay': 'OVERLAY',
    'darken': 'DARKEN',
    'lighten': 'LIGHTEN',
    'color-dodge': 'COLOR_DODGE',
    'color-burn': 'COLOR_BURN',
    'hard-light': 'HARD_LIGHT',
    'soft-light': 'SOFT_LIGHT',
    'difference': 'DIFFERENCE',
    'exclusion': 'EXCLUSION',
    'hue': 'HUE',
    'saturation': 'SATURATION',
    'color': 'COLOR',
    'luminosity': 'LUMINOSITY'
};

/**
 * Checks if an element is a pure inline text container with mixed inline child nodes
 */
function isRichTextContainer(element) {
    if (!element || !element.children || element.children.length === 0) return false;
    const text = element.textContent.trim();
    if (!text) return false;

    const inlineTags = ['b', 'strong', 'i', 'em', 'u', 's', 'del', 'span', 'a', 'small', 'mark', 'code', 'br', 'sub', 'sup'];
    for (const child of element.children) {
        const tag = child.tagName.toLowerCase();
        if (!inlineTags.includes(tag)) {
            return false;
        }
        if (child.children.length > 0) {
            for (const grandChild of child.children) {
                if (!inlineTags.includes(grandChild.tagName.toLowerCase())) {
                    return false;
                }
            }
        }
        // Exclude shape elements (e.g. class="dot", class="avatar", or empty span shapes)
        if (child.classList && (
            child.classList.contains('dot') ||
            child.classList.contains('avatar') ||
            child.classList.contains('swatch-color') ||
            child.classList.contains('color-swatch') ||
            child.classList.contains('icon')
        )) {
            return false;
        }
        if (tag === 'span' && child.textContent.trim().length === 0) {
            return false;
        }
    }
    return true;
}

/**
 * Parses CSS box shorthands (padding, margin) with 1, 2, 3, or 4 tokens into 4 offsets
 */
function parseBoxOffsets(shorthand, top, right, bottom, left) {
    let t = 0, r = 0, b = 0, l = 0;
    if (shorthand && shorthand !== '0' && shorthand !== 'none') {
        const parts = shorthand.trim().split(/\s+/).map(p => parseFloat(p) || 0);
        if (parts.length === 1) {
            t = r = b = l = parts[0];
        } else if (parts.length === 2) {
            t = b = parts[0];
            r = l = parts[1];
        } else if (parts.length === 3) {
            t = parts[0];
            r = l = parts[1];
            b = parts[2];
        } else if (parts.length >= 4) {
            t = parts[0];
            r = parts[1];
            b = parts[2];
            l = parts[3];
        }
    }
    if (top !== undefined && top !== null && top !== '') t = parseFloat(top) || 0;
    if (right !== undefined && right !== null && right !== '') r = parseFloat(right) || 0;
    if (bottom !== undefined && bottom !== null && bottom !== '') b = parseFloat(bottom) || 0;
    if (left !== undefined && left !== null && left !== '') l = parseFloat(left) || 0;
    return { top: t, right: r, bottom: b, left: l };
}

/**
 * Parses CSS border shorthand (e.g. "1px solid var(--border)") into width, style, and color
 */
function parseBorderProperty(borderStr, widthStr, styleStr, colorStr) {
    let width = parseFloat(widthStr) || 0;
    let style = styleStr || '';
    let color = colorStr || '';

    if (borderStr && borderStr !== 'none') {
        const parts = borderStr.trim();
        const wMatch = parts.match(/([0-9.]+)(?:px|rem|em)?/);
        if (!width && wMatch) {
            width = parseFloat(wMatch[1]) || 0;
        }
        const sMatch = parts.match(/\b(solid|dashed|dotted|double|groove|ridge|inset|outset|none)\b/i);
        if (!style && sMatch) {
            style = sMatch[1].toLowerCase();
        }
        if (!color) {
            let rem = parts;
            if (wMatch) rem = rem.replace(wMatch[0], '');
            if (sMatch) rem = rem.replace(new RegExp('\\b' + sMatch[1] + '\\b', 'i'), '');
            color = rem.trim();
        }
    }
    return { width, style: style || 'none', color };
}

/**
 * Extracts rich text with character-level style overrides
 */
function extractRichText(element, win, defaultStyles, resolveVar = null, varMap = null, colorToVarMap = null, createColorVar = null) {
    let fullText = '';
    const charStyles = [];
    const styleOverrideTable = [];
    const styleMap = new Map();
    let nextStyleId = 1;

    function colorToHexKey(col) {
        if (!col || typeof col.r !== 'number') return '';
        const r = Math.round(col.r * 255).toString(16).padStart(2, '0');
        const g = Math.round(col.g * 255).toString(16).padStart(2, '0');
        const b = Math.round(col.b * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`.toLowerCase();
    }

    function traverse(node, currentStyle) {
        if (node.nodeType === 3) { // TEXT_NODE
            let text = node.textContent.replace(/[\r\n\t]+/g, ' ').replace(/ +/g, ' ');
            if (fullText.length === 0 || fullText.endsWith('\n')) {
                text = text.replace(/^ +/, '');
            }
            if (!text) return;
            for (let i = 0; i < text.length; i++) {
                fullText += text[i];
                charStyles.push(currentStyle.styleId || 0);
            }
        } else if (node.nodeType === 1) { // ELEMENT_NODE
            const tag = node.tagName.toLowerCase();
            if (tag === 'br') {
                while (fullText.endsWith(' ') || fullText.endsWith('\t')) {
                    fullText = fullText.slice(0, -1);
                    charStyles.pop();
                }
                fullText += '\n';
                charStyles.push(currentStyle.styleId || 0);
                return;
            }

            const computed = win.getComputedStyle(node);
            const inline = node.style;
            const getProp = (p, c) => {
                const raw = inline[c] || inline.getPropertyValue(p) || computed[c] || computed.getPropertyValue(p);
                return resolveVar ? resolveVar(raw, node) : raw;
            };

            const colorParsed = parseColor(getProp('color', 'color'), defaultStyles.color);
            const fontWeight = getProp('font-weight', 'fontWeight') || defaultStyles.fontWeight;
            const fontStyle = getProp('font-style', 'fontStyle') || defaultStyles.fontStyle;
            const fontSize = parseFloat(getProp('font-size', 'fontSize')) || defaultStyles.fontSize;
            const textDec = parseTextDecoration(getProp('text-decoration', 'textDecoration'));

            const { styleName, postscript, cleanFamily } = parseFontStyle(
                fontWeight,
                fontStyle,
                getProp('font-family', 'fontFamily') || defaultStyles.fontFamily
            );

            // Check if different from root text style
            const isDifferent =
                (colorParsed && (colorParsed.r !== defaultStyles.color.r || colorParsed.g !== defaultStyles.color.g || colorParsed.b !== defaultStyles.color.b)) ||
                fontWeight !== defaultStyles.fontWeight ||
                fontStyle !== defaultStyles.fontStyle ||
                fontSize !== defaultStyles.fontSize ||
                textDec !== 'NONE';

            let styleId = 0;
            if (isDifferent) {
                const key = `${cleanFamily}_${styleName}_${fontSize}_${JSON.stringify(colorParsed)}_${textDec}`;
                if (styleMap.has(key)) {
                    styleId = styleMap.get(key);
                } else {
                    styleId = nextStyleId++;
                    styleMap.set(key, styleId);

                    const override = {
                        styleID: styleId,
                        fontSize: fontSize,
                        fontName: { family: cleanFamily, style: styleName, postscript: postscript },
                        textDecoration: textDec
                    };
                    if (colorParsed) {
                        const richColorRaw = inline.color || inline.getPropertyValue('color') || computed.color || computed.getPropertyValue('color');
                        const richVarName = richColorRaw ? (richColorRaw.match(/var\(\s*(--[a-zA-Z0-9-_]+)/) || [])[1] : null;
                        const richVar = (richVarName && varMap && varMap.get(richVarName)) ||
                            (colorParsed.a === 1 && colorToVarMap ? colorToVarMap.get(colorToHexKey(colorParsed)) : null);
                        const richPaint = {
                            type: 'SOLID',
                            color: colorParsed,
                            opacity: colorParsed.a,
                            visible: true,
                            blendMode: 'NORMAL'
                        };
                        if (createColorVar && richVar) {
                            const cVar = createColorVar(richVar);
                            if (cVar) richPaint.colorVar = cVar;
                        }
                        override.fillPaints = [richPaint];
                    }
                    styleOverrideTable.push(override);
                }
            }

            for (const child of node.childNodes) {
                traverse(child, { ...currentStyle, styleId });
            }
        }
    }

    for (const child of element.childNodes) {
        traverse(child, { styleId: 0 });
    }

    while (fullText.endsWith(' ') || fullText.endsWith('\t')) {
        fullText = fullText.slice(0, -1);
        charStyles.pop();
    }

    return {
        characters: fullText,
        characterStyleIDs: charStyles,
        styleOverrideTable: styleOverrideTable
    };
}

/**
 * Main function to convert HTML string into Figma nodeChanges AST
 */
async function convertHtmlToNodes(htmlString, parentCanvasGuid, options = {}) {
    const dom = new JSDOM(htmlString);
    const win = dom.window;
    const doc = win.document;
    const guidGen = new GuidGenerator(options.sessionId || 1, options.startLocalId || 100);
    const imageRegistry = options.imageRegistry || new ImageRegistry({
        baseDir: options.baseDir || process.cwd(),
        allowRemote: options.allowRemoteImages !== false
    });

    // 1. Collect all CSS custom properties (--var) across stylesheets
    const rootVars = {};
    const ruleVars = [];

    for (const styleEl of doc.querySelectorAll('style')) {
        const css = styleEl.textContent;
        const ruleRegex = /([^{]+)\{([^}]+)\}/g;
        let match;
        while ((match = ruleRegex.exec(css)) !== null) {
            const selector = match[1].trim();
            const body = match[2];
            const varRegex = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
            let vMatch;
            const vars = {};
            let hasVars = false;
            while ((vMatch = varRegex.exec(body)) !== null) {
                vars[vMatch[1].trim()] = vMatch[2].trim();
                hasVars = true;
            }
            if (hasVars) {
                if (selector === ':root' || selector === 'html' || selector === '*') {
                    Object.assign(rootVars, vars);
                } else {
                    ruleVars.push({ selector, vars });
                }
            }
        }
    }

    function resolveVar(str, element) {
        if (!str || typeof str !== 'string' || !str.includes('var(')) return str;
        let resolved = str;
        let iterations = 0;
        while (resolved.includes('var(') && iterations < 5) {
            iterations++;
            resolved = resolved.replace(/var\(\s*(--[a-zA-Z0-9-_]+)(?:\s*,\s*([^)]+))?\s*\)/g, (m, varName, fallback) => {
                let curr = element;
                while (curr && curr.matches) {
                    for (let i = ruleVars.length - 1; i >= 0; i--) {
                        const r = ruleVars[i];
                        try {
                            if (curr.matches(r.selector) && r.vars[varName] !== undefined) {
                                return r.vars[varName];
                            }
                        } catch (_) {}
                    }
                    curr = curr.parentElement;
                }
                if (rootVars[varName] !== undefined) {
                    return rootVars[varName];
                }
                return fallback ? fallback.trim() : m;
            });
        }
        return resolved;
    }

    // 2. Extract Web Fonts references (Google Fonts)
    const webFonts = extractWebFonts(doc);

    // 3. Collect interactive pseudo-class rules (:hover, :active, :focus)
    const pseudoRules = { hover: [], active: [], focus: [] };
    let nextCompSetY = 40;
    for (const styleEl of doc.querySelectorAll('style')) {
        const css = styleEl.textContent || '';
        const ruleRegex = /([^{]+)\{([^}]+)\}/g;
        let match;
        while ((match = ruleRegex.exec(css)) !== null) {
            const selector = match[1].trim();
            const body = match[2];
            if (selector.includes(':hover')) {
                const baseSel = selector.replace(/:hover/g, '').trim();
                pseudoRules.hover.push({ selector: baseSel, body });
            } else if (selector.includes(':active')) {
                const baseSel = selector.replace(/:active/g, '').trim();
                pseudoRules.active.push({ selector: baseSel, body });
            } else if (selector.includes(':focus')) {
                const baseSel = selector.replace(/:focus/g, '').trim();
                pseudoRules.focus.push({ selector: baseSel, body });
            }
        }
    }

    // 4. Generate native Figma Variables and Variable Sets from :root CSS custom properties
    const variableChanges = [];
    const varKeys = Object.keys(rootVars);
    const varMap = new Map();
    const colorToVarMap = new Map();
    const floatToVarMap = new Map();
    const radiusToVarMap = new Map();
    const spaceToVarMap = new Map();

    function colorToHexKey(col) {
        if (!col || typeof col.r !== 'number') return '';
        const r = Math.round(col.r * 255).toString(16).padStart(2, '0');
        const g = Math.round(col.g * 255).toString(16).padStart(2, '0');
        const b = Math.round(col.b * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`.toLowerCase();
    }

    function createColorVar(varInfo) {
        if (!varInfo || varInfo.varType !== 'COLOR') return undefined;
        return {
            value: {
                alias: {
                    guid: varInfo.guid
                }
            },
            dataType: 'ALIAS',
            resolvedDataType: 'COLOR'
        };
    }

    function createFloatVar(varInfo) {
        if (!varInfo || varInfo.varType !== 'FLOAT') return undefined;
        return {
            value: {
                alias: {
                    guid: varInfo.guid
                }
            },
            dataType: 'ALIAS',
            resolvedDataType: 'FLOAT'
        };
    }

    if (options.createVariables !== false && varKeys.length > 0) {
        const varSetGuid = guidGen.next();
        const modeId = { sessionID: options.sessionId || 1, localID: 1 };
        const docGuid = options.documentGuid || { sessionID: 0, localID: 2 };

        const varSetNode = {
            guid: varSetGuid,
            phase: 'CREATED',
            parentIndex: {
                guid: docGuid,
                position: '!'
            },
            type: 'VARIABLE_SET',
            name: options.variableSetName || 'Web Tokens',
            isPublishable: false,
            visible: false,
            locked: true,
            variableSetModes: [
                {
                    id: modeId,
                    name: 'Default',
                    sortPosition: '!'
                }
            ],
            isCollectionExtendable: true
        };
        variableChanges.push(varSetNode);

        for (const varName of varKeys) {
            const rawVal = rootVars[varName];
            if (!rawVal) continue;

            const cleanName = varName.replace(/^--/, '').replace(/-/g, '/');
            let varType = 'STRING';
            let anyValue = { textValue: String(rawVal) };

            const parsedColor = parseColor(rawVal);
            if (parsedColor && (rawVal.startsWith('#') || rawVal.startsWith('rgb') || rawVal.startsWith('hsl'))) {
                varType = 'COLOR';
                anyValue = { colorValue: parsedColor };
            } else if (rawVal.endsWith('px') || (!isNaN(parseFloat(rawVal)) && !rawVal.includes(' '))) {
                varType = 'FLOAT';
                anyValue = { floatValue: parseFloat(rawVal) || 0 };
            }

            const varGuid = guidGen.next();
            const varInfo = {
                guid: varGuid,
                varType,
                cleanName,
                rawVal,
                anyValue,
                colorValue: parsedColor,
                floatValue: parseFloat(rawVal) || 0
            };
            varMap.set(varName, varInfo);
            varMap.set(cleanName, varInfo);
            varMap.set(varName.replace(/^--/, ''), varInfo);

            if (varType === 'COLOR' && parsedColor && parsedColor.a === 1) {
                const hex = colorToHexKey(parsedColor);
                if (hex && !colorToVarMap.has(hex)) {
                    colorToVarMap.set(hex, varInfo);
                }
            } else if (varType === 'FLOAT' && varInfo.floatValue > 0) {
                const lowerName = varName.toLowerCase();
                if (lowerName.includes('radius')) {
                    if (!radiusToVarMap.has(varInfo.floatValue)) radiusToVarMap.set(varInfo.floatValue, varInfo);
                } else if (lowerName.includes('space') || lowerName.includes('gap') || lowerName.includes('pad')) {
                    if (!spaceToVarMap.has(varInfo.floatValue)) spaceToVarMap.set(varInfo.floatValue, varInfo);
                }
                if (!floatToVarMap.has(varInfo.floatValue)) {
                    floatToVarMap.set(varInfo.floatValue, varInfo);
                }
            }

            const varNode = {
                guid: varGuid,
                phase: 'CREATED',
                parentIndex: {
                    guid: docGuid,
                    position: '!'
                },
                type: 'VARIABLE',
                name: cleanName,
                isPublishable: false,
                visible: false,
                locked: true,
                variableSetID: {
                    guid: varSetGuid
                },
                variableResolvedType: varType,
                variableScopes: ['ALL_SCOPES'],
                variableDataValues: {
                    entries: [
                        {
                            modeID: modeId,
                            variableData: {
                                value: anyValue,
                                dataType: varType,
                                resolvedDataType: varType
                            }
                        }
                    ]
                }
            };
            variableChanges.push(varNode);
        }
    }

    const nodeChanges = [];
    const stats = {
        totalNodes: 0,
        frames: 0,
        textNodes: 0,
        images: 0,
        shapes: 0,
        variables: variableChanges.length
    };

    async function processElement(element, parentGuid, orderPosition = '!', parentContext = null) {
        // Skip metadata / script / template elements
        if (['SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TEMPLATE', 'NOSCRIPT', 'TITLE'].includes(element.tagName)) {
            return;
        }

        const tagName = element.tagName.toLowerCase();
        const inline = element.style;
        const computed = win.getComputedStyle(element);

        function extractVarName(rawStr) {
            if (!rawStr || typeof rawStr !== 'string') return null;
            const match = rawStr.match(/var\(\s*(--[a-zA-Z0-9-_]+)/);
            return match ? match[1] : null;
        }

        const getProp = (...props) => {
            for (const p of props) {
                const raw = inline[p] || inline.getPropertyValue(p) || computed[p] || computed.getPropertyValue(p);
                if (raw !== undefined && raw !== null && raw !== '') {
                    return resolveVar(raw, element);
                }
            }
            return '';
        };

        const getRawProp = (...props) => {
            for (const p of props) {
                const raw = inline[p] || inline.getPropertyValue(p) || computed[p] || computed.getPropertyValue(p);
                if (raw !== undefined && raw !== null && raw !== '') {
                    return raw;
                }
            }
            return '';
        };

        const getVarForProp = (...props) => {
            for (const p of props) {
                const raw = inline[p] || inline.getPropertyValue(p) || computed[p] || computed.getPropertyValue(p);
                if (raw !== undefined && raw !== null && raw !== '') {
                    const varName = extractVarName(raw);
                    if (varName && varMap.has(varName)) {
                        return varMap.get(varName);
                    }
                }
            }
            return null;
        };

        // Visibility check
        const display = getProp('display', 'display');
        if (display === 'none') {
            return;
        }
        const visibility = getProp('visibility', 'visibility');
        const isVisible = visibility !== 'hidden';

        const currentGuid = guidGen.next();

        // Opacity: Ensure 1.0 default if not specified or empty string
        const rawOpacity = getProp('opacity', 'opacity');
        const opacity = (rawOpacity !== undefined && rawOpacity !== null && rawOpacity !== '' && !isNaN(parseFloat(rawOpacity)))
            ? clamp01(parseFloat(rawOpacity))
            : 1.0;

        const mixBlend = getProp('mix-blend-mode', 'mixBlendMode');
        const blendMode = (mixBlend && mixBlend.toLowerCase() !== 'normal')
            ? (BLEND_MODE_MAP[mixBlend.toLowerCase()] || undefined)
            : undefined;

        // Position: check for absolute / fixed positioning
        const position = getProp('position', 'position');
        const isAbsolute = position === 'absolute' || position === 'fixed';
        const topStr = getProp('top', 'top');
        const leftStr = getProp('left', 'left');
        const rightStr = getProp('right', 'right');
        const bottomStr = getProp('bottom', 'bottom');
        const insetStr = getProp('inset', 'inset');

        // Containing block dimensions for absolute elements vs flow elements
        const containerW = parentContext ? (parentContext.containerWidth || parentContext.width) : 1440;
        const containerH = parentContext ? (parentContext.containerHeight || parentContext.height) : 900;
        const flowW = parentContext ? parentContext.width : 1440;
        const flowH = parentContext ? parentContext.height : 900;

        // Check CSS dimensions (handling percentages and inset: 0 correctly)
        const rawWidthStr = getProp('width', 'width');
        const rawHeightStr = getProp('height', 'height');

        let width = 0;
        let isWidthPercent = false;
        if (rawWidthStr) {
            if (rawWidthStr.endsWith('%')) {
                isWidthPercent = true;
                const pct = (parseFloat(rawWidthStr) || 100) / 100;
                width = Math.round((isAbsolute ? containerW : flowW) * pct);
            } else if (rawWidthStr !== 'auto') {
                width = parseFloat(rawWidthStr) || 0;
            }
        }
        if (!width && element.getAttribute('width')) {
            const attrW = element.getAttribute('width');
            if (attrW.endsWith('%')) {
                isWidthPercent = true;
                const pct = (parseFloat(attrW) || 100) / 100;
                width = Math.round((isAbsolute ? containerW : flowW) * pct);
            } else {
                width = parseFloat(attrW) || 0;
            }
        }
        if ((!width || width === 0) && (insetStr === '0' || insetStr === '0px' || (topStr === '0' && leftStr === '0' && rightStr === '0')) && isAbsolute) {
            width = containerW;
        }

        let height = 0;
        let isHeightPercent = false;
        if (rawHeightStr) {
            if (rawHeightStr.endsWith('%')) {
                isHeightPercent = true;
                const pct = (parseFloat(rawHeightStr) || 100) / 100;
                height = Math.round((isAbsolute ? containerH : flowH) * pct);
            } else if (rawHeightStr !== 'auto') {
                height = parseFloat(rawHeightStr) || 0;
            }
        }
        if (!height && element.getAttribute('height')) {
            const attrH = element.getAttribute('height');
            if (attrH.endsWith('%')) {
                isHeightPercent = true;
                const pct = (parseFloat(attrH) || 100) / 100;
                height = Math.round((isAbsolute ? containerH : flowH) * pct);
            } else {
                height = parseFloat(attrH) || 0;
            }
        }
        if ((!height || height === 0) && (insetStr === '0' || insetStr === '0px' || (topStr === '0' && bottomStr === '0')) && isAbsolute) {
            height = containerH;
        }

        const hasExplicitWidth = width > 0 && !isWidthPercent;
        const hasExplicitHeight = height > 0;

        let posX = 0;
        let posY = 0;
        if (isAbsolute) {
            if (leftStr && leftStr !== 'auto') {
                posX = parseFloat(leftStr) || 0;
            } else if (rightStr && rightStr !== 'auto' && parentContext) {
                const rVal = parseFloat(rightStr) || 0;
                posX = Math.max(0, containerW - rVal - (width || 0));
            }

            if (topStr && topStr !== 'auto') {
                posY = parseFloat(topStr) || 0;
            } else if (bottomStr && bottomStr !== 'auto' && parentContext) {
                const bVal = parseFloat(bottomStr) || 0;
                posY = Math.max(0, containerH - bVal - (height || 0));
            }
        }

        let x = posX || parseFloat(getProp('left', 'left')) || 0;
        let y = posY || parseFloat(getProp('top', 'top')) || 0;

        const rawFlex = getProp('flex', 'flex');
        let flexGrow = parseFloat(getProp('flex-grow', 'flexGrow')) || 0;
        if (!flexGrow && rawFlex) {
            flexGrow = parseFloat(rawFlex) || 0;
        }
        const alignSelf = getProp('align-self', 'alignSelf');

        // Margin offsets & auto-centering check
        const marginOffsets = parseBoxOffsets(
            getProp('margin', 'margin'),
            getProp('margin-top', 'marginTop'),
            getProp('margin-right', 'marginRight'),
            getProp('margin-bottom', 'marginBottom'),
            getProp('margin-left', 'marginLeft')
        );
        const marginStr = getProp('margin', 'margin');
        const mlStr = getProp('margin-left', 'marginLeft');
        const mrStr = getProp('margin-right', 'marginRight');
        const isMarginAuto = marginStr.includes('auto') || (mlStr === 'auto' && mrStr === 'auto');

        // Inherited styles
        const elementColorVar = getVarForProp('color', 'color');
        const inheritedColorVar = elementColorVar || (parentContext?.inherited?.colorVar);
        const inheritedStyles = {
            fontFamily: getProp('font-family', 'fontFamily') || (parentContext?.inherited?.fontFamily) || 'Inter',
            color: getProp('color', 'color') || (parentContext?.inherited?.color) || '#000000',
            colorVar: inheritedColorVar,
            lineHeight: getProp('line-height', 'lineHeight') || (parentContext?.inherited?.lineHeight) || 'normal',
            letterSpacing: getProp('letter-spacing', 'letterSpacing') || (parentContext?.inherited?.letterSpacing) || 'normal',
            fontWeight: getProp('font-weight', 'fontWeight') || (parentContext?.inherited?.fontWeight) || 'normal',
            fontStyle: getProp('font-style', 'fontStyle') || (parentContext?.inherited?.fontStyle) || 'normal',
            fontSize: parseFloat(getProp('font-size', 'fontSize')) || (parentContext?.inherited?.fontSize) || 16
        };

        // If parent is flex row with flexGrow, auto-calculate width share
        if (parentContext && parentContext.isFlex && !parentContext.isColumn && flexGrow > 0) {
            if (parentContext.width > 0 && (!hasExplicitWidth || width === 0)) {
                const gap = parentContext.gap || 0;
                const siblingsCount = Math.max(1, element.parentElement.children.length);
                const totalGaps = gap * (siblingsCount - 1);
                width = Math.floor((parentContext.width - totalGaps) / siblingsCount);
            }
        }

        // Fills: solid colors, gradients, background-images (supporting multiple comma-separated backgrounds)
        const fills = [];
        const bgImage = getProp('background-image', 'backgroundImage');
        const bgVal = getProp('background', 'background');
        const bgColor = getProp('background-color', 'backgroundColor');
        const bgVar = getVarForProp('background-color', 'backgroundColor', 'background');

        const bgCandidates = [bgImage, bgVal].filter(Boolean);
        for (const candidate of bgCandidates) {
            const parts = splitTopLevelCommas(candidate);
            for (const part of parts) {
                if (part.includes('gradient')) {
                    const gradPaint = parseGradient(part);
                    if (gradPaint) fills.push(gradPaint);
                } else if (part.includes('url(')) {
                    const urlMatch = part.match(/url\(["']?(.*?)["']?\)/);
                    if (urlMatch) {
                        const imgRes = await imageRegistry.resolveImage(urlMatch[1], 'bg-image');
                        if (imgRes) {
                            fills.push(imageRegistry.createImagePaint(imgRes, 'FILL'));
                            stats.images++;
                        }
                    }
                } else {
                    const col = parseColor(part);
                    if (col && col.a > 0 && !fills.some(f => f.type === 'SOLID')) {
                        const solidPaint = {
                            type: 'SOLID',
                            color: col,
                            opacity: col.a,
                            visible: true,
                            blendMode: 'NORMAL'
                        };
                        const candidateVarName = extractVarName(part);
                        const candidateVar = (candidateVarName && varMap.get(candidateVarName)) || bgVar ||
                            (col.a === 1 ? colorToVarMap.get(colorToHexKey(col)) : null);
                        const cVar = createColorVar(candidateVar);
                        if (cVar) solidPaint.colorVar = cVar;
                        fills.push(solidPaint);
                    }
                }
            }
        }

        if (bgColor) {
            const parsedBgColor = parseColor(bgColor);
            if (parsedBgColor && parsedBgColor.a > 0 && !fills.some(f => f.type === 'SOLID')) {
                const solidPaint = {
                    type: 'SOLID',
                    color: parsedBgColor,
                    opacity: parsedBgColor.a,
                    visible: true,
                    blendMode: 'NORMAL'
                };
                const cVar = createColorVar(bgVar) || (parsedBgColor.a === 1 ? createColorVar(colorToVarMap.get(colorToHexKey(parsedBgColor))) : undefined);
                if (cVar) solidPaint.colorVar = cVar;
                fills.push(solidPaint);
            }
        }

        // Border & Strokes (supporting CSS border shorthand and individual border properties)
        const strokePaints = [];
        const mainBorder = parseBorderProperty(
            getProp('border', 'border'),
            getProp('border-width', 'borderWidth'),
            getProp('border-style', 'borderStyle'),
            getProp('border-color', 'borderColor')
        );
        const borderWidth = mainBorder.width;
        const parsedBorderColor = parseColor(mainBorder.color);
        const strokeVar = getVarForProp('border-color', 'borderColor', 'border');

        if (borderWidth > 0 && mainBorder.style !== 'none' && parsedBorderColor && parsedBorderColor.a > 0) {
            const strokePaint = {
                type: 'SOLID',
                color: parsedBorderColor,
                opacity: parsedBorderColor.a,
                visible: true,
                blendMode: 'NORMAL'
            };
            const cVar = createColorVar(strokeVar) || (parsedBorderColor.a === 1 ? createColorVar(colorToVarMap.get(colorToHexKey(parsedBorderColor))) : undefined);
            if (cVar) strokePaint.colorVar = cVar;
            strokePaints.push(strokePaint);
        }

        // Individual borders
        const topB = parseBorderProperty(getProp('border-top', 'borderTop'), getProp('border-top-width', 'borderTopWidth'), getProp('border-top-style', 'borderTopStyle'), getProp('border-top-color', 'borderTopColor'));
        const bottomB = parseBorderProperty(getProp('border-bottom', 'borderBottom'), getProp('border-bottom-width', 'borderBottomWidth'), getProp('border-bottom-style', 'borderBottomStyle'), getProp('border-bottom-color', 'borderBottomColor'));
        const leftB = parseBorderProperty(getProp('border-left', 'borderLeft'), getProp('border-left-width', 'borderLeftWidth'), getProp('border-left-style', 'borderLeftStyle'), getProp('border-left-color', 'borderLeftColor'));
        const rightB = parseBorderProperty(getProp('border-right', 'borderRight'), getProp('border-right-width', 'borderRightWidth'), getProp('border-right-style', 'borderRightStyle'), getProp('border-right-color', 'borderRightColor'));

        const borderTopW = topB.width || borderWidth;
        const borderBottomW = bottomB.width || borderWidth;
        const borderLeftW = leftB.width || borderWidth;
        const borderRightW = rightB.width || borderWidth;

        const hasIndependentBorders =
            borderTopW !== borderBottomW || borderLeftW !== borderRightW || borderTopW !== borderLeftW;

        if (strokePaints.length === 0 && (borderTopW > 0 || borderBottomW > 0 || borderLeftW > 0 || borderRightW > 0)) {
            const sideColor = parseColor(topB.color || bottomB.color || leftB.color || rightB.color || mainBorder.color);
            if (sideColor && sideColor.a > 0) {
                const sideVar = getVarForProp(
                    'border-top-color', 'borderTopColor', 'border-top', 'borderTop',
                    'border-bottom-color', 'borderBottomColor', 'border-bottom', 'borderBottom',
                    'border-left-color', 'borderLeftColor', 'border-left', 'borderLeft',
                    'border-right-color', 'borderRightColor', 'border-right', 'borderRight',
                    'border-color', 'borderColor', 'border'
                );
                const strokePaint = {
                    type: 'SOLID',
                    color: sideColor,
                    opacity: sideColor.a,
                    visible: true,
                    blendMode: 'NORMAL'
                };
                const cVar = createColorVar(sideVar) || (sideColor.a === 1 ? createColorVar(colorToVarMap.get(colorToHexKey(sideColor))) : undefined);
                if (cVar) strokePaint.colorVar = cVar;
                strokePaints.push(strokePaint);
            }
        }

        // Border Radius
        const borderRadius = parseFloat(getProp('border-radius', 'borderRadius')) || 0;
        const tlRadius = parseFloat(getProp('border-top-left-radius', 'borderTopLeftRadius')) || borderRadius;
        const trRadius = parseFloat(getProp('border-top-right-radius', 'borderTopRightRadius')) || borderRadius;
        const brRadius = parseFloat(getProp('border-bottom-right-radius', 'borderBottomRightRadius')) || borderRadius;
        const blRadius = parseFloat(getProp('border-bottom-left-radius', 'borderBottomLeftRadius')) || borderRadius;
        const hasIndependentCorners =
            tlRadius !== trRadius || brRadius !== blRadius || tlRadius !== brRadius;

        // Effects (Shadows & Blur)
        const boxShadow = getProp('box-shadow', 'boxShadow');
        const filter = getProp('filter', 'filter');
        const backdropFilter = getProp('backdrop-filter', 'backdropFilter');
        const effects = parseAllEffects(boxShadow, filter, backdropFilter);

        // -------------------------------------------------------------
        // 1. IMAGE ELEMENT (<img>)
        // -------------------------------------------------------------
        if (tagName === 'img') {
            const src = element.getAttribute('src');
            const alt = element.getAttribute('alt') || element.className || 'Image';
            const objectFit = getProp('object-fit', 'objectFit') || 'cover';
            const scaleMode = objectFit === 'contain' ? 'FIT' : objectFit === 'fill' ? 'STRETCH' : 'FILL';

            const targetW = width || (isAbsolute ? containerW : (parentContext ? parentContext.width : 280));
            const resolved = await imageRegistry.resolveImage(src, alt, targetW);

            const imgWidth = width || (isAbsolute ? containerW : (parentContext ? parentContext.width : (resolved?.width || 280)));
            const imgHeight = height || resolved?.height || (isAbsolute ? containerH : 140);

            const imgFills = resolved ? [imageRegistry.createImagePaint(resolved, scaleMode)] : [];
            stats.images++;
            stats.totalNodes++;

            const imgNode = {
                guid: currentGuid,
                phase: 'CREATED',
                parentIndex: { guid: parentGuid, position: orderPosition },
                type: 'RECTANGLE',
                name: alt,
                visible: isVisible,
                opacity: opacity,
                blendMode: blendMode,
                transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
                size: { x: imgWidth, y: imgHeight },
                fillPaints: imgFills,
                strokePaints: strokePaints,
                strokeWeight: borderWidth,
                strokeAlign: 'INSIDE',
                effects: effects,
                cornerRadius: borderRadius
            };

            if (hasIndependentCorners) {
                imgNode.rectangleTopLeftCornerRadius = tlRadius;
                imgNode.rectangleTopRightCornerRadius = trRadius;
                imgNode.rectangleBottomRightCornerRadius = brRadius;
                imgNode.rectangleBottomLeftCornerRadius = blRadius;
                imgNode.rectangleCornerRadiiIndependent = true;
            }

            if (isAbsolute) {
                imgNode.stackPositioning = 'ABSOLUTE';
                imgNode.transform = { m00: 1, m01: 0, m02: posX, m10: 0, m11: 1, m12: posY };
            } else if (parentContext && parentContext.isFlex) {
                if (flexGrow > 0) imgNode.stackChildPrimaryGrow = 1.0;
                if (alignSelf === 'stretch' || (parentContext.isColumn && (!hasExplicitWidth || isWidthPercent))) {
                    imgNode.stackChildAlignSelf = 'STRETCH';
                } else if (alignSelf === 'center') {
                    imgNode.stackChildAlignSelf = 'CENTER';
                }
                if (marginOffsets.top) imgNode.stackChildMarginTop = marginOffsets.top;
                if (marginOffsets.right) imgNode.stackChildMarginRight = marginOffsets.right;
                if (marginOffsets.bottom) imgNode.stackChildMarginBottom = marginOffsets.bottom;
                if (marginOffsets.left) imgNode.stackChildMarginLeft = marginOffsets.left;
            }

            nodeChanges.push(imgNode);
            return { node: imgNode, width: imgWidth, height: imgHeight, isAbsolute, marginTop: marginOffsets.top, marginBottom: marginOffsets.bottom, marginLeft: marginOffsets.left, marginRight: marginOffsets.right };
        }

        // -------------------------------------------------------------
        // 2. SVG ELEMENT (<svg>)
        // -------------------------------------------------------------
        if (tagName === 'svg') {
            const dims = getSvgDimensions(element, win);
            if (dims.isSpriteDef || (dims.width === 0 && dims.height === 0)) {
                return null;
            }
            const svgWidth = dims.width;
            const svgHeight = dims.height;

            const iconColor = getProp('color', 'color') || inheritedStyles.color || '#000000';
            const svgXml = serializeSvgElement(element, iconColor, svgWidth, svgHeight, win);
            const pngBuffer = renderSvgToPng(svgXml, svgWidth);
            const resolved = imageRegistry.registerBuffer(pngBuffer || Buffer.from(svgXml, 'utf8'), element.id || 'svg-icon', svgWidth);

            stats.images++;
            stats.totalNodes++;

            const svgNode = {
                guid: currentGuid,
                phase: 'CREATED',
                parentIndex: { guid: parentGuid, position: orderPosition },
                type: 'RECTANGLE',
                name: element.id || 'SVG Icon',
                visible: isVisible,
                opacity: opacity,
                blendMode: blendMode,
                transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
                size: { x: svgWidth, y: svgHeight },
                fillPaints: [imageRegistry.createImagePaint(resolved, 'FIT')],
                cornerRadius: borderRadius
            };

            if (isAbsolute) {
                svgNode.stackPositioning = 'ABSOLUTE';
                svgNode.transform = { m00: 1, m01: 0, m02: posX, m10: 0, m11: 1, m12: posY };
            } else if (parentContext && parentContext.isFlex) {
                if (flexGrow > 0) svgNode.stackChildPrimaryGrow = 1.0;
                if (alignSelf === 'stretch') svgNode.stackChildAlignSelf = 'STRETCH';
                else if (alignSelf === 'center') svgNode.stackChildAlignSelf = 'CENTER';
                if (marginOffsets.top) svgNode.stackChildMarginTop = marginOffsets.top;
                if (marginOffsets.right) svgNode.stackChildMarginRight = marginOffsets.right;
                if (marginOffsets.bottom) svgNode.stackChildMarginBottom = marginOffsets.bottom;
                if (marginOffsets.left) svgNode.stackChildMarginLeft = marginOffsets.left;
            }

            nodeChanges.push(svgNode);
            return { node: svgNode, width: svgWidth, height: svgHeight, isAbsolute, marginTop: marginOffsets.top, marginBottom: marginOffsets.bottom, marginLeft: marginOffsets.left, marginRight: marginOffsets.right };
        }

        // -------------------------------------------------------------
        // 3. HORIZONTAL RULE (<hr>)
        // -------------------------------------------------------------
        if (tagName === 'hr') {
            stats.shapes++;
            stats.totalNodes++;

            const hrWidth = width || (parentContext ? parentContext.width : 300);
            const borderTopC = getProp('border-top-color', 'borderTopColor');
            const borderC = getProp('border-color', 'borderColor');
            const bgC = getProp('background-color', 'backgroundColor');
            const hrColor = parseColor(borderTopC) || parseColor(borderC) || parseColor(bgC) || parseColor(inheritedStyles.color) || { r: 0.2, g: 0.25, b: 0.33, a: 1.0 };
            const hrThickness = borderTopW || borderWidth || parseFloat(getProp('height', 'height')) || 1;

            const hrNode = {
                guid: currentGuid,
                phase: 'CREATED',
                parentIndex: { guid: parentGuid, position: orderPosition },
                type: 'RECTANGLE',
                name: 'Divider',
                visible: isVisible,
                opacity: opacity,
                blendMode: blendMode,
                transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
                size: { x: hrWidth, y: hrThickness },
                fillPaints: [{
                    type: 'SOLID',
                    color: hrColor,
                    opacity: hrColor.a,
                    visible: true,
                    blendMode: 'NORMAL'
                }],
                stackChildAlignSelf: 'STRETCH'
            };

            if (parentContext && parentContext.isFlex && !isAbsolute) {
                if (marginOffsets.top) hrNode.stackChildMarginTop = marginOffsets.top;
                if (marginOffsets.right) hrNode.stackChildMarginRight = marginOffsets.right;
                if (marginOffsets.bottom) hrNode.stackChildMarginBottom = marginOffsets.bottom;
                if (marginOffsets.left) hrNode.stackChildMarginLeft = marginOffsets.left;
            }

            nodeChanges.push(hrNode);
            return { node: hrNode, width: hrWidth, height: hrThickness, isAbsolute, marginTop: marginOffsets.top, marginBottom: marginOffsets.bottom, marginLeft: marginOffsets.left, marginRight: marginOffsets.right };
        }

        // -------------------------------------------------------------
        // 4. TEXT ELEMENTS
        // -------------------------------------------------------------
        const isTextTag = ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'label', 'strong', 'b', 'em', 'i', 'small', 'code', 'pre', 'blockquote'].includes(tagName);
        const hasNoChildren = element.children.length === 0;
        const textContent = element.textContent.trim();
        const hasRichChildren = isRichTextContainer(element);
        const isChildlessTextDiv = (tagName === 'div' && hasNoChildren && textContent.length > 0 && fills.length === 0 && borderWidth === 0);

        if ((isTextTag && hasNoChildren && textContent.length > 0) || (hasRichChildren && !fills.length && borderWidth === 0) || isChildlessTextDiv) {
            const textColor = parseColor(inheritedStyles.color) || { r: 0.1, g: 0.1, b: 0.1, a: 1.0 };
            const textColorVar = inheritedStyles.colorVar || (textColor.a === 1 ? colorToVarMap.get(colorToHexKey(textColor)) : null);
            const textPaint = {
                type: 'SOLID',
                color: textColor,
                opacity: textColor.a,
                visible: true,
                blendMode: 'NORMAL'
            };
            const cVar = createColorVar(textColorVar);
            if (cVar) textPaint.colorVar = cVar;

            const fontSize = parseFloat(getProp('font-size', 'fontSize')) || inheritedStyles.fontSize;

            const { styleName, postscript, cleanFamily } = parseFontStyle(
                inheritedStyles.fontWeight,
                inheritedStyles.fontStyle,
                inheritedStyles.fontFamily
            );

            const lhObj = parseLineHeight(inheritedStyles.lineHeight, fontSize);
            const lsResult = parseLetterSpacing(inheritedStyles.letterSpacing, fontSize);
            const textCase = parseTextTransform(getProp('text-transform', 'textTransform'));
            const textDec = parseTextDecoration(getProp('text-decoration', 'textDecoration'));

            let textData = null;
            let displayCharacters = textContent;

            if (hasRichChildren) {
                const richResult = extractRichText(element, win, {
                    color: textColor,
                    fontSize: fontSize,
                    fontFamily: cleanFamily,
                    fontWeight: inheritedStyles.fontWeight,
                    fontStyle: inheritedStyles.fontStyle
                }, resolveVar, varMap, colorToVarMap, createColorVar);
                displayCharacters = richResult.characters;
                textData = {
                    characters: displayCharacters,
                    characterStyleIDs: richResult.characterStyleIDs,
                    styleOverrideTable: richResult.styleOverrideTable
                };
            } else {
                textData = {
                    characters: displayCharacters
                };
            }

            // Paragraph / block text wrapping
            const isParagraph = tagName === 'p' || tagName === 'blockquote';
            const maxWidthProp = parseFloat(getProp('max-width', 'maxWidth'));
            const inFlexRow = parentContext && parentContext.isFlex && !parentContext.isColumn;

            let targetWidth = width > 0 ? width : (inFlexRow ? 0 : (parentContext ? parentContext.width : 0));
            if (maxWidthProp && !isNaN(maxWidthProp) && maxWidthProp > 0) {
                targetWidth = targetWidth > 0 ? Math.min(targetWidth, maxWidthProp) : maxWidthProp;
            }

            const charWidth = fontSize * 0.58;
            const hasNewlines = displayCharacters.includes('\n');
            const isMultiLine = isParagraph || hasNewlines || (targetWidth > 0 && (displayCharacters.length * charWidth) > targetWidth);

            const textGeom = estimateTextDimensions(
                displayCharacters,
                fontSize,
                isMultiLine ? targetWidth : width,
                isMultiLine,
                cleanFamily
            );

            stats.textNodes++;
            stats.totalNodes++;

            const textNode = {
                guid: currentGuid,
                phase: 'CREATED',
                parentIndex: { guid: parentGuid, position: orderPosition },
                type: 'TEXT',
                name: (element.className ? element.className.trim() : null) || displayCharacters.slice(0, 32) || 'Text',
                visible: isVisible,
                opacity: opacity,
                blendMode: blendMode,
                transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
                size: { x: textGeom.width, y: textGeom.height },
                fillPaints: [textPaint],
                fontSize: fontSize,
                fontName: {
                    family: cleanFamily,
                    style: styleName,
                    postscript: postscript
                },
                textAlignHorizontal: (getProp('text-align', 'textAlign') || 'LEFT').toUpperCase(),
                textAlignVertical: 'TOP',
                textAutoResize: textGeom.autoResize,
                lineHeight: lhObj,
                letterSpacing: lsResult.struct,
                textTracking: lsResult.tracking,
                textCase: textCase,
                textDecoration: textDec,
                textData: {
                    ...textData,
                    layoutSize: { x: textGeom.width, y: textGeom.height }
                }
            };

            const textConsumptionEntries = [];
            const fsVar = getVarForProp('font-size', 'fontSize');
            if (fsVar) {
                const vData = createFloatVar(fsVar);
                if (vData) {
                    textConsumptionEntries.push({
                        variableField: 'FONT_SIZE',
                        variableData: vData
                    });
                }
            }
            if (textConsumptionEntries.length > 0) {
                const mapObj = { entries: textConsumptionEntries };
                textNode.parameterConsumptionMap = mapObj;
                textNode.variableConsumptionMap = mapObj;
            }

            if (isAbsolute) {
                textNode.stackPositioning = 'ABSOLUTE';
                textNode.transform = { m00: 1, m01: 0, m02: posX, m10: 0, m11: 1, m12: posY };
            } else if (parentContext && parentContext.isFlex) {
                if (flexGrow > 0) textNode.stackChildPrimaryGrow = 1.0;
                if (alignSelf === 'stretch' || (parentContext.isColumn && isParagraph && !inFlexRow)) {
                    textNode.stackChildAlignSelf = 'STRETCH';
                } else if (alignSelf === 'center') {
                    textNode.stackChildAlignSelf = 'CENTER';
                }
            }

            const hasMargins = (marginOffsets.top > 0 || marginOffsets.right > 0 || marginOffsets.bottom > 0 || marginOffsets.left > 0);
            if (hasMargins && parentContext && parentContext.isFlex && !isAbsolute) {
                const wrapperGuid = currentGuid;
                const innerTextGuid = guidGen.next();

                textNode.guid = innerTextGuid;
                textNode.parentIndex = { guid: wrapperGuid, position: '!' };
                textNode.transform = {
                    m00: 1, m01: 0, m02: marginOffsets.left || 0,
                    m10: 0, m11: 1, m12: marginOffsets.top || 0
                };
                textNode.stackChildAlignSelf = 'STRETCH';
                textNode.textAutoResize = 'HEIGHT';

                const isCol = parentContext.isColumn;
                const shouldStretch = alignSelf === 'stretch' || (isCol && isParagraph && !inFlexRow);
                const wrapperW = (isCol || shouldStretch)
                    ? (parentContext.width || textGeom.width)
                    : (textGeom.width + marginOffsets.left + marginOffsets.right);
                const wrapperH = textGeom.height + marginOffsets.top + marginOffsets.bottom;

                const wrapperName = (element.className && typeof element.className === 'string')
                    ? element.className.trim()
                    : (element.id || 'TextWrapper');

                const wrapperFrame = {
                    guid: wrapperGuid,
                    phase: 'CREATED',
                    parentIndex: { guid: parentGuid, position: orderPosition },
                    type: 'FRAME',
                    name: wrapperName,
                    visible: isVisible,
                    opacity: opacity,
                    size: { x: wrapperW, y: wrapperH },
                    transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
                    strokeWeight: 0,
                    strokeAlign: 'INSIDE',
                    fillPaints: [],
                    strokePaints: [],
                    effects: [],
                    stackMode: 'VERTICAL',
                    stackLayoutVersion: 4,
                    stackPrimarySizing: 'RESIZE_TO_FIT',
                    stackCounterSizing: (isCol || shouldStretch) ? 'FIXED' : 'RESIZE_TO_FIT',
                    stackPrimaryAlignItems: 'MIN',
                    stackCounterAlignItems: 'MIN',
                    stackChildAlignSelf: shouldStretch ? 'STRETCH' : (alignSelf === 'center' ? 'CENTER' : 'MIN')
                };

                wrapperFrame.stackVerticalPadding = marginOffsets.top || 0;
                wrapperFrame.stackPaddingBottom = marginOffsets.bottom || 0;
                wrapperFrame.stackHorizontalPadding = marginOffsets.left || 0;
                wrapperFrame.stackPaddingRight = marginOffsets.right || 0;

                nodeChanges.push(wrapperFrame);
                nodeChanges.push(textNode);
                stats.frames++;

                return {
                    node: wrapperFrame,
                    width: wrapperW,
                    height: wrapperH,
                    isAbsolute: false,
                    marginTop: 0,
                    marginBottom: 0,
                    marginLeft: 0,
                    marginRight: 0
                };
            }

            nodeChanges.push(textNode);
            return { node: textNode, width: textGeom.width, height: textGeom.height, isAbsolute, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 };
        }

        // -------------------------------------------------------------
        // 5. INPUT / FORM CONTROLS
        // -------------------------------------------------------------
        if (tagName === 'input') {
            const inputType = (element.getAttribute('type') || 'text').toLowerCase();
            const placeholder = element.getAttribute('placeholder') || element.getAttribute('value') || '';

            if (inputType === 'checkbox') {
                stats.shapes++;
                stats.totalNodes++;
                const isChecked = element.checked;
                const checkColor = isChecked ? { r: 0.15, g: 0.39, b: 0.92, a: 1 } : { r: 1, g: 1, b: 1, a: 1 };
                const checkBorder = isChecked ? { r: 0.15, g: 0.39, b: 0.92, a: 1 } : { r: 0.8, g: 0.8, b: 0.8, a: 1 };

                const cbNode = {
                    guid: currentGuid,
                    phase: 'CREATED',
                    parentIndex: { guid: parentGuid, position: orderPosition },
                    type: 'RECTANGLE',
                    name: 'Checkbox',
                    visible: isVisible,
                    opacity: opacity,
                    blendMode: blendMode,
                    transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
                    size: { x: 18, y: 18 },
                    fillPaints: [{ type: 'SOLID', color: checkColor, opacity: 1, visible: true, blendMode: 'NORMAL' }],
                    strokePaints: [{ type: 'SOLID', color: checkBorder, opacity: 1, visible: true, blendMode: 'NORMAL' }],
                    strokeWeight: 1,
                    cornerRadius: 4
                };
                nodeChanges.push(cbNode);
                return { node: cbNode, width: 18, height: 18, isAbsolute };
            }

            if (inputType === 'radio') {
                stats.shapes++;
                stats.totalNodes++;
                const radioNode = {
                    guid: currentGuid,
                    phase: 'CREATED',
                    parentIndex: { guid: parentGuid, position: orderPosition },
                    type: 'ELLIPSE',
                    name: 'Radio',
                    visible: isVisible,
                    opacity: opacity,
                    blendMode: blendMode,
                    transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
                    size: { x: 18, y: 18 },
                    fillPaints: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
                    strokePaints: [{ type: 'SOLID', color: { r: 0.7, g: 0.7, b: 0.7, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
                    strokeWeight: 1.5
                };
                nodeChanges.push(radioNode);
                return { node: radioNode, width: 18, height: 18, isAbsolute };
            }

            // Text input container
            const inputW = width || 260;
            const inputH = height || 42;
            stats.frames++;
            stats.totalNodes++;

            const inputFrame = {
                guid: currentGuid,
                phase: 'CREATED',
                parentIndex: { guid: parentGuid, position: orderPosition },
                type: 'FRAME',
                name: `Input[${inputType}]`,
                visible: isVisible,
                opacity: opacity,
                blendMode: blendMode,
                transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
                size: { x: inputW, y: inputH },
                fillPaints: fills.length ? fills : [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
                strokePaints: strokePaints.length ? strokePaints : [{ type: 'SOLID', color: { r: 0.82, g: 0.84, b: 0.86, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
                strokeWeight: borderWidth || 1,
                strokeAlign: 'INSIDE',
                cornerRadius: borderRadius || 6,
                stackMode: 'HORIZONTAL',
                stackLayoutVersion: 4,
                stackHorizontalPadding: 14,
                stackVerticalPadding: 10,
                stackPrimaryAlignItems: 'MIN',
                stackCounterAlignItems: 'CENTER',
                stackPrimarySizing: 'FIXED',
                stackCounterSizing: 'FIXED'
            };

            if (isAbsolute) {
                inputFrame.stackPositioning = 'ABSOLUTE';
                inputFrame.transform = { m00: 1, m01: 0, m02: posX, m10: 0, m11: 1, m12: posY };
            } else if (parentContext && parentContext.isFlex) {
                if (marginOffsets.top) inputFrame.stackChildMarginTop = marginOffsets.top;
                if (marginOffsets.right) inputFrame.stackChildMarginRight = marginOffsets.right;
                if (marginOffsets.bottom) inputFrame.stackChildMarginBottom = marginOffsets.bottom;
                if (marginOffsets.left) inputFrame.stackChildMarginLeft = marginOffsets.left;
            }

            const inputRadiusVar = getVarForProp('border-radius', 'borderRadius') || (borderRadius > 0 ? (radiusToVarMap.get(borderRadius) || floatToVarMap.get(borderRadius)) : null);
            if (inputRadiusVar) {
                const rVal = borderRadius || inputRadiusVar.floatValue || 6;
                inputFrame.rectangleCornerRadiiIndependent = true;
                inputFrame.rectangleTopLeftCornerRadius = rVal;
                inputFrame.rectangleTopRightCornerRadius = rVal;
                inputFrame.rectangleBottomLeftCornerRadius = rVal;
                inputFrame.rectangleBottomRightCornerRadius = rVal;
                delete inputFrame.cornerRadius;

                const vData = createFloatVar(inputRadiusVar);
                if (vData) {
                    const inputEntries = [
                        { variableField: 'RECTANGLE_TOP_LEFT_CORNER_RADIUS', variableData: vData },
                        { variableField: 'RECTANGLE_TOP_RIGHT_CORNER_RADIUS', variableData: vData },
                        { variableField: 'RECTANGLE_BOTTOM_LEFT_CORNER_RADIUS', variableData: vData },
                        { variableField: 'RECTANGLE_BOTTOM_RIGHT_CORNER_RADIUS', variableData: vData }
                    ];
                    const mapObj = { entries: inputEntries };
                    inputFrame.parameterConsumptionMap = mapObj;
                    inputFrame.variableConsumptionMap = mapObj;
                }
            }

            nodeChanges.push(inputFrame);

            if (placeholder) {
                stats.textNodes++;
                stats.totalNodes++;
                const textGuid = guidGen.next();

                const inputFontSize = parseFloat(getProp('font-size', 'fontSize')) || 14;
                const inputLh = parseLineHeight(getProp('line-height', 'lineHeight') || (parentContext ? parentContext.inherited.lineHeight : null), inputFontSize);
                const inputLs = parseLetterSpacing(getProp('letter-spacing', 'letterSpacing') || (parentContext ? parentContext.inherited.letterSpacing : null), inputFontSize);
                const { styleName: inStyle, postscript: inPs, cleanFamily: inFam } = parseFontStyle(
                    getProp('font-weight', 'fontWeight') || (parentContext ? parentContext.inherited.fontWeight : 'normal'),
                    getProp('font-style', 'fontStyle') || (parentContext ? parentContext.inherited.fontStyle : 'normal'),
                    getProp('font-family', 'fontFamily') || (parentContext ? parentContext.inherited.fontFamily : 'Inter')
                );

                const placeholderNode = {
                    guid: textGuid,
                    phase: 'CREATED',
                    parentIndex: { guid: currentGuid, position: '!' },
                    type: 'TEXT',
                    name: 'Placeholder',
                    visible: true,
                    opacity: 1.0,
                    blendMode: blendMode,
                    size: { x: inputW - 28, y: 18 },
                    transform: { m00: 1, m01: 0, m02: 14, m10: 0, m11: 1, m12: 12 },
                    fillPaints: [{ type: 'SOLID', color: { r: 0.6, g: 0.64, b: 0.68, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
                    fontSize: inputFontSize,
                    fontName: { family: inFam, style: inStyle, postscript: inPs },
                    lineHeight: inputLh,
                    letterSpacing: inputLs.struct,
                    textTracking: inputLs.tracking,
                    textAlignHorizontal: 'LEFT',
                    textAlignVertical: 'CENTER',
                    textAutoResize: 'WIDTH_AND_HEIGHT',
                    textData: {
                        characters: placeholder,
                        layoutSize: { x: inputW - 28, y: 18 }
                    }
                };
                nodeChanges.push(placeholderNode);
            }
            return { node: inputFrame, width: inputW, height: inputH, isAbsolute, marginTop: marginOffsets.top, marginBottom: marginOffsets.bottom, marginLeft: marginOffsets.left, marginRight: marginOffsets.right };
        }

        // -------------------------------------------------------------
        // 6. GENERAL CONTAINER (FRAME / Auto Layout / Circle)
        // -------------------------------------------------------------
        const isFlex = display === 'flex' || display === 'inline-flex';
        const isGrid = display === 'grid' || display === 'inline-grid';
        const flexDirection = getProp('flex-direction', 'flexDirection');
        const gridCols = getProp('grid-template-columns', 'gridTemplateColumns');
        const parsedCols = isGrid ? parseGridColumns(gridCols) : [];
        const isMultiColGrid = isGrid && parsedCols.length > 1;
        const isColumn = isFlex
            ? (flexDirection === 'column' || flexDirection === 'column-reverse')
            : (isGrid ? !isMultiColGrid : true);

        const padOffsets = parseBoxOffsets(
            getProp('padding', 'padding'),
            getProp('padding-top', 'paddingTop'),
            getProp('padding-right', 'paddingRight'),
            getProp('padding-bottom', 'paddingBottom'),
            getProp('padding-left', 'paddingLeft')
        );
        const paddingTop = padOffsets.top;
        const paddingRight = padOffsets.right;
        const paddingBottom = padOffsets.bottom;
        const paddingLeft = padOffsets.left;
        const rowGap = parseFloat(getProp('row-gap', 'rowGap')) || parseFloat(getProp('gap', 'gap')) || 0;
        const colGap = parseFloat(getProp('column-gap', 'columnGap')) || parseFloat(getProp('gap', 'gap')) || 0;
        const gap = isColumn ? rowGap : colGap;

        // Determine frame width
        let frameWidth = width;
        const isInlineEl = display === 'inline-block' || display === 'inline-flex' || display === 'inline' || tagName === 'button';
        const hasTextChildren = Array.from(element.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
        const isGridChild = parentContext && (parentContext.isMultiColGrid || parentContext.gridChildWidth > 0);

        if (parentContext && parentContext.isMultiColGrid && parentContext.gridChildWidth > 0 && !hasExplicitWidth) {
            frameWidth = parentContext.gridChildWidth;
            width = parentContext.gridChildWidth;
        } else if (tagName === 'body') {
            frameWidth = width || 1440;
        } else if (!frameWidth || frameWidth === 0) {
            if (parentContext && parentContext.isColumn && alignSelf !== 'center' && alignSelf !== 'flex-start' && !isMarginAuto && !isInlineEl) {
                // In a column parent, block children expand to parent's width by default
                frameWidth = parentContext.width;
            } else if (parentContext && parentContext.isFlex && !parentContext.isColumn && flexGrow > 0) {
                frameWidth = parentContext.width;
            } else if (isInlineEl || (parentContext && !parentContext.isColumn && hasTextChildren && element.children.length === 0)) {
                // For inline elements or buttons, estimate width from text content + padding
                const textContent = element.textContent.trim();
                const fontSize = parseFloat(getProp('font-size', 'fontSize')) || inheritedStyles.fontSize || 14;
                const charW = fontSize * 0.58;
                frameWidth = Math.ceil(paddingLeft + paddingRight + textContent.length * charW);
            } else if (parentContext && !parentContext.isColumn) {
                // In a flex row, default to remaining width or content width
                frameWidth = Math.min(240, Math.max(60, parentContext.width - 60));
            } else {
                frameWidth = parentContext ? parentContext.width : 300;
            }
        }

        let frameHeight = height || (hasExplicitHeight ? height : 40);

        // Circle shape detection (border-radius: 50% with equal width & height)
        const isCircle = (borderRadius >= frameWidth / 2 && frameWidth === frameHeight) ||
            element.classList.contains('rounded-full') ||
            element.classList.contains('avatar') ||
            element.classList.contains('avatar-circle');

        const frameType = (isCircle && element.children.length === 0) ? 'ELLIPSE' : 'FRAME';

        let frameName = element.getAttribute('data-name') || element.getAttribute('name') || element.getAttribute('title') || element.id || (element.className && typeof element.className === 'string' ? element.className.trim() : '') || tagName;
        if (tagName === 'body') {
            frameName = (doc.title && doc.title.trim()) || 'Page';
        }

        stats.frames++;
        stats.totalNodes++;

        const frameNode = {
            guid: currentGuid,
            phase: 'CREATED',
            parentIndex: { guid: parentGuid, position: orderPosition },
            type: frameType,
            name: frameName,
            visible: isVisible,
            opacity: opacity,
            blendMode: blendMode,
            transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
            size: { x: frameWidth, y: frameHeight },
            fillPaints: fills,
            strokePaints: strokePaints,
            strokeWeight: borderWidth,
            strokeAlign: 'INSIDE',
            effects: effects,
            cornerRadius: borderRadius,
            frameMaskDisabled: !(getProp('overflow', 'overflow') === 'hidden' || getProp('overflow', 'overflow') === 'clip')
        };

        if (isAbsolute) {
            frameNode.stackPositioning = 'ABSOLUTE';
            frameNode.transform = { m00: 1, m01: 0, m02: posX, m10: 0, m11: 1, m12: posY };
        }

        // Independent corner radii
        if (hasIndependentCorners) {
            frameNode.rectangleTopLeftCornerRadius = tlRadius;
            frameNode.rectangleTopRightCornerRadius = trRadius;
            frameNode.rectangleBottomRightCornerRadius = brRadius;
            frameNode.rectangleBottomLeftCornerRadius = blRadius;
            frameNode.rectangleCornerRadiiIndependent = true;
        }

        // Independent border weights
        if (hasIndependentBorders) {
            frameNode.borderTopWeight = borderTopW;
            frameNode.borderBottomWeight = borderBottomW;
            frameNode.borderLeftWeight = borderLeftW;
            frameNode.borderRightWeight = borderRightW;
            frameNode.borderStrokeWeightsIndependent = true;
        }

        // Auto Layout configuration
        if (frameType === 'FRAME') {
            if (tagName === 'body') {
                frameNode.stackMode = 'VERTICAL';
                frameNode.stackSpacing = gap || 0;
                frameNode.stackHorizontalPadding = paddingLeft || 0;
                frameNode.stackPaddingRight = paddingRight || 0;
                frameNode.stackVerticalPadding = paddingTop || 0;
                frameNode.stackPaddingBottom = paddingBottom || 0;
                frameNode.stackPrimaryAlignItems = 'MIN';
                frameNode.stackCounterAlignItems = 'MIN';
                frameNode.stackPrimarySizing = 'RESIZE_TO_FIT';
                frameNode.stackCounterSizing = 'FIXED';
            } else if (isFlex || isGrid) {
                frameNode.stackMode = isColumn ? 'VERTICAL' : 'HORIZONTAL';
                frameNode.stackSpacing = gap || 0;
                frameNode.stackHorizontalPadding = paddingLeft || 0;
                frameNode.stackPaddingRight = paddingRight || 0;
                frameNode.stackVerticalPadding = paddingTop || 0;
                frameNode.stackPaddingBottom = paddingBottom || 0;

                const flexWrap = getProp('flex-wrap', 'flexWrap');
                if (isMultiColGrid) {
                    frameNode.stackMode = 'HORIZONTAL';
                    frameNode.stackWrap = 'WRAP';
                    frameNode.stackSpacing = colGap;
                    frameNode.stackCounterSpacing = rowGap;
                } else if (flexWrap === 'wrap' || (isGrid && gridCols && (gridCols.includes('repeat') || gridCols.split(/\s+/).length > 1))) {
                    frameNode.stackWrap = 'WRAP';
                    if (colGap) frameNode.stackCounterSpacing = colGap;
                }

                const placeItems = getProp('place-items', 'placeItems') || getProp('place-content', 'placeContent');
                const isPlaceCenter = placeItems && placeItems.includes('center');

                const jc = getProp('justify-content', 'justifyContent');
                if (jc === 'center' || isPlaceCenter) frameNode.stackPrimaryAlignItems = 'CENTER';
                else if (jc === 'flex-end' || jc === 'end') frameNode.stackPrimaryAlignItems = 'MAX';
                else if (jc === 'space-between' || jc === 'space-around' || jc === 'space-evenly') frameNode.stackPrimaryAlignItems = 'SPACE_BETWEEN';
                else frameNode.stackPrimaryAlignItems = 'MIN';

                const ai = getProp('align-items', 'alignItems');
                if (ai === 'center' || isPlaceCenter) frameNode.stackCounterAlignItems = 'CENTER';
                else if (ai === 'flex-end' || ai === 'end') frameNode.stackCounterAlignItems = 'MAX';
                else if (ai === 'baseline') frameNode.stackCounterAlignItems = 'BASELINE';
                else frameNode.stackCounterAlignItems = 'MIN';

                const isInline = isInlineEl;
                const isContentWidth = rawWidthStr === 'max-content' || rawWidthStr === 'min-content' || rawWidthStr === 'fit-content';

                // Axes:
                // HORIZONTAL stack: primary = WIDTH, counter = HEIGHT
                // VERTICAL stack: primary = HEIGHT, counter = WIDTH
                if (isColumn) {
                    frameNode.stackPrimarySizing = (hasExplicitHeight || isHeightPercent) ? 'FIXED' : 'RESIZE_TO_FIT';
                    frameNode.stackCounterSizing = (hasExplicitWidth || isWidthPercent || (parentContext && (parentContext.isColumn || isGridChild))) && !isInline && !isContentWidth ? 'FIXED' : 'RESIZE_TO_FIT';
                } else {
                    frameNode.stackPrimarySizing = (hasExplicitWidth || isWidthPercent || isGridChild || (jc === 'space-between' && frameWidth > 200)) && !isContentWidth ? 'FIXED' : 'RESIZE_TO_FIT';
                    frameNode.stackCounterSizing = (hasExplicitHeight || isHeightPercent) ? 'FIXED' : 'RESIZE_TO_FIT';
                }
            } else if (element.children.length > 0) {
                // Block container flow (e.g. <div>, <form>, <section> without display: flex)
                // In HTML, block elements stack their children VERTICALLY
                frameNode.stackMode = 'VERTICAL';
                frameNode.stackSpacing = 2; // small default spacing between block items
                frameNode.stackHorizontalPadding = paddingLeft || 0;
                frameNode.stackPaddingRight = paddingRight || 0;
                frameNode.stackVerticalPadding = paddingTop || 0;
                frameNode.stackPaddingBottom = paddingBottom || 0;
                frameNode.stackPrimaryAlignItems = 'MIN';
                frameNode.stackCounterAlignItems = 'MIN';

                frameNode.stackPrimarySizing = hasExplicitHeight ? 'FIXED' : 'RESIZE_TO_FIT';
                frameNode.stackCounterSizing = (hasExplicitWidth || isWidthPercent || (parentContext && (parentContext.isColumn || isGridChild))) && !isInlineEl ? 'FIXED' : 'RESIZE_TO_FIT';
            } else if (hasTextChildren && !isGridChild && (fills.length > 0 || strokePaints.length > 0 || effects.length > 0 || borderRadius > 0 || paddingLeft > 0 || paddingRight > 0 || paddingTop > 0 || paddingBottom > 0 || tagName === 'button' || isInlineEl)) {
                // Inline container, button or badge with text (e.g. <button>, <div class="badge">, <a class="btn">)
                frameNode.stackMode = 'HORIZONTAL';
                frameNode.stackSpacing = gap || 0;
                frameNode.stackHorizontalPadding = paddingLeft || 0;
                frameNode.stackPaddingRight = paddingRight || 0;
                frameNode.stackVerticalPadding = paddingTop || 0;
                frameNode.stackPaddingBottom = paddingBottom || 0;

                const ta = (getProp('text-align', 'textAlign') || '').toLowerCase();
                frameNode.stackPrimaryAlignItems = (ta === 'center' || tagName === 'button') ? 'CENTER' : (ta === 'right' || ta === 'end' ? 'MAX' : 'MIN');
                frameNode.stackCounterAlignItems = 'CENTER';

                frameNode.stackPrimarySizing = (hasExplicitWidth || isWidthPercent) ? 'FIXED' : 'RESIZE_TO_FIT';
                frameNode.stackCounterSizing = (hasExplicitHeight || isHeightPercent) ? 'FIXED' : 'RESIZE_TO_FIT';
            } else {
                frameNode.stackMode = 'NONE';
            }

            if (frameNode.stackMode && frameNode.stackMode !== 'NONE') {
                frameNode.stackLayoutVersion = 4;
                if (frameNode.stackHorizontalPadding === undefined) frameNode.stackHorizontalPadding = 0;
                if (frameNode.stackPaddingRight === undefined) frameNode.stackPaddingRight = 0;
                if (frameNode.stackVerticalPadding === undefined) frameNode.stackVerticalPadding = 0;
                if (frameNode.stackPaddingBottom === undefined) frameNode.stackPaddingBottom = 0;
                if (frameNode.stackPrimaryAlignItems === undefined) frameNode.stackPrimaryAlignItems = 'MIN';
                if (frameNode.stackCounterAlignItems === undefined) frameNode.stackCounterAlignItems = 'MIN';
            }
        }

        // Child sizing inside parent flex/block container
        if (!isAbsolute && parentContext && parentContext.isFlex) {
            if (marginOffsets.top) frameNode.stackChildMarginTop = marginOffsets.top;
            if (marginOffsets.right) frameNode.stackChildMarginRight = marginOffsets.right;
            if (marginOffsets.bottom) frameNode.stackChildMarginBottom = marginOffsets.bottom;
            if (marginOffsets.left) frameNode.stackChildMarginLeft = marginOffsets.left;

            const isInline = isInlineEl;
            const isContentWidth = rawWidthStr === 'max-content' || rawWidthStr === 'min-content' || rawWidthStr === 'fit-content';

            if (isMarginAuto && parentContext.isColumn) {
                frameNode.stackChildAlignSelf = 'CENTER';
            } else if (parentContext.isColumn) {
                // In column container, cross-axis is WIDTH
                const shouldStretchW = (alignSelf === 'stretch' || (!hasExplicitWidth && alignSelf !== 'center' && alignSelf !== 'flex-start')) && !isInline && !isContentWidth;
                if (shouldStretchW) {
                    frameNode.stackChildAlignSelf = 'STRETCH';
                    if (!isColumn) {
                        frameNode.stackPrimarySizing = 'FIXED';
                    } else {
                        frameNode.stackCounterSizing = 'FIXED';
                    }
                } else if (alignSelf === 'center') {
                    frameNode.stackChildAlignSelf = 'CENTER';
                } else if (alignSelf === 'flex-end' || alignSelf === 'end') {
                    frameNode.stackChildAlignSelf = 'MAX';
                } else if (alignSelf === 'flex-start' || alignSelf === 'start' || isInline || isContentWidth) {
                    frameNode.stackChildAlignSelf = 'MIN';
                }

                if (flexGrow > 0) {
                    frameNode.stackChildPrimaryGrow = 1.0;
                    if (isColumn) {
                        frameNode.stackPrimarySizing = 'FIXED';
                    } else {
                        frameNode.stackCounterSizing = 'FIXED';
                    }
                }
            } else {
                // In row container, cross-axis is HEIGHT
                const shouldStretchH = alignSelf === 'stretch' || (!hasExplicitHeight && (!alignSelf || alignSelf === 'auto') && parentContext.alignItems === 'stretch');
                if (shouldStretchH) {
                    frameNode.stackChildAlignSelf = 'STRETCH';
                    // If child is a vertical frame, its primary axis is height!
                    // Setting stackPrimarySizing = 'FIXED' prevents it from hugging and makes it Fill Container!
                    if (isColumn) {
                        frameNode.stackPrimarySizing = 'FIXED';
                    } else {
                        frameNode.stackCounterSizing = 'FIXED';
                    }
                } else if (alignSelf === 'center' || parentContext.alignItems === 'center') {
                    frameNode.stackChildAlignSelf = 'CENTER';
                } else if (alignSelf === 'flex-end' || parentContext.alignItems === 'flex-end') {
                    frameNode.stackChildAlignSelf = 'MAX';
                } else if (alignSelf === 'flex-start' || parentContext.alignItems === 'flex-start' || isInline) {
                    frameNode.stackChildAlignSelf = 'MIN';
                }

                if (flexGrow > 0) {
                    frameNode.stackChildPrimaryGrow = 1.0;
                    if (!isColumn) {
                        frameNode.stackPrimarySizing = 'FIXED';
                    } else {
                        frameNode.stackCounterSizing = 'FIXED';
                    }
                }
            }
        }

        let hasHoverRule = false;
        let hoverRuleBody = null;
        for (const rule of pseudoRules.hover) {
            try {
                if (element.matches(rule.selector)) {
                    hasHoverRule = true;
                    hoverRuleBody = rule.body;
                    break;
                }
            } catch (_) {}
        }

        // Assemble variable consumption map for frameNode
        const consumptionEntries = [];
        function addFloatConsumption(arg1, arg2, arg3) {
            let variableField, varInfo;
            if (typeof arg1 === 'string') {
                variableField = arg1;
                varInfo = arg2;
            } else {
                variableField = arg2;
                varInfo = arg3;
            }
            if (!varInfo) return;
            const vData = createFloatVar(varInfo);
            if (vData) {
                consumptionEntries.push({
                    variableField,
                    variableData: vData
                });
            }
        }

        // 1. Corner Radius
        if (hasIndependentCorners) {
            const tlVar = getVarForProp('border-top-left-radius', 'borderTopLeftRadius') || (tlRadius > 0 ? (radiusToVarMap.get(tlRadius) || floatToVarMap.get(tlRadius)) : null);
            const trVar = getVarForProp('border-top-right-radius', 'borderTopRightRadius') || (trRadius > 0 ? (radiusToVarMap.get(trRadius) || floatToVarMap.get(trRadius)) : null);
            const brVar = getVarForProp('border-bottom-right-radius', 'borderBottomRightRadius') || (brRadius > 0 ? (radiusToVarMap.get(brRadius) || floatToVarMap.get(brRadius)) : null);
            const blVar = getVarForProp('border-bottom-left-radius', 'borderBottomLeftRadius') || (blRadius > 0 ? (radiusToVarMap.get(blRadius) || floatToVarMap.get(blRadius)) : null);

            frameNode.rectangleCornerRadiiIndependent = true;
            frameNode.rectangleTopLeftCornerRadius = tlRadius;
            frameNode.rectangleTopRightCornerRadius = trRadius;
            frameNode.rectangleBottomLeftCornerRadius = blRadius;
            frameNode.rectangleBottomRightCornerRadius = brRadius;
            delete frameNode.cornerRadius;

            if (tlVar) addFloatConsumption('RECTANGLE_TOP_LEFT_CORNER_RADIUS', tlVar);
            if (trVar) addFloatConsumption('RECTANGLE_TOP_RIGHT_CORNER_RADIUS', trVar);
            if (blVar) addFloatConsumption('RECTANGLE_BOTTOM_LEFT_CORNER_RADIUS', blVar);
            if (brVar) addFloatConsumption('RECTANGLE_BOTTOM_RIGHT_CORNER_RADIUS', brVar);
        } else {
            const radiusVar = getVarForProp('border-radius', 'borderRadius') || (borderRadius > 0 ? (radiusToVarMap.get(borderRadius) || floatToVarMap.get(borderRadius)) : null);
            if (radiusVar) {
                const rVal = borderRadius || radiusVar.floatValue || 0;
                frameNode.rectangleCornerRadiiIndependent = true;
                frameNode.rectangleTopLeftCornerRadius = rVal;
                frameNode.rectangleTopRightCornerRadius = rVal;
                frameNode.rectangleBottomLeftCornerRadius = rVal;
                frameNode.rectangleBottomRightCornerRadius = rVal;
                delete frameNode.cornerRadius;

                addFloatConsumption('RECTANGLE_TOP_LEFT_CORNER_RADIUS', radiusVar);
                addFloatConsumption('RECTANGLE_TOP_RIGHT_CORNER_RADIUS', radiusVar);
                addFloatConsumption('RECTANGLE_BOTTOM_LEFT_CORNER_RADIUS', radiusVar);
                addFloatConsumption('RECTANGLE_BOTTOM_RIGHT_CORNER_RADIUS', radiusVar);
            }
        }

        // 2. Stroke Weight
        if (hasIndependentBorders) {
            const topWVar = getVarForProp('border-top-width', 'borderTopWidth') || (borderTopW > 0 ? floatToVarMap.get(borderTopW) : null);
            const bottomWVar = getVarForProp('border-bottom-width', 'borderBottomWidth') || (borderBottomW > 0 ? floatToVarMap.get(borderBottomW) : null);
            const leftWVar = getVarForProp('border-left-width', 'borderLeftWidth') || (borderLeftW > 0 ? floatToVarMap.get(borderLeftW) : null);
            const rightWVar = getVarForProp('border-right-width', 'borderRightWidth') || (borderRightW > 0 ? floatToVarMap.get(borderRightW) : null);

            if (borderTopW > 0) addFloatConsumption('BORDER_TOP_WEIGHT', topWVar);
            if (borderBottomW > 0) addFloatConsumption('BORDER_BOTTOM_WEIGHT', bottomWVar);
            if (borderLeftW > 0) addFloatConsumption('BORDER_LEFT_WEIGHT', leftWVar);
            if (borderRightW > 0) addFloatConsumption('BORDER_RIGHT_WEIGHT', rightWVar);
        } else {
            const strokeWVar = getVarForProp('border-width', 'borderWidth') || (borderWidth > 0 ? floatToVarMap.get(borderWidth) : null);
            if (borderWidth > 0) {
                addFloatConsumption('STROKE_WEIGHT', strokeWVar);
            }
        }

        // 3. Auto Layout Spacing (Gap) & Padding
        if (frameNode.stackMode && frameNode.stackMode !== 'NONE') {
            const gapVar = getVarForProp('gap', 'gap', 'column-gap', 'columnGap', 'row-gap', 'rowGap') || (gap > 0 ? (spaceToVarMap.get(gap) || floatToVarMap.get(gap)) : null);
            if (gapVar) {
                addFloatConsumption('STACK_SPACING', gapVar);
            }

            if (frameNode.stackCounterSpacing && frameNode.stackCounterSpacing > 0) {
                const counterGapVar = getVarForProp('row-gap', 'rowGap') || (spaceToVarMap.get(frameNode.stackCounterSpacing) || floatToVarMap.get(frameNode.stackCounterSpacing));
                if (counterGapVar) {
                    addFloatConsumption('STACK_COUNTER_SPACING', counterGapVar);
                }
            }

            const paddingVar = getVarForProp('padding', 'padding');
            const topPadVar = getVarForProp('padding-top', 'paddingTop') || paddingVar || (paddingTop > 0 ? (spaceToVarMap.get(paddingTop) || floatToVarMap.get(paddingTop)) : null);
            const bottomPadVar = getVarForProp('padding-bottom', 'paddingBottom') || paddingVar || (paddingBottom > 0 ? (spaceToVarMap.get(paddingBottom) || floatToVarMap.get(paddingBottom)) : null);
            const leftPadVar = getVarForProp('padding-left', 'paddingLeft') || paddingVar || (paddingLeft > 0 ? (spaceToVarMap.get(paddingLeft) || floatToVarMap.get(paddingLeft)) : null);
            const rightPadVar = getVarForProp('padding-right', 'paddingRight') || paddingVar || (paddingRight > 0 ? (spaceToVarMap.get(paddingRight) || floatToVarMap.get(paddingRight)) : null);

            if (leftPadVar) addFloatConsumption('STACK_PADDING_LEFT', leftPadVar);
            if (topPadVar) addFloatConsumption('STACK_PADDING_TOP', topPadVar);
            if (rightPadVar) addFloatConsumption('STACK_PADDING_RIGHT', rightPadVar);
            if (bottomPadVar) addFloatConsumption('STACK_PADDING_BOTTOM', bottomPadVar);
        }

        // 4. Opacity
        const opacityVar = getVarForProp('opacity', 'opacity');
        if (opacityVar) {
            addFloatConsumption('OPACITY', opacityVar);
        }

        if (consumptionEntries.length > 0) {
            const mapObj = { entries: consumptionEntries };
            frameNode.parameterConsumptionMap = mapObj;
            frameNode.variableConsumptionMap = mapObj;
        }

        nodeChanges.push(frameNode);

        // Recurse into children
        const innerContentWidth = Math.max(10, frameWidth - paddingLeft - paddingRight);
        let gridChildWidth = 0;
        if (isMultiColGrid) {
            const numCols = parsedCols.length;
            gridChildWidth = Math.max(20, Math.floor((innerContentWidth - (numCols - 1) * colGap) / numCols));
        }

        const currentContext = {
            isFlex: isFlex || isGrid || element.children.length > 0 || tagName === 'body',
            isColumn,
            isGrid,
            isMultiColGrid,
            gridChildWidth,
            containerWidth: frameWidth,
            containerHeight: frameHeight,
            width: innerContentWidth,
            height: frameHeight - paddingTop - paddingBottom,
            paddingLeft,
            paddingTop,
            gap,
            alignItems: getProp('align-items', 'alignItems') || 'stretch',
            inherited: inheritedStyles
        };

        const childResults = [];
        let childOrderIdx = 0;

        for (const childNode of element.childNodes) {
            if (childNode.nodeType === 1) { // Element
                const childPos = FractionalIndexer.getPosition(childOrderIdx++);
                const res = await processElement(childNode, currentGuid, childPos, currentContext);
                if (res) childResults.push(res);
            } else if (childNode.nodeType === 3) { // Direct text child node
                const rawText = childNode.textContent.replace(/[\r\n\t]+/g, ' ').replace(/ +/g, ' ').trim();
                if (rawText.length > 0 && frameType === 'FRAME') {
                    const childPos = FractionalIndexer.getPosition(childOrderIdx++);
                    const textGuid = guidGen.next();
                    const fontSize = parseFloat(getProp('font-size', 'fontSize')) || inheritedStyles.fontSize;
                    const { styleName, postscript, cleanFamily } = parseFontStyle(
                        inheritedStyles.fontWeight,
                        inheritedStyles.fontStyle,
                        inheritedStyles.fontFamily
                    );
                    const textColor = parseColor(inheritedStyles.color) || { r: 1, g: 1, b: 1, a: 1 };
                    const textGeom = estimateTextDimensions(rawText, fontSize, 0, false, cleanFamily);
                    const textColorVar = inheritedStyles.colorVar || (textColor.a === 1 ? colorToVarMap.get(colorToHexKey(textColor)) : null);
                    const textPaint = {
                        type: 'SOLID',
                        color: textColor,
                        opacity: textColor.a,
                        visible: true,
                        blendMode: 'NORMAL'
                    };
                    const cVar = createColorVar(textColorVar);
                    if (cVar) textPaint.colorVar = cVar;

                    const childTextNode = {
                        guid: textGuid,
                        phase: 'CREATED',
                        parentIndex: { guid: currentGuid, position: childPos },
                        type: 'TEXT',
                        name: rawText.slice(0, 32),
                        visible: true,
                        opacity: 1.0,
                        blendMode: blendMode,
                        transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
                        size: { x: textGeom.width, y: textGeom.height },
                        fillPaints: [textPaint],
                        fontSize: fontSize,
                        fontName: { family: cleanFamily, style: styleName, postscript: postscript },
                        textAlignHorizontal: 'LEFT',
                        textAlignVertical: 'CENTER',
                        textAutoResize: 'WIDTH_AND_HEIGHT',
                        lineHeight: parseLineHeight(inheritedStyles.lineHeight, fontSize),
                        letterSpacing: parseLetterSpacing(inheritedStyles.letterSpacing, fontSize).struct,
                        textData: {
                            characters: rawText,
                            layoutSize: { x: textGeom.width, y: textGeom.height }
                        }
                    };

                    const textConsumptionEntries = [];
                    const fsVar = getVarForProp('font-size', 'fontSize');
                    if (fsVar) {
                        const vData = createFloatVar(fsVar);
                        if (vData) {
                            textConsumptionEntries.push({
                                variableField: 'FONT_SIZE',
                                variableData: vData
                            });
                        }
                    }
                    if (textConsumptionEntries.length > 0) {
                        const mapObj = { entries: textConsumptionEntries };
                        childTextNode.parameterConsumptionMap = mapObj;
                        childTextNode.variableConsumptionMap = mapObj;
                    }
                    nodeChanges.push(childTextNode);
                    stats.textNodes++;
                    stats.totalNodes++;
                    childResults.push({ node: childTextNode, width: textGeom.width, height: textGeom.height, isAbsolute: false });
                }
            }
        }

        const flowChildren = childResults.filter(c => !c.isAbsolute);
        if (flowChildren.length > 0) {
            if (frameNode.stackMode === 'HORIZONTAL') {
                const totalGap = (gap || 0) * Math.max(0, flowChildren.length - 1);
                const childrenWidthSum = flowChildren.reduce((sum, c) => sum + (c.width || 0) + (c.marginLeft || 0) + (c.marginRight || 0), 0);
                const contentW = paddingLeft + paddingRight + childrenWidthSum + totalGap;
                const maxChildH = Math.max(0, ...flowChildren.map(c => (c.height || 0) + (c.marginTop || 0) + (c.marginBottom || 0)));
                const contentH = paddingTop + paddingBottom + maxChildH;

                if (frameNode.stackPrimarySizing === 'RESIZE_TO_FIT' && tagName !== 'body') {
                    frameNode.size.x = contentW;
                }
                if (((!hasExplicitHeight && !isHeightPercent) || frameNode.stackCounterSizing === 'RESIZE_TO_FIT') && tagName !== 'body') {
                    frameNode.size.y = (!hasExplicitHeight && !isHeightPercent) ? contentH : Math.max(contentH, frameNode.size.y || 10);
                }

                // Pre-compute child X coordinates along row
                const availW = frameNode.size.x - paddingLeft - paddingRight;
                if (frameNode.stackPrimaryAlignItems === 'SPACE_BETWEEN' && flowChildren.length > 1) {
                    const remaining = availW - childrenWidthSum;
                    const spacing = Math.max(0, remaining / (flowChildren.length - 1));
                    let curX = paddingLeft;
                    for (const c of flowChildren) {
                        curX += (c.marginLeft || 0);
                        if (c.node && c.node.transform) c.node.transform.m02 = Math.round(curX * 10) / 10;
                        curX += (c.width || 0) + (c.marginRight || 0) + spacing;
                    }
                } else if (frameNode.stackPrimaryAlignItems === 'MAX') {
                    let curX = frameNode.size.x - paddingRight - (childrenWidthSum + totalGap);
                    for (const c of flowChildren) {
                        curX += (c.marginLeft || 0);
                        if (c.node && c.node.transform) c.node.transform.m02 = Math.round(curX * 10) / 10;
                        curX += (c.width || 0) + (c.marginRight || 0) + (gap || 0);
                    }
                } else if (frameNode.stackPrimaryAlignItems === 'CENTER') {
                    let curX = paddingLeft + (availW - (childrenWidthSum + totalGap)) / 2;
                    for (const c of flowChildren) {
                        curX += (c.marginLeft || 0);
                        if (c.node && c.node.transform) c.node.transform.m02 = Math.round(curX * 10) / 10;
                        curX += (c.width || 0) + (c.marginRight || 0) + (gap || 0);
                    }
                } else {
                    let curX = paddingLeft;
                    for (const c of flowChildren) {
                        curX += (c.marginLeft || 0);
                        if (c.node && c.node.transform) c.node.transform.m02 = Math.round(curX * 10) / 10;
                        curX += (c.width || 0) + (c.marginRight || 0) + (gap || 0);
                    }
                }

                // Pre-compute child Y coordinates and cross-axis stretch
                const isStretchRow = currentContext.alignItems === 'stretch';
                for (const c of flowChildren) {
                    if (c.node && c.node.transform) {
                        if (c.node.stackChildAlignSelf === 'STRETCH' || isStretchRow) {
                            c.node.transform.m12 = paddingTop;
                            c.node.size.y = maxChildH;
                            c.height = maxChildH;
                        } else if (frameNode.stackCounterAlignItems === 'CENTER' || c.node.stackChildAlignSelf === 'CENTER') {
                            const childY = paddingTop + (frameNode.size.y - paddingTop - paddingBottom - (c.height || 0)) / 2;
                            c.node.transform.m12 = Math.round(childY * 10) / 10;
                        } else if (frameNode.stackCounterAlignItems === 'MAX' || c.node.stackChildAlignSelf === 'MAX') {
                            const childY = frameNode.size.y - paddingBottom - (c.height || 0);
                            c.node.transform.m12 = Math.round(childY * 10) / 10;
                        } else {
                            c.node.transform.m12 = paddingTop + (c.marginTop || 0);
                        }
                    }
                }
            } else if (frameNode.stackMode === 'VERTICAL') {
                const totalGap = (gap || 0) * Math.max(0, flowChildren.length - 1);
                const childrenHeightSum = flowChildren.reduce((sum, c) => sum + (c.height || 0) + (c.marginTop || 0) + (c.marginBottom || 0), 0);
                const contentH = paddingTop + paddingBottom + childrenHeightSum + totalGap;
                const maxChildW = Math.max(0, ...flowChildren.map(c => (c.width || 0) + (c.marginLeft || 0) + (c.marginRight || 0)));
                const contentW = paddingLeft + paddingRight + maxChildW;

                if ((!hasExplicitHeight && !isHeightPercent) || tagName === 'body' || frameNode.stackPrimarySizing === 'RESIZE_TO_FIT') {
                    frameNode.size.y = Math.max(contentH, frameNode.size.y || 10);
                }
                if (frameNode.stackCounterSizing === 'RESIZE_TO_FIT' && tagName !== 'body') {
                    frameNode.size.x = contentW;
                }

                // Pre-compute child Y coordinates along column
                const availH = frameNode.size.y - paddingTop - paddingBottom;
                if (frameNode.stackPrimaryAlignItems === 'SPACE_BETWEEN' && flowChildren.length > 1) {
                    const remaining = availH - childrenHeightSum;
                    const spacing = Math.max(0, remaining / (flowChildren.length - 1));
                    let curY = paddingTop;
                    for (const c of flowChildren) {
                        curY += (c.marginTop || 0);
                        if (c.node && c.node.transform) c.node.transform.m12 = Math.round(curY * 10) / 10;
                        curY += (c.height || 0) + (c.marginBottom || 0) + spacing;
                    }
                } else if (frameNode.stackPrimaryAlignItems === 'MAX') {
                    let curY = frameNode.size.y - paddingBottom - (childrenHeightSum + totalGap);
                    for (const c of flowChildren) {
                        curY += (c.marginTop || 0);
                        if (c.node && c.node.transform) c.node.transform.m12 = Math.round(curY * 10) / 10;
                        curY += (c.height || 0) + (c.marginBottom || 0) + (gap || 0);
                    }
                } else if (frameNode.stackPrimaryAlignItems === 'CENTER') {
                    let curY = paddingTop + (availH - (childrenHeightSum + totalGap)) / 2;
                    for (const c of flowChildren) {
                        curY += (c.marginTop || 0);
                        if (c.node && c.node.transform) c.node.transform.m12 = Math.round(curY * 10) / 10;
                        curY += (c.height || 0) + (c.marginBottom || 0) + (gap || 0);
                    }
                } else {
                    let curY = paddingTop;
                    for (const c of flowChildren) {
                        curY += (c.marginTop || 0);
                        if (c.node && c.node.transform) c.node.transform.m12 = Math.round(curY * 10) / 10;
                        curY += (c.height || 0) + (c.marginBottom || 0) + (gap || 0);
                    }
                }

                // Pre-compute child X coordinates and cross-axis stretch
                for (const c of flowChildren) {
                    if (c.node && c.node.transform) {
                        if (c.node.stackChildAlignSelf === 'STRETCH') {
                            c.node.transform.m02 = paddingLeft;
                            c.node.size.x = Math.max(10, frameNode.size.x - paddingLeft - paddingRight);
                            c.width = c.node.size.x;
                        } else if (frameNode.stackCounterAlignItems === 'CENTER' || c.node.stackChildAlignSelf === 'CENTER') {
                            const childX = paddingLeft + (frameNode.size.x - paddingLeft - paddingRight - (c.width || 0)) / 2;
                            c.node.transform.m02 = Math.round(childX * 10) / 10;
                        } else if (frameNode.stackCounterAlignItems === 'MAX' || c.node.stackChildAlignSelf === 'MAX') {
                            const childX = frameNode.size.x - paddingRight - (c.width || 0);
                            c.node.transform.m02 = Math.round(childX * 10) / 10;
                        } else {
                            c.node.transform.m02 = paddingLeft + (c.marginLeft || 0);
                        }
                    }
                }
            }
        }

        if (hasHoverRule && options.createVariants !== false) {
            const compSetGuid = guidGen.next();
            const defaultVariantGuid = guidGen.next();
            const hoverVariantGuid = guidGen.next();

            const compSetW = Math.max(100, frameNode.size.x * 2 + 60);
            const compSetH = Math.max(60, frameNode.size.y + 40);

            const compSetNode = {
                guid: compSetGuid,
                phase: 'CREATED',
                parentIndex: { guid: parentCanvasGuid, position: '~' },
                type: 'FRAME',
                name: frameNode.name || 'Component',
                visible: true,
                opacity: 1,
                size: { x: compSetW, y: compSetH },
                transform: { m00: 1, m01: 0, m02: 1140, m10: 0, m11: 1, m12: nextCompSetY },
                isStateGroup: true,
                stackMode: 'HORIZONTAL',
                stackSpacing: 20,
                stackHorizontalPadding: 20,
                stackVerticalPadding: 20,
                stackPaddingRight: 20,
                stackPaddingBottom: 20,
                stackLayoutVersion: 4,
                stackPrimaryAlignItems: 'MIN',
                stackCounterAlignItems: 'CENTER',
                stateGroupPropertyValueOrders: [
                    { property: 'State', values: ['Default', 'Hover'] }
                ]
            };
            nextCompSetY += compSetH + 40;

            const defaultVariant = {
                ...cloneNode(frameNode),
                guid: defaultVariantGuid,
                parentIndex: { guid: compSetGuid, position: '!' },
                type: 'SYMBOL',
                name: 'State=Default',
                transform: { m00: 1, m01: 0, m02: 20, m10: 0, m11: 1, m12: 20 },
                prototypeInteractions: [
                    {
                        id: guidGen.next(),
                        event: { interactionType: 'ON_HOVER' },
                        actions: [
                            {
                                transitionNodeID: hoverVariantGuid,
                                transitionType: 'SMART_ANIMATE',
                                transitionDuration: 0.18,
                                navigationType: 'SWAP_STATE',
                                connectionType: 'INTERNAL_NODE'
                            }
                        ],
                        isDeleted: false,
                        stateManagementVersion: 1
                    }
                ]
            };

            const hoverVariant = {
                ...cloneNode(frameNode),
                guid: hoverVariantGuid,
                parentIndex: { guid: compSetGuid, position: '"' },
                type: 'SYMBOL',
                name: 'State=Hover',
                transform: { m00: 1, m01: 0, m02: frameNode.size.x + 40, m10: 0, m11: 1, m12: 20 },
                prototypeInteractions: undefined
            };

            if (hoverRuleBody) {
                const bgMatch = hoverRuleBody.match(/(?:background-color|background)\s*:\s*([^;!]+)/i);
                if (bgMatch) {
                    const rawBg = bgMatch[1].trim();
                    const resolvedBg = resolveVar(rawBg, element);
                    const parsedBg = parseColor(resolvedBg);
                    if (parsedBg) {
                        const hoverBgVarName = extractVarName(rawBg);
                        const hoverBgVar = (hoverBgVarName && varMap.get(hoverBgVarName)) ||
                            (parsedBg.a === 1 ? colorToVarMap.get(colorToHexKey(parsedBg)) : null);
                        const hoverFill = {
                            type: 'SOLID',
                            color: { r: parsedBg.r, g: parsedBg.g, b: parsedBg.b, a: 1 },
                            opacity: parsedBg.a !== undefined ? parsedBg.a : 1,
                            visible: true,
                            blendMode: 'NORMAL'
                        };
                        const cVar = createColorVar(hoverBgVar);
                        if (cVar) hoverFill.colorVar = cVar;
                        hoverVariant.fillPaints = [hoverFill];
                    }
                }
                const borderMatch = hoverRuleBody.match(/(?:border-color|border)\s*:\s*([^;!]+)/i);
                if (borderMatch) {
                    const rawBorder = borderMatch[1].trim();
                    const resolvedBorder = resolveVar(rawBorder, element);
                    const parsedBorder = parseColor(resolvedBorder);
                    if (parsedBorder) {
                        const hoverBorderVarName = extractVarName(rawBorder);
                        const hoverBorderVar = (hoverBorderVarName && varMap.get(hoverBorderVarName)) ||
                            (parsedBorder.a === 1 ? colorToVarMap.get(colorToHexKey(parsedBorder)) : null);
                        const hoverStroke = {
                            type: 'SOLID',
                            color: { r: parsedBorder.r, g: parsedBorder.g, b: parsedBorder.b, a: 1 },
                            opacity: parsedBorder.a !== undefined ? parsedBorder.a : 1,
                            visible: true,
                            blendMode: 'NORMAL'
                        };
                        const cVar = createColorVar(hoverBorderVar);
                        if (cVar) hoverStroke.colorVar = cVar;
                        hoverVariant.strokePaints = [hoverStroke];
                    }
                }
            }

            for (const c of flowChildren) {
                if (c.node) {
                    const defChild = {
                        ...cloneNode(c.node),
                        guid: guidGen.next(),
                        parentIndex: { guid: defaultVariantGuid, position: c.node.parentIndex?.position || '!' }
                    };
                    const hovChild = {
                        ...cloneNode(c.node),
                        guid: guidGen.next(),
                        parentIndex: { guid: hoverVariantGuid, position: c.node.parentIndex?.position || '!' }
                    };
                    if (hoverRuleBody && c.node.type === 'TEXT') {
                        const colorMatch = hoverRuleBody.match(/(?:^|[^-_])color\s*:\s*([^;!]+)/i);
                        if (colorMatch) {
                            const rawColor = colorMatch[1].trim();
                            const resolvedColor = resolveVar(rawColor, element);
                            const parsedColor = parseColor(resolvedColor);
                            if (parsedColor) {
                                const hoverColorVarName = extractVarName(rawColor);
                                const hoverColorVar = (hoverColorVarName && varMap.get(hoverColorVarName)) ||
                                    (parsedColor.a === 1 ? colorToVarMap.get(colorToHexKey(parsedColor)) : null);
                                const textPaint = {
                                    type: 'SOLID',
                                    color: { r: parsedColor.r, g: parsedColor.g, b: parsedColor.b, a: 1 },
                                    opacity: parsedColor.a !== undefined ? parsedColor.a : 1,
                                    visible: true,
                                    blendMode: 'NORMAL'
                                };
                                const cVar = createColorVar(hoverColorVar);
                                if (cVar) textPaint.colorVar = cVar;
                                hovChild.fillPaints = [textPaint];
                            }
                        }
                    }
                    nodeChanges.push(defChild, hovChild);
                }
            }

            frameNode.type = 'INSTANCE';
            frameNode.symbolData = { symbolID: defaultVariantGuid };
            frameNode.prototypeInteractions = [
                {
                    id: guidGen.next(),
                    event: { interactionType: 'ON_HOVER' },
                    actions: [
                        {
                            transitionNodeID: hoverVariantGuid,
                            transitionType: 'SMART_ANIMATE',
                            transitionDuration: 0.18,
                            navigationType: 'SWAP_STATE',
                            connectionType: 'INTERNAL_NODE'
                        }
                    ],
                    isDeleted: false,
                    stateManagementVersion: 1
                }
            ];
            nodeChanges.push(compSetNode, defaultVariant, hoverVariant);
            stats.frames += 3;
        }

        return { node: frameNode, width: frameNode.size.x, height: frameNode.size.y, isAbsolute, marginTop: marginOffsets.top, marginBottom: marginOffsets.bottom, marginLeft: marginOffsets.left, marginRight: marginOffsets.right };
    }

    // Process root body element
    if (doc.body) {
        const rootPos = FractionalIndexer.getPosition(0);
        await processElement(doc.body, parentCanvasGuid, rootPos, null);
    }

    if (variableChanges.length > 0) {
        nodeChanges.unshift(...variableChanges);
    }

    return {
        nodeChanges,
        imageRegistry,
        stats
    };
}

module.exports = {
    convertHtmlToNodes
};
