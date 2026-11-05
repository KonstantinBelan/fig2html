// src/decompiler/tree.js
const { synthesizeLayoutTree, applySmartLayout } = require('./synthesizer');

/**
 * Creates a unique string identifier for a Figma GUID
 * @param {{ sessionID: number, localID: number }} guid
 * @returns {string|null}
 */
function guidKey(guid) {
    if (!guid || guid.sessionID === undefined || guid.localID === undefined) return null;
    return `${guid.sessionID}:${guid.localID}`;
}

/**
 * Deep clones a scene node and its children
 * @param {object} node
 * @returns {object}
 */
function cloneNode(node) {
    if (!node) return null;
    const clone = { ...node };
    if (Array.isArray(clone.children)) {
        clone.children = clone.children.map(cloneNode);
    }
    return clone;
}

/**
 * Resolves a component INSTANCE node by cloning master SYMBOL children
 * and applying overrides and component property assignments.
 * @param {object} instanceNode
 * @param {Map<string, object>} allNodesMap
 * @param {number} [depth=0]
 */
function resolveInstanceNode(instanceNode, allNodesMap, depth = 0) {
    if (depth > 25) return;
    if (!instanceNode || instanceNode.type !== 'INSTANCE') return;
    if (!instanceNode.symbolData?.symbolID) return;

    const symKey = guidKey(instanceNode.symbolData.symbolID);
    const masterSymbol = allNodesMap.get(symKey);
    if (!masterSymbol) return;

    // Clone master children if instance has no children of its own
    if (!instanceNode.children || instanceNode.children.length === 0) {
        instanceNode.children = (masterSymbol.children || []).map(cloneNode);
    }

    const overrides = instanceNode.symbolData.symbolOverrides || [];
    const propAssignments = instanceNode.componentPropAssignments || [];

    // Map overrides by target key (either overrideKey or guid)
    const overrideMap = new Map();
    for (const ov of overrides) {
        if (!ov.guidPath?.guids?.length) continue;
        const lastGuid = ov.guidPath.guids[ov.guidPath.guids.length - 1];
        overrideMap.set(guidKey(lastGuid), ov);
    }

    // Map component prop assignments by defID
    const propMap = new Map();
    for (const pa of propAssignments) {
        if (pa.defID) {
            propMap.set(guidKey(pa.defID), pa);
        }
    }

    function applyDescendant(child) {
        if (!child) return;
        const childKey = guidKey(child.guid);
        const overrideKey = guidKey(child.overrideKey);

        const ov = (overrideKey && overrideMap.get(overrideKey)) || (childKey && overrideMap.get(childKey));
        if (ov) {
            if (ov.visible !== undefined) child.visible = ov.visible;
            if (ov.textData) {
                child.textData = ov.textData;
                if (ov.textData.characters) child.characters = ov.textData.characters;
            }
            if (ov.fillPaints) child.fillPaints = ov.fillPaints;
            if (ov.strokePaints) child.strokePaints = ov.strokePaints;
            if (ov.size) child.size = ov.size;
            if (ov.fontSize) child.fontSize = ov.fontSize;
            if (ov.opacity !== undefined) child.opacity = ov.opacity;
            if (ov.fontName) child.fontName = ov.fontName;
            if (ov.lineHeight) child.lineHeight = ov.lineHeight;
            if (ov.letterSpacing) child.letterSpacing = ov.letterSpacing;
            if (ov.textTracking !== undefined) child.textTracking = ov.textTracking;
            if (ov.textAlignHorizontal) child.textAlignHorizontal = ov.textAlignHorizontal;
            if (ov.textAlignVertical) child.textAlignVertical = ov.textAlignVertical;
            if (ov.textAutoResize) child.textAutoResize = ov.textAutoResize;
            if (ov.textTruncation) child.textTruncation = ov.textTruncation;
            if (ov.maxLines !== undefined) child.maxLines = ov.maxLines;
            if (ov.cornerRadius !== undefined) child.cornerRadius = ov.cornerRadius;
            if (ov.stackCounterSizing) child.stackCounterSizing = ov.stackCounterSizing;
            if (ov.stackPositioning) child.stackPositioning = ov.stackPositioning;
            if (ov.styleIdForText) child.styleIdForText = ov.styleIdForText;
            if (ov.styleIdForFill) child.styleIdForFill = ov.styleIdForFill;
        }

        // Apply parameterConsumptionMap entries from componentPropAssignments
        if (child.parameterConsumptionMap?.entries) {
            for (const entry of child.parameterConsumptionMap.entries) {
                const defId = entry.variableData?.value?.propRefValue?.defId;
                if (defId) {
                    const pa = propMap.get(guidKey(defId));
                    if (pa) {
                        if (entry.variableField === 'TEXT_DATA' && pa.varValue?.value?.textDataValue) {
                            child.textData = pa.varValue.value.textDataValue;
                        } else if (entry.variableField === 'OVERRIDDEN_SYMBOL_ID') {
                            const swapGuid = pa.value?.guidValue || pa.varValue?.value?.symbolIdValue?.guid;
                            if (swapGuid) {
                                if (!child.symbolData) child.symbolData = {};
                                child.symbolData.symbolID = swapGuid;
                                child.children = []; // Reset children to populate from new swapped symbol
                            }
                        }
                    }
                }
            }
        }

        // Check instance resolution
        if (child.type === 'INSTANCE') {
            resolveInstanceNode(child, allNodesMap, depth + 1);
        } else if (child.children && child.children.length > 0) {
            for (const c of child.children) {
                applyDescendant(c);
            }
        }
    }

    for (const child of instanceNode.children) {
        applyDescendant(child);
    }
}

/**
 * Builds a hierarchical tree from a flat list of Figma nodeChanges
 * @param {Array<object>} nodeChanges
 * @param {object} [options={}]
 * @param {string} [options.pageName='Page 1'] Name of the canvas/page to extract
 * @returns {{ document: object, canvas: object, rootNodes: Array<object>, allNodesMap: Map<string, object> }}
 */
function buildSceneTree(nodeChanges, options = {}) {
    if (!Array.isArray(nodeChanges)) {
        throw new Error('nodeChanges must be an array.');
    }

    const allNodesMap = new Map();
    const childrenMap = new Map(); // parentGuidKey -> Array<node>

    // 1. Index all nodes (merging duplicate updates if any)
    for (const change of nodeChanges) {
        const key = guidKey(change.guid);
        if (!key) continue;

        if (!allNodesMap.has(key)) {
            allNodesMap.set(key, { ...change, children: [] });
        } else {
            // Merge properties
            Object.assign(allNodesMap.get(key), change);
        }
    }

    // 2. Link parents and children
    for (const [key, node] of allNodesMap.entries()) {
        const parentKey = guidKey(node.parentIndex?.guid);
        if (parentKey) {
            if (!childrenMap.has(parentKey)) {
                childrenMap.set(parentKey, []);
            }
            childrenMap.get(parentKey).push(node);
        }
    }

    // 3. Attach sorted children to each parent node
    for (const [parentKey, children] of childrenMap.entries()) {
        // Sort children according to Figma ASCII position
        children.sort((a, b) => {
            const posA = a.parentIndex?.position || '';
            const posB = b.parentIndex?.position || '';
            if (posA < posB) return -1;
            if (posA > posB) return 1;
            return 0;
        });

        const parentNode = allNodesMap.get(parentKey);
        if (parentNode) {
            parentNode.children = children;
        }
    }

    // 4. Find Document node
    let documentNode = null;
    for (const node of allNodesMap.values()) {
        if (node.type === 'DOCUMENT') {
            documentNode = node;
            break;
        }
    }

    // 5. Find Target Canvas (Page)
    const targetPageName = options.pageName || 'Page 1';
    let targetCanvas = null;

    // Search canvases
    const canvases = [];
    for (const node of allNodesMap.values()) {
        if (node.type === 'CANVAS') {
            canvases.push(node);
        }
    }

    // Pick target page by name if found and not empty
    targetCanvas = canvases.find(c => c.name === targetPageName);
    if (!targetCanvas || targetCanvas.children.length === 0) {
        // Fallback to first canvas with children
        targetCanvas = canvases.find(c => c.children.length > 0) || canvases[0];
    }

    if (!targetCanvas) {
        throw new Error('No valid CANVAS (Page) node found in .fig tree.');
    }

    // 6. Recursively resolve all INSTANCE nodes across all canvases
    function walkAndResolve(nodes) {
        for (const node of nodes) {
            if (node.type === 'INSTANCE') {
                resolveInstanceNode(node, allNodesMap);
            }
            if (node.children && node.children.length > 0) {
                walkAndResolve(node.children);
            }
        }
    }
    for (const c of canvases) {
        if (c.children && c.children.length > 0) {
            walkAndResolve(c.children);
        }
    }

    // 7. Collect native Figma variables and variable sets
    const variableSets = [];
    const variables = [];
    for (const node of allNodesMap.values()) {
        if (node.type === 'VARIABLE_SET') {
            variableSets.push(node);
        } else if (node.type === 'VARIABLE') {
            variables.push(node);
        }
    }

    // 8. Optional smart layout synthesis if explicitly requested on tree build
    if (options.smartLayout === true) {
        applySmartLayout(targetCanvas.children, options);
    }

    return {
        document: documentNode,
        canvas: targetCanvas,
        canvases: canvases,
        rootNodes: targetCanvas.children || [],
        allNodesMap,
        variableSets,
        variables
    };
}

module.exports = {
    guidKey,
    cloneNode,
    resolveInstanceNode,
    buildSceneTree,
    synthesizeLayoutTree,
    applySmartLayout
};
