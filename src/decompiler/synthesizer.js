// src/decompiler/synthesizer.js
const {
    BoundingBox,
    fuzzyEqual,
    clusterValues,
    sliceAlongAxis,
    computeMedian
} = require('./geometry');
const {
    detectAndExtractContainers,
    adjustCoordinatesRelativeToContainer
} = require('./container-detector');
const { isVectorContainer } = require('./vector');

let virtualGuidCounter = 900000;

/**
 * Generates a unique GUID for synthesized virtual frames
 * @returns {{ sessionID: number, localID: number }}
 */
function nextVirtualGuid() {
    return {
        sessionID: 0,
        localID: ++virtualGuidCounter
    };
}

/**
 * Detects whether a set of nodes forms a regular N x M grid
 * @param {Array<object>} nodes
 * @param {object} [containerSize=null]
 * @param {number} [epsilon=3]
 * @returns {{ isGrid: boolean, rows?: number, columns?: number, columnGap?: number, rowGap?: number, orderedNodes?: Array<object> }}
 */
function detectGrid(nodes, containerSize = null, epsilon = 3) {
    if (!Array.isArray(nodes) || nodes.length < 4) {
        return { isGrid: false };
    }

    // 1. Group nodes into rows by clustering their Y positions
    const yValues = nodes.map(n => n.y !== undefined ? n.y : (n.transform?.m12 ?? 0));
    const yClusters = clusterValues(yValues, epsilon);
    const rowCount = yClusters.length;

    if (rowCount < 2) {
        return { isGrid: false };
    }

    // Assign each node to its row cluster
    const rowBuckets = Array.from({ length: rowCount }, () => []);
    for (const node of nodes) {
        const ny = node.y !== undefined ? node.y : (node.transform?.m12 ?? 0);
        const clusterIdx = yClusters.findIndex(c => Math.abs(c.mean - ny) <= epsilon || (ny >= c.min - epsilon && ny <= c.max + epsilon));
        if (clusterIdx !== -1) {
            rowBuckets[clusterIdx].push(node);
        } else {
            return { isGrid: false };
        }
    }

    // Sort each row by X coordinate
    for (const row of rowBuckets) {
        row.sort((a, b) => {
            const ax = a.x !== undefined ? a.x : (a.transform?.m02 ?? 0);
            const bx = b.x !== undefined ? b.x : (b.transform?.m02 ?? 0);
            return ax - bx;
        });
    }

    // 2. Check column count regularity
    const colCount = rowBuckets[0].length;
    if (colCount < 2) {
        return { isGrid: false };
    }

    // Every row must have colCount items (last row may have <= colCount items)
    for (let r = 0; r < rowCount; r++) {
        const rLen = rowBuckets[r].length;
        if (r < rowCount - 1 && rLen !== colCount) {
            return { isGrid: false };
        }
        if (r === rowCount - 1 && (rLen < 1 || rLen > colCount)) {
            return { isGrid: false };
        }
    }

    // 3. Check uniformity of column widths and row heights
    const firstBox = BoundingBox.fromNode(rowBuckets[0][0]);
    const expectedW = firstBox.width;
    const expectedH = firstBox.height;

    for (const row of rowBuckets) {
        for (const item of row) {
            const b = BoundingBox.fromNode(item);
            if (!fuzzyEqual(b.width, expectedW, epsilon * 2) || !fuzzyEqual(b.height, expectedH, epsilon * 2)) {
                return { isGrid: false };
            }
        }
    }

    // 4. Check horizontal gaps (columnGap)
    const colGaps = [];
    for (const row of rowBuckets) {
        for (let c = 0; c < row.length - 1; c++) {
            const b1 = BoundingBox.fromNode(row[c]);
            const b2 = BoundingBox.fromNode(row[c + 1]);
            const gap = b2.xMin - b1.xMax;
            if (gap < -epsilon) return { isGrid: false };
            colGaps.push(Math.max(0, Math.round(gap)));
        }
    }

    // 5. Check vertical gaps (rowGap)
    const rowGaps = [];
    for (let r = 0; r < rowCount - 1; r++) {
        const topRowBottom = Math.max(...rowBuckets[r].map(n => BoundingBox.fromNode(n).yMax));
        const bottomRowTop = Math.min(...rowBuckets[r + 1].map(n => BoundingBox.fromNode(n).yMin));
        const gap = bottomRowTop - topRowBottom;
        if (gap < -epsilon) return { isGrid: false };
        rowGaps.push(Math.max(0, Math.round(gap)));
    }

    const columnGap = computeMedian(colGaps);
    const rowGap = computeMedian(rowGaps);

    // Verify gaps are consistent
    for (const g of colGaps) {
        if (!fuzzyEqual(g, columnGap, epsilon * 2)) return { isGrid: false };
    }
    for (const g of rowGaps) {
        if (!fuzzyEqual(g, rowGap, epsilon * 2)) return { isGrid: false };
    }

    // Flatten in reading order
    const orderedNodes = [];
    for (const row of rowBuckets) {
        for (const item of row) {
            orderedNodes.push(item);
        }
    }

    return {
        isGrid: true,
        rows: rowCount,
        columns: colCount,
        columnGap,
        rowGap,
        orderedNodes
    };
}

/**
 * Synthesizes Auto Layout and Grid properties for a container frame and its children
 * @param {object} containerNode
 * @param {object} [options={}]
 * @param {number} [options.epsilon=3]
 * @returns {object} Updated containerNode
 */
function synthesizeContainerLayout(containerNode, options = {}) {
    if (!containerNode || !Array.isArray(containerNode.children) || containerNode.children.length === 0) {
        return containerNode;
    }
    if (isVectorContainer(containerNode)) {
        return containerNode;
    }

    const epsilon = options.epsilon || 3;
    const containerW = containerNode.size?.x || containerNode.width || 0;
    const containerH = containerNode.size?.y || containerNode.height || 0;

    // Separate flow nodes from absolute/decorative overlay nodes
    let flowNodes = containerNode.children.filter(c => c.stackPositioning !== 'ABSOLUTE');
    const overlayNodes = containerNode.children.filter(c => c.stackPositioning === 'ABSOLUTE');

    if (flowNodes.length === 0) {
        return containerNode;
    }

    // Mark button-like containers to hug content
    for (const node of flowNodes) {
        const nodeName = (node.name || '').toLowerCase();
        const isBtn = nodeName.startsWith('btn') || nodeName === 'button' || nodeName.includes('btn-');
        if (isBtn) {
            node.isButton = true;
            node.stackPrimarySizing = 'RESIZE_TO_FIT';
            node.stackCounterSizing = 'RESIZE_TO_FIT';
        }
    }

    // Single flow child inside container
    if (flowNodes.length === 1) {
        const child = flowNodes[0];
        const childBox = BoundingBox.fromNode(child);

        // Derive paddings
        const pt = Math.max(0, Math.round(childBox.yMin));
        const pl = Math.max(0, Math.round(childBox.xMin));
        const pr = containerW > 0 ? Math.max(0, Math.round(containerW - childBox.xMax)) : 0;
        const pb = containerH > 0 ? Math.max(0, Math.round(containerH - childBox.yMax)) : 0;

        containerNode.stackMode = 'VERTICAL';
        containerNode.stackVerticalPadding = pt;
        containerNode.stackHorizontalPadding = pl;
        containerNode.stackPaddingRight = pr;
        containerNode.stackPaddingBottom = pb;
        containerNode.stackSpacing = 0;

        // If child spans content width, stretch it (unless it is a button)
        if (containerW > 0 && childBox.width >= (containerW - pl - pr - epsilon * 2) && !child.isButton) {
            child.stackCounterSizing = 'FIXED';
            child.layoutAlign = 'STRETCH';
        }

        // Recurse into child if it's a container
        if (child.children && child.children.length > 0 && child.stackMode === 'NONE') {
            synthesizeContainerLayout(child, options);
        }

        return containerNode;
    }

    // Check for N x M Matrix Grid Induction
    const gridInfo = detectGrid(flowNodes, { x: containerW, y: containerH }, epsilon);
    if (gridInfo.isGrid) {
        const gridBounds = BoundingBox.computeUnion(gridInfo.orderedNodes);

        const pt = Math.max(0, Math.round(gridBounds.yMin));
        const pl = Math.max(0, Math.round(gridBounds.xMin));
        const pr = containerW > 0 ? Math.max(0, Math.round(containerW - gridBounds.xMax)) : 0;
        const pb = containerH > 0 ? Math.max(0, Math.round(containerH - gridBounds.yMax)) : 0;

        containerNode.isGrid = true;
        containerNode.gridColumns = gridInfo.columns;
        containerNode.gridRows = gridInfo.rows;
        containerNode.stackMode = 'HORIZONTAL';
        containerNode.stackWrap = 'WRAP';
        containerNode.stackSpacing = gridInfo.columnGap;
        containerNode.stackCounterSpacing = gridInfo.rowGap;
        containerNode.gridColumnGap = gridInfo.columnGap;
        containerNode.gridRowGap = gridInfo.rowGap;

        containerNode.stackVerticalPadding = pt;
        containerNode.stackHorizontalPadding = pl;
        containerNode.stackPaddingRight = pr;
        containerNode.stackPaddingBottom = pb;

        containerNode.children = [...gridInfo.orderedNodes, ...overlayNodes];

        // Recurse into each grid item
        for (const item of gridInfo.orderedNodes) {
            if (item.children && item.children.length > 0 && item.stackMode === 'NONE') {
                synthesizeContainerLayout(item, options);
            }
        }

        return containerNode;
    }

    // Recursive XY-Cut Algorithm
    let yBands = sliceAlongAxis(flowNodes, 'y', epsilon);
    let xBands = sliceAlongAxis(flowNodes, 'x', epsilon);

    // If elements overlap in both dimensions, isolate the most overlapping or smallest node as overlay
    if (yBands.length <= 1 && xBands.length <= 1 && flowNodes.length > 1) {
        // Find node with smallest area or highest overlap
        const sortedByArea = [...flowNodes].sort((a, b) => BoundingBox.fromNode(a).area - BoundingBox.fromNode(b).area);
        const overlayCandidate = sortedByArea[0];
        overlayCandidate.stackPositioning = 'ABSOLUTE';
        overlayCandidate.isDecorativeOverlay = true;
        overlayNodes.push(overlayCandidate);
        flowNodes = flowNodes.filter(n => n !== overlayCandidate);

        // Re-slice with overlay removed
        yBands = sliceAlongAxis(flowNodes, 'y', epsilon);
        xBands = sliceAlongAxis(flowNodes, 'x', epsilon);
    }

    // 1. Cut along Y axis (Vertical Stack of Rows)
    if (yBands.length >= 2) {
        const flowBounds = BoundingBox.computeUnion(flowNodes);

        const pt = Math.max(0, Math.round(flowBounds.yMin));
        const pl = Math.max(0, Math.round(flowBounds.xMin));
        const pr = containerW > 0 ? Math.max(0, Math.round(containerW - flowBounds.xMax)) : 0;
        const pb = containerH > 0 ? Math.max(0, Math.round(containerH - flowBounds.yMax)) : 0;

        containerNode.stackMode = 'VERTICAL';
        containerNode.stackVerticalPadding = pt;
        containerNode.stackHorizontalPadding = pl;
        containerNode.stackPaddingRight = pr;
        containerNode.stackPaddingBottom = pb;

        // Evaluate row gaps uniformity
        const rowGaps = [];
        for (let i = 0; i < yBands.length - 1; i++) {
            const gap = yBands[i + 1].interval.start - yBands[i].interval.end;
            rowGaps.push(Math.max(0, Math.round(gap)));
        }

        const minRowGap = Math.min(...rowGaps);
        const maxRowGap = Math.max(...rowGaps);
        const isUniformGap = (maxRowGap - minRowGap) <= epsilon;

        let baseGap = 0;
        let useChildMargins = false;

        if (isUniformGap) {
            baseGap = computeMedian(rowGaps);
            containerNode.stackSpacing = baseGap;
        } else {
            // Gaps vary! Find if there is a dominant gap
            const gapClusters = clusterValues(rowGaps, epsilon);
            gapClusters.sort((a, b) => b.values.length - a.values.length);

            if (gapClusters[0].values.length >= Math.ceil(rowGaps.length * 0.7)) {
                baseGap = Math.round(gapClusters[0].median);
                containerNode.stackSpacing = baseGap;
                useChildMargins = true;
            } else {
                // No dominant gap, all gaps differ (e.g. 20, 10, 32, 36)
                baseGap = 0;
                containerNode.stackSpacing = 0;
                useChildMargins = true;
            }
        }

        // Horizontal cross-axis alignment
        const centers = yBands.map(b => b.bounds.centerX);
        const lefts = yBands.map(b => b.bounds.xMin);
        const allCentersAligned = centers.every(c => fuzzyEqual(c, centers[0], epsilon));
        const allLeftsAligned = lefts.every(l => fuzzyEqual(l, lefts[0], epsilon));

        if (allCentersAligned && !allLeftsAligned) {
            containerNode.stackCounterAlignItems = 'CENTER';
        } else {
            containerNode.stackCounterAlignItems = 'MIN';
        }

        const newChildren = [];

        for (let bandIdx = 0; bandIdx < yBands.length; bandIdx++) {
            const band = yBands[bandIdx];
            let rowMarginTop = 0;
            if (useChildMargins && bandIdx > 0) {
                const actualGap = rowGaps[bandIdx - 1];
                if (Math.abs(actualGap - baseGap) > epsilon || baseGap === 0) {
                    rowMarginTop = actualGap - baseGap;
                }
            }

            if (band.nodes.length === 1) {
                const singleNode = band.nodes[0];
                if (rowMarginTop > 0) {
                    singleNode.stackChildMarginTop = rowMarginTop;
                }
                const nodeBox = BoundingBox.fromNode(singleNode);

                // Stretch full-width items (unless it is a button)
                if (containerW > 0 && nodeBox.width >= (containerW - pl - pr - epsilon * 2) && !singleNode.isButton) {
                    singleNode.stackCounterSizing = 'FIXED';
                    singleNode.layoutAlign = 'STRETCH';
                }

                if (singleNode.children && singleNode.children.length > 0 && singleNode.stackMode === 'NONE') {
                    synthesizeContainerLayout(singleNode, options);
                }
                newChildren.push(singleNode);
            } else {
                // Synthesize a virtual horizontal row frame
                const rowBounds = band.bounds;
                const isFullWidthRow = containerW > 0 && rowBounds.width >= (containerW - pl - pr - epsilon * 2);
                const rowFrame = {
                    guid: nextVirtualGuid(),
                    type: 'FRAME',
                    name: 'Row',
                    isSynthesized: true,
                    stackMode: 'HORIZONTAL',
                    stackPrimarySizing: isFullWidthRow ? 'FIXED' : 'RESIZE_TO_FIT',
                    stackCounterSizing: 'RESIZE_TO_FIT',
                    layoutAlign: isFullWidthRow ? 'STRETCH' : 'INHERIT',
                    size: { x: rowBounds.width, y: rowBounds.height },
                    transform: {
                        m00: 1,
                        m01: 0,
                        m02: rowBounds.xMin,
                        m10: 0,
                        m11: 1,
                        m12: rowBounds.yMin
                    },
                    children: band.nodes
                };

                if (rowMarginTop > 0) {
                    rowFrame.stackChildMarginTop = rowMarginTop;
                }

                // Adjust nodes' coordinates relative to rowFrame
                for (const node of band.nodes) {
                    adjustCoordinatesRelativeToContainer(node, rowBounds.xMin, rowBounds.yMin);
                }

                synthesizeContainerLayout(rowFrame, options);
                newChildren.push(rowFrame);
            }
        }

        containerNode.children = [...newChildren, ...overlayNodes];
        return containerNode;
    }

    // 2. Cut along X axis (Horizontal Stack of Columns)
    if (xBands.length >= 2) {
        const flowBounds = BoundingBox.computeUnion(flowNodes);

        const pt = Math.max(0, Math.round(flowBounds.yMin));
        const pl = Math.max(0, Math.round(flowBounds.xMin));
        const pr = containerW > 0 ? Math.max(0, Math.round(containerW - flowBounds.xMax)) : 0;
        const pb = containerH > 0 ? Math.max(0, Math.round(containerH - flowBounds.yMax)) : 0;

        containerNode.stackMode = 'HORIZONTAL';
        containerNode.stackVerticalPadding = pt;
        containerNode.stackHorizontalPadding = pl;
        containerNode.stackPaddingRight = pr;
        containerNode.stackPaddingBottom = pb;

        // Mark button-like containers to hug content
        for (const node of flowNodes) {
            const nodeName = (node.name || '').toLowerCase();
            const isBtn = nodeName.startsWith('btn') || nodeName === 'button' || nodeName.includes('btn-');
            if (isBtn) {
                node.isButton = true;
                node.stackPrimarySizing = 'RESIZE_TO_FIT';
                node.stackCounterSizing = 'RESIZE_TO_FIT';
            }
        }

        // Analyze child widths and heights for equal sizing / flex distribution
        const nonBtnNodes = flowNodes.filter(n => !n.isButton);
        if (nonBtnNodes.length >= 2) {
            const widths = nonBtnNodes.map(n => n.size?.x || n.width || 0).filter(w => w > 0);
            const widthClusters = clusterValues(widths, epsilon);
            const heights = nonBtnNodes.map(n => n.size?.y || n.height || 0).filter(h => h > 0);
            const heightClusters = clusterValues(heights, epsilon);

            // 1. Equal-width distribution
            if (widthClusters.length === 1) {
                // All items in the row have equal width
                for (const n of nonBtnNodes) {
                    n.layoutGrow = 1;
                    n.stackChildPrimaryGrow = 1.0;
                    n.isEqualWidthGroup = true;
                }
            } else if (widthClusters.length > 1) {
                // Multiple width clusters: items in dominant cluster get flex: 1, others keep fixed width
                widthClusters.sort((a, b) => b.values.length - a.values.length);
                const largestCluster = widthClusters[0];
                if (largestCluster.values.length >= 2) {
                    for (const n of nonBtnNodes) {
                        const nw = n.size?.x || n.width || 0;
                        if (fuzzyEqual(nw, largestCluster.median, epsilon)) {
                            n.layoutGrow = 1;
                            n.stackChildPrimaryGrow = 1.0;
                            n.isEqualWidthGroup = true;
                        }
                    }
                }
            }

            // 2. Equal-height distribution
            if (heightClusters.length === 1) {
                // All items in the row have equal height
                for (const n of nonBtnNodes) {
                    n.isEqualHeightGroup = true;
                }
            } else if (heightClusters.length > 1) {
                // Some items have equal height, some have different heights
                heightClusters.sort((a, b) => b.values.length - a.values.length);
                const largestHeightCluster = heightClusters[0];
                if (largestHeightCluster.values.length >= 2) {
                    for (const n of nonBtnNodes) {
                        const nh = n.size?.y || n.height || 0;
                        if (fuzzyEqual(nh, largestHeightCluster.median, epsilon)) {
                            n.isEqualHeightGroup = true;
                        }
                    }
                }
            }
        }

        // Calculate median gap between columns
        const colGaps = [];
        for (let i = 0; i < xBands.length - 1; i++) {
            const gap = xBands[i + 1].interval.start - xBands[i].interval.end;
            colGaps.push(Math.max(0, Math.round(gap)));
        }

        const minColGap = Math.min(...colGaps);
        const maxColGap = Math.max(...colGaps);
        const isUniformColGap = (maxColGap - minColGap) <= epsilon;

        let baseColGap = 0;
        let useColMargins = false;

        if (isUniformColGap) {
            baseColGap = computeMedian(colGaps);
            containerNode.stackSpacing = baseColGap;
        } else {
            const gapClusters = clusterValues(colGaps, epsilon);
            gapClusters.sort((a, b) => b.values.length - a.values.length);
            if (gapClusters[0].values.length >= Math.ceil(colGaps.length * 0.7)) {
                baseColGap = Math.round(gapClusters[0].median);
                containerNode.stackSpacing = baseColGap;
                useColMargins = true;
            } else {
                baseColGap = 0;
                containerNode.stackSpacing = 0;
                useColMargins = true;
            }
        }

        // Check primary alignment (justify-content)
        // If elements are pushed to far edges (e.g., space-between navbar)
        if (containerW > 0 && xBands.length >= 2) {
            const firstBand = xBands[0];
            const lastBand = xBands[xBands.length - 1];
            const leftPinned = firstBand.bounds.xMin <= epsilon * 3;
            const rightPinned = (containerW - lastBand.bounds.xMax) <= epsilon * 3;

            if (leftPinned && rightPinned && colGaps.some(g => g > 40)) {
                containerNode.stackPrimaryAlignItems = 'SPACE_BETWEEN';
            } else {
                // Check if horizontally centered
                const marginDiff = Math.abs(pl - pr);
                if (marginDiff <= epsilon && pl > 20) {
                    containerNode.stackPrimaryAlignItems = 'CENTER';
                } else {
                    containerNode.stackPrimaryAlignItems = 'MIN';
                }
            }
        } else {
            containerNode.stackPrimaryAlignItems = 'MIN';
        }

        // Vertical cross-axis alignment
        const yCenters = xBands.map(b => b.bounds.centerY);
        const yTops = xBands.map(b => b.bounds.yMin);
        const yBottoms = xBands.map(b => b.bounds.yMax);

        const allCentersAligned = yCenters.every(c => fuzzyEqual(c, yCenters[0], epsilon));
        const allTopsAligned = yTops.every(t => fuzzyEqual(t, yTops[0], epsilon));
        const allBottomsAligned = yBottoms.every(b => fuzzyEqual(b, yBottoms[0], epsilon));

        if (allCentersAligned) {
            containerNode.stackCounterAlignItems = 'CENTER';
        } else if (allTopsAligned) {
            containerNode.stackCounterAlignItems = 'MIN';
        } else if (allBottomsAligned) {
            containerNode.stackCounterAlignItems = 'MAX';
        } else {
            containerNode.stackCounterAlignItems = 'CENTER';
        }

        const newChildren = [];

        for (let bandIdx = 0; bandIdx < xBands.length; bandIdx++) {
            const band = xBands[bandIdx];
            let colMarginLeft = 0;
            if (useColMargins && bandIdx > 0) {
                const actualGap = colGaps[bandIdx - 1];
                if (Math.abs(actualGap - baseColGap) > epsilon || baseColGap === 0) {
                    colMarginLeft = actualGap - baseColGap;
                }
            }

            if (band.nodes.length === 1) {
                const singleNode = band.nodes[0];
                if (colMarginLeft > 0) {
                    singleNode.stackChildMarginLeft = colMarginLeft;
                }
                if (singleNode.children && singleNode.children.length > 0 && singleNode.stackMode === 'NONE') {
                    synthesizeContainerLayout(singleNode, options);
                }
                newChildren.push(singleNode);
            } else {
                // Synthesize a virtual vertical column frame
                const colBounds = band.bounds;
                const colFrame = {
                    guid: nextVirtualGuid(),
                    type: 'FRAME',
                    name: 'Column',
                    isSynthesized: true,
                    stackMode: 'VERTICAL',
                    stackPrimarySizing: 'RESIZE_TO_FIT',
                    stackCounterSizing: 'RESIZE_TO_FIT',
                    size: { x: colBounds.width, y: colBounds.height },
                    transform: {
                        m00: 1,
                        m01: 0,
                        m02: colBounds.xMin,
                        m10: 0,
                        m11: 1,
                        m12: colBounds.yMin
                    },
                    children: band.nodes
                };

                if (colMarginLeft > 0) {
                    colFrame.stackChildMarginLeft = colMarginLeft;
                }

                for (const node of band.nodes) {
                    adjustCoordinatesRelativeToContainer(node, colBounds.xMin, colBounds.yMin);
                }

                synthesizeContainerLayout(colFrame, options);
                newChildren.push(colFrame);
            }
        }

        containerNode.children = [...newChildren, ...overlayNodes];
        return containerNode;
    }

    // Fallback: If neither axis cuts, recurse into children
    for (const child of flowNodes) {
        if (child.children && child.children.length > 0 && child.stackMode === 'NONE') {
            synthesizeContainerLayout(child, options);
        }
    }

    return containerNode;
}

/**
 * Recursively runs container induction and layout synthesis on a tree node
 * @param {object} node
 * @param {object} [options={}]
 * @returns {object} Synthesized node
 */
function synthesizeLayoutTree(node, options = {}) {
    if (!node) return node;
    if (isVectorContainer(node)) return node;

    // 1. If node has children, detect and extract underlays / card backgrounds first
    if (Array.isArray(node.children) && node.children.length > 1) {
        node.children = detectAndExtractContainers(node.children, node.size, options.epsilon || 3);
    }

    // 2. Synthesize layout for this node if it lacks native Auto Layout
    const isAutoLayout = node.stackMode === 'HORIZONTAL' || node.stackMode === 'VERTICAL';
    if (!isAutoLayout && Array.isArray(node.children) && node.children.length > 0) {
        synthesizeContainerLayout(node, options);
    }

    // 3. Recurse into any children that have children
    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            if (Array.isArray(child.children) && child.children.length > 0) {
                synthesizeLayoutTree(child, options);
            }
        }
    }

    return node;
}

/**
 * Applies layout synthesis to root nodes or canvas
 * @param {Array<object>|object} rootNodes
 * @param {object} [options={}]
 * @returns {Array<object>}
 */
function applySmartLayout(rootNodes, options = {}) {
    if (!rootNodes) return rootNodes;

    const list = Array.isArray(rootNodes) ? rootNodes : [rootNodes];
    for (const root of list) {
        synthesizeLayoutTree(root, options);
    }

    return list;
}

module.exports = {
    detectGrid,
    synthesizeContainerLayout,
    synthesizeLayoutTree,
    applySmartLayout
};
