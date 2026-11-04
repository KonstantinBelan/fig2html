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
    estimateTextDimensions
} = require('./parsers/typography');
const { ImageRegistry } = require('./parsers/images');
const { serializeSvgElement, getSvgDimensions, renderSvgToPng } = require('./parsers/svg');

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
    if (element.children.length === 0) return false;
    const inlineTags = ['b', 'strong', 'i', 'em', 'u', 's', 'del', 'span', 'a', 'small', 'mark', 'code'];
    for (const child of element.children) {
        if (!inlineTags.includes(child.tagName.toLowerCase())) {
            return false;
        }
    }
    return true;
}

/**
 * Extracts rich text with character-level style overrides
 */
function extractRichText(element, win, defaultStyles) {
    let fullText = '';
    const charStyles = [];
    const styleOverrideTable = [];
    const styleMap = new Map();
    let nextStyleId = 1;

    function traverse(node, currentStyle) {
        if (node.nodeType === 3) { // TEXT_NODE
            const text = node.textContent;
            if (!text) return;
            for (let i = 0; i < text.length; i++) {
                fullText += text[i];
                charStyles.push(currentStyle.styleId || 0);
            }
        } else if (node.nodeType === 1) { // ELEMENT_NODE
            const computed = win.getComputedStyle(node);
            const inline = node.style;
            const getProp = (p, c) => inline[c] || inline.getPropertyValue(p) || computed[c] || computed.getPropertyValue(p);

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
                        override.fillPaints = [{
                            type: 'SOLID',
                            color: colorParsed,
                            opacity: colorParsed.a,
                            visible: true,
                            blendMode: 'NORMAL'
                        }];
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

    return {
        characters: fullText.trim(),
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

    const nodeChanges = [];
    const stats = {
        totalNodes: 0,
        frames: 0,
        textNodes: 0,
        images: 0,
        shapes: 0
    };

    async function processElement(element, parentGuid, orderPosition = '!', parentContext = null) {
        // Skip metadata / script / template elements
        if (['SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TEMPLATE', 'NOSCRIPT', 'TITLE'].includes(element.tagName)) {
            return;
        }

        const tagName = element.tagName.toLowerCase();
        const inline = element.style;
        const computed = win.getComputedStyle(element);

        const getProp = (...props) => {
            for (const p of props) {
                const raw = inline[p] || inline.getPropertyValue(p) || computed[p] || computed.getPropertyValue(p);
                if (raw !== undefined && raw !== null && raw !== '') {
                    return resolveVar(raw, element);
                }
            }
            return '';
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
        const hasExplicitHeight = height > 0 && !isHeightPercent;

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

        const flexGrow = parseFloat(getProp('flex-grow', 'flexGrow')) || 0;
        const alignSelf = getProp('align-self', 'alignSelf');

        // Margin check for centering (margin: auto or margin: 0 auto)
        const marginStr = getProp('margin', 'margin');
        const mlStr = getProp('margin-left', 'marginLeft');
        const mrStr = getProp('margin-right', 'marginRight');
        const isMarginAuto = marginStr.includes('auto') || (mlStr === 'auto' && mrStr === 'auto');

        // Inherited styles
        const inheritedStyles = {
            fontFamily: getProp('font-family', 'fontFamily') || (parentContext?.inherited?.fontFamily) || 'Inter',
            color: getProp('color', 'color') || (parentContext?.inherited?.color) || '#000000',
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
                        fills.push({
                            type: 'SOLID',
                            color: col,
                            opacity: col.a,
                            visible: true,
                            blendMode: 'NORMAL'
                        });
                    }
                }
            }
        }

        if (bgColor) {
            const parsedBgColor = parseColor(bgColor);
            if (parsedBgColor && parsedBgColor.a > 0 && !fills.some(f => f.type === 'SOLID')) {
                fills.push({
                    type: 'SOLID',
                    color: parsedBgColor,
                    opacity: parsedBgColor.a,
                    visible: true,
                    blendMode: 'NORMAL'
                });
            }
        }

        // Border & Strokes
        const strokePaints = [];
        const borderWidth = parseFloat(getProp('border-width', 'borderWidth')) || 0;
        const borderStyle = getProp('border-style', 'borderStyle');
        const borderColor = getProp('border-color', 'borderColor');
        const parsedBorderColor = parseColor(borderColor);

        if (borderWidth > 0 && borderStyle !== 'none' && parsedBorderColor && parsedBorderColor.a > 0) {
            strokePaints.push({
                type: 'SOLID',
                color: parsedBorderColor,
                opacity: parsedBorderColor.a,
                visible: true,
                blendMode: 'NORMAL'
            });
        }

        // Individual borders
        const borderTopW = parseFloat(getProp('border-top-width', 'borderTopWidth')) || borderWidth;
        const borderBottomW = parseFloat(getProp('border-bottom-width', 'borderBottomWidth')) || borderWidth;
        const borderLeftW = parseFloat(getProp('border-left-width', 'borderLeftWidth')) || borderWidth;
        const borderRightW = parseFloat(getProp('border-right-width', 'borderRightWidth')) || borderWidth;

        const hasIndependentBorders =
            borderTopW !== borderBottomW || borderLeftW !== borderRightW || borderTopW !== borderLeftW;

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
            const alt = element.getAttribute('alt') || 'Image';
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
            }

            nodeChanges.push(imgNode);
            return { node: imgNode, width: imgWidth, height: imgHeight, isAbsolute };
        }

        // -------------------------------------------------------------
        // 2. SVG ELEMENT (<svg>)
        // -------------------------------------------------------------
        if (tagName === 'svg') {
            const dims = getSvgDimensions(element, win);
            if (dims.isSpriteDef || (dims.width === 0 && dims.height === 0)) {
                return null;
            }
            const svgWidth = width || dims.width;
            const svgHeight = height || dims.height;

            const iconColor = getProp('color', 'color') || inheritedStyles.color || '#000000';
            const svgXml = serializeSvgElement(element, iconColor, svgWidth, svgHeight);
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
            }

            nodeChanges.push(svgNode);
            return { node: svgNode, width: svgWidth, height: svgHeight, isAbsolute };
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

            nodeChanges.push(hrNode);
            return { node: hrNode, width: hrWidth, height: hrThickness, isAbsolute };
        }

        // -------------------------------------------------------------
        // 4. TEXT ELEMENTS
        // -------------------------------------------------------------
        const isTextTag = ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'label', 'strong', 'b', 'em', 'i', 'small', 'code', 'pre', 'blockquote'].includes(tagName);
        const hasNoChildren = element.children.length === 0;
        const textContent = element.textContent.trim();
        const hasRichChildren = isRichTextContainer(element);

        if ((isTextTag && hasNoChildren && textContent.length > 0) || (hasRichChildren && !fills.length && borderWidth === 0)) {
            const textColor = parseColor(inheritedStyles.color) || { r: 0.1, g: 0.1, b: 0.1, a: 1.0 };
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
                });
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

            let targetWidth = width > 0 ? width : (parentContext ? parentContext.width : 0);
            if (maxWidthProp && !isNaN(maxWidthProp) && maxWidthProp > 0) {
                targetWidth = Math.min(targetWidth, maxWidthProp);
            }

            const charWidth = fontSize * 0.58;
            const isMultiLine = isParagraph || (targetWidth > 0 && (displayCharacters.length * charWidth) > targetWidth);

            const textGeom = estimateTextDimensions(
                displayCharacters,
                fontSize,
                isMultiLine ? targetWidth : width,
                isMultiLine
            );

            stats.textNodes++;
            stats.totalNodes++;

            const textNode = {
                guid: currentGuid,
                phase: 'CREATED',
                parentIndex: { guid: parentGuid, position: orderPosition },
                type: 'TEXT',
                name: displayCharacters.slice(0, 32) || 'Text',
                visible: isVisible,
                opacity: opacity,
                blendMode: blendMode,
                transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
                size: { x: textGeom.width, y: textGeom.height },
                fillPaints: [{
                    type: 'SOLID',
                    color: textColor,
                    opacity: textColor.a,
                    visible: true,
                    blendMode: 'NORMAL'
                }],
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

            if (isAbsolute) {
                textNode.stackPositioning = 'ABSOLUTE';
                textNode.transform = { m00: 1, m01: 0, m02: posX, m10: 0, m11: 1, m12: posY };
            } else if (parentContext && parentContext.isFlex) {
                if (flexGrow > 0) textNode.stackChildPrimaryGrow = 1.0;
                if (alignSelf === 'stretch' || (parentContext.isColumn && isParagraph)) {
                    textNode.stackChildAlignSelf = 'STRETCH';
                } else if (alignSelf === 'center') {
                    textNode.stackChildAlignSelf = 'CENTER';
                }
            }

            nodeChanges.push(textNode);
            return { node: textNode, width: textGeom.width, height: textGeom.height, isAbsolute };
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
                stackPadding: 10,
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
            return { node: inputFrame, width: inputW, height: inputH, isAbsolute };
        }

        // -------------------------------------------------------------
        // 6. GENERAL CONTAINER (FRAME / Auto Layout / Circle)
        // -------------------------------------------------------------
        const isFlex = display === 'flex' || display === 'inline-flex';
        const flexDirection = getProp('flex-direction', 'flexDirection');
        const isColumn = isFlex ? (flexDirection === 'column' || flexDirection === 'column-reverse') : true;

        const paddingTop = parseFloat(getProp('padding-top', 'paddingTop')) || 0;
        const paddingRight = parseFloat(getProp('padding-right', 'paddingRight')) || 0;
        const paddingBottom = parseFloat(getProp('padding-bottom', 'paddingBottom')) || 0;
        const paddingLeft = parseFloat(getProp('padding-left', 'paddingLeft')) || 0;
        const gap = parseFloat(getProp('gap', 'gap')) || parseFloat(getProp('row-gap', 'rowGap')) || 0;

        // Determine frame width
        let frameWidth = width;
        if (tagName === 'body') {
            frameWidth = width || 1440;
        } else if (!frameWidth || frameWidth === 0) {
            if (parentContext && parentContext.isColumn && alignSelf !== 'center' && alignSelf !== 'flex-start' && !isMarginAuto) {
                // In a column parent, block children expand to parent's width by default
                frameWidth = parentContext.width;
            } else if (parentContext && parentContext.isFlex && !parentContext.isColumn && flexGrow > 0) {
                frameWidth = parentContext.width;
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

        let frameName = element.id || (element.className && typeof element.className === 'string' ? element.className.trim() : '') || tagName;
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
            clipsContent: getProp('overflow', 'overflow') === 'hidden' || getProp('overflow', 'overflow') === 'clip'
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
                frameNode.stackPadding = paddingTop;
                frameNode.stackHorizontalPadding = paddingLeft;
                frameNode.stackVerticalPadding = paddingTop;
                frameNode.stackPaddingRight = paddingRight;
                frameNode.stackPaddingBottom = paddingBottom;
                frameNode.stackPrimaryAlignItems = 'MIN';
                frameNode.stackCounterAlignItems = 'MIN';
                frameNode.stackPrimarySizing = 'RESIZE_TO_FIT';
                frameNode.stackCounterSizing = 'FIXED';
            } else if (isFlex) {
                frameNode.stackMode = isColumn ? 'VERTICAL' : 'HORIZONTAL';
                frameNode.stackSpacing = gap;
                frameNode.stackPadding = paddingTop;
                frameNode.stackHorizontalPadding = paddingLeft;
                frameNode.stackVerticalPadding = paddingTop;
                frameNode.stackPaddingRight = paddingRight;
                frameNode.stackPaddingBottom = paddingBottom;

                const flexWrap = getProp('flex-wrap', 'flexWrap');
                if (flexWrap === 'wrap') {
                    frameNode.stackWrap = 'WRAP';
                    const colGap = parseFloat(getProp('column-gap', 'columnGap'));
                    if (colGap) frameNode.stackCounterSpacing = colGap;
                }

                const jc = getProp('justify-content', 'justifyContent');
                frameNode.stackPrimaryAlignItems = jc === 'center' ? 'CENTER' :
                    (jc === 'flex-end' || jc === 'end') ? 'MAX' :
                        (jc === 'space-between' || jc === 'space-around' || jc === 'space-evenly') ? 'SPACE_BETWEEN' : 'MIN';

                const ai = getProp('align-items', 'alignItems');
                frameNode.stackCounterAlignItems = ai === 'center' ? 'CENTER' :
                    (ai === 'flex-end' || ai === 'end') ? 'MAX' :
                        ai === 'baseline' ? 'BASELINE' : 'MIN';

                // Axes:
                // HORIZONTAL stack: primary = WIDTH, counter = HEIGHT
                // VERTICAL stack: primary = HEIGHT, counter = WIDTH
                if (isColumn) {
                    frameNode.stackPrimarySizing = hasExplicitHeight ? 'FIXED' : 'RESIZE_TO_FIT';
                    frameNode.stackCounterSizing = (hasExplicitWidth || isWidthPercent || (parentContext && parentContext.isColumn)) ? 'FIXED' : 'RESIZE_TO_FIT';
                } else {
                    frameNode.stackPrimarySizing = (hasExplicitWidth || isWidthPercent || (jc === 'space-between' && frameWidth > 200)) ? 'FIXED' : 'RESIZE_TO_FIT';
                    frameNode.stackCounterSizing = hasExplicitHeight ? 'FIXED' : 'RESIZE_TO_FIT';
                }
            } else if (element.children.length > 0) {
                // Block container flow (e.g. <div>, <form>, <section> without display: flex)
                // In HTML, block elements stack their children VERTICALLY
                frameNode.stackMode = 'VERTICAL';
                frameNode.stackSpacing = 2; // small default spacing between block items
                frameNode.stackPadding = paddingTop;
                frameNode.stackHorizontalPadding = paddingLeft;
                frameNode.stackVerticalPadding = paddingTop;
                frameNode.stackPaddingRight = paddingRight;
                frameNode.stackPaddingBottom = paddingBottom;
                frameNode.stackPrimaryAlignItems = 'MIN';
                frameNode.stackCounterAlignItems = 'MIN';

                frameNode.stackPrimarySizing = hasExplicitHeight ? 'FIXED' : 'RESIZE_TO_FIT';
                frameNode.stackCounterSizing = (hasExplicitWidth || isWidthPercent || (parentContext && parentContext.isColumn)) ? 'FIXED' : 'RESIZE_TO_FIT';
            } else {
                frameNode.stackMode = 'NONE';
            }
        }

        // Child sizing inside parent flex/block container
        if (!isAbsolute && parentContext && parentContext.isFlex) {
            if (isMarginAuto && parentContext.isColumn) {
                frameNode.stackChildAlignSelf = 'CENTER';
            } else if (parentContext.isColumn) {
                // In column container, cross-axis is WIDTH
                const shouldStretchW = alignSelf === 'stretch' || (!hasExplicitWidth && alignSelf !== 'center' && alignSelf !== 'flex-start');
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
                } else if (alignSelf === 'flex-start' || alignSelf === 'start') {
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
                } else if (alignSelf === 'flex-start' || parentContext.alignItems === 'flex-start') {
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

        nodeChanges.push(frameNode);

        // Recurse into children
        const innerContentWidth = Math.max(10, frameWidth - paddingLeft - paddingRight);
        const currentContext = {
            isFlex: isFlex || element.children.length > 0 || tagName === 'body',
            isColumn,
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
        let childIndex = 0;
        for (const child of element.children) {
            const childPos = FractionalIndexer.getPosition(childIndex);
            const res = await processElement(child, currentGuid, childPos, currentContext);
            if (res) childResults.push(res);
            childIndex++;
        }

        const flowChildren = childResults.filter(c => !c.isAbsolute);
        if (flowChildren.length > 0) {
            if (frameNode.stackMode === 'HORIZONTAL') {
                const maxChildH = Math.max(0, ...flowChildren.map(c => c.height || 0));
                if (!hasExplicitHeight && tagName !== 'body') {
                    const contentH = paddingTop + paddingBottom + maxChildH;
                    frameNode.size.y = Math.max(contentH, frameNode.size.y || 40);
                }
                // Update stretched children's size.y to match row height
                const isStretchRow = currentContext.alignItems === 'stretch';
                for (const c of flowChildren) {
                    if (c.node && (c.node.stackChildAlignSelf === 'STRETCH' || isStretchRow)) {
                        c.node.size.y = maxChildH;
                        c.height = maxChildH;
                    }
                }
            } else if (frameNode.stackMode === 'VERTICAL') {
                const totalChildH = flowChildren.reduce((acc, c) => acc + (c.height || 0), 0) + (gap * Math.max(0, flowChildren.length - 1));
                if (!hasExplicitHeight || tagName === 'body') {
                    const contentH = paddingTop + paddingBottom + totalChildH;
                    frameNode.size.y = Math.max(contentH, frameNode.size.y || 40);
                }
            }
        }

        return { node: frameNode, width: frameNode.size.x, height: frameNode.size.y, isAbsolute };
    }

    // Process root body element
    if (doc.body) {
        const rootPos = FractionalIndexer.getPosition(0);
        await processElement(doc.body, parentCanvasGuid, rootPos, null);
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
