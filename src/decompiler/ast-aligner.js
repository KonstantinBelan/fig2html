// src/decompiler/ast-aligner.js

/**
 * Normalizes text content for comparison (strips whitespace, lowercase)
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Normalizes a layer name for comparison (strips common suffixes like mobile, desktop, copy, digits)
 * @param {string} name
 * @returns {string}
 */
export function normalizeLayerName(name) {
    if (!name || typeof name !== 'string') return '';
    return name
        .toLowerCase()
        .replace(/\[.*?\]|\(.*?\)|@\w+/g, '') // strip [desktop], (mobile), @768
        .replace(/[-_/\s]*(desktop|laptop|tablet|mobile|phone|screen|artboard|copy|\d+px|\d+)[-_/\s]*/gi, ' ')
        .replace(/[^a-z0-9а-яё]+/gi, ' ')
        .trim();
}

/**
 * Computes Jaccard word token similarity between two strings
 * @param {string} a
 * @param {string} b
 * @returns {number} Score between 0 and 1
 */
export function tokenSimilarity(a, b) {
    if (!a && !b) return 1.0;
    if (!a || !b) return 0.0;
    if (a === b) return 1.0;

    const wordsA = new Set(a.split(/\s+/).filter(Boolean));
    const wordsB = new Set(b.split(/\s+/).filter(Boolean));
    if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
    if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

    let intersection = 0;
    for (const w of wordsA) {
        if (wordsB.has(w)) intersection++;
    }
    const union = new Set([...wordsA, ...wordsB]).size;
    return union > 0 ? intersection / union : 0.0;
}

/**
 * Extracts raw text content from a Figma TEXT node
 * @param {object} node
 * @returns {string}
 */
export function extractNodeText(node) {
    if (!node) return '';
    if (node.type === 'TEXT') {
        return node.characters || node.textData?.characters || '';
    }
    return '';
}

/**
 * Extracts primary image hash or ref from a node if it is an image paint
 * @param {object} node
 * @returns {string|null}
 */
export function extractImageId(node) {
    if (!node || !Array.isArray(node.fillPaints)) return null;
    const imgPaint = node.fillPaints.find(f => f && f.type === 'IMAGE' && f.visible !== false);
    if (!imgPaint) return null;
    if (imgPaint.image?.hash) {
        return Buffer.isBuffer(imgPaint.image.hash)
            ? imgPaint.image.hash.toString('hex')
            : String(imgPaint.image.hash);
    }
    if (imgPaint.imageRef) return String(imgPaint.imageRef);
    return null;
}

/**
 * Computes a similarity score between two Figma nodes (0.0 to 1.0)
 * Evaluates:
 *   - Content match (Text characters or Image hash): weight 0.40
 *   - Normalized Name match: weight 0.30
 *   - Relative Structural/Role match: weight 0.20
 *   - Type match: weight 0.10
 *
 * @param {object} nodeA
 * @param {object} nodeB
 * @returns {number}
 */
export function computeNodeSimilarity(nodeA, nodeB) {
    if (!nodeA || !nodeB) return 0.0;
    if (nodeA === nodeB) return 1.0;

    // 1. Type match
    const typeMatch = nodeA.type === nodeB.type ? 1.0 : (
        // Allow structural interchangeability between FRAME, GROUP, COMPONENT, INSTANCE
        (['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE'].includes(nodeA.type) &&
         ['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE'].includes(nodeB.type)) ? 0.8 : 0.0
    );

    // If completely incompatible types (e.g. TEXT vs RECTANGLE), reject
    if (typeMatch === 0.0) {
        return 0.0;
    }

    // 2. Content match
    let contentScore = 0.5; // Neutral default for containers
    if (nodeA.type === 'TEXT' && nodeB.type === 'TEXT') {
        const textA = normalizeText(extractNodeText(nodeA));
        const textB = normalizeText(extractNodeText(nodeB));
        if (textA === textB && textA.length > 0) {
            contentScore = 1.0;
        } else if (textA.length > 0 && textB.length > 0) {
            contentScore = tokenSimilarity(textA, textB);
        } else {
            contentScore = 0.0;
        }
    } else {
        const imgA = extractImageId(nodeA);
        const imgB = extractImageId(nodeB);
        if (imgA && imgB) {
            contentScore = imgA === imgB ? 1.0 : 0.0;
        }
    }

    // 3. Name match
    const nameA = normalizeLayerName(nodeA.name);
    const nameB = normalizeLayerName(nodeB.name);
    let nameScore = 0.0;
    if (nameA === nameB && nameA.length > 0) {
        nameScore = 1.0;
    } else if (nameA.length > 0 && nameB.length > 0) {
        nameScore = tokenSimilarity(nameA, nameB);
    } else if (nodeA.name && nodeB.name && nodeA.name.trim().toLowerCase() === nodeB.name.trim().toLowerCase()) {
        nameScore = 0.9;
    }

    // 4. Structural child count match for containers
    let childCountScore = 1.0;
    const countA = Array.isArray(nodeA.children) ? nodeA.children.length : 0;
    const countB = Array.isArray(nodeB.children) ? nodeB.children.length : 0;
    if (countA > 0 || countB > 0) {
        const maxC = Math.max(countA, countB);
        const minC = Math.min(countA, countB);
        childCountScore = minC / maxC;
    }

    // Weighted composite score
    // Content (0.40) + Name (0.30) + Structural (0.20) + Type (0.10)
    const composite = (contentScore * 0.40) + (nameScore * 0.30) + (childCountScore * 0.20) + (typeMatch * 0.10);
    return Math.round(composite * 1000) / 1000;
}

/**
 * Deep clones an AST node for canonical tree composition
 * @param {object} obj
 * @returns {object}
 */
export function cloneAstNode(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const copy = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) {
        if (k === 'children' && Array.isArray(v)) {
            copy.children = v.map(cloneAstNode);
        } else if (typeof v === 'object' && v !== null && !Buffer.isBuffer(v)) {
            copy[k] = cloneAstNode(v);
        } else {
            copy[k] = v;
        }
    }
    return copy;
}

/**
 * Bipartite matching between children of a base container and children of a variant container.
 * Returns paired nodes and unmatched exclusive nodes.
 *
 * @param {Array<object>} baseChildren
 * @param {Array<object>} variantChildren
 * @param {number} [threshold=0.65]
 * @returns {{ matches: Array<{ base: object, variant: object, score: number }>, unmatchedBase: Array<object>, unmatchedVariant: Array<object> }}
 */
export function matchChildren(baseChildren = [], variantChildren = [], threshold = 0.65) {
    const pairs = [];
    const usedBase = new Set();
    const usedVariant = new Set();

    // Compute similarity matrix
    const matrix = [];
    for (let i = 0; i < baseChildren.length; i++) {
        for (let j = 0; j < variantChildren.length; j++) {
            const score = computeNodeSimilarity(baseChildren[i], variantChildren[j]);
            if (score >= threshold) {
                matrix.push({ bIdx: i, vIdx: j, score });
            }
        }
    }

    // Sort candidate pairs by score descending (greedy maximum-weight matching)
    matrix.sort((a, b) => b.score - a.score);

    for (const candidate of matrix) {
        if (!usedBase.has(candidate.bIdx) && !usedVariant.has(candidate.vIdx)) {
            usedBase.add(candidate.bIdx);
            usedVariant.add(candidate.vIdx);
            pairs.push({
                base: baseChildren[candidate.bIdx],
                variant: variantChildren[candidate.vIdx],
                score: candidate.score
            });
        }
    }

    const unmatchedBase = baseChildren.filter((_, idx) => !usedBase.has(idx));
    const unmatchedVariant = variantChildren.filter((_, idx) => !usedVariant.has(idx));

    return {
        matches: pairs,
        unmatchedBase,
        unmatchedVariant
    };
}

/**
 * Aligns a base scene tree (e.g. Desktop) with one or more variant trees (e.g. Tablet, Mobile).
 * Produces a unified canonical tree containing all nodes, with visibility metadata:
 *   - node.responsiveMetadata = {
 *       visibility: { desktop: true, mobile: false, ... },
 *       alignedVariants: { desktop: nodeA, mobile: nodeB },
 *       isExclusive: true/false,
 *       exclusiveMode: 'desktop-only' | 'mobile-only' | null
 *     }
 *
 * @param {object} baseRoot The root node of the primary/widest breakpoint (e.g. Desktop 1440)
 * @param {Array<{ name: string, width: number, frame: object }>} variantBreakpoints
 * @returns {{ canonicalTree: object, nodeAlignmentMap: Map<object, Record<string, object>>, exclusiveNodes: Array<object> }}
 */
export function alignBreakpointTrees(baseRoot, variantBreakpoints = []) {
    if (!baseRoot) return { canonicalTree: null, nodeAlignmentMap: new Map(), exclusiveNodes: [] };

    const baseName = 'desktop';
    const allBreakpointNames = [baseName, ...variantBreakpoints.map(v => v.name)];

    const canonicalTree = cloneAstNode(baseRoot);
    const nodeAlignmentMap = new Map();
    const exclusiveNodes = [];

    // Helper to initialize responsive metadata on a canonical node
    function initMetadata(node, matchedBaseNode) {
        if (!node) return;
        const initialVisibility = {};
        const aligned = {};
        for (const bp of allBreakpointNames) {
            initialVisibility[bp] = true;
        }
        aligned[baseName] = matchedBaseNode || node;
        node.responsiveMetadata = {
            visibility: initialVisibility,
            alignedVariants: aligned,
            isExclusive: false,
            exclusiveMode: null
        };
        nodeAlignmentMap.set(node, aligned);
    }

    // Pass 1: Initialize metadata for all nodes in cloned canonical tree
    function walkInit(node) {
        initMetadata(node, node);
        if (node.children) {
            for (const child of node.children) {
                walkInit(child);
            }
        }
    }
    walkInit(canonicalTree);

    // Pass 2: Reconcile each variant breakpoint against canonical tree
    for (const variantBp of variantBreakpoints) {
        const bpName = variantBp.name;
        const variantRoot = variantBp.frame;
        if (!variantRoot) continue;

        reconcileContainer(canonicalTree, variantRoot, bpName);
    }

    /**
     * Recursively reconciles a canonical container with a variant container
     */
    function reconcileContainer(canonicalContainer, variantContainer, bpName) {
        if (!canonicalContainer || !variantContainer) return;

        // Register container alignment
        canonicalContainer.responsiveMetadata.alignedVariants[bpName] = variantContainer;

        const canonicalChildren = canonicalContainer.children || [];
        const variantChildren = variantContainer.children || [];

        if (canonicalChildren.length === 0 && variantChildren.length === 0) {
            return;
        }

        const { matches, unmatchedBase, unmatchedVariant } = matchChildren(canonicalChildren, variantChildren);

        // 1. Process matched children recursively
        for (const pair of matches) {
            pair.base.responsiveMetadata.alignedVariants[bpName] = pair.variant;
            pair.base.responsiveMetadata.visibility[bpName] = true;

            // Recurse into child containers
            if (pair.base.children || pair.variant.children) {
                reconcileContainer(pair.base, pair.variant, bpName);
            }
        }

        // 2. Mark unmatched base children as hidden on this variant breakpoint (Desktop-only)
        for (const orphanBase of unmatchedBase) {
            orphanBase.responsiveMetadata.visibility[bpName] = false;
            orphanBase.responsiveMetadata.isExclusive = true;
            orphanBase.responsiveMetadata.exclusiveMode = 'desktop-only';
            if (!exclusiveNodes.includes(orphanBase)) {
                exclusiveNodes.push(orphanBase);
            }
        }

        // 3. Insert unmatched variant children into canonical tree as Mobile-only / Variant-only
        for (const orphanVariant of unmatchedVariant) {
            const canonicalNewNode = cloneAstNode(orphanVariant);

            // Configure as exclusive variant-only node
            const vis = {};
            for (const bp of allBreakpointNames) {
                vis[bp] = (bp === bpName); // true only for this variant
            }
            const aligned = { [bpName]: orphanVariant };

            canonicalNewNode.responsiveMetadata = {
                visibility: vis,
                alignedVariants: aligned,
                isExclusive: true,
                exclusiveMode: `${bpName}-only`
            };

            nodeAlignmentMap.set(canonicalNewNode, aligned);
            exclusiveNodes.push(canonicalNewNode);

            // Insert into canonical children
            if (!canonicalContainer.children) {
                canonicalContainer.children = [];
            }
            canonicalContainer.children.push(canonicalNewNode);
        }
    }

    return {
        canonicalTree,
        nodeAlignmentMap,
        exclusiveNodes
    };
}
