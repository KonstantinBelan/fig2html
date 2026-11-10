// src/decompiler/tailwind/typography.js
import { mapGradientToTailwind } from './effects.js';
import { snapSpacing } from './scale-snapper.js';

/**
 * Maps font family name to standard Tailwind font-family utility or theme
 * @param {string} family
 * @returns {string|null}
 */
export function mapFontFamily(family) {
    if (!family || typeof family !== 'string') return null;
    const clean = family.toLowerCase();

    if (clean.includes('mono') || clean.includes('code') || clean.includes('consolas') || clean.includes('menlo')) {
        return 'font-mono';
    }
    if (clean.includes('serif') || clean.includes('georgia') || clean.includes('times') || clean.includes('garamond') || clean.includes('merriweather') || clean.includes('playfair') || clean.includes('lora')) {
        return 'font-serif';
    }
    // Default sans-serif
    return 'font-sans';
}

/**
 * Maps advanced text node features (gradients, line clamping, lists, leading trim) into Tailwind classes
 * @param {object} node Figma TEXT node
 * @param {object} [options={}]
 * @returns {Array<string>}
 */
export function mapTextNodeToTailwind(node, options = {}) {
    if (!node || node.type !== 'TEXT') return [];
    const classes = [];

    // 1. Text Truncation & Line Clamping
    if (node.textTruncation === 'ENDING' || node.textAutoResize === 'TRUNCATE') {
        if (node.maxLines && node.maxLines > 1) {
            const lines = Math.min(6, Math.max(1, node.maxLines));
            classes.push(`line-clamp-${lines}`);
        } else {
            classes.push('truncate');
        }
    }

    // 2. Text Gradient Fill
    if (Array.isArray(node.fillPaints)) {
        const topGrad = [...node.fillPaints].reverse().find(f => f.visible !== false && (f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL'));
        if (topGrad) {
            const gradClasses = mapGradientToTailwind(topGrad, options);
            if (gradClasses.length > 0) {
                classes.push(...gradClasses);
                classes.push('bg-clip-text', 'text-transparent');
            }
        }
    }

    // 3. Lists (Ordered / Unordered)
    const hasListLines = Array.isArray(node.textData?.lines) && node.textData.lines.length > 0 &&
        node.textData.lines.every(l => l.lineType === 'ORDERED_LIST' || l.lineType === 'UNORDERED_LIST');
    if (hasListLines) {
        const isOrdered = node.textData.lines.every(l => l.lineType === 'ORDERED_LIST');
        classes.push(isOrdered ? 'list-decimal' : 'list-disc');
        classes.push('pl-5');

        if (node.listSpacing && node.listSpacing > 0) {
            const s = snapSpacing(node.listSpacing, options);
            classes.push(`space-y-${s}`);
        }
    }

    // 4. Leading Trim (Cap Height)
    if (node.leadingTrim === 'CAP_HEIGHT') {
        classes.push('leading-none');
    }

    return classes;
}
