// src/decompiler/tailwind/layout.js
import { snapSpacing } from './scale-snapper.js';
import { mapStylesToTailwind, deduplicateTailwindClasses } from './mapper.js';
import { mapGradientToTailwind, mapBlendMode, mapSvgIconToTailwind } from './effects.js';
import { mapTextNodeToTailwind, mapFontFamily } from './typography.js';
import { computeNodeStyles } from '../css/index.js';
import { resolveSmartAbsoluteAnchors, parseGridAxisCount, isVectorContainer, isVectorNode } from '../css/layout-styles.js';

/**
 * Maps a Figma node with Auto Layout or Grid properties into Tailwind layout classes
 * @param {object} node
 * @param {object} [parentNode=null]
 * @param {object} [options={}]
 * @returns {Array<string>} List of layout utility classes
 */
export function mapAutoLayoutToTailwind(node, parentNode = null, options = {}) {
    if (!node) return [];
    const classes = [];

    const isAutoLayout = !node.isCollapsedGraphicRoot && (node.stackMode === 'HORIZONTAL' || node.stackMode === 'VERTICAL');
    const numGridCols = parseGridAxisCount(node.gridColumns);
    const numGridRows = parseGridAxisCount(node.gridRows);
    const isGridContainer = Boolean(
        node.isGrid ||
        node.layoutType === 'GRID' ||
        options.layoutMode === 'grid' ||
        numGridCols ||
        (node.stackWrap === 'WRAP' && Array.isArray(node.children) && node.children.length > 2 && node.stackCounterSpacing)
    );

    // 1. Grid Container
    if (isGridContainer) {
        classes.push('grid');
        if (numGridCols && numGridCols > 0) {
            classes.push(`grid-cols-${numGridCols}`);
        } else if (node.gridColumnsCount) {
            classes.push(`grid-cols-${node.gridColumnsCount}`);
        } else if (node.stackMode === 'HORIZONTAL' && Array.isArray(node.children) && node.children.length > 0) {
            const childW = node.children[0]?.size?.x || 200;
            const containerW = node.size?.x || 1200;
            const cols = Math.max(1, Math.min(node.children.length, Math.round(containerW / Math.max(50, childW))));
            classes.push(`grid-cols-${cols}`);
        } else {
            classes.push('grid-cols-1');
        }

        if (numGridRows && numGridRows > 1) {
            classes.push(`grid-rows-${numGridRows}`);
        }

        // Gap
        if (node.gridColumnGap !== undefined || node.gridRowGap !== undefined) {
            if (node.gridColumnGap) {
                const s = snapSpacing(node.gridColumnGap, options);
                classes.push(`gap-x-${s}`);
            }
            if (node.gridRowGap) {
                const s = snapSpacing(node.gridRowGap, options);
                classes.push(`gap-y-${s}`);
            }
            if (!node.gridColumnGap && !node.gridRowGap && node.stackSpacing) {
                const s = snapSpacing(node.stackSpacing, options);
                classes.push(`gap-${s}`);
            }
        } else if (node.stackSpacing && node.stackSpacing > 0) {
            const s = snapSpacing(node.stackSpacing, options);
            classes.push(`gap-${s}`);
        }
    } else if (isAutoLayout) {
        // 2. Flexbox Container
        classes.push('flex');
        classes.push(node.stackMode === 'HORIZONTAL' ? 'flex-row' : 'flex-col');

        if (node.stackWrap === 'WRAP') {
            classes.push('flex-wrap');
        }

        // Gap
        if (node.stackSpacing && node.stackSpacing > 0) {
            const s = snapSpacing(node.stackSpacing, options);
            classes.push(`gap-${s}`);
        }
        if (node.stackCounterSpacing && node.stackCounterSpacing > 0 && node.stackWrap === 'WRAP') {
            const s = snapSpacing(node.stackCounterSpacing, options);
            if (node.stackMode === 'HORIZONTAL') {
                classes.push(`gap-y-${s}`);
            } else {
                classes.push(`gap-x-${s}`);
            }
        }

        // Primary axis alignment (justify-content)
        const primaryAlign = node.stackPrimaryAlignItems || node.primaryAxisAlignItems;
        if (primaryAlign === 'CENTER') classes.push('justify-center');
        else if (primaryAlign === 'MAX') classes.push('justify-end');
        else if (primaryAlign === 'SPACE_BETWEEN' || primaryAlign === 'SPACE_EVENLY') classes.push('justify-between');
        else if (primaryAlign === 'SPACE_AROUND') classes.push('justify-around');
        else if (primaryAlign === 'MIN') classes.push('justify-start');

        // Cross axis alignment (align-items)
        const counterAlign = node.stackCounterAlignItems || node.counterAxisAlignItems;
        if (counterAlign === 'CENTER') classes.push('items-center');
        else if (counterAlign === 'MAX') classes.push('items-end');
        else if (counterAlign === 'MIN') classes.push('items-start');
        else if (counterAlign === 'BASELINE') classes.push('items-baseline');
        else if (counterAlign === 'STRETCH') classes.push('items-stretch');
    }

    // 3. Padding (Auto Layout padding)
    const pt = node.stackPaddingTop !== undefined ? node.stackPaddingTop : (node.stackVerticalPadding || node.stackPaddingVertical || 0);
    const pr = node.stackPaddingRight !== undefined ? node.stackPaddingRight : (node.stackHorizontalPadding || node.stackPaddingHorizontal || 0);
    const pb = node.stackPaddingBottom !== undefined ? node.stackPaddingBottom : (node.stackVerticalPadding || node.stackPaddingVertical || 0);
    const pl = node.stackPaddingLeft !== undefined ? node.stackPaddingLeft : (node.stackHorizontalPadding || node.stackPaddingHorizontal || 0);

    if (pt > 0 || pr > 0 || pb > 0 || pl > 0) {
        if (pt === pb && pr === pl && pt === pr) {
            classes.push(`p-${snapSpacing(pt, options)}`);
        } else if (pt === pb && pr === pl) {
            if (pt > 0) classes.push(`py-${snapSpacing(pt, options)}`);
            if (pr > 0) classes.push(`px-${snapSpacing(pr, options)}`);
        } else {
            if (pt > 0) classes.push(`pt-${snapSpacing(pt, options)}`);
            if (pr > 0) classes.push(`pr-${snapSpacing(pr, options)}`);
            if (pb > 0) classes.push(`pb-${snapSpacing(pb, options)}`);
            if (pl > 0) classes.push(`pl-${snapSpacing(pl, options)}`);
        }
    }

    // 4. Child Sizing & Position relative to parent
    const parentIsAutoLayout = parentNode && (parentNode.stackMode === 'HORIZONTAL' || parentNode.stackMode === 'VERTICAL');
    const isAbsolute = node.stackPositioning === 'ABSOLUTE' || (!parentIsAutoLayout && parentNode && parentNode.type !== 'CANVAS');

    if (isAbsolute && parentNode) {
        classes.push('absolute');
        const anchors = resolveSmartAbsoluteAnchors(node, parentNode);
        const hVal = snapSpacing(anchors.horizontalVal, options);
        const vVal = snapSpacing(anchors.verticalVal, options);

        classes.push(`${anchors.horizontalProp}-${hVal}`);
        classes.push(`${anchors.verticalProp}-${vVal}`);
    } else if (parentIsAutoLayout) {
        // Child inside Auto Layout container
        const isHorizontalParent = parentNode.stackMode === 'HORIZONTAL';

        // Layout Grow (Fill container along primary axis)
        if (node.layoutGrow === 1 || node.stackPrimarySizing === 'FILL') {
            classes.push('flex-1');
        }

        // Layout Align (Cross axis alignment / Stretch)
        if (node.layoutAlign === 'STRETCH') {
            if (isHorizontalParent) {
                classes.push('h-full');
                classes.push('self-stretch');
            } else {
                classes.push('w-full');
                classes.push('self-stretch');
            }
        } else if (node.layoutAlign === 'CENTER') {
            classes.push('self-center');
        } else if (node.layoutAlign === 'MIN') {
            classes.push('self-start');
        } else if (node.layoutAlign === 'MAX') {
            classes.push('self-end');
        }

        // Fixed Sizing
        if (node.stackPrimarySizing === 'FIXED' || (node.layoutGrow !== 1 && node.size?.x && !node.children?.length)) {
            classes.push('shrink-0');
        }
    }

    return classes;
}

/**
 * Resolves complete Tailwind utility classes for any given Figma node
 * @param {object} node Figma Kiwi scene node
 * @param {object} parentNode Parent scene node
 * @param {Map<string, object>} imageRegistry
 * @param {object} [options={}]
 * @returns {{ classes: Array<string>, classString: string, remainingStyles: Record<string, string> }}
 */
export function resolveNodeTailwindClasses(node, parentNode, imageRegistry, options = {}) {
    if (!node) {
        return { classes: [], classString: '', remainingStyles: {} };
    }

    // 1. Compute full CSS styles via core engine
    const computedStyles = computeNodeStyles(node, parentNode, imageRegistry, options);

    // 2. Map computed styles to Tailwind utilities
    const { classes: mappedClasses, remainingStyles } = mapStylesToTailwind(computedStyles, options);

    // 3. Direct Auto Layout / Grid enhancements
    const layoutClasses = mapAutoLayoutToTailwind(node, parentNode, options);

    // 4. Advanced typography & text properties
    const textClasses = node.type === 'TEXT' ? mapTextNodeToTailwind(node, options) : [];
    if (node.type === 'TEXT' && node.fontName?.family) {
        const ff = mapFontFamily(node.fontName.family);
        if (ff) textClasses.push(ff);
    }

    // 5. Gradients on non-text shapes & containers
    const gradientClasses = [];
    if (node.type !== 'TEXT' && Array.isArray(node.fillPaints)) {
        const topGrad = [...node.fillPaints].reverse().find(f => f.visible !== false && (f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL'));
        if (topGrad) {
            gradientClasses.push(...mapGradientToTailwind(topGrad, options));
        }
    }

    // 6. Blend Modes
    const blendClasses = [];
    if (node.blendMode) {
        const bm = mapBlendMode(node.blendMode);
        if (bm) blendClasses.push(bm);
    }

    // 7. Vector Icons
    const vectorClasses = (isVectorContainer(node) || isVectorNode(node)) ? mapSvgIconToTailwind(node, options) : [];

    // 8. Combine and deduplicate
    const combined = deduplicateTailwindClasses([
        ...mappedClasses,
        ...layoutClasses,
        ...textClasses,
        ...gradientClasses,
        ...blendClasses,
        ...vectorClasses
    ]);

    return {
        classes: combined,
        classString: combined.join(' '),
        remainingStyles
    };
}
