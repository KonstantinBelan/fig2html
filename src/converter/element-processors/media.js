// src/converter/element-processors/media.js
const { parseColor } = require('../../parsers/color');

function isMediaElement(element) {
    return element.tagName.toLowerCase() === 'hr';
}

function processMediaElement(element, parentGuid, orderPosition, parentContext, styles, context) {
    const { stats, nodeChanges } = context;
    const {
        currentGuid,
        width,
        isAbsolute,
        getProp,
        inheritedStyles,
        borderTopW,
        borderWidth,
        isVisible,
        opacity,
        blendMode,
        x,
        y,
        marginOffsets
    } = styles;

    if (stats) {
        stats.shapes++;
        stats.totalNodes++;
    }

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
    return {
        node: hrNode,
        width: hrWidth,
        height: hrThickness,
        isAbsolute,
        marginTop: marginOffsets.top,
        marginBottom: marginOffsets.bottom,
        marginLeft: marginOffsets.left,
        marginRight: marginOffsets.right
    };
}

module.exports = {
    isMediaElement,
    processMediaElement
};
