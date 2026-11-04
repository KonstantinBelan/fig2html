// src/converter.js
const { JSDOM } = require('jsdom');
const { GuidGenerator, FractionalIndexer } = require('./utils/guid');
const { parseColor, clamp01 } = require('./parsers/color');
const { parseGradient } = require('./parsers/gradient');
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

        const getProp = (p, c) => inline[c] || inline.getPropertyValue(p) || computed[c] || computed.getPropertyValue(p);

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

        const mixBlend = getProp('mix-blend-mode', 'mixBlendMode') || 'normal';
        const blendMode = BLEND_MODE_MAP[mixBlend.toLowerCase()] || 'NORMAL';

        // Check CSS dimensions (handling percentages correctly)
        const rawWidthStr = getProp('width', 'width');
        const rawHeightStr = getProp('height', 'height');

        let width = 0;
        let isWidthPercent = false;
        if (rawWidthStr) {
            if (rawWidthStr.endsWith('%')) {
                isWidthPercent = true;
                const pct = (parseFloat(rawWidthStr) || 100) / 100;
                width = Math.round((parentContext ? parentContext.width : 1000) * pct);
            } else if (rawWidthStr !== 'auto') {
                width = parseFloat(rawWidthStr) || 0;
            }
        }
        if (!width && element.getAttribute('width')) {
            const attrW = element.getAttribute('width');
            if (attrW.endsWith('%')) {
                isWidthPercent = true;
                const pct = (parseFloat(attrW) || 100) / 100;
                width = Math.round((parentContext ? parentContext.width : 1000) * pct);
            } else {
                width = parseFloat(attrW) || 0;
            }
        }

        let height = 0;
        let isHeightPercent = false;
        if (rawHeightStr) {
            if (rawHeightStr.endsWith('%')) {
                isHeightPercent = true;
                const pct = (parseFloat(rawHeightStr) || 100) / 100;
                height = Math.round((parentContext ? parentContext.height : 500) * pct);
            } else if (rawHeightStr !== 'auto') {
                height = parseFloat(rawHeightStr) || 0;
            }
        }
        if (!height && element.getAttribute('height')) {
            const attrH = element.getAttribute('height');
            if (attrH.endsWith('%')) {
                isHeightPercent = true;
                const pct = (parseFloat(attrH) || 100) / 100;
                height = Math.round((parentContext ? parentContext.height : 500) * pct);
            } else {
                height = parseFloat(attrH) || 0;
            }
        }

        const hasExplicitWidth = width > 0 && !isWidthPercent;
        const hasExplicitHeight = height > 0 && !isHeightPercent;

        let x = parseFloat(getProp('left', 'left')) || 0;
        let y = parseFloat(getProp('top', 'top')) || 0;

        const flexGrow = parseFloat(getProp('flex-grow', 'flexGrow')) || 0;
        const alignSelf = getProp('align-self', 'alignSelf');

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

        // Fills: solid colors, gradients, background-images
        const fills = [];
        const bgImage = getProp('background-image', 'backgroundImage');
        const bgVal = getProp('background', 'background');
        const bgColor = getProp('background-color', 'backgroundColor');

        // Gradients
        if (bgImage && bgImage.includes('gradient')) {
            const gradPaint = parseGradient(bgImage);
            if (gradPaint) fills.push(gradPaint);
        } else if (bgVal && bgVal.includes('gradient')) {
            const gradPaint = parseGradient(bgVal);
            if (gradPaint) fills.push(gradPaint);
        }

        // Background Image URL
        const bgUrlMatch = (bgImage || bgVal || '').match(/url\(["']?(.*?)["']?\)/);
        if (bgUrlMatch) {
            const imgRes = await imageRegistry.resolveImage(bgUrlMatch[1], 'bg-image');
            if (imgRes) {
                fills.push(imageRegistry.createImagePaint(imgRes, 'FILL'));
                stats.images++;
            }
        }

        // Background Color
        const parsedBgColor = parseColor(bgColor);
        if (parsedBgColor && parsedBgColor.a > 0) {
            fills.push({
                type: 'SOLID',
                color: parsedBgColor,
                opacity: parsedBgColor.a,
                visible: true,
                blendMode: 'NORMAL'
            });
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

            const targetW = width || (parentContext ? parentContext.width : 280);
            const resolved = await imageRegistry.resolveImage(src, alt, targetW);

            const imgWidth = width || (parentContext ? parentContext.width : (resolved?.width || 280));
            const imgHeight = height || resolved?.height || 140;

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

            if (parentContext && parentContext.isFlex) {
                if (flexGrow > 0) imgNode.stackChildPrimaryGrow = 1.0;
                if (alignSelf === 'stretch' || (parentContext.isColumn && (!hasExplicitWidth || isWidthPercent))) {
                    imgNode.stackChildAlignSelf = 'STRETCH';
                } else if (alignSelf === 'center') {
                    imgNode.stackChildAlignSelf = 'CENTER';
                }
            }

            nodeChanges.push(imgNode);
            return;
        }

        // -------------------------------------------------------------
        // 2. SVG ELEMENT (<svg>)
        // -------------------------------------------------------------
        if (tagName === 'svg') {
            const dims = getSvgDimensions(element, win);
            const svgWidth = width || dims.width;
            const svgHeight = height || dims.height;

            const svgXml = serializeSvgElement(element);
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

            if (parentContext && parentContext.isFlex) {
                if (flexGrow > 0) svgNode.stackChildPrimaryGrow = 1.0;
                if (alignSelf === 'stretch') svgNode.stackChildAlignSelf = 'STRETCH';
                else if (alignSelf === 'center') svgNode.stackChildAlignSelf = 'CENTER';
            }

            nodeChanges.push(svgNode);
            return;
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
            return;
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

            if (parentContext && parentContext.isFlex) {
                if (flexGrow > 0) textNode.stackChildPrimaryGrow = 1.0;
                if (alignSelf === 'stretch' || (parentContext.isColumn && isParagraph)) {
                    textNode.stackChildAlignSelf = 'STRETCH';
                } else if (alignSelf === 'center') {
                    textNode.stackChildAlignSelf = 'CENTER';
                }
            }

            nodeChanges.push(textNode);
            return;
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
                    transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
                    size: { x: 18, y: 18 },
                    fillPaints: [{ type: 'SOLID', color: checkColor, opacity: 1, visible: true, blendMode: 'NORMAL' }],
                    strokePaints: [{ type: 'SOLID', color: checkBorder, opacity: 1, visible: true, blendMode: 'NORMAL' }],
                    strokeWeight: 1,
                    cornerRadius: 4
                };
                nodeChanges.push(cbNode);
                return;
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
                    transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
                    size: { x: 18, y: 18 },
                    fillPaints: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
                    strokePaints: [{ type: 'SOLID', color: { r: 0.7, g: 0.7, b: 0.7, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
                    strokeWeight: 1.5
                };
                nodeChanges.push(radioNode);
                return;
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

            nodeChanges.push(inputFrame);

            if (placeholder) {
                stats.textNodes++;
                stats.totalNodes++;
                const textGuid = guidGen.next();
                const placeholderNode = {
                    guid: textGuid,
                    phase: 'CREATED',
                    parentIndex: { guid: currentGuid, position: '!' },
                    type: 'TEXT',
                    name: 'Placeholder',
                    visible: true,
                    opacity: 1.0,
                    size: { x: inputW - 28, y: 18 },
                    transform: { m00: 1, m01: 0, m02: 14, m10: 0, m11: 1, m12: 12 },
                    fillPaints: [{ type: 'SOLID', color: { r: 0.6, g: 0.64, b: 0.68, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
                    fontSize: 14,
                    fontName: { family: 'Inter', style: 'Regular', postscript: 'Inter-Regular' },
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
            return;
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
        if (!frameWidth || frameWidth === 0) {
            if (parentContext && parentContext.isColumn && alignSelf !== 'center' && alignSelf !== 'flex-start') {
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

        stats.frames++;
        stats.totalNodes++;

        const frameNode = {
            guid: currentGuid,
            phase: 'CREATED',
            parentIndex: { guid: parentGuid, position: orderPosition },
            type: frameType,
            name: element.id || element.className || tagName,
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
            if (isFlex) {
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
        if (parentContext && parentContext.isFlex) {
            if (flexGrow > 0) {
                frameNode.stackChildPrimaryGrow = 1.0;
            }

            if (parentContext.isColumn) {
                // In column container, cross-axis is WIDTH
                if (alignSelf === 'stretch' || (!hasExplicitWidth && alignSelf !== 'center' && alignSelf !== 'flex-start')) {
                    frameNode.stackChildAlignSelf = 'STRETCH';
                } else if (alignSelf === 'center') {
                    frameNode.stackChildAlignSelf = 'CENTER';
                } else if (alignSelf === 'flex-end' || alignSelf === 'end') {
                    frameNode.stackChildAlignSelf = 'MAX';
                } else if (alignSelf === 'flex-start' || alignSelf === 'start') {
                    frameNode.stackChildAlignSelf = 'MIN';
                }
            } else {
                // In row container, cross-axis is HEIGHT
                if (alignSelf === 'stretch' || (!hasExplicitHeight && parentContext.alignItems === 'stretch')) {
                    frameNode.stackChildAlignSelf = 'STRETCH';
                } else if (alignSelf === 'center' || parentContext.alignItems === 'center') {
                    frameNode.stackChildAlignSelf = 'CENTER';
                } else if (alignSelf === 'flex-end' || parentContext.alignItems === 'flex-end') {
                    frameNode.stackChildAlignSelf = 'MAX';
                } else if (alignSelf === 'flex-start' || parentContext.alignItems === 'flex-start') {
                    frameNode.stackChildAlignSelf = 'MIN';
                }
            }
        }

        nodeChanges.push(frameNode);

        // Recurse into children
        const innerContentWidth = Math.max(10, frameWidth - paddingLeft - paddingRight);
        const currentContext = {
            isFlex: isFlex || element.children.length > 0,
            isColumn,
            width: innerContentWidth,
            height: frameHeight - paddingTop - paddingBottom,
            gap,
            alignItems: getProp('align-items', 'alignItems') || 'stretch',
            inherited: inheritedStyles
        };

        let childIndex = 0;
        for (const child of element.children) {
            const childPos = FractionalIndexer.getPosition(childIndex);
            await processElement(child, currentGuid, childPos, currentContext);
            childIndex++;
        }
    }

    // Process top-level body elements
    let rootIndex = 0;
    for (const rootEl of doc.body.children) {
        const rootPos = FractionalIndexer.getPosition(rootIndex);
        await processElement(rootEl, parentCanvasGuid, rootPos, null);
        rootIndex++;
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
