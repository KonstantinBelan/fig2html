// src/converter/element-processors/text.js
import { parseColor } from '../../parsers/color.js';
import {
    parseFontStyle,
    parseLineHeight,
    parseLetterSpacing,
    parseTextDecoration,
    parseTextTransform,
    estimateTextDimensions
} from '../../parsers/typography.js';
import { isRichTextContainer, extractRichText } from '../rich-text.js';

export function isTextElement(element, styles) {
    const tagName = element.tagName.toLowerCase();
    const isTextTag = ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'label', 'strong', 'b', 'em', 'i', 'small', 'code', 'pre', 'blockquote'].includes(tagName);
    const hasNoChildren = element.children.length === 0;
    const textContent = element.textContent.trim();
    const hasRichChildren = isRichTextContainer(element);

    // If an element has container styling (background fill, border, radius, or padding),
    // it represents a UI component (badge, button, chip, pill) and must be rendered as an Auto Layout FRAME container, not a flat TEXT node
    const pTop = parseFloat(styles.getProp ? styles.getProp('padding-top', 'paddingTop', 'padding') : 0) || 0;
    const pRight = parseFloat(styles.getProp ? styles.getProp('padding-right', 'paddingRight', 'padding') : 0) || 0;
    const pBottom = parseFloat(styles.getProp ? styles.getProp('padding-bottom', 'paddingBottom', 'padding') : 0) || 0;
    const pLeft = parseFloat(styles.getProp ? styles.getProp('padding-left', 'paddingLeft', 'padding') : 0) || 0;
    const hasPadding = pTop > 0 || pRight > 0 || pBottom > 0 || pLeft > 0;
    const hasFills = Boolean(styles.fills && styles.fills.length > 0);
    const hasBorders = Boolean(styles.borderWidth > 0 || (styles.strokePaints && styles.strokePaints.length > 0) || styles.borderTopW > 0 || styles.borderBottomW > 0 || styles.borderLeftW > 0 || styles.borderRightW > 0);
    const hasRadius = Boolean(styles.borderRadius > 0);
    const hasContainerStyling = hasFills || hasBorders || hasRadius || hasPadding;

    if (hasContainerStyling) {
        return false;
    }

    const isChildlessTextDiv = (tagName === 'div' && hasNoChildren && textContent.length > 0 && !hasContainerStyling);

    return (isTextTag && hasNoChildren && textContent.length > 0) || (hasRichChildren && !styles.fills.length && styles.borderWidth === 0) || isChildlessTextDiv;
}

export function processTextElement(element, parentGuid, orderPosition, parentContext, styles, context) {
    const {
        win,
        guidGen,
        stats,
        nodeChanges,
        resolveVar,
        varMap,
        colorToVarMap,
        createColorVar,
        createFloatVar,
        colorToHexKey
    } = context;

    const {
        currentGuid,
        width,
        isAbsolute,
        getProp,
        getVarForProp,
        inheritedStyles,
        isVisible,
        opacity,
        blendMode,
        x,
        y,
        posX,
        posY,
        flexGrow,
        alignSelf,
        marginOffsets
    } = styles;

    const tagName = element.tagName.toLowerCase();
    const textContent = element.textContent.trim();
    const hasRichChildren = isRichTextContainer(element);

    const textColor = parseColor(inheritedStyles.color) || { r: 0.1, g: 0.1, b: 0.1, a: 1.0 };
    const textColorVar = inheritedStyles.colorVar || (textColor.a === 1 && colorToVarMap ? colorToVarMap.get(colorToHexKey(textColor)) : null);
    const textPaint = {
        type: 'SOLID',
        color: textColor,
        opacity: textColor.a,
        visible: true,
        blendMode: 'NORMAL'
    };
    const cVar = createColorVar ? createColorVar(textColorVar) : undefined;
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

    if (stats) {
        stats.textNodes++;
        stats.totalNodes++;
    }

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
    if (fsVar && createFloatVar) {
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
        if (stats) stats.frames++;

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
    return {
        node: textNode,
        width: textGeom.width,
        height: textGeom.height,
        isAbsolute,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0
    };
}
