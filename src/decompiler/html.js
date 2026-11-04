// src/decompiler/html.js
const { computeNodeStyles, toStyleString, formatColor, parseFontWeightAndStyle } = require('./css');
const { StylesheetManager } = require('./stylesheet');

/**
 * Escapes characters for safe HTML attribute and text content rendering
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Checks if a string is a valid CSS class name
 * @param {string} name
 * @returns {boolean}
 */
function isValidClassName(name) {
    if (!name || typeof name !== 'string') return false;
    const clean = name.trim();
    if (!clean) return false;
    // Exclude generic Figma names, text content, or names with special characters
    if (clean.includes('[') || clean.includes('(') || clean.includes('#') || clean.includes('/') || clean.includes('\n') || clean.includes(':') || clean.includes('·')) return false;
    const tokens = clean.split(/\s+/);
    return tokens.length > 0 && tokens.every(token => /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(token));
}

/**
 * Reconstructs Rich Text content from characters, characterStyleIDs and styleOverrideTable
 * @param {object} textData
 * @param {object} defaultNode
 * @param {StylesheetManager} [stylesheetManager=null]
 * @returns {string} HTML string with styled <span> tags where necessary
 */
function renderRichText(textData, defaultNode, stylesheetManager = null) {
    if (!textData || !textData.characters) {
        return '';
    }

    const characters = textData.characters;
    const styleIDs = textData.characterStyleIDs;
    const styleTable = textData.styleOverrideTable;

    // Plain text without overrides
    if (!Array.isArray(styleIDs) || styleIDs.length === 0 || !Array.isArray(styleTable) || styleTable.length === 0) {
        return escapeHtml(characters).replace(/\n/g, '<br>');
    }

    // Map styleID -> style object
    const styleMap = new Map();
    for (const item of styleTable) {
        if (item.styleID !== undefined) {
            styleMap.set(item.styleID, item);
        }
    }

    // Group characters into contiguous runs with identical styleID
    const runs = [];
    let currentID = styleIDs[0] || 0;
    let currentRunChars = characters[0] || '';

    for (let i = 1; i < characters.length; i++) {
        const id = (i < styleIDs.length) ? styleIDs[i] : 0;
        if (id === currentID) {
            currentRunChars += characters[i];
        } else {
            runs.push({ id: currentID, text: currentRunChars });
            currentID = id;
            currentRunChars = characters[i];
        }
    }
    if (currentRunChars.length > 0) {
        runs.push({ id: currentID, text: currentRunChars });
    }

    // Render each run
    const resultParts = [];
    for (const run of runs) {
        const escaped = escapeHtml(run.text).replace(/\n/g, '<br>');
        if (run.id === 0 || !styleMap.has(run.id)) {
            resultParts.push(escaped);
        } else {
            const override = styleMap.get(run.id);
            const spanStyles = {};

            if (override.fillPaints && override.fillPaints.length > 0) {
                const solid = override.fillPaints.find(f => f.type === 'SOLID');
                if (solid) {
                    const rawColor = formatColor(solid.color, solid.opacity);
                    spanStyles['color'] = stylesheetManager ? stylesheetManager.substituteVar(rawColor) : rawColor;
                }
            }

            if (override.fontSize && override.fontSize !== defaultNode.fontSize) {
                spanStyles['font-size'] = `${override.fontSize}px`;
            }

            if (override.fontName) {
                if (override.fontName.family && override.fontName.family !== defaultNode.fontName?.family) {
                    spanStyles['font-family'] = `'${override.fontName.family}', sans-serif`;
                }
                const { fontWeight, fontStyle } = parseFontWeightAndStyle(override.fontName.style);
                const defaultParsed = parseFontWeightAndStyle(defaultNode.fontName?.style);
                if (fontWeight !== defaultParsed.fontWeight) spanStyles['font-weight'] = String(fontWeight);
                if (fontStyle !== defaultParsed.fontStyle) spanStyles['font-style'] = fontStyle;
            }

            if (override.textDecoration === 'UNDERLINE') spanStyles['text-decoration'] = 'underline';
            else if (override.textDecoration === 'STRIKETHROUGH') spanStyles['text-decoration'] = 'line-through';

            const styleStr = toStyleString(spanStyles);
            if (styleStr) {
                resultParts.push(`<span style="${styleStr}">${escaped}</span>`);
            } else {
                resultParts.push(escaped);
            }
        }
    }

    return resultParts.join('');
}

/**
 * Determines appropriate HTML tag for a text node
 * @param {object} node
 * @returns {string} Tag name (h1..h6, p, span)
 */
function determineTextTag(node) {
    const name = (node.name || '').toLowerCase().trim();

    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label', 'blockquote', 'code'].includes(name)) {
        return name;
    }

    const fs = node.fontSize || 16;
    const { fontWeight } = parseFontWeightAndStyle(node.fontName?.style);

    if (fs >= 32 && fontWeight >= 600) return 'h1';
    if (fs >= 24 && fontWeight >= 600) return 'h2';
    if (fs >= 18 && fontWeight >= 600) return 'h3';
    if (fs >= 15 && fontWeight >= 600) return 'h4';

    const text = node.textData?.characters || '';
    if (text.includes('\n') || text.length > 80) {
        return 'p';
    }

    return 'span';
}

/**
 * Determines appropriate HTML tag for a frame or container node
 * @param {object} node
 * @returns {string} Tag name (div, header, nav, section, etc.)
 */
function determineContainerTag(node) {
    const name = (node.name || '').toLowerCase().trim();

    if (['header', 'nav', 'footer', 'section', 'article', 'aside', 'main', 'form'].includes(name)) {
        return name;
    }

    if (name.startsWith('btn') || name === 'button') {
        return 'button';
    }

    return 'div';
}

/**
 * Renders a Figma node and its children into semantic HTML
 * @param {object} node
 * @param {object} parentNode
 * @param {Map<string, object>} imageRegistry
 * @param {StylesheetManager|object} [stylesheetManagerOrOptions={}]
 * @param {object|number} [maybeOptions={}]
 * @param {number} [maybeIndent=2]
 * @returns {string} HTML snippet
 */
function renderNodeToHtml(node, parentNode, imageRegistry, stylesheetManagerOrOptions = {}, maybeOptions = {}, maybeIndent = 2) {
    if (!node || node.visible === false) return '';

    let stylesheetManager = null;
    let options = {};
    let indentLevel = 2;

    if (stylesheetManagerOrOptions && typeof stylesheetManagerOrOptions.getNodeClass === 'function') {
        stylesheetManager = stylesheetManagerOrOptions;
        options = maybeOptions || {};
        if (typeof maybeIndent === 'number') indentLevel = maybeIndent;
    } else {
        options = stylesheetManagerOrOptions || {};
        stylesheetManager = options.stylesheetManager || null;
        if (typeof maybeOptions === 'number') indentLevel = maybeOptions;
    }

    const indent = '  '.repeat(indentLevel);
    const nodeName = node.name || '';
    const assignedClass = stylesheetManager
        ? stylesheetManager.getNodeClass(node)
        : (isValidClassName(nodeName) ? nodeName : '');
    const classAttr = assignedClass ? ` class="${assignedClass}"` : '';

    const styles = (stylesheetManager && stylesheetManager.getNodeStyles(node))
        || computeNodeStyles(node, parentNode, imageRegistry, options);

    const isInline = stylesheetManager ? (options.inlineStyles === true) : (options.inlineStyles !== false);
    const styleStr = toStyleString(styles);
    const styleAttr = isInline && styleStr ? ` style="${styleStr}"` : '';

    // 1. INPUT ELEMENT DETECTION
    if (nodeName.startsWith('Input[') && nodeName.endsWith(']')) {
        const inputType = nodeName.slice('Input['.length, -1).toLowerCase();
        const placeholderNode = (node.children || []).find(c => c.name === 'Placeholder' || c.type === 'TEXT');
        const placeholderText = placeholderNode ? (placeholderNode.textData?.characters || placeholderNode.name || '') : '';
        const phAttr = placeholderText ? ` placeholder="${escapeHtml(placeholderText)}"` : '';

        return `${indent}<input type="${inputType}"${classAttr}${phAttr}${styleAttr}>\n`;
    }

    // 2. CHECKBOX / RADIO DETECTION
    if (nodeName === 'Checkbox' && node.type === 'RECTANGLE' && node.size?.x <= 24) {
        return `${indent}<input type="checkbox"${classAttr}${styleAttr}>\n`;
    }
    if (nodeName === 'Radio' && node.type === 'ELLIPSE' && node.size?.x <= 24) {
        return `${indent}<input type="radio"${classAttr}${styleAttr}>\n`;
    }

    // 3. DIVIDER / HORIZONTAL RULE (<hr>)
    if ((nodeName === 'Divider' || nodeName === 'Line' || nodeName === 'hairline') && node.type === 'RECTANGLE' && (node.size?.y <= 3 || !node.children?.length)) {
        return `${indent}<div${classAttr || ' class="hairline"'}${styleAttr}></div>\n`;
    }

    // 4. IMAGE RECTANGLE (<img />)
    const hasImageFill = Array.isArray(node.fillPaints) && node.fillPaints.some(f => f.type === 'IMAGE' && f.visible !== false);
    const hasNoChildren = !node.children || node.children.length === 0;

    if (node.type === 'RECTANGLE' && hasImageFill && hasNoChildren) {
        const imgPaint = node.fillPaints.find(f => f.type === 'IMAGE' && f.visible !== false);
        const hashHex = imgPaint?.image?.hash ? Buffer.from(imgPaint.image.hash).toString('hex').toLowerCase() : null;
        const imgObj = hashHex ? imageRegistry.get(hashHex) : null;

        if (imgObj) {
            const imgSrc = options.inlineImages !== false
                ? imgObj.base64
                : `${options.assetUrlPrefix || 'images/'}${hashHex}.${imgObj.mime === 'image/jpeg' ? 'jpg' : 'png'}`;

            return `${indent}<img src="${imgSrc}" alt="${escapeHtml(nodeName)}"${classAttr}${styleAttr}>\n`;
        }
    }

    // 5. TEXT ELEMENT
    if (node.type === 'TEXT') {
        const tag = determineTextTag(node);
        const textContent = renderRichText(node.textData || { characters: node.name }, node, stylesheetManager);

        return `${indent}<${tag}${classAttr}${styleAttr}>${textContent}</${tag}>\n`;
    }

    // 6. GENERAL CONTAINER (FRAME / GROUP / COMPONENT / INSTANCE / ELLIPSE)
    const tag = determineContainerTag(node);

    // Self-closing if empty and not a container tag
    if ((!node.children || node.children.length === 0) && tag !== 'div' && tag !== 'button') {
        return `${indent}<${tag}${classAttr}${styleAttr}></${tag}>\n`;
    }

    let innerHtml = '';
    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            innerHtml += renderNodeToHtml(child, node, imageRegistry, stylesheetManager, options, indentLevel + 1);
        }
    }

    if (!innerHtml.trim()) {
        return `${indent}<${tag}${classAttr}${styleAttr}></${tag}>\n`;
    }

    return `${indent}<${tag}${classAttr}${styleAttr}>\n${innerHtml}${indent}</${tag}>\n`;
}

/**
 * Collects all unique font families from the scene tree
 * @param {Array<object>} rootNodes
 * @returns {Set<string>}
 */
function collectFontFamilies(rootNodes) {
    const fonts = new Set();

    function traverse(node) {
        if (!node) return;
        if (node.type === 'TEXT' && node.fontName?.family) {
            fonts.add(node.fontName.family);
        }
        if (node.children) {
            for (const child of node.children) {
                traverse(child);
            }
        }
    }

    for (const r of rootNodes) {
        traverse(r);
    }
    return fonts;
}

/**
 * Generates Google Fonts URL query string for given font families
 * @param {Set<string>} fontFamilies
 * @returns {string|null}
 */
function generateGoogleFontsUrl(fontFamilies) {
    if (!fontFamilies || fontFamilies.size === 0) return null;

    const googleFontCandidates = [
        'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
        'Source Sans Pro', 'Raleway', 'Ubuntu', 'Nunito', 'Playfair Display',
        'Rubik', 'Plus Jakarta Sans', 'Fira Sans', 'Work Sans', 'DM Sans'
    ];

    const familiesToLoad = [];
    for (const fam of fontFamilies) {
        const matched = googleFontCandidates.find(c => c.toLowerCase() === fam.toLowerCase());
        if (matched) {
            familiesToLoad.push(`family=${matched.replace(/\s+/g, '+')}:wght@300;400;500;600;700;800;900`);
        }
    }

    if (familiesToLoad.length === 0) return null;
    return `https://fonts.googleapis.com/css2?${familiesToLoad.join('&')}&display=swap`;
}

/**
 * Generates a full standalone HTML5 document from the root Figma nodes
 * @param {Array<object>} rootNodes
 * @param {Map<string, object>} imageRegistry
 * @param {object} [options={}]
 * @returns {string} Complete HTML document
 */
function generateFullHtmlDocument(rootNodes, imageRegistry, options = {}) {
    const title = options.title || (rootNodes[0]?.name) || 'Exported Figma Design';
    const fontFamilies = collectFontFamilies(rootNodes);
    const googleFontsUrl = generateGoogleFontsUrl(fontFamilies);

    let rootBg = '#0d1117';
    if (rootNodes[0] && Array.isArray(rootNodes[0].fillPaints)) {
        const solid = rootNodes[0].fillPaints.find(f => f.type === 'SOLID' && f.visible !== false);
        if (solid) {
            rootBg = formatColor(solid.color, solid.opacity);
        }
    }

    const stylesheetManager = new StylesheetManager(options);

    // Pass 1: Walk entire scene tree and register all nodes
    function registerTree(node, parent) {
        if (!node || node.visible === false) return;
        stylesheetManager.registerNode(node, parent, imageRegistry, options);
        if (node.children) {
            for (const child of node.children) {
                registerTree(child, node);
            }
        }
    }
    for (const root of rootNodes) {
        registerTree(root, null);
    }

    // Generate CSS rules (classes + :root) or base resets if inlineStyles is requested
    let cssContent = '';
    if (options.inlineStyles) {
        cssContent = `  *, *::before, *::after {\n    box-sizing: border-box;\n  }\n  body {\n    margin: 0;\n    padding: 0;\n    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\n    -webkit-font-smoothing: antialiased;\n    -moz-osx-font-smoothing: grayscale;\n    background-color: ${rootBg};\n    color: #c9d1d9;\n  }\n  img {\n    max-width: 100%;\n    display: block;\n  }`;
    } else {
        cssContent = stylesheetManager.generateFullStylesheet(rootBg);
    }

    // Pass 2: Render semantic HTML
    let bodyContent = '';
    for (const root of rootNodes) {
        bodyContent += renderNodeToHtml(root, null, imageRegistry, stylesheetManager, options, 2);
    }

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
${googleFontsUrl ? `  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link href="${googleFontsUrl}" rel="stylesheet">\n` : ''}  <style>
${cssContent}
  </style>
</head>
<body>
${bodyContent}</body>
</html>
`;
}

module.exports = {
    escapeHtml,
    isValidClassName,
    renderRichText,
    determineTextTag,
    determineContainerTag,
    renderNodeToHtml,
    collectFontFamilies,
    generateGoogleFontsUrl,
    generateFullHtmlDocument
};
