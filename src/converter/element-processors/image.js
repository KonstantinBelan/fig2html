// src/converter/element-processors/image.js

export function isImageElement(element) {
    const tagName = element.tagName.toLowerCase();
    return tagName === 'img' || tagName === 'picture';
}

export async function processImageElement(element, parentGuid, orderPosition, parentContext, styles, context) {
    const {
        guidGen,
        imageRegistry,
        stats,
        nodeChanges
    } = context;

    const {
        currentGuid,
        width,
        height,
        isAbsolute,
        containerW,
        containerH,
        getProp,
        isVisible,
        opacity,
        blendMode,
        x,
        y,
        posX,
        posY,
        strokePaints,
        borderWidth,
        effects,
        borderRadius,
        hasIndependentCorners,
        tlRadius,
        trRadius,
        brRadius,
        blRadius,
        flexGrow,
        alignSelf,
        hasExplicitWidth,
        isWidthPercent,
        marginOffsets
    } = styles;

    const src = element.getAttribute('src');
    const alt = element.getAttribute('alt') || element.className || 'Image';
    const objectFit = getProp('object-fit', 'objectFit') || 'cover';
    const scaleMode = objectFit === 'contain' ? 'FIT' : objectFit === 'fill' ? 'STRETCH' : 'FILL';

    const targetW = width || (isAbsolute ? containerW : (parentContext ? parentContext.width : 280));
    const resolved = await imageRegistry.resolveImage(src, alt, targetW);

    const imgWidth = width || (isAbsolute ? containerW : (parentContext ? parentContext.width : (resolved?.width || 280)));
    const imgHeight = height || resolved?.height || (isAbsolute ? containerH : 140);

    const imgFills = resolved ? [imageRegistry.createImagePaint(resolved, scaleMode)] : [];
    if (stats) {
        stats.images++;
        stats.totalNodes++;
    }

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
        if (marginOffsets.top) imgNode.stackChildMarginTop = marginOffsets.top;
        if (marginOffsets.right) imgNode.stackChildMarginRight = marginOffsets.right;
        if (marginOffsets.bottom) imgNode.stackChildMarginBottom = marginOffsets.bottom;
        if (marginOffsets.left) imgNode.stackChildMarginLeft = marginOffsets.left;
    }

    nodeChanges.push(imgNode);
    return {
        node: imgNode,
        width: imgWidth,
        height: imgHeight,
        isAbsolute,
        marginTop: marginOffsets.top,
        marginBottom: marginOffsets.bottom,
        marginLeft: marginOffsets.left,
        marginRight: marginOffsets.right
    };
}
