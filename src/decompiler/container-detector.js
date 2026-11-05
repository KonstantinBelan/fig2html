// src/decompiler/container-detector.js
const { BoundingBox } = require('./geometry');

/**
 * Checks if a node possesses visual container styling (fills, strokes, corner radius, shadows)
 * @param {object} node
 * @returns {boolean}
 */
function hasContainerVisualStyles(node) {
    if (!node) return false;

    // Check visible fill paints
    const hasFill = Array.isArray(node.fillPaints) && node.fillPaints.some(p => p.visible !== false);

    // Check visible stroke paints
    const hasStroke = Array.isArray(node.strokePaints) &&
        node.strokePaints.some(p => p.visible !== false) &&
        (node.strokeWeight === undefined || node.strokeWeight > 0);

    // Check corner radius
    const hasCornerRadius = Boolean(
        (node.cornerRadius && node.cornerRadius > 0) ||
        (Array.isArray(node.rectangleCornerRadii) && node.rectangleCornerRadii.some(r => r > 0))
    );

    // Check effects (box shadows, blurs)
    const hasEffects = Array.isArray(node.effects) && node.effects.some(e => e.visible !== false);

    return hasFill || hasStroke || hasCornerRadius || hasEffects;
}

/**
 * Checks if a node is an underlay candidate (flat shape/frame without existing children)
 * @param {object} node
 * @returns {boolean}
 */
function isUnderlayCandidate(node) {
    if (!node) return false;
    const isUnderlayType = node.type === 'RECTANGLE' || node.type === 'ROUNDED_RECTANGLE' || node.type === 'FRAME';
    const hasNoChildren = !Array.isArray(node.children) || node.children.length === 0;

    return isUnderlayType && hasNoChildren && hasContainerVisualStyles(node);
}

/**
 * Adjusts a node's local position relative to a new container
 * @param {object} node
 * @param {number} containerX
 * @param {number} containerY
 */
function adjustCoordinatesRelativeToContainer(node, containerX, containerY) {
    const origX = node.x !== undefined ? node.x : (node.transform?.m02 ?? 0);
    const origY = node.y !== undefined ? node.y : (node.transform?.m12 ?? 0);

    const relX = Math.round((origX - containerX) * 100) / 100;
    const relY = Math.round((origY - containerY) * 100) / 100;

    if (node.x !== undefined) node.x = relX;
    if (node.y !== undefined) node.y = relY;

    if (node.transform) {
        node.transform = {
            ...node.transform,
            m02: relX,
            m12: relY
        };
    } else {
        node.transform = {
            m00: 1,
            m01: 0,
            m02: relX,
            m10: 0,
            m11: 1,
            m12: relY
        };
    }
}

/**
 * Promotes a flat underlay node to a Semantic Container Frame
 * @param {object} underlayNode
 * @param {Array<object>} children
 * @returns {object} Promoted container frame
 */
function promoteToContainer(underlayNode, children) {
    const origX = underlayNode.x !== undefined ? underlayNode.x : (underlayNode.transform?.m02 ?? 0);
    const origY = underlayNode.y !== undefined ? underlayNode.y : (underlayNode.transform?.m12 ?? 0);

    // Adjust each child's position relative to underlay
    for (const child of children) {
        adjustCoordinatesRelativeToContainer(child, origX, origY);
    }

    underlayNode.type = 'FRAME';
    underlayNode.stackMode = underlayNode.stackMode || 'NONE';
    underlayNode.isSynthesizedContainer = true;
    underlayNode.children = children;

    return underlayNode;
}

/**
 * Detects enclosing background rectangles/cards, promotes them to semantic containers,
 * nests enclosed elements inside them, and isolates floating overlays.
 *
 * @param {Array<object>} nodes List of sibling nodes
 * @param {object} [containerSize=null] Dimensions of the parent container
 * @param {number} [epsilon=3] Tolerance in pixels
 * @returns {Array<object>} Transformed list of nodes
 */
function detectAndExtractContainers(nodes, containerSize = null, epsilon = 3) {
    if (!Array.isArray(nodes) || nodes.length < 2) {
        return nodes || [];
    }

    // Work on a shallow copy of the node list
    let workingNodes = [...nodes];

    // Find all candidate underlays
    const candidates = [];
    for (let i = 0; i < workingNodes.length; i++) {
        const node = workingNodes[i];
        if (isUnderlayCandidate(node)) {
            const box = BoundingBox.fromNode(node);
            // Don't treat a shape spanning the entire artboard as a child card if it's identical to container
            if (containerSize && box.width >= containerSize.x - epsilon && box.height >= containerSize.y - epsilon) {
                continue;
            }
            candidates.push({ node, box, area: box.area, originalIndex: i });
        }
    }

    if (candidates.length === 0) {
        return workingNodes;
    }

    // Sort candidate underlays by area ascending (smallest / inner-most cards & buttons first)
    candidates.sort((a, b) => a.area - b.area);

    for (const candidate of candidates) {
        const underlay = candidate.node;
        // Verify underlay is still in workingNodes (could have been adopted by another container)
        if (!workingNodes.includes(underlay)) continue;

        const underlayBox = BoundingBox.fromNode(underlay);
        const containedNodes = [];
        const overlayNodes = [];

        // Check all other active nodes in workingNodes
        for (const item of workingNodes) {
            if (item === underlay) continue;

            const itemBox = BoundingBox.fromNode(item);

            // 1. Strict or fuzzy geometric containment
            if (underlayBox.contains(itemBox, epsilon)) {
                containedNodes.push(item);
            }
            // 2. Decorative overlay detection (badge, close button protruding across boundary)
            else if (itemBox.area < underlayBox.area * 0.4 && underlayBox.overlapsBoundary(itemBox, epsilon)) {
                // Must have substantial intersection with the container or touch its edge
                if (underlayBox.intersects(itemBox, -epsilon)) {
                    item.stackPositioning = 'ABSOLUTE';
                    item.isDecorativeOverlay = true;
                    overlayNodes.push(item);
                }
            }
        }

        // Only promote if underlay contains at least 1 content node
        if (containedNodes.length > 0) {
            const allAdoptedChildren = [...containedNodes, ...overlayNodes];

            // Promote underlay to FRAME and attach children
            promoteToContainer(underlay, allAdoptedChildren);

            // Remove adopted nodes from parent workingNodes
            workingNodes = workingNodes.filter(n => !allAdoptedChildren.includes(n));
        }
    }

    return workingNodes;
}

module.exports = {
    hasContainerVisualStyles,
    isUnderlayCandidate,
    adjustCoordinatesRelativeToContainer,
    promoteToContainer,
    detectAndExtractContainers
};
