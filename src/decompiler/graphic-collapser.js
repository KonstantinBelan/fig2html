// src/decompiler/graphic-collapser.js
const crypto = require('crypto');

/**
 * Returns a 2D affine identity matrix:
 * M = [ [1, 0, 0], [0, 1, 0], [0, 0, 1] ]
 * @returns {{ m00: number, m01: number, m02: number, m10: number, m11: number, m12: number }}
 */
function identityMatrix() {
    return { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
}

/**
 * Multiplies two 2D affine matrices: C = A x B
 * In Figma Kiwi representation:
 * [ [m00, m01, m02],
 *   [m10, m11, m12],
 *   [  0,   0,   1] ]
 * Where m00 = a, m01 = c, m02 = tx
 *       m10 = b, m11 = d, m12 = ty
 *
 * @param {object} a First matrix
 * @param {object} b Second matrix
 * @returns {{ m00: number, m01: number, m02: number, m10: number, m11: number, m12: number }} Result matrix
 */
function multiplyAffineMatrices(a, b) {
    if (!a && !b) return identityMatrix();
    if (!a) return { ...b };
    if (!b) return { ...a };

    const a00 = a.m00 ?? 1, a01 = a.m01 ?? 0, a02 = a.m02 ?? 0;
    const a10 = a.m10 ?? 0, a11 = a.m11 ?? 1, a12 = a.m12 ?? 0;

    const b00 = b.m00 ?? 1, b01 = b.m01 ?? 0, b02 = b.m02 ?? 0;
    const b10 = b.m10 ?? 0, b11 = b.m11 ?? 1, b12 = b.m12 ?? 0;

    return {
        m00: a00 * b00 + a01 * b10,
        m01: a00 * b01 + a01 * b11,
        m02: a00 * b02 + a01 * b12 + a02,
        m10: a10 * b00 + a11 * b10,
        m11: a10 * b01 + a11 * b11,
        m12: a10 * b02 + a11 * b12 + a12
    };
}

/**
 * Multiplies an array of 2D affine matrices sequentially: M_cumulative = M1 x M2 x ... x Mn
 * @param {Array<object>} matrices
 * @returns {{ m00: number, m01: number, m02: number, m10: number, m11: number, m12: number }}
 */
function multiplyChain(matrices) {
    if (!Array.isArray(matrices) || matrices.length === 0) return identityMatrix();
    let res = identityMatrix();
    for (const m of matrices) {
        if (m) {
            res = multiplyAffineMatrices(res, m);
        }
    }
    return res;
}

/**
 * Decomposes a 2D affine matrix into rotation (degrees & radians), scale (Sx, Sy), and translation (Tx, Ty)
 * @param {object} m
 * @returns {{ rotateDeg: number, rotateRad: number, scaleX: number, scaleY: number, translateX: number, translateY: number }}
 */
function decomposeAffineMatrix(m) {
    if (!m) {
        return { rotateDeg: 0, rotateRad: 0, scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 };
    }
    const m00 = m.m00 ?? 1;
    const m01 = m.m01 ?? 0;
    const m02 = m.m02 ?? 0;
    const m10 = m.m10 ?? 0;
    const m11 = m.m11 ?? 1;
    const m12 = m.m12 ?? 0;

    const scaleX = Math.sqrt(m00 * m00 + m10 * m10);
    const scaleY = Math.sqrt(m01 * m01 + m11 * m11);
    const rad = Math.atan2(m10, m00);
    const deg = Math.round(rad * (180 / Math.PI) * 100) / 100;

    return {
        rotateDeg: Math.abs(deg) > 0.001 ? deg : 0,
        rotateRad: rad,
        scaleX: Math.abs(scaleX - 1) > 0.001 ? scaleX : 1,
        scaleY: Math.abs(scaleY - 1) > 0.001 ? scaleY : 1,
        translateX: m02,
        translateY: m12
    };
}

/**
 * Checks whether a node is a mask layer
 * @param {object} node
 * @returns {boolean}
 */
function isMaskNode(node) {
    return Boolean(node && (node.mask === true || node.isMask === true));
}

/**
 * Checks whether a node subtree contains text or interactive input elements
 * @param {object} node
 * @returns {boolean}
 */
function hasTextOrInteractive(node) {
    if (!node) return false;
    if (node.type === 'TEXT') return true;
    const name = node.name || '';
    if (name.startsWith('Input[') || name === 'Button' || name === 'Checkbox' || name === 'Radio') return true;
    if (node.prototypeInteractions && node.prototypeInteractions.length > 0) return true;
    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            if (hasTextOrInteractive(child)) return true;
        }
    }
    return false;
}

/**
 * Checks whether a node has visible background fills
 * @param {object} node
 * @returns {boolean}
 */
function hasVisibleFills(node) {
    if (!Array.isArray(node.fillPaints)) return false;
    return node.fillPaints.some(f => f.visible !== false && (f.opacity ?? 1) > 0.01 && (f.type !== 'SOLID' || (f.color && f.color.a > 0.01)));
}

/**
 * Checks whether a node has visible border strokes
 * @param {object} node
 * @returns {boolean}
 */
function hasVisibleStrokes(node) {
    if (!Array.isArray(node.strokePaints)) return false;
    return node.strokePaints.some(s => s.visible !== false && (s.opacity ?? 1) > 0.01);
}

/**
 * Checks whether a node has graphical effects (shadows, blur)
 * @param {object} node
 * @returns {boolean}
 */
function hasEffects(node) {
    if (!Array.isArray(node.effects)) return false;
    return node.effects.some(e => e.visible !== false);
}

/**
 * Detects whether a node represents a degenerate graphic wrapper chain:
 * (Frame/Group -> Group -> Mask Group -> Group -> Image)
 *
 * Requirements:
 * 1. Single visual branch (each intermediate node has 1 child, or 2 if one is mask).
 * 2. No text or interactive elements in the subtree.
 * 3. Leaf contains an IMAGE fill.
 * 4. Parasitic complexity: contains rotation, mask, or wrapper depth >= 2.
 *
 * @param {object} node
 * @returns {object|null} Chain description object if degenerate graphic chain is found, null otherwise
 */
function detectGraphicSubtreeChain(node) {
    if (!node || !Array.isArray(node.children) || node.children.length === 0) return null;
    if (node.type === 'CANVAS' || node.type === 'DOCUMENT') return null;
    if (hasTextOrInteractive(node)) return null;

    let curr = node;
    const chain = [];
    const masks = [];
    let hasRotation = false;
    let hasMask = false;
    let mCum = identityMatrix();

    while (curr) {
        if (!Array.isArray(curr.children) || curr.children.length === 0) {
            break;
        }

        const nonMaskChildren = curr.children.filter(c => !isMaskNode(c));
        const maskChildren = curr.children.filter(isMaskNode);

        if (maskChildren.length > 0) {
            hasMask = true;
            masks.push(...maskChildren);
        }

        // Must have exactly ONE non-mask visual child
        if (nonMaskChildren.length !== 1) {
            return null;
        }

        const next = nonMaskChildren[0];
        if (hasTextOrInteractive(next)) return null;

        if (next.transform) {
            mCum = multiplyAffineMatrices(mCum, next.transform);
            if (Math.abs(next.transform.m01 || 0) > 0.001 || Math.abs(next.transform.m10 || 0) > 0.001) {
                hasRotation = true;
            }
        }

        chain.push(next);
        curr = next;
    }

    const leaf = curr;
    if (!leaf || leaf === node) return null;

    // Leaf must have image fill
    const hasImageFill = Array.isArray(leaf.fillPaints) && leaf.fillPaints.some(f => f.type === 'IMAGE' && f.image?.hash);
    if (!hasImageFill) return null;

    const chainDepth = chain.length;
    // Degenerate chain requires rotation OR deep wrapper nesting (>= 3)
    if (!hasRotation && chainDepth < 3) {
        return null;
    }

    // Root boundary determination:
    // Variant A: Root node has no visible fills, no strokes, no effects -> replace root
    const isRootReplaced = !hasVisibleFills(node) && !hasVisibleStrokes(node) && !hasEffects(node);

    const canvasWidth = Math.round(node.size?.x || 100);
    const canvasHeight = Math.round(node.size?.y || 100);
    const decomposition = decomposeAffineMatrix(mCum);

    return {
        rootNode: node,
        isRootReplaced,
        canvasWidth,
        canvasHeight,
        chain,
        leaf,
        masks,
        cumulativeTransform: mCum,
        decomposition,
        hasRotation,
        hasMask,
        chainDepth
    };
}

/**
 * Traverses root nodes to find all graphic chains suitable for baking and collapsing
 * @param {Array<object>|object} rootNodes
 * @returns {Array<object>}
 */
function findAllGraphicChains(rootNodes) {
    const chains = [];

    function traverse(node) {
        if (!node) return;
        const chainInfo = detectGraphicSubtreeChain(node);
        if (chainInfo) {
            chains.push(chainInfo);
            // Do not traverse into children of collapsed chain
            return;
        }
        if (Array.isArray(node.children)) {
            for (const child of node.children) {
                traverse(child);
            }
        }
    }

    if (Array.isArray(rootNodes)) {
        for (const r of rootNodes) traverse(r);
    } else if (rootNodes) {
        traverse(rootNodes);
    }

    return chains;
}

/**
 * Collapses the AST structure of a graphic chain after its asset has been baked:
 * Removes intermediate wrapper layers, sets baked image hash, suppresses auto-layout padding.
 *
 * @param {object} chainInfo Result from detectGraphicSubtreeChain
 * @param {string|Buffer} bakedHash SHA-1 hash of the baked raster asset
 */
function collapseGraphicSubtree(chainInfo, bakedHash) {
    if (!chainInfo || !bakedHash) return;

    const hashBuffer = Buffer.isBuffer(bakedHash)
        ? bakedHash
        : Buffer.from(bakedHash, 'hex');

    const imageFill = {
        type: 'IMAGE',
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        image: { hash: hashBuffer },
        imageScaleMode: 'FILL'
    };

    if (chainInfo.isRootReplaced) {
        // Variant A: The root frame itself is replaced with a single <img> element
        const root = chainInfo.rootNode;
        root.isCollapsedGraphicRoot = true;
        root.fillPaints = [imageFill];
        root.children = [];
        root.stackMode = 'NONE';
        root.paddingTop = 0;
        root.paddingBottom = 0;
        root.paddingLeft = 0;
        root.paddingRight = 0;
        root.stackSpacing = 0;
        if (chainInfo.leaf?.altText) {
            root.altText = chainInfo.leaf.altText;
        }
    } else {
        // Variant B: The root frame keeps its visual background/border,
        // and its inner wrapper hierarchy collapses into a single child image
        const root = chainInfo.rootNode;
        const leaf = chainInfo.leaf;
        const imgChild = {
            ...leaf,
            name: leaf.name || 'image',
            size: { x: chainInfo.canvasWidth, y: chainInfo.canvasHeight },
            transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
            fillPaints: [imageFill],
            children: [],
            isCollapsedGraphicRoot: true
        };
        root.children = [imgChild];
    }
}

module.exports = {
    identityMatrix,
    multiplyAffineMatrices,
    multiplyChain,
    decomposeAffineMatrix,
    detectGraphicSubtreeChain,
    findAllGraphicChains,
    collapseGraphicSubtree,
    hasTextOrInteractive,
    hasVisibleFills,
    hasVisibleStrokes,
    hasEffects
};
