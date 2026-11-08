// src/converter/element-processors/interactive.js
import { parseFontStyle, parseLineHeight, parseLetterSpacing } from '../../parsers/typography.js';

export function isInteractiveElement(element) {
    const tagName = element.tagName.toLowerCase();
    return tagName === 'input';
}

export function processInteractiveElement(element, parentGuid, orderPosition, parentContext, styles, context) {
    const {
        guidGen,
        stats,
        nodeChanges,
        createFloatVar,
        radiusToVarMap,
        floatToVarMap
    } = context;

    const {
        currentGuid,
        width,
        height,
        isAbsolute,
        getProp,
        getVarForProp,
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
        borderRadius,
        marginOffsets
    } = styles;

    const inputType = (element.getAttribute('type') || 'text').toLowerCase();
    const placeholder = element.getAttribute('placeholder') || element.getAttribute('value') || '';

    if (inputType === 'checkbox') {
        if (stats) {
            stats.shapes++;
            stats.totalNodes++;
        }
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
        if (stats) {
            stats.shapes++;
            stats.totalNodes++;
        }
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
    if (stats) {
        stats.frames++;
        stats.totalNodes++;
    }

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

    const inputRadiusVar = getVarForProp('border-radius', 'borderRadius') || (borderRadius > 0 && radiusToVarMap ? (radiusToVarMap.get(borderRadius) || floatToVarMap?.get(borderRadius)) : null);
    if (inputRadiusVar && createFloatVar) {
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
        if (stats) {
            stats.textNodes++;
            stats.totalNodes++;
        }
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
    return {
        node: inputFrame,
        width: inputW,
        height: inputH,
        isAbsolute,
        marginTop: marginOffsets.top,
        marginBottom: marginOffsets.bottom,
        marginLeft: marginOffsets.left,
        marginRight: marginOffsets.right
    };
}
