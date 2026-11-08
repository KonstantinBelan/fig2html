// src/converter/element-processors/container.js
const { FractionalIndexer } = require('../../utils/guid');
const { parseColor } = require('../../parsers/color');
const {
    parseFontStyle,
    parseLineHeight,
    parseLetterSpacing,
    estimateTextDimensions
} = require('../../parsers/typography');
const {
    cloneNode,
    parseGridColumns,
    extractVarName
} = require('../style-resolver');
const {
    computeContainerDimensions,
    setupAutoLayout,
    applyChildSizing,
    applyVariableConsumptions,
    recalculateContainerDimensions
} = require('../layout-engine');

async function processContainerElement(element, parentGuid, orderPosition, parentContext, styles, context) {
    const {
        doc,
        guidGen,
        stats,
        nodeChanges,
        parentCanvasGuid,
        options,
        pseudoRules,
        resolveVar,
        varMap,
        colorToVarMap,
        createColorVar,
        colorToHexKey,
        nextCompSetYState,
        processElement
    } = context;

    const {
        currentGuid,
        width,
        height,
        display,
        isAbsolute,
        getProp,
        isVisible,
        opacity,
        blendMode,
        x,
        y,
        posX,
        posY,
        fills,
        strokePaints,
        borderWidth,
        borderTopW,
        borderBottomW,
        borderLeftW,
        borderRightW,
        hasIndependentBorders,
        borderRadius,
        hasIndependentCorners,
        tlRadius,
        trRadius,
        brRadius,
        blRadius,
        effects,
        hasExplicitWidth,
        hasExplicitHeight,
        isWidthPercent,
        isHeightPercent,
        rawWidthStr,
        marginOffsets,
        inheritedStyles
    } = styles;

    const tagName = element.tagName.toLowerCase();

    // 1. Grid & Flex layout definitions
    const isFlex = display === 'flex' || display === 'inline-flex';
    const isGrid = display === 'grid' || display === 'inline-grid';
    const flexDirection = getProp('flex-direction', 'flexDirection');
    const gridCols = getProp('grid-template-columns', 'gridTemplateColumns');
    const parsedCols = isGrid ? parseGridColumns(gridCols) : [];
    const isMultiColGrid = isGrid && parsedCols.length > 1;
    const isColumn = isFlex
        ? (flexDirection === 'column' || flexDirection === 'column-reverse')
        : (isGrid ? !isMultiColGrid : true);

    const padOffsets = styles.marginOffsets ? styles.padOffsets : null; // or getProp
    const paddingTop = parseFloat(getProp('padding-top', 'paddingTop')) || parseFloat(getProp('padding', 'padding')) || 0;
    const paddingRight = parseFloat(getProp('padding-right', 'paddingRight')) || parseFloat(getProp('padding', 'padding')) || 0;
    const paddingBottom = parseFloat(getProp('padding-bottom', 'paddingBottom')) || parseFloat(getProp('padding', 'padding')) || 0;
    const paddingLeft = parseFloat(getProp('padding-left', 'paddingLeft')) || parseFloat(getProp('padding', 'padding')) || 0;

    const rowGap = parseFloat(getProp('row-gap', 'rowGap')) || parseFloat(getProp('gap', 'gap')) || 0;
    const colGap = parseFloat(getProp('column-gap', 'columnGap')) || parseFloat(getProp('gap', 'gap')) || 0;
    const gap = isColumn ? rowGap : colGap;

    const layoutStyles = {
        ...styles,
        isFlex,
        isGrid,
        isColumn,
        isMultiColGrid,
        parsedCols,
        gap,
        rowGap,
        colGap,
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft
    };

    // 2. Initial container dimensions & shape type
    const {
        frameWidth,
        frameHeight,
        frameType,
        isInlineEl,
        hasTextChildren,
        isGridChild
    } = computeContainerDimensions(element, layoutStyles, parentContext);

    layoutStyles.frameWidth = frameWidth;
    layoutStyles.frameHeight = frameHeight;
    layoutStyles.isInlineEl = isInlineEl;
    layoutStyles.hasTextChildren = hasTextChildren;
    layoutStyles.isGridChild = isGridChild;

    let frameName = element.getAttribute('data-name') || element.getAttribute('name') || element.getAttribute('title') || element.id || (element.className && typeof element.className === 'string' ? element.className.trim() : '') || tagName;
    if (tagName === 'body') {
        frameName = (doc.title && doc.title.trim()) || 'Page';
    }

    if (stats) {
        stats.frames++;
        stats.totalNodes++;
    }

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

    if (hasIndependentCorners) {
        frameNode.rectangleTopLeftCornerRadius = tlRadius;
        frameNode.rectangleTopRightCornerRadius = trRadius;
        frameNode.rectangleBottomRightCornerRadius = brRadius;
        frameNode.rectangleBottomLeftCornerRadius = blRadius;
        frameNode.rectangleCornerRadiiIndependent = true;
    }

    if (hasIndependentBorders) {
        frameNode.borderTopWeight = borderTopW;
        frameNode.borderBottomWeight = borderBottomW;
        frameNode.borderLeftWeight = borderLeftW;
        frameNode.borderRightWeight = borderRightW;
        frameNode.borderStrokeWeightsIndependent = true;
    }

    // 3. Setup Auto Layout
    if (frameType === 'FRAME') {
        setupAutoLayout(frameNode, element, layoutStyles, {}, parentContext);
    }

    // 4. Child sizing inside parent flex
    if (!isAbsolute && parentContext && parentContext.isFlex) {
        applyChildSizing(frameNode, layoutStyles, parentContext, isColumn);
    }

    // 5. Hover pseudo-classes detection
    let hasHoverRule = false;
    let hoverRuleBody = null;
    if (pseudoRules && pseudoRules.hover) {
        for (const rule of pseudoRules.hover) {
            try {
                if (element.matches(rule.selector)) {
                    hasHoverRule = true;
                    hoverRuleBody = rule.body;
                    break;
                }
            } catch (_) {}
        }
    }

    // 6. Bind Variables / Tokens
    applyVariableConsumptions(frameNode, layoutStyles, context);

    nodeChanges.push(frameNode);

    // 7. Child Context & Traversal
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
                const lhObj = parseLineHeight(inheritedStyles.lineHeight, fontSize);
                const lsResult = parseLetterSpacing(inheritedStyles.letterSpacing, fontSize);
                const textGeom = estimateTextDimensions(rawText, fontSize, 0, false, cleanFamily);

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

                const childTextNode = {
                    guid: textGuid,
                    phase: 'CREATED',
                    parentIndex: { guid: currentGuid, position: childPos },
                    type: 'TEXT',
                    name: rawText.slice(0, 32),
                    visible: true,
                    opacity: 1.0,
                    blendMode: 'NORMAL',
                    transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
                    size: { x: textGeom.width, y: textGeom.height },
                    fillPaints: [textPaint],
                    fontSize: fontSize,
                    fontName: { family: cleanFamily, style: styleName, postscript },
                    textAlignHorizontal: 'LEFT',
                    textAlignVertical: 'TOP',
                    textAutoResize: 'WIDTH_AND_HEIGHT',
                    lineHeight: lhObj,
                    letterSpacing: lsResult.struct,
                    textTracking: lsResult.tracking,
                    textData: {
                        characters: rawText,
                        layoutSize: { x: textGeom.width, y: textGeom.height }
                    }
                };

                nodeChanges.push(childTextNode);
                if (stats) {
                    stats.textNodes++;
                    stats.totalNodes++;
                }
                childResults.push({ node: childTextNode, width: textGeom.width, height: textGeom.height, isAbsolute: false });
            }
        }
    }

    // 8. Post-children dimensions recalculation
    recalculateContainerDimensions(frameNode, element, layoutStyles, childResults, currentContext);

    // 9. Interactive Component Set & Hover Variants
    if (hasHoverRule && options.createVariants !== false) {
        const compSetGuid = guidGen.next();
        const defaultVariantGuid = guidGen.next();
        const hoverVariantGuid = guidGen.next();

        const compSetW = Math.max(100, frameNode.size.x * 2 + 60);
        const compSetH = Math.max(60, frameNode.size.y + 40);

        const currentCompSetY = nextCompSetYState.y;
        nextCompSetYState.y += compSetH + 40;

        const compSetNode = {
            guid: compSetGuid,
            phase: 'CREATED',
            parentIndex: { guid: parentCanvasGuid, position: '~' },
            type: 'FRAME',
            name: frameNode.name || 'Component',
            visible: true,
            opacity: 1,
            size: { x: compSetW, y: compSetH },
            transform: { m00: 1, m01: 0, m02: 1140, m10: 0, m11: 1, m12: currentCompSetY },
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
                    const hoverBgVar = (hoverBgVarName && varMap?.get(hoverBgVarName)) ||
                        (parsedBg.a === 1 && colorToVarMap ? colorToVarMap.get(colorToHexKey(parsedBg)) : null);
                    const hoverFill = {
                        type: 'SOLID',
                        color: { r: parsedBg.r, g: parsedBg.g, b: parsedBg.b, a: 1 },
                        opacity: parsedBg.a !== undefined ? parsedBg.a : 1,
                        visible: true,
                        blendMode: 'NORMAL'
                    };
                    const cVar = createColorVar ? createColorVar(hoverBgVar) : undefined;
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
                    const hoverBorderVar = (hoverBorderVarName && varMap?.get(hoverBorderVarName)) ||
                        (parsedBorder.a === 1 && colorToVarMap ? colorToVarMap.get(colorToHexKey(parsedBorder)) : null);
                    const hoverStroke = {
                        type: 'SOLID',
                        color: { r: parsedBorder.r, g: parsedBorder.g, b: parsedBorder.b, a: 1 },
                        opacity: parsedBorder.a !== undefined ? parsedBorder.a : 1,
                        visible: true,
                        blendMode: 'NORMAL'
                    };
                    const cVar = createColorVar ? createColorVar(hoverBorderVar) : undefined;
                    if (cVar) hoverStroke.colorVar = cVar;
                    hoverVariant.strokePaints = [hoverStroke];
                }
            }
        }

        const flowChildren = childResults.filter(c => !c.isAbsolute);
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
                            const hoverColorVar = (hoverColorVarName && varMap?.get(hoverColorVarName)) ||
                                (parsedColor.a === 1 && colorToVarMap ? colorToVarMap.get(colorToHexKey(parsedColor)) : null);
                            const textPaint = {
                                type: 'SOLID',
                                color: { r: parsedColor.r, g: parsedColor.g, b: parsedColor.b, a: 1 },
                                opacity: parsedColor.a !== undefined ? parsedColor.a : 1,
                                visible: true,
                                blendMode: 'NORMAL'
                            };
                            const cVar = createColorVar ? createColorVar(hoverColorVar) : undefined;
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
        if (stats) stats.frames += 3;
    }

    return {
        node: frameNode,
        width: frameNode.size.x,
        height: frameNode.size.y,
        isAbsolute,
        marginTop: marginOffsets.top,
        marginBottom: marginOffsets.bottom,
        marginLeft: marginOffsets.left,
        marginRight: marginOffsets.right
    };
}

module.exports = {
    processContainerElement
};
