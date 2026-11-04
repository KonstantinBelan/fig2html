// src/decompiler/tree.js

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

    return {
        document: documentNode,
        canvas: targetCanvas,
        rootNodes: targetCanvas.children || [],
        allNodesMap
    };
}

module.exports = {
    guidKey,
    buildSceneTree
};
