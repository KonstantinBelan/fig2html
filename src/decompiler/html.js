// src/decompiler/html.js
import { computeNodeStyles, toStyleString, formatColor, formatGradient, parseFontWeightAndStyle, getExtensionForMime } from './css/index.js';
import { toRem, formatFluidFontSize } from './units.js';
import { StylesheetManager } from './stylesheet.js';
import {
    isVectorNode,
    isVectorContainer,
    collectVectorLeaves,
    extractVectorPath,
    extractVectorPathInfo,
    getVectorStrokeAttributes,
    getVectorFillAttribute
} from './vector.js';
import {
    resolveNodeTailwindClasses,
    synthesizeNodeResponsiveTailwind,
    mapStylesToTailwind,
    matchColor,
    injectTailwindCdn,
    generateHybridApplyStylesheet,
    extractFigmaVariablesTheme,
    transformHtmlToJsx,
    generateReactComponent,
    generateVueComponent,
    generateSvelteComponent
} from './tailwind/index.js';

/**
 * Escapes characters for safe HTML attribute and text content rendering
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
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
export function isValidClassName(name) {
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
 * @param {object} [options={}]
 * @returns {string} HTML string with styled <span> tags where necessary
 */
export function renderRichText(textData, defaultNode, stylesheetManager = null, options = {}) {
    if (!textData || !textData.characters) {
        return '';
    }

    const characters = textData.characters;
    const styleIDs = textData.characterStyleIDs;
    const styleTable = textData.styleOverrideTable;

    // Plain text without overrides
    if (!Array.isArray(styleIDs) || styleIDs.length === 0 || !Array.isArray(styleTable) || styleTable.length === 0) {
        return escapeHtml(characters).replace(/\n|\u2028/g, '<br>');
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
        const escaped = escapeHtml(run.text).replace(/\n|\u2028/g, '<br>');
        if (run.id === 0 || !styleMap.has(run.id)) {
            resultParts.push(escaped);
        } else {
            const override = styleMap.get(run.id);
            const spanStyles = {};

            if (override.fillPaints && override.fillPaints.length > 0) {
                const visibleOverrideFills = override.fillPaints.filter(f => f.visible !== false);
                const topFill = visibleOverrideFills[visibleOverrideFills.length - 1];
                const topGrad = (topFill && (topFill.type === 'GRADIENT_LINEAR' || topFill.type === 'GRADIENT_RADIAL'))
                    ? topFill
                    : null;
                const solid = (topFill && topFill.type === 'SOLID')
                    ? topFill
                    : [...visibleOverrideFills].reverse().find(f => f.type === 'SOLID');
                if (topGrad) {
                    const gradCss = formatGradient(topGrad);
                    if (gradCss) {
                        spanStyles['background'] = gradCss;
                        spanStyles['-webkit-background-clip'] = 'text';
                        spanStyles['-webkit-text-fill-color'] = 'transparent';
                        spanStyles['background-clip'] = 'text';
                    }
                } else if (solid) {
                    const rawColor = formatColor(solid.color, solid.opacity);
                    const isTwUtility = Boolean(options.tailwind && options.tailwindMode !== 'hybrid');
                    const subColor = (!isTwUtility && stylesheetManager) ? stylesheetManager.substituteVar('color', rawColor) : rawColor;
                    spanStyles['color'] = subColor;
                    const defaultHasGrad = Array.isArray(defaultNode?.fillPaints) && defaultNode.fillPaints.some(f => f.visible !== false && (f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL'));
                    if (defaultHasGrad) {
                        spanStyles['-webkit-text-fill-color'] = subColor;
                    }
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

            if (options.tailwind && options.tailwindMode !== 'hybrid' && Object.keys(spanStyles).length > 0) {
                const { classes: spanTwClasses, remainingStyles: spanRemStyles } = mapStylesToTailwind(spanStyles, options);
                if (spanTwClasses.length > 0) {
                    const classProp = options.framework === 'react' ? 'className' : 'class';
                    const remStyleStr = toStyleString(spanRemStyles);
                    const remStyleAttr = remStyleStr ? ` style="${remStyleStr}"` : '';
                    resultParts.push(`<span ${classProp}="${spanTwClasses.join(' ')}"${remStyleAttr}>${escaped}</span>`);
                    continue;
                }
            }

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
 * Checks if text is a standalone metric, price, percentage, or numeric counter
 * @param {string} text
 * @returns {boolean}
 */
function isPriceOrMetricText(text) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim();
    if (!clean) return false;
    // e.g. "100+", "$99", "4 990 ₽", "99.9%", "01", "12/24", "FREE", "+15%"
    return /^[$€₽£¥]?\s*[-+]?\d+([.,\s]\d+)?\s*([%$€₽£¥+]|\/mo|\/yr|\/мес|\/год|\/день)?$/i.test(clean) ||
           /^\d{1,2}\s*[\/\-.]\s*\d{1,2}(\s*[\/\-.]\s*\d{2,4})?$/.test(clean);
}

/**
 * Checks if a subtree contains readable text
 * @param {object} node
 * @returns {boolean}
 */
function hasTextChild(node) {
    if (!node) return false;
    if (node.type === 'TEXT' && node.textData?.characters?.trim()) return true;
    if (Array.isArray(node.children)) {
        return node.children.some(c => hasTextChild(c));
    }
    return false;
}

const A11Y_I18N = {
    ru: {
        navigation: 'Навигация',
        action: 'Действие',
        close: 'Закрыть',
        menu: 'Меню',
        search: 'Поиск'
    },
    en: {
        navigation: 'Navigation',
        action: 'Action',
        close: 'Close',
        menu: 'Menu',
        search: 'Search'
    }
};

/**
 * Returns localized accessibility string
 * @param {string} key
 * @param {string} [lang='en']
 * @returns {string}
 */
function getAccessibleLabel(key, lang = 'en') {
    const cleanLang = (lang || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en';
    const dict = A11Y_I18N[cleanLang] || A11Y_I18N.en;
    return dict[key] || A11Y_I18N.en[key] || key;
}

/**
 * Automatically detects primary document language from text content (en vs ru)
 * @param {Array<object>|object} rootNodes
 * @param {object} [options={}]
 * @returns {string} ISO language code (e.g. 'en', 'ru')
 */
export function detectDocumentLanguage(rootNodes, options = {}) {
    if (options.lang && typeof options.lang === 'string') {
        return options.lang.toLowerCase().trim();
    }

    let cyrillicCount = 0;
    let latinCount = 0;

    function walk(node) {
        if (!node) return;
        if (node.type === 'TEXT' && node.textData?.characters) {
            const str = node.textData.characters;
            const cyr = str.match(/[\u0400-\u04FF]/g);
            if (cyr) cyrillicCount += cyr.length;
            const lat = str.match(/[a-zA-Z]/g);
            if (lat) latinCount += lat.length;
        }
        if (Array.isArray(node.children)) {
            for (const child of node.children) walk(child);
        }
    }

    if (Array.isArray(rootNodes)) {
        for (const root of rootNodes) walk(root);
    } else if (rootNodes) {
        walk(rootNodes);
    }

    if (cyrillicCount > 0 && (cyrillicCount >= latinCount || cyrillicCount >= 15)) {
        return 'ru';
    }

    return 'en';
}

/**
 * Derives a clean accessibility label for an action button
 * @param {object} node
 * @param {string} [lang='en']
 * @returns {string}
 */
function getButtonAriaLabel(node, lang = 'en') {
    if (!node) return getAccessibleLabel('action', lang);
    const name = (node.name || '').toLowerCase().trim();
    if (name.includes('close') || name.includes('закрыт')) return getAccessibleLabel('close', lang);
    if (name.includes('menu') || name.includes('меню') || name.includes('burger')) return getAccessibleLabel('menu', lang);
    if (name.includes('search') || name.includes('поиск')) return getAccessibleLabel('search', lang);

    const origName = (node.name || '').trim();
    const clean = origName.replace(/[-_]*(btn|button)[-_]*/gi, ' ').trim();
    if (!clean || /^(btn|button|frame|group|vector|rectangle|el)[-_ ]?\d*$/i.test(origName)) {
        return getAccessibleLabel('action', lang);
    }
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Computes accessible alt text and aria attributes for images
 * @param {object} node
 * @param {string} defaultName
 * @returns {string}
 */
function getAccessibleImageAttributes(node, defaultName) {
    if (node.altText !== undefined) {
        return ` alt="${escapeHtml(node.altText)}"`;
    }
    const clean = (defaultName || '').trim();
    const isDecorative = !clean ||
        /^(image|frame|group|rectangle|shape|vector|slice|mask|underlay|bg|background|decor|decoration|pattern|texture|blob|ellipse)[-_ ]?\d*$/i.test(clean) ||
        /^(img[-_ ]?\d+|pic[-_ ]?\d+)$/i.test(clean);
    if (isDecorative) {
        return ' alt="" aria-hidden="true"';
    }
    return ` alt="${escapeHtml(clean)}"`;
}

/**
 * Determines appropriate HTML tag for a text node with heading hierarchy scoring
 * @param {object} node
 * @param {object} [context={}]
 * @returns {string} Tag name (h1..h6, p, span)
 */
export function determineTextTag(node, context = {}) {
    const name = (node.name || '').toLowerCase().trim();

    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label', 'blockquote', 'code'].includes(name)) {
        if (name === 'h1') context.pageH1Assigned = true;
        return name;
    }

    const text = node.textData?.characters || '';
    const cleanText = text.trim();

    // Standalone numbers, prices, or metrics should never be h1/h2 headings
    if (isPriceOrMetricText(cleanText)) {
        return 'span';
    }

    // Name-based hints
    if (name.includes('h1') || name.includes('hero-title') || name.includes('main-title')) {
        context.pageH1Assigned = true;
        return 'h1';
    }
    if (name.includes('h2') || name.includes('section-title') || name.includes('section-heading')) {
        return 'h2';
    }
    if (name.includes('h3') || name.includes('card-title') || name.includes('item-title')) {
        return 'h3';
    }
    if (name.includes('h4') || name.includes('widget-title') || name.includes('subtitle')) {
        return 'h4';
    }

    const fs = node.fontSize || 16;
    const { fontWeight } = parseFontWeightAndStyle(node.fontName?.style);

    // Font size & weight hierarchy: exactly ONE h1 per document, subsequent large titles receive h2
    if (fs >= 32 && fontWeight >= 600) {
        if (!context.pageH1Assigned) {
            context.pageH1Assigned = true;
            return 'h1';
        }
        return 'h2';
    }
    if (fs >= 24 && fontWeight >= 500) return 'h2';
    if (fs >= 18 && fontWeight >= 500) return 'h3';
    if (fs >= 15 && fontWeight >= 600) return 'h4';

    if (cleanText.includes('\n') || cleanText.length > 80) {
        return 'p';
    }

    return 'span';
}

/**
 * Determines appropriate HTML tag for a frame or container node
 * @param {object} node
 * @param {object} [parentNode=null]
 * @param {object} [options={}]
 * @returns {string} Tag name (div, header, nav, section, article, main, form, button, a)
 */
export function determineContainerTag(node, parentNode = null, options = {}) {
    const name = (node.name || '').toLowerCase().trim();

    // 1. Exact semantic tag names
    if (['header', 'nav', 'footer', 'section', 'article', 'aside', 'main', 'form'].includes(name)) {
        return name;
    }

    // 2. Button checks
    if (/^(btn|button)([-_ ]|$)/i.test(name) || /[-_ ](btn|button)$/i.test(name)) {
        return 'button';
    }

    // 3. Link checks
    if (/^(link|nav[-_ ]?link|url|btn[-_ ]?link)([-_ ]|$)/i.test(name) || /[-_ ]link$/i.test(name)) {
        return 'a';
    }

    // 4. Header patterns
    if (/^(header|top[-_ ]?bar|navbar|nav[-_ ]?bar|app[-_ ]?bar)($|[-_ ])/i.test(name)) {
        return 'header';
    }

    // 5. Footer patterns
    if (/^(footer|bottom[-_ ]?bar)($|[-_ ])/i.test(name)) {
        return 'footer';
    }

    // 6. Navigation patterns
    if (/^(nav|navigation|nav[-_ ]?links?|nav[-_ ]?menu|menu[-_ ]?links?)($|[-_ ])/i.test(name)) {
        return 'nav';
    }

    // 7. Form patterns
    if (/^(form|contact[-_ ]?form|subscribe[-_ ]?form|feedback[-_ ]?form|search[-_ ]?form|login[-_ ]?form|signup[-_ ]?form)$/i.test(name)) {
        return 'form';
    }

    // 8. Main content patterns
    if (/^(main|main[-_ ]?content|content[-_ ]?wrapper|page[-_ ]?body)$/i.test(name)) {
        return 'main';
    }

    // 9. Named section patterns
    const isSectionName = name.includes('section') ||
        /^(hero|features?|pricing|testimonials?|reviews?|faq|cta|call[-_ ]?to[-_ ]?action|about|about[-_ ]?us|contact|contact[-_ ]?us|services?|portfolio|gallery|team|partners?|clients?|stats|how[-_ ]?it[-_ ]?works|benefits?|advantages?|catalog|products?)([-_ ]|$)/i.test(name);
    if (isSectionName && Array.isArray(node.children) && node.children.length > 0) {
        return 'section';
    }

    // 10. Structural/positional heuristics for direct root children
    const isDirectChildOfRoot = Boolean(parentNode && parentNode.isRoot === true);
    if (isDirectChildOfRoot && Array.isArray(node.children) && node.children.length > 0) {
        const y = node.y !== undefined ? node.y : (node.transform?.m12 ?? 0);
        const height = node.size?.y || 0;

        // Topmost bar < 180px height
        if (y <= 30 && height > 0 && height <= 180 && !options.hasRootHeader) {
            options.hasRootHeader = true;
            return 'header';
        }

        // Bottom bar
        const pageHeight = parentNode.size?.y || 0;
        if (pageHeight > 0 && (y + height >= pageHeight - 60) && height >= 60 && !options.hasRootFooter) {
            options.hasRootFooter = true;
            return 'footer';
        }

        // Other major top-level blocks
        if (height >= 120) {
            return 'section';
        }
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
export function renderNodeToHtml(node, parentNode, imageRegistry, stylesheetManagerOrOptions = {}, maybeOptions = {}, maybeIndent = 2) {
    if (!node || node.visible === false || node.mask === true || node.isMask === true) return '';

    if (!parentNode) {
        node.isRoot = true;
    }

    let stylesheetManager = null;
    let options = {};
    let indentLevel = 2;

    if (stylesheetManagerOrOptions && typeof stylesheetManagerOrOptions.getNodeClass === 'function') {
        stylesheetManager = stylesheetManagerOrOptions;
        options = (maybeOptions && typeof maybeOptions === 'object') ? maybeOptions : {};
        if (typeof maybeIndent === 'number') indentLevel = maybeIndent;
    } else if (maybeOptions && typeof maybeOptions === 'object' && !Array.isArray(maybeOptions)) {
        options = { ...(stylesheetManagerOrOptions || {}), ...maybeOptions };
        stylesheetManager = options.stylesheetManager || null;
        if (typeof maybeIndent === 'number') indentLevel = maybeIndent;
    } else {
        options = stylesheetManagerOrOptions || {};
        stylesheetManager = options.stylesheetManager || null;
        if (typeof maybeOptions === 'number') indentLevel = maybeOptions;
    }

    const indent = '  '.repeat(indentLevel);
    const nodeName = node.name || '';
    const isTailwind = Boolean(options.tailwind);
    const isHybrid = options.tailwindMode === 'hybrid';
    const isReact = options.framework === 'react';
    const classProp = isReact ? 'className' : 'class';

    let assignedClass = stylesheetManager
        ? stylesheetManager.getNodeClass(node)
        : (isValidClassName(nodeName) ? nodeName : '');

    const styles = (stylesheetManager && stylesheetManager.getNodeStyles(node))
        || computeNodeStyles(node, parentNode, imageRegistry, options);

    let twClassString = '';
    let remainingStyles = styles;

    if (isTailwind && !isHybrid) {
        const twOptions = (options.extractCss || options.inlineStyles)
            ? options
            : { ...options, cssAssetUrlPrefix: options.assetUrlPrefix || 'img/' };

        if (options.pageBreakpoints && options.pageBreakpoints.length > 1) {
            const twResult = synthesizeNodeResponsiveTailwind(node, options.pageBreakpoints, imageRegistry, twOptions, parentNode);
            twClassString = twResult.classString;
            remainingStyles = twResult.remainingStyles || {};
        } else {
            const twResult = resolveNodeTailwindClasses(node, parentNode, imageRegistry, twOptions);
            twClassString = twResult.classString;
            remainingStyles = twResult.remainingStyles || {};
        }
    }

    const finalClass = isTailwind && !isHybrid
        ? (options.keepSemanticClasses && assignedClass ? `${assignedClass} ${twClassString}`.trim() : (twClassString || assignedClass))
        : assignedClass;

    const classAttr = finalClass ? ` ${classProp}="${escapeHtml(finalClass)}"` : '';

    const isInline = isTailwind && !isHybrid
        ? (options.inlineStyles === true || Object.keys(remainingStyles).length > 0)
        : (stylesheetManager ? (options.inlineStyles === true) : (options.inlineStyles !== false));

    const stylesToRender = (isTailwind && !isHybrid) ? remainingStyles : styles;
    const styleStr = toStyleString(stylesToRender);
    const styleAttr = isInline && styleStr ? ` style="${styleStr}"` : '';

    // 1. INPUT ELEMENT DETECTION
    if (nodeName.startsWith('Input[') && nodeName.endsWith(']')) {
        const inputType = nodeName.slice('Input['.length, -1).toLowerCase();
        const placeholderNode = (node.children || []).find(c => c.name === 'Placeholder' || c.type === 'TEXT');
        const placeholderText = placeholderNode ? (placeholderNode.textData?.characters || placeholderNode.name || '') : '';
        const phAttr = placeholderText ? ` placeholder="${escapeHtml(placeholderText)}"` : '';

        return `${indent}<input type="${inputType}"${classAttr}${phAttr}${styleAttr} />\n`;
    }

    // 2. CHECKBOX / RADIO DETECTION
    if (nodeName === 'Checkbox' && node.type === 'RECTANGLE' && node.size?.x <= 24) {
        return `${indent}<input type="checkbox"${classAttr}${styleAttr} />\n`;
    }
    if (nodeName === 'Radio' && node.type === 'ELLIPSE' && node.size?.x <= 24) {
        return `${indent}<input type="radio"${classAttr}${styleAttr} />\n`;
    }

    // 3. DIVIDER / HORIZONTAL RULE (<hr>)
    if ((nodeName === 'Divider' || nodeName === 'Line' || nodeName === 'hairline') && node.type === 'RECTANGLE' && (node.size?.y <= 3 || !node.children?.length)) {
        return `${indent}<div${classAttr || ` ${classProp}="hairline"`}${styleAttr}></div>\n`;
    }

    // 4. IMAGE RECTANGLE (<img />)
    const hasImageFill = Array.isArray(node.fillPaints) && node.fillPaints.some(f => f.type === 'IMAGE' && f.visible !== false);
    const hasNoChildren = !node.children || node.children.length === 0;

    if ((node.type === 'RECTANGLE' || node.type === 'ROUNDED_RECTANGLE' || node.isCollapsedGraphicRoot) && hasImageFill && hasNoChildren) {
        const imgPaint = node.fillPaints.find(f => f.type === 'IMAGE' && f.visible !== false);
        const hashHex = imgPaint?.image?.hash
            ? (typeof imgPaint.image.hash === 'string' ? imgPaint.image.hash.toLowerCase() : Buffer.from(imgPaint.image.hash).toString('hex').toLowerCase())
            : null;
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

            const imgAttrs = getAccessibleImageAttributes(node, nodeName);
            return `${indent}<img src="${imgSrc}"${srcsetAttr}${sizesAttr}${imgAttrs}${classAttr}${styleAttr} />\n`;
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

                const fillVal = (!isTailwind || isHybrid) && stylesheetManager ? stylesheetManager.substituteVar('fill', fill) : fill;
                const strokeVal = (!isTailwind || isHybrid) && stylesheetManager ? stylesheetManager.substituteVar('stroke', stroke) : stroke;

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
                if (info.fillRule === 'evenodd') {
                    pathAttrs += ` fill-rule="evenodd" clip-rule="evenodd"`;
                }
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
                return `${indent}<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"${classAttr}${styleAttr}>\n${pathElements.join('\n')}\n${indent}</svg>\n`;
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
            if (info.fillRule === 'evenodd') {
                pathAttrs += ` fill-rule="evenodd" clip-rule="evenodd"`;
            }
            if (transformAttr) pathAttrs = `${transformAttr} ${pathAttrs}`;
            if (strokeVal !== 'none') {
                pathAttrs += ` stroke="${strokeVal}"`;
                pathAttrs += ` vector-effect="non-scaling-stroke"`;
            }
            if (strokeWidth) pathAttrs += ` stroke-width="${strokeWidth}"`;
            if (strokeLinecap) pathAttrs += ` stroke-linecap="${strokeLinecap}"`;
            if (strokeLinejoin) pathAttrs += ` stroke-linejoin="${strokeLinejoin}"`;

            return `${indent}<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"${classAttr}${styleAttr}>\n${indent}  <path ${pathAttrs} />\n${indent}</svg>\n`;
        }
    }

    // 6. TEXT ELEMENT
    if (node.type === 'TEXT') {
        const lines = node.textData?.lines;
        const isOrderedList = Array.isArray(lines) && lines.length > 0 && lines.every(l => l.lineType === 'ORDERED_LIST');
        const isUnorderedList = Array.isArray(lines) && lines.length > 0 && lines.every(l => l.lineType === 'UNORDERED_LIST');
        if ((isOrderedList || isUnorderedList) && node.textData?.characters) {
            const listTag = isOrderedList ? 'ol' : 'ul';
            const items = node.textData.characters.split('\n');
            const liHtml = items.map(item => `${indent}  <li>${escapeHtml(item).replace(/\u2028/g, '<br>')}</li>`).join('\n');
            return `${indent}<${listTag}${classAttr}${styleAttr}>\n${liHtml}\n${indent}</${listTag}>\n`;
        }

        const tag = determineTextTag(node, options.headingContext);
        const textContent = renderRichText(node.textData || { characters: node.name }, node, stylesheetManager, options);

        return `${indent}<${tag}${classAttr}${styleAttr}>${textContent}</${tag}>\n`;
    }

    // 6. GENERAL CONTAINER (FRAME / GROUP / COMPONENT / INSTANCE / ELLIPSE)
    const tag = determineContainerTag(node, parentNode, options);
    const docLang = options.lang || (node ? detectDocumentLanguage(node, options) : 'en');
    let extraAttrs = '';
    if (tag === 'button') {
        extraAttrs += ' type="button"';
        if (!hasTextChild(node)) {
            extraAttrs += ` aria-label="${escapeHtml(getButtonAriaLabel(node, docLang))}"`;
        }
    } else if (tag === 'a') {
        extraAttrs += ' href="#"';
    } else if (tag === 'nav') {
        extraAttrs += ` aria-label="${escapeHtml(getAccessibleLabel('navigation', docLang))}"`;
    }

    // Self-closing if empty and not a container tag
    if ((!node.children || node.children.length === 0) && tag !== 'div' && tag !== 'button') {
        return `${indent}<${tag}${extraAttrs}${classAttr}${styleAttr}></${tag}>\n`;
    }

    let innerHtml = '';
    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            innerHtml += renderNodeToHtml(child, node, imageRegistry, stylesheetManager, options, indentLevel + 1);
        }
    }

    if (!innerHtml.trim()) {
        return `${indent}<${tag}${extraAttrs}${classAttr}${styleAttr}></${tag}>\n`;
    }

    return `${indent}<${tag}${extraAttrs}${classAttr}${styleAttr}>\n${innerHtml}${indent}</${tag}>\n`;
}

/**
 * Collects all unique font families from the scene tree
 * @param {Array<object>} rootNodes
 * @returns {Set<string>}
 */
export function collectFontFamilies(rootNodes) {
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
export function generateGoogleFontsUrl(fontFamilies) {
    if (!fontFamilies || fontFamilies.size === 0) return null;

    const googleFontCandidates = [
        'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
        'Source Sans Pro', 'Raleway', 'Ubuntu', 'Nunito', 'Playfair Display',
        'Rubik', 'Plus Jakarta Sans', 'Fira Sans', 'Work Sans', 'DM Sans',
        'Jura', 'Bahianita', 'Manrope', 'Outfit', 'Oswald', 'PT Sans',
        'Noto Sans', 'Space Grotesk', 'Unbounded', 'Golos Text', 'Onest'
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
export function generateFullHtmlDocument(rootNodes, imageRegistry, options = {}) {
    for (const root of rootNodes) {
        if (root) root.isRoot = true;
    }
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

    const stylesheetManager = options.stylesheetManager || new StylesheetManager(options);
    if (options.pageSlug) {
        stylesheetManager.setPageContext(options.pageSlug, title);
    }

    // Register native Figma variables and Design Tokens if provided
    if (options.variables && options.variables.length > 0 && !options.skipRegisterVariables) {
        stylesheetManager.registerFigmaVariables(options.variables, options.variableSets || []);
    }

    // Pass 1: Walk entire scene tree and register all nodes
    function registerTree(node, parent, isRoot = false) {
        if (!node || node.visible === false) return;
        if (node.mask === true || node.isMask === true) {
            if (Array.isArray(node.fillPaints) && node.fillPaints.some(f => f.type === 'IMAGE' && f.image?.hash)) {
                stylesheetManager.registerNode(node, parent, imageRegistry, { ...options, isRoot });
            }
            return;
        }
        stylesheetManager.registerNode(node, parent, imageRegistry, { ...options, isRoot });
        stylesheetManager.registerVariants(node, imageRegistry, options);
        if (isVectorContainer(node)) {
            return;
        }
        if (node.children) {
            for (const child of node.children) {
                registerTree(child, node, false);
            }
        }
    }
    if (!options.skipRegisterTree) {
        for (const root of rootNodes) {
            registerTree(root, null, true);
        }
    }

    // Generate CSS rules (classes + :root) or base resets if inlineStyles is requested
    let cssContent = options.cssContent || '';
    if (!cssContent) {
        if (options.tailwind && options.tailwindMode === 'hybrid') {
            cssContent = generateHybridApplyStylesheet(stylesheetManager.uniqueRules, options);
        } else if (options.tailwind) {
            cssContent = '';
        } else if (options.inlineStyles) {
            cssContent = `  *, *::before, *::after {\n    box-sizing: border-box;\n    margin: 0;\n    padding: 0;\n  }\n  body {\n    margin: 0;\n    padding: 0;\n    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\n    -webkit-font-smoothing: antialiased;\n    -moz-osx-font-smoothing: grayscale;\n    background-color: ${rootBg};\n    color: #c9d1d9;\n    line-height: 1.5;\n  }\n  button, input, optgroup, select, textarea {\n    font-family: inherit;\n    font-size: 100%;\n    line-height: inherit;\n    color: inherit;\n    margin: 0;\n    padding: 0;\n    border: 0;\n    background: transparent;\n    vertical-align: baseline;\n  }\n  button, [type="button"], [type="reset"], [type="submit"] {\n    -webkit-appearance: button;\n    appearance: button;\n    cursor: pointer;\n    background: transparent;\n    border: none;\n    outline: none;\n  }\n  input, textarea {\n    outline: none;\n    background: transparent;\n    border: none;\n  }\n  h1, h2, h3, h4, h5, h6, p {\n    margin: 0;\n    font-size: inherit;\n    font-weight: inherit;\n  }\n  ul, ol {\n    list-style: none;\n    margin: 0;\n    padding: 0;\n  }\n  img, svg {\n    max-width: 100%;\n    display: block;\n  }\n  a {\n    color: inherit;\n    text-decoration: inherit;\n  }\n  :focus-visible {\n    outline: 2px solid currentColor;\n    outline-offset: 2px;\n  }`;
        } else {
            cssContent = stylesheetManager.generateFullStylesheet(rootBg);
        }
    }

    // Pass 2: Render semantic HTML
    const docLang = options.lang || detectDocumentLanguage(rootNodes, options);
    options.lang = docLang;
    options.headingContext = options.headingContext || { pageH1Assigned: false };
    let bodyContent = '';
    for (const root of rootNodes) {
        if (root.isStateGroup) continue;
        bodyContent += renderNodeToHtml(root, null, imageRegistry, stylesheetManager, options, 2);
    }

    const cssHref = options.cssHref || options.cssFile || 'css/style.css';
    const isTwUtility = Boolean(options.tailwind && options.tailwindMode !== 'hybrid');
    let styleTagOrLink = '';
    if (cssContent.trim()) {
        styleTagOrLink = options.extractCss
            ? `  <link rel="stylesheet" href="${escapeHtml(cssHref)}">\n`
            : `  <style>\n${cssContent}\n  </style>\n`;
    } else if (options.extractCss && !isTwUtility) {
        styleTagOrLink = `  <link rel="stylesheet" href="${escapeHtml(cssHref)}">\n`;
    }

    let bodyClass = options.pageSlug ? `page-${options.pageSlug}` : (options.bodyClass || '');
    if (isTwUtility && rootBg) {
        const bgMatch = matchColor(rootBg, options);
        if (bgMatch && bgMatch.classSuffix && bgMatch.classSuffix !== 'transparent') {
            bodyClass = `${bodyClass} bg-${bgMatch.classSuffix} m-0 p-0 antialiased`.trim();
        }
    }
    const bodyClassAttr = bodyClass ? ` class="${escapeHtml(bodyClass)}"` : '';

    let html = `<!DOCTYPE html>
<html lang="${escapeHtml(docLang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
${googleFontsUrl ? `  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link href="${googleFontsUrl}" rel="stylesheet">\n` : ''}${styleTagOrLink}</head>
<body${bodyClassAttr}>
${bodyContent}</body>
</html>
`;

    // Inject Tailwind Play CDN if requested and not in scaffold mode
    if (options.tailwind && options.tailwindCdn !== false && !options.scaffold) {
        const themeData = extractFigmaVariablesTheme(options.variables || [], options.variableSets || []);
        if (fontFamilies && fontFamilies.size > 0) {
            themeData.fontFamily = themeData.fontFamily || themeData.fonts || {};
            const sansFonts = [];
            const monoFonts = [];
            const serifFonts = [];
            for (const fam of fontFamilies) {
                const clean = fam.toLowerCase();
                if (clean.includes('mono') || clean.includes('code') || clean.includes('consolas') || clean.includes('menlo')) {
                    monoFonts.push(fam);
                } else if (clean.includes('serif') || clean.includes('georgia') || clean.includes('times') || clean.includes('garamond') || clean.includes('merriweather') || clean.includes('playfair') || clean.includes('lora')) {
                    serifFonts.push(fam);
                } else {
                    sansFonts.push(fam);
                }
            }
            if (sansFonts.length > 0) {
                const primarySans = sansFonts[0];
                themeData.fontFamily.sans = [primarySans, 'sans-serif'];
                themeData.fontFamily.display = [primarySans, 'sans-serif'];
            }
            if (monoFonts.length > 0) {
                themeData.fontFamily.mono = [monoFonts[0], 'monospace'];
            }
            if (serifFonts.length > 0) {
                themeData.fontFamily.serif = [serifFonts[0], 'serif'];
            }
        }
        html = injectTailwindCdn(html, themeData);
    }

    // Component framework transformation if requested
    let componentCode = null;
    const componentName = options.componentName || (rootNodes[0]?.name ? rootNodes[0].name.replace(/[^a-zA-Z0-9_]/g, '') : 'FigmaComponent') || 'FigmaComponent';
    if (options.framework === 'react') {
        componentCode = generateReactComponent(bodyContent.trim(), componentName, { typescript: options.typescript !== false });
    } else if (options.framework === 'vue') {
        componentCode = generateVueComponent(bodyContent.trim(), componentName);
    } else if (options.framework === 'svelte') {
        componentCode = generateSvelteComponent(bodyContent.trim(), componentName);
    }

    const tokens = stylesheetManager.exportDesignTokens();

    if (options.extractCss || options.returnCss || options.returnTokens || options.framework) {
        return {
            html,
            css: cssContent,
            tokens,
            componentCode,
            framework: options.framework || 'html',
            toString() { return this.html; }
        };
    }

    return html;
}
