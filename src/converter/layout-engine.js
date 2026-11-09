// src/converter/layout-engine.js
import { parseCssLength } from './style-resolver.js';

/**
 * Computes initial container dimensions before child elements are processed
 */
export function computeContainerDimensions(element, styles, parentContext) {
    const {
        width,
        height,
        hasExplicitWidth,
        hasExplicitHeight,
        display,
        isMarginAuto,
        alignSelf,
        flexGrow,
        paddingLeft,
        paddingRight,
        borderRadius,
        getProp,
        inheritedStyles
    } = styles;

    const tagName = element.tagName.toLowerCase();
    let frameWidth = width;
    const isInlineEl = display === 'inline-block' || display === 'inline-flex' || display === 'inline' || tagName === 'button';
    const hasTextChildren = Array.from(element.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
    const isGridChild = parentContext && (parentContext.isMultiColGrid || parentContext.gridChildWidth > 0);

    if (parentContext && parentContext.isMultiColGrid && parentContext.gridChildWidth > 0 && !hasExplicitWidth) {
        frameWidth = parentContext.gridChildWidth;
    } else if (tagName === 'body') {
        frameWidth = width || 1440;
    } else if (!frameWidth || frameWidth === 0) {
        if (parentContext && parentContext.isColumn && alignSelf !== 'center' && alignSelf !== 'flex-start' && !isMarginAuto && !isInlineEl) {
            frameWidth = parentContext.width;
        } else if (parentContext && parentContext.isFlex && !parentContext.isColumn && flexGrow > 0) {
            frameWidth = parentContext.width;
        } else if (isInlineEl || (parentContext && !parentContext.isColumn && hasTextChildren && element.children.length === 0)) {
            const textContent = element.textContent.trim();
            const fontSize = parseFloat(getProp('font-size', 'fontSize')) || inheritedStyles.fontSize || 14;
            const charW = fontSize * 0.58;
            frameWidth = Math.ceil(paddingLeft + paddingRight + textContent.length * charW);
        } else if (parentContext && !parentContext.isColumn) {
            frameWidth = Math.min(240, Math.max(60, parentContext.width - 60));
        } else {
            frameWidth = parentContext ? parentContext.width : 300;
        }
    }

    if (styles.maxWidth && styles.maxWidth !== 'none') {
        const maxW = parseCssLength(styles.maxWidth, 16, parentContext?.width || 1440, 1440);
        if (maxW > 0 && frameWidth > maxW) frameWidth = Math.round(maxW);
    }

    const frameHeight = height || (hasExplicitHeight ? height : 40);

    // Circle shape detection (border-radius: 50% with equal width & height, containing NO children and NO text content)
    const isCircle = (borderRadius >= frameWidth / 2 && frameWidth === frameHeight) ||
        element.classList.contains('rounded-full') ||
        element.classList.contains('avatar') ||
        element.classList.contains('avatar-circle');

    const frameType = (isCircle && element.children.length === 0 && !element.textContent.trim()) ? 'ELLIPSE' : 'FRAME';

    return {
        frameWidth,
        frameHeight,
        frameType,
        isInlineEl,
        hasTextChildren,
        isGridChild
    };
}

/**
 * Configures Auto Layout v4 on the container frame
 */
export function setupAutoLayout(frameNode, element, styles, layoutParams, parentContext) {
    const tagName = element.tagName.toLowerCase();
    const {
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
        paddingLeft,
        isInlineEl,
        hasTextChildren,
        isGridChild,
        frameWidth,
        hasExplicitWidth,
        isWidthPercent,
        hasExplicitHeight,
        isHeightPercent,
        rawWidthStr,
        fills,
        strokePaints,
        effects,
        borderRadius,
        getProp
    } = styles;

    if (tagName === 'body') {
        frameNode.stackMode = (isFlex && !isColumn) ? 'HORIZONTAL' : 'VERTICAL';
        frameNode.stackSpacing = gap || 0;
        frameNode.stackHorizontalPadding = paddingLeft || 0;
        frameNode.stackPaddingRight = paddingRight || 0;
        frameNode.stackVerticalPadding = paddingTop || 0;
        frameNode.stackPaddingBottom = paddingBottom || 0;

        if (isFlex) {
            const jc = getProp('justify-content', 'justifyContent');
            const ai = getProp('align-items', 'alignItems');

            if (jc === 'center') frameNode.stackPrimaryAlignItems = 'CENTER';
            else if (jc === 'flex-end' || jc === 'end') frameNode.stackPrimaryAlignItems = 'MAX';
            else if (jc === 'space-between') frameNode.stackPrimaryAlignItems = 'SPACE_BETWEEN';
            else frameNode.stackPrimaryAlignItems = 'MIN';

            if (ai === 'center') frameNode.stackCounterAlignItems = 'CENTER';
            else if (ai === 'flex-end' || ai === 'end') frameNode.stackCounterAlignItems = 'MAX';
            else frameNode.stackCounterAlignItems = 'MIN';

            const isFixedH = (frameNode.size?.y >= 900 || hasExplicitHeight);
            if (!isColumn) {
                frameNode.stackPrimarySizing = 'FIXED';
                frameNode.stackCounterSizing = isFixedH ? 'FIXED' : 'RESIZE_TO_FIT';
            } else {
                frameNode.stackPrimarySizing = isFixedH ? 'FIXED' : 'RESIZE_TO_FIT';
                frameNode.stackCounterSizing = 'FIXED';
            }
        } else {
            frameNode.stackPrimaryAlignItems = 'MIN';
            frameNode.stackCounterAlignItems = 'MIN';
            frameNode.stackPrimarySizing = 'RESIZE_TO_FIT';
            frameNode.stackCounterSizing = 'FIXED';
        }
    } else if (isFlex || isGrid) {
        frameNode.stackMode = isColumn ? 'VERTICAL' : 'HORIZONTAL';
        frameNode.stackSpacing = gap || 0;
        frameNode.stackHorizontalPadding = paddingLeft || 0;
        frameNode.stackPaddingRight = paddingRight || 0;
        frameNode.stackVerticalPadding = paddingTop || 0;
        frameNode.stackPaddingBottom = paddingBottom || 0;

        const flexWrap = getProp('flex-wrap', 'flexWrap');
        const gridCols = getProp('grid-template-columns', 'gridTemplateColumns');
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

        if (isColumn) {
            frameNode.stackPrimarySizing = (hasExplicitHeight || isHeightPercent) ? 'FIXED' : 'RESIZE_TO_FIT';
            frameNode.stackCounterSizing = (hasExplicitWidth || isWidthPercent || (parentContext && (parentContext.isColumn || isGridChild))) && !isInline && !isContentWidth ? 'FIXED' : 'RESIZE_TO_FIT';
        } else {
            frameNode.stackPrimarySizing = (hasExplicitWidth || isWidthPercent || isGridChild || (jc === 'space-between' && frameWidth > 200)) && !isContentWidth ? 'FIXED' : 'RESIZE_TO_FIT';
            frameNode.stackCounterSizing = (hasExplicitHeight || isHeightPercent) ? 'FIXED' : 'RESIZE_TO_FIT';
        }
    } else if (element.children.length > 0) {
        frameNode.stackMode = 'VERTICAL';
        frameNode.stackSpacing = 2;
        frameNode.stackHorizontalPadding = paddingLeft || 0;
        frameNode.stackPaddingRight = paddingRight || 0;
        frameNode.stackVerticalPadding = paddingTop || 0;
        frameNode.stackPaddingBottom = paddingBottom || 0;
        frameNode.stackPrimaryAlignItems = 'MIN';
        frameNode.stackCounterAlignItems = 'MIN';

        frameNode.stackPrimarySizing = hasExplicitHeight ? 'FIXED' : 'RESIZE_TO_FIT';
        frameNode.stackCounterSizing = (hasExplicitWidth || isWidthPercent || (parentContext && (parentContext.isColumn || isGridChild))) && !isInlineEl ? 'FIXED' : 'RESIZE_TO_FIT';
    } else if (hasTextChildren && !isGridChild && (fills.length > 0 || strokePaints.length > 0 || effects.length > 0 || borderRadius > 0 || paddingLeft > 0 || paddingRight > 0 || paddingTop > 0 || paddingBottom > 0 || tagName === 'button' || isInlineEl)) {
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

/**
 * Sets child margins and alignment relative to its parent flex container
 */
export function applyChildSizing(frameNode, styles, parentContext, isColumn) {
    const {
        marginOffsets,
        isMarginAuto,
        alignSelf,
        hasExplicitWidth,
        isWidthPercent,
        hasExplicitHeight,
        flexGrow,
        isInlineEl,
        rawWidthStr
    } = styles;

    if (marginOffsets.top) frameNode.stackChildMarginTop = marginOffsets.top;
    if (marginOffsets.right) frameNode.stackChildMarginRight = marginOffsets.right;
    if (marginOffsets.bottom) frameNode.stackChildMarginBottom = marginOffsets.bottom;
    if (marginOffsets.left) frameNode.stackChildMarginLeft = marginOffsets.left;

    const isInline = isInlineEl;
    const isContentWidth = rawWidthStr === 'max-content' || rawWidthStr === 'min-content' || rawWidthStr === 'fit-content';

    if (isMarginAuto && parentContext.isColumn) {
        frameNode.stackChildAlignSelf = 'CENTER';
    } else if (parentContext.isColumn) {
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
        const shouldStretchH = alignSelf === 'stretch' || (!hasExplicitHeight && (!alignSelf || alignSelf === 'auto') && parentContext.alignItems === 'stretch');
        if (shouldStretchH) {
            frameNode.stackChildAlignSelf = 'STRETCH';
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

/**
 * Binds Figma variable consumption tokens to the container frame
 */
export function applyVariableConsumptions(frameNode, styles, context) {
    const {
        getVarForProp,
        hasIndependentCorners,
        tlRadius,
        trRadius,
        brRadius,
        blRadius,
        borderRadius,
        hasIndependentBorders,
        borderTopW,
        borderBottomW,
        borderLeftW,
        borderRightW,
        borderWidth,
        gap,
        paddingTop,
        paddingBottom,
        paddingLeft,
        paddingRight
    } = styles;

    const {
        radiusToVarMap,
        floatToVarMap,
        spaceToVarMap,
        createFloatVar
    } = context;

    if (!createFloatVar) return;

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

    // Corner Radius
    if (hasIndependentCorners) {
        const tlVar = getVarForProp('border-top-left-radius', 'borderTopLeftRadius') || (tlRadius > 0 && radiusToVarMap ? (radiusToVarMap.get(tlRadius) || floatToVarMap?.get(tlRadius)) : null);
        const trVar = getVarForProp('border-top-right-radius', 'borderTopRightRadius') || (trRadius > 0 && radiusToVarMap ? (radiusToVarMap.get(trRadius) || floatToVarMap?.get(trRadius)) : null);
        const brVar = getVarForProp('border-bottom-right-radius', 'borderBottomRightRadius') || (brRadius > 0 && radiusToVarMap ? (radiusToVarMap.get(brRadius) || floatToVarMap?.get(brRadius)) : null);
        const blVar = getVarForProp('border-bottom-left-radius', 'borderBottomLeftRadius') || (blRadius > 0 && radiusToVarMap ? (radiusToVarMap.get(blRadius) || floatToVarMap?.get(blRadius)) : null);

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
        const radiusVar = getVarForProp('border-radius', 'borderRadius') || (borderRadius > 0 && radiusToVarMap ? (radiusToVarMap.get(borderRadius) || floatToVarMap?.get(borderRadius)) : null);
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

    // Stroke Weight
    if (hasIndependentBorders) {
        const topWVar = getVarForProp('border-top-width', 'borderTopWidth') || (borderTopW > 0 && floatToVarMap ? floatToVarMap.get(borderTopW) : null);
        const bottomWVar = getVarForProp('border-bottom-width', 'borderBottomWidth') || (borderBottomW > 0 && floatToVarMap ? floatToVarMap.get(borderBottomW) : null);
        const leftWVar = getVarForProp('border-left-width', 'borderLeftWidth') || (borderLeftW > 0 && floatToVarMap ? floatToVarMap.get(borderLeftW) : null);
        const rightWVar = getVarForProp('border-right-width', 'borderRightWidth') || (borderRightW > 0 && floatToVarMap ? floatToVarMap.get(borderRightW) : null);

        if (borderTopW > 0) addFloatConsumption('BORDER_TOP_WEIGHT', topWVar);
        if (borderBottomW > 0) addFloatConsumption('BORDER_BOTTOM_WEIGHT', bottomWVar);
        if (borderLeftW > 0) addFloatConsumption('BORDER_LEFT_WEIGHT', leftWVar);
        if (borderRightW > 0) addFloatConsumption('BORDER_RIGHT_WEIGHT', rightWVar);
    } else {
        const strokeWVar = getVarForProp('border-width', 'borderWidth') || (borderWidth > 0 && floatToVarMap ? floatToVarMap.get(borderWidth) : null);
        if (borderWidth > 0) {
            addFloatConsumption('STROKE_WEIGHT', strokeWVar);
        }
    }

    // Auto Layout Spacing & Padding
    if (frameNode.stackMode && frameNode.stackMode !== 'NONE') {
        const gapVar = getVarForProp('gap', 'gap', 'column-gap', 'columnGap', 'row-gap', 'rowGap') || (gap > 0 && spaceToVarMap ? (spaceToVarMap.get(gap) || floatToVarMap?.get(gap)) : null);
        if (gapVar) {
            addFloatConsumption('STACK_SPACING', gapVar);
        }

        if (frameNode.stackCounterSpacing && frameNode.stackCounterSpacing > 0 && spaceToVarMap) {
            const counterGapVar = getVarForProp('row-gap', 'rowGap') || (spaceToVarMap.get(frameNode.stackCounterSpacing) || floatToVarMap?.get(frameNode.stackCounterSpacing));
            if (counterGapVar) {
                addFloatConsumption('STACK_COUNTER_SPACING', counterGapVar);
            }
        }

        const paddingVar = getVarForProp('padding', 'padding');
        const topPadVar = getVarForProp('padding-top', 'paddingTop') || paddingVar || (paddingTop > 0 && spaceToVarMap ? (spaceToVarMap.get(paddingTop) || floatToVarMap?.get(paddingTop)) : null);
        const bottomPadVar = getVarForProp('padding-bottom', 'paddingBottom') || paddingVar || (paddingBottom > 0 && spaceToVarMap ? (spaceToVarMap.get(paddingBottom) || floatToVarMap?.get(paddingBottom)) : null);
        const leftPadVar = getVarForProp('padding-left', 'paddingLeft') || paddingVar || (paddingLeft > 0 && spaceToVarMap ? (spaceToVarMap.get(paddingLeft) || floatToVarMap?.get(paddingLeft)) : null);
        const rightPadVar = getVarForProp('padding-right', 'paddingRight') || paddingVar || (paddingRight > 0 && spaceToVarMap ? (spaceToVarMap.get(paddingRight) || floatToVarMap?.get(paddingRight)) : null);

        if (leftPadVar) addFloatConsumption('STACK_PADDING_LEFT', leftPadVar);
        if (topPadVar) addFloatConsumption('STACK_PADDING_TOP', topPadVar);
        if (rightPadVar) addFloatConsumption('STACK_PADDING_RIGHT', rightPadVar);
        if (bottomPadVar) addFloatConsumption('STACK_PADDING_BOTTOM', bottomPadVar);
    }

    // Opacity
    const opacityVar = getVarForProp('opacity', 'opacity');
    if (opacityVar) {
        addFloatConsumption('OPACITY', opacityVar);
    }

    if (consumptionEntries.length > 0) {
        const mapObj = { entries: consumptionEntries };
        frameNode.parameterConsumptionMap = mapObj;
        frameNode.variableConsumptionMap = mapObj;
    }
}

/**
 * Recalculates container size based on resolved flow children and computes child positions
 */
export function recalculateContainerDimensions(frameNode, element, styles, childResults, currentContext) {
    const tagName = element.tagName.toLowerCase();
    const {
        gap,
        paddingLeft,
        paddingRight,
        paddingTop,
        paddingBottom,
        hasExplicitHeight,
        isHeightPercent
    } = styles;

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
}
