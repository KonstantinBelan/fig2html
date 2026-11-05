// src/decompiler/html.js
const { computeNodeStyles, toStyleString, formatColor, parseFontWeightAndStyle, getExtensionForMime } = require('./css');
const { toRem, formatFluidFontSize } = require('./units');
const { StylesheetManager } = require('./stylesheet');
const {
    isVectorNode,
    isVectorContainer,
    collectVectorLeaves,
    extractVectorPath,
    extractVectorPathInfo,
    getVectorStrokeAttributes,
    getVectorFillAttribute
} = require('./vector');

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
                    spanStyles['color'] = stylesheetManager ? stylesheetManager.substituteVar('color', rawColor) : rawColor;
                }
            }

            if (override.fontSize && override.fontSize !== defaultNode.fontSize) {
                const layoutMode = stylesheetManager?.options?.layoutMode || 'default';
                const cw = stylesheetManager?.options?.canvasWidth || 1440;
                if (layoutMode === 'fluid') {
                    spanStyles['font-size'] = formatFluidFontSize(override.fontSize, cw);
                } else if (layoutMode === 'relative') {
                    spanStyles['font-size'] = toRem(override.fontSize);
                } else {
                    spanStyles['font-size'] = `${override.fontSize}px`;
                }
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
    if (!node || node.visible === false || node.mask === true || node.isMask === true) return '';

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

    if ((node.type === 'RECTANGLE' || node.type === 'ROUNDED_RECTANGLE') && hasImageFill && hasNoChildren) {
        const imgPaint = node.fillPaints.find(f => f.type === 'IMAGE' && f.visible !== false);
        const hashHex = imgPaint?.image?.hash ? Buffer.from(imgPaint.image.hash).toString('hex').toLowerCase() : null;
        const imgObj = hashHex ? imageRegistry.get(hashHex) : null;

        if (imgObj) {
            const nodeImgInfo = options.nodeImageMap ? options.nodeImageMap.get(node) : null;
            const imgInfo = nodeImgInfo || imgObj;
            const ext = imgInfo.ext || imgObj.ext || getExtensionForMime(imgInfo.mime || imgObj.mime);
            const prefix = options.assetUrlPrefix || 'img/';
            const mainFile = imgInfo.mainFileName || imgObj.mainFileName || `${hashHex}.${ext}`;
            const imgSrc = options.inlineImages !== false
                ? (imgInfo.mainBase64 || imgObj.base64)
                : `${prefix}${mainFile}`;

            let srcsetAttr = '';
            let sizesAttr = '';

            if (options.responsiveImages !== false && imgInfo.srcset) {
                srcsetAttr = ` srcset="${imgInfo.srcset}"`;
                if (imgInfo.sizes) {
                    sizesAttr = ` sizes="${imgInfo.sizes}"`;
                }
            }

            return `${indent}<img src="${imgSrc}"${srcsetAttr}${sizesAttr} alt="${escapeHtml(nodeName)}"${classAttr}${styleAttr}>\n`;
        }
    }

    // 5. VECTOR CONTAINER (Icon frame or multi-vector group like 1b87bb flattened into single SVG)
    if (isVectorContainer(node)) {
        const leaves = collectVectorLeaves(node);
        if (leaves.length > 0) {
            const w = Math.round((node.size?.x || 24) * 100) / 100;
            const h = Math.round((node.size?.y || 24) * 100) / 100;
            const pathElements = [];

            for (const leaf of leaves) {
                const info = extractVectorPathInfo(leaf.node, options.blobs);
                if (!info.d) continue;

                let fill = getVectorFillAttribute(leaf.node);
                const { stroke, strokeWidth, strokeLinecap, strokeLinejoin } = getVectorStrokeAttributes(leaf.node);

                if (fill === 'none' && stroke === 'none') {
                    fill = 'currentColor';
                }

                const fillVal = stylesheetManager ? stylesheetManager.substituteVar('fill', fill) : fill;
                const strokeVal = stylesheetManager ? stylesheetManager.substituteVar('stroke', stroke) : stroke;

                // Scale factor for normalized vectorNetworkBlob coordinates
                let sx = 1;
                let sy = 1;
                if (info.isNormalized && leaf.node.vectorData?.normalizedSize?.x && leaf.node.size?.x) {
                    sx = leaf.node.size.x / leaf.node.vectorData.normalizedSize.x;
                    sy = (leaf.node.vectorData?.normalizedSize?.y && leaf.node.size?.y)
                        ? (leaf.node.size.y / leaf.node.vectorData.normalizedSize.y)
                        : sx;
                }

                const m = leaf.transform || { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
                // Combined affine transform: M * scale(sx, sy)
                const a = (m.m00 ?? 1) * sx;
                const b = (m.m10 ?? 0) * sx;
                const c = (m.m01 ?? 0) * sy;
                const dVal = (m.m11 ?? 1) * sy;
                const e = m.m02 ?? 0;
                const f = m.m12 ?? 0;

                const r = n => Math.round(n * 1000) / 1000;
                let transformAttr = '';

                if (Math.abs(b) > 0.001 || Math.abs(c) > 0.001) {
                    transformAttr = ` transform="matrix(${r(a)} ${r(b)} ${r(c)} ${r(dVal)} ${r(e)} ${r(f)})"`;
                } else {
                    const hasScale = Math.abs(a - 1) > 0.001 || Math.abs(dVal - 1) > 0.001;
                    const hasTranslate = Math.abs(e) > 0.001 || Math.abs(f) > 0.001;
                    if (hasScale && hasTranslate) {
                        transformAttr = ` transform="translate(${r(e)} ${r(f)}) scale(${r(a)} ${r(dVal)})"`;
                    } else if (hasTranslate) {
                        transformAttr = ` transform="translate(${r(e)} ${r(f)})"`;
                    } else if (hasScale) {
                        transformAttr = ` transform="scale(${r(a)} ${r(dVal)})"`;
                    }
                }

                let pathAttrs = `d="${info.d}" fill="${fillVal}"`;
                if (transformAttr) pathAttrs = `${transformAttr} ${pathAttrs}`;
                if (strokeVal !== 'none') {
                    pathAttrs += ` stroke="${strokeVal}"`;
                    pathAttrs += ` vector-effect="non-scaling-stroke"`;
                }
                if (strokeWidth) pathAttrs += ` stroke-width="${strokeWidth}"`;
                if (strokeLinecap) pathAttrs += ` stroke-linecap="${strokeLinecap}"`;
                if (strokeLinejoin) pathAttrs += ` stroke-linejoin="${strokeLinejoin}"`;

                pathElements.push(`${indent}  <path ${pathAttrs} />`);
            }

            if (pathElements.length > 0) {
                return `${indent}<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg"${classAttr}${styleAttr}>\n${pathElements.join('\n')}\n${indent}</svg>\n`;
            }
        }
    }

    // 6. SINGLE VECTOR / SVG ELEMENT
    if (isVectorNode(node)) {
        const info = extractVectorPathInfo(node, options.blobs);
        if (info.d) {
            const w = Math.round((node.size?.x || 24) * 100) / 100;
            const h = Math.round((node.size?.y || 24) * 100) / 100;
            let fill = getVectorFillAttribute(node);
            const { stroke, strokeWidth, strokeLinecap, strokeLinejoin } = getVectorStrokeAttributes(node);

            if (fill === 'none' && stroke === 'none') {
                fill = 'currentColor';
            }

            const fillVal = stylesheetManager ? stylesheetManager.substituteVar('fill', fill) : fill;
            const strokeVal = stylesheetManager ? stylesheetManager.substituteVar('stroke', stroke) : stroke;

            let transformAttr = '';
            if (info.isNormalized && node.vectorData?.normalizedSize?.x && node.size?.x) {
                const sx = node.size.x / node.vectorData.normalizedSize.x;
                const sy = (node.vectorData?.normalizedSize?.y && node.size?.y)
                    ? (node.size.y / node.vectorData.normalizedSize.y)
                    : sx;
                if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) {
                    const r = n => Math.round(n * 1000) / 1000;
                    transformAttr = ` transform="scale(${r(sx)} ${r(sy)})"`;
                }
            }

            let pathAttrs = `d="${info.d}" fill="${fillVal}"`;
            if (transformAttr) pathAttrs = `${transformAttr} ${pathAttrs}`;
            if (strokeVal !== 'none') {
                pathAttrs += ` stroke="${strokeVal}"`;
                pathAttrs += ` vector-effect="non-scaling-stroke"`;
            }
            if (strokeWidth) pathAttrs += ` stroke-width="${strokeWidth}"`;
            if (strokeLinecap) pathAttrs += ` stroke-linecap="${strokeLinecap}"`;
            if (strokeLinejoin) pathAttrs += ` stroke-linejoin="${strokeLinejoin}"`;

            return `${indent}<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg"${classAttr}${styleAttr}>\n${indent}  <path ${pathAttrs} />\n${indent}</svg>\n`;
        }
    }

    // 6. TEXT ELEMENT
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

    // Register native Figma variables and Design Tokens if provided
    if (options.variables && options.variables.length > 0) {
        stylesheetManager.registerFigmaVariables(options.variables, options.variableSets || []);
    }

    // Pass 1: Walk entire scene tree and register all nodes
    function registerTree(node, parent) {
        if (!node || node.visible === false || node.mask === true || node.isMask === true) return;
        stylesheetManager.registerNode(node, parent, imageRegistry, options);
        stylesheetManager.registerVariants(node, imageRegistry, options);
        if (isVectorContainer(node)) {
            return;
        }
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
        cssContent = `  *, *::before, *::after {\n    box-sizing: border-box;\n    margin: 0;\n    padding: 0;\n  }\n  body {\n    margin: 0;\n    padding: 0;\n    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\n    -webkit-font-smoothing: antialiased;\n    -moz-osx-font-smoothing: grayscale;\n    background-color: ${rootBg};\n    color: #c9d1d9;\n    line-height: 1.5;\n  }\n  button, input, optgroup, select, textarea {\n    font-family: inherit;\n    font-size: 100%;\n    line-height: inherit;\n    color: inherit;\n    margin: 0;\n    padding: 0;\n    border: 0;\n    background: transparent;\n    vertical-align: baseline;\n  }\n  button, [type="button"], [type="reset"], [type="submit"] {\n    -webkit-appearance: button;\n    appearance: button;\n    cursor: pointer;\n    background: transparent;\n    border: none;\n    outline: none;\n  }\n  input, textarea {\n    outline: none;\n    background: transparent;\n    border: none;\n  }\n  h1, h2, h3, h4, h5, h6, p {\n    margin: 0;\n    font-size: inherit;\n    font-weight: inherit;\n  }\n  ul, ol {\n    list-style: none;\n    margin: 0;\n    padding: 0;\n  }\n  img, svg {\n    max-width: 100%;\n    display: block;\n  }\n  a {\n    color: inherit;\n    text-decoration: inherit;\n  }`;
    } else {
        cssContent = stylesheetManager.generateFullStylesheet(rootBg);
    }

    // Pass 2: Render semantic HTML
    let bodyContent = '';
    for (const root of rootNodes) {
        bodyContent += renderNodeToHtml(root, null, imageRegistry, stylesheetManager, options, 2);
    }

    const cssHref = options.cssHref || options.cssFile || 'css/style.css';
    const styleTagOrLink = options.extractCss
        ? `  <link rel="stylesheet" href="${escapeHtml(cssHref)}">\n`
        : `  <style>\n${cssContent}\n  </style>\n`;

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
${googleFontsUrl ? `  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link href="${googleFontsUrl}" rel="stylesheet">\n` : ''}${styleTagOrLink}</head>
<body>
${bodyContent}</body>
</html>
`;

    const tokens = stylesheetManager.exportDesignTokens();

    if (options.extractCss || options.returnCss || options.returnTokens) {
        return {
            html,
            css: cssContent,
            tokens,
            toString() { return this.html; }
        };
    }

    return html;
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
