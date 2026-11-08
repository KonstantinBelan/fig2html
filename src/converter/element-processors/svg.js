// src/converter/element-processors/svg.js
const { FractionalIndexer } = require('../../utils/guid');
const { parseColor } = require('../../parsers/color');
const { serializeSvgElement, getSvgDimensions, renderSvgToPng } = require('../../parsers/svg');
const { encodeCommandsBlob, encodeVectorNetworkBlob, extractSvgShapeElements } = require('../../parsers/svg-path');

function isSvgElement(element) {
    return element.tagName.toLowerCase() === 'svg';
}

async function processSvgElement(element, parentGuid, orderPosition, parentContext, styles, context) {
    const {
        win,
        guidGen,
        blobOffset,
        conversionBlobs,
        imageRegistry,
        stats,
        nodeChanges
    } = context;

    const {
        currentGuid,
        isAbsolute,
        getProp,
        inheritedStyles,
        isVisible,
        opacity,
        blendMode,
        x,
        y,
        posX,
        posY,
        borderRadius,
        flexGrow,
        alignSelf,
        marginOffsets
    } = styles;

    const dims = getSvgDimensions(element, win);
    if (dims.isSpriteDef || (dims.width === 0 && dims.height === 0)) {
        return null;
    }
    const svgWidth = dims.width;
    const svgHeight = dims.height;

    const iconColor = getProp('color', 'color') || inheritedStyles.color || '#000000';
    const shapes = extractSvgShapeElements(element, iconColor, win);

    // Native Kiwi VECTOR synthesis when vector shapes are present
    if (shapes.length > 0) {
        const vbAttr = element.getAttribute('viewBox');
        let vbMinX = 0, vbMinY = 0, vbW = svgWidth, vbH = svgHeight;
        if (vbAttr) {
            const parts = vbAttr.trim().split(/[\s,]+/).map(parseFloat);
            if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
                vbMinX = parts[0];
                vbMinY = parts[1];
                vbW = parts[2];
                vbH = parts[3];
            }
        }
        const scaleX = vbW > 0 ? svgWidth / vbW : 1;
        const scaleY = vbH > 0 ? svgHeight / vbH : 1;

        const iconFrame = {
            guid: currentGuid,
            phase: 'CREATED',
            parentIndex: { guid: parentGuid, position: orderPosition },
            type: 'FRAME',
            name: element.id || 'SVG Icon',
            visible: isVisible,
            opacity: opacity,
            blendMode: blendMode,
            transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
            size: { x: svgWidth, y: svgHeight },
            fillPaints: [],
            clipsContent: false
        };

        if (isAbsolute) {
            iconFrame.stackPositioning = 'ABSOLUTE';
            iconFrame.transform = { m00: 1, m01: 0, m02: posX, m10: 0, m11: 1, m12: posY };
        } else if (parentContext && parentContext.isFlex) {
            if (flexGrow > 0) iconFrame.stackChildPrimaryGrow = 1.0;
            if (alignSelf === 'stretch') iconFrame.stackChildAlignSelf = 'STRETCH';
            else if (alignSelf === 'center') iconFrame.stackChildAlignSelf = 'CENTER';
            if (marginOffsets.top) iconFrame.stackChildMarginTop = marginOffsets.top;
            if (marginOffsets.right) iconFrame.stackChildMarginRight = marginOffsets.right;
            if (marginOffsets.bottom) iconFrame.stackChildMarginBottom = marginOffsets.bottom;
            if (marginOffsets.left) iconFrame.stackChildMarginLeft = marginOffsets.left;
        }

        if (stats) {
            stats.frames++;
            stats.totalNodes++;
        }
        nodeChanges.push(iconFrame);

        for (let sIdx = 0; sIdx < shapes.length; sIdx++) {
            const shape = shapes[sIdx];
            const scaledCmds = shape.commands.map(cmd => {
                const c = { ...cmd };
                if (c.x !== undefined) c.x = (c.x - vbMinX) * scaleX;
                if (c.y !== undefined) c.y = (c.y - vbMinY) * scaleY;
                if (c.cp1x !== undefined) c.cp1x = (c.cp1x - vbMinX) * scaleX;
                if (c.cp1y !== undefined) c.cp1y = (c.cp1y - vbMinY) * scaleY;
                if (c.cp2x !== undefined) c.cp2x = (c.cp2x - vbMinX) * scaleX;
                if (c.cp2y !== undefined) c.cp2y = (c.cp2y - vbMinY) * scaleY;
                return c;
            });

            const cmdBlob = encodeCommandsBlob(scaledCmds);
            const vnBlob = encodeVectorNetworkBlob(scaledCmds);

            const cmdIdx = blobOffset + conversionBlobs.length;
            conversionBlobs.push(cmdBlob);

            const vnIdx = blobOffset + conversionBlobs.length;
            conversionBlobs.push(vnBlob);

            const vectorGuid = guidGen.next();
            const vPos = FractionalIndexer.getPosition(sIdx, shapes.length);

            const vectorNode = {
                guid: vectorGuid,
                phase: 'CREATED',
                parentIndex: { guid: currentGuid, position: vPos },
                type: 'VECTOR',
                name: shape.name || 'Vector',
                visible: true,
                opacity: 1.0,
                size: { x: svgWidth, y: svgHeight },
                transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
                vectorData: {
                    vectorNetworkBlob: vnIdx,
                    normalizedSize: { x: svgWidth, y: svgHeight }
                }
            };

            if (shape.fill) {
                const parsedFill = parseColor(shape.fill);
                if (parsedFill) {
                    vectorNode.fillPaints = [{
                        type: 'SOLID',
                        color: parsedFill,
                        opacity: parsedFill.a !== undefined ? parsedFill.a : 1.0,
                        visible: true,
                        blendMode: 'NORMAL'
                    }];
                    vectorNode.fillGeometry = [{
                        commandsBlob: cmdIdx,
                        windingRule: shape.fillRule || 'NONZERO',
                        styleID: 0
                    }];
                }
            }

            if (shape.stroke) {
                const parsedStroke = parseColor(shape.stroke);
                if (parsedStroke) {
                    vectorNode.strokePaints = [{
                        type: 'SOLID',
                        color: parsedStroke,
                        opacity: parsedStroke.a !== undefined ? parsedStroke.a : 1.0,
                        visible: true,
                        blendMode: 'NORMAL'
                    }];
                    vectorNode.strokeWeight = (shape.strokeWidth || 1) * Math.min(scaleX, scaleY);
                    vectorNode.strokeCap = shape.strokeCap || 'ROUND';
                    vectorNode.strokeJoin = shape.strokeJoin || 'ROUND';
                    if (!vectorNode.fillGeometry) {
                        vectorNode.strokeGeometry = [{
                            commandsBlob: cmdIdx,
                            windingRule: shape.fillRule || 'NONZERO',
                            styleID: 0
                        }];
                    }
                }
            }

            if (stats) {
                stats.shapes++;
                stats.totalNodes++;
            }
            nodeChanges.push(vectorNode);
        }

        return {
            node: iconFrame,
            width: svgWidth,
            height: svgHeight,
            isAbsolute,
            marginTop: marginOffsets.top,
            marginBottom: marginOffsets.bottom,
            marginLeft: marginOffsets.left,
            marginRight: marginOffsets.right
        };
    }

    // Fallback to rasterized PNG if no vector shapes could be extracted
    const svgXml = serializeSvgElement(element, iconColor, svgWidth, svgHeight, win);
    const pngBuffer = renderSvgToPng(svgXml, svgWidth);
    const resolved = imageRegistry.registerBuffer(pngBuffer || Buffer.from(svgXml, 'utf8'), element.id || 'svg-icon', svgWidth);

    if (stats) {
        stats.images++;
        stats.totalNodes++;
    }

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
        if (marginOffsets.top) svgNode.stackChildMarginTop = marginOffsets.top;
        if (marginOffsets.right) svgNode.stackChildMarginRight = marginOffsets.right;
        if (marginOffsets.bottom) svgNode.stackChildMarginBottom = marginOffsets.bottom;
        if (marginOffsets.left) svgNode.stackChildMarginLeft = marginOffsets.left;
    }

    nodeChanges.push(svgNode);
    return {
        node: svgNode,
        width: svgWidth,
        height: svgHeight,
        isAbsolute,
        marginTop: marginOffsets.top,
        marginBottom: marginOffsets.bottom,
        marginLeft: marginOffsets.left,
        marginRight: marginOffsets.right
    };
}

module.exports = {
    isSvgElement,
    processSvgElement
};
