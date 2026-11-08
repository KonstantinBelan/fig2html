// src/decompiler/css/layout-styles.js

export function hasExplicitMaskTag(node) {
    if (!node) return false;
    const name = (node.name || '').toLowerCase();
    return /\[(mask|маска)\]/i.test(name) || /#(mask|маска)\b/i.test(name) || /\/(mask|маска)\b/i.test(name);
}

export function parseGridAxisCount(val) {
    if (typeof val === 'number') return val;
    if (val && Array.isArray(val.entries)) return val.entries.length;
    if (Array.isArray(val)) return val.length;
    if (val && typeof val.count === 'number') return val.count;
    return null;
}

export function isImageNode(n) {
    if (!n) return false;
    if (n.isCollapsedGraphicRoot) return true;
    if (Array.isArray(n.fillPaints) && n.fillPaints.some(f => f.type === 'IMAGE' && f.visible !== false)) return true;
    if (n.type === 'IMAGE') return true;
    const name = (n.name || '').toLowerCase();
    if (/^(image|img|photo|picture|pic)/i.test(name) || name.includes('generated_image') || name.includes('mockup') || name.includes('kontract')) return true;
    if (Array.isArray(n.children) && n.children.length > 0) {
        return n.children.some(c => isImageNode(c));
    }
    return false;
}

export function isVectorNode(n) {
    if (!n) return false;
    return ['VECTOR', 'STAR', 'REGULAR_POLYGON', 'BOOLEAN_OPERATION', 'LINE'].includes(n.type) || (n.vectorData && (!n.children || n.children.length === 0));
}

export function isVectorContainer(node) {
    if (!node || !Array.isArray(node.children) || node.children.length === 0) return false;
    const isFrame = ['FRAME', 'GROUP', 'INSTANCE', 'SYMBOL', 'BOOLEAN_OPERATION'].includes(node.type);
    if (!isFrame) return false;

    const hasImageFill = Array.isArray(node.fillPaints) && node.fillPaints.some(f => f.type === 'IMAGE' && f.visible !== false);
    if (hasImageFill) return false;

    return node.children.every(c => isVectorNode(c) || c.type === 'LINE');
}

/**
 * Resolves smart horizontal (left vs right) and vertical (top vs bottom) anchoring
 * for absolutely positioned elements based on Figma constraints and nearest-edge proximity.
 *
 * @param {object} node
 * @param {object} parentNode
 * @param {object} [context={}]
 * @param {boolean} [context.parentHasMask=false]
 * @param {boolean} [context.hasTransform=false]
 * @returns {{ horizontalProp: 'left'|'right', horizontalVal: number, verticalProp: 'top'|'bottom', verticalVal: number }}
 */
export function resolveSmartAbsoluteAnchors(node, parentNode, context = {}) {
    const rawX = node?.transform?.m02 || 0;
    const rawY = node?.transform?.m12 || 0;
    const posX = Math.round(rawX * 10) / 10;
    const posY = Math.round(rawY * 10) / 10;

    const parentW = parentNode?.size?.x || 0;
    const parentH = parentNode?.size?.y || 0;
    const nodeW = node?.size?.x || 0;
    const nodeH = node?.size?.y || 0;

    const { parentHasMask = false, hasTransform = false } = context;
    const hConstraint = node?.horizontalConstraint || node?.constraints?.horizontal;
    const vConstraint = node?.verticalConstraint || node?.constraints?.vertical;

    let horizontalProp = 'left';
    let horizontalVal = posX;
    let verticalProp = 'top';
    let verticalVal = posY;

    const canEvaluateProximity = Boolean(
        parentNode &&
        parentNode.type !== 'CANVAS' &&
        (!hasTransform || node?.isCollapsedGraphicRoot)
    );

    // 1. Horizontal anchor resolution (left vs right)
    if (canEvaluateProximity && parentW > 0 && nodeW > 0) {
        const distRight = Math.round((parentW - (rawX + nodeW)) * 10) / 10;
        if (hConstraint === 'MAX') {
            horizontalProp = 'right';
            horizontalVal = distRight;
        } else if (!parentHasMask && hConstraint !== 'SCALE' && posX > 0 && Math.abs(distRight) < Math.abs(posX)) {
            horizontalProp = 'right';
            horizontalVal = distRight;
        }
    }

    // 2. Vertical anchor resolution (top vs bottom)
    if (canEvaluateProximity && parentH > 0 && nodeH > 0) {
        const distBottom = Math.round((parentH - (rawY + nodeH)) * 10) / 10;
        if (vConstraint === 'MAX') {
            verticalProp = 'bottom';
            verticalVal = distBottom;
        } else if (!parentHasMask && vConstraint !== 'SCALE' && posY > 0 && Math.abs(distBottom) < Math.abs(posY)) {
            verticalProp = 'bottom';
            verticalVal = distBottom;
        }
    }

    return {
        horizontalProp,
        horizontalVal,
        verticalProp,
        verticalVal
    };
}
