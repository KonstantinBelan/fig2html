// src/decompiler/tailwind/responsive.js
import { resolveNodeTailwindClasses } from './layout.js';
import { deduplicateTailwindClasses } from './mapper.js';

/**
 * Standard Tailwind screen breakpoints
 */
export const TAILWIND_BREAKPOINTS = [
    { name: 'sm', width: 640 },
    { name: 'md', width: 768 },
    { name: 'lg', width: 1024 },
    { name: 'xl', width: 1280 },
    { name: '2xl', width: 1536 }
];

/**
 * Maps a pixel breakpoint width to the closest Tailwind screen prefix
 * @param {number} width Viewport width in pixels
 * @param {boolean} [mobileFirst=true]
 * @returns {string} e.g. 'md:', 'lg:', 'max-md:'
 */
export function getTailwindBreakpointPrefix(width, mobileFirst = true) {
    if (!width || typeof width !== 'number') return '';

    // Match exact standard breakpoints or nearest within 40px
    for (let i = TAILWIND_BREAKPOINTS.length - 1; i >= 0; i--) {
        const bp = TAILWIND_BREAKPOINTS[i];
        if (Math.abs(width - bp.width) <= 40 || width >= bp.width) {
            return mobileFirst ? `${bp.name}:` : `max-${bp.name}:`;
        }
    }

    if (mobileFirst) {
        return width <= 640 ? '' : `min-[${Math.round(width)}px]:`;
    } else {
        return `max-[${Math.round(width)}px]:`;
    }
}

/**
 * Categorizes a Tailwind utility class into its CSS property domain
 * to allow accurate diffing between breakpoints
 * @param {string} cls
 * @returns {string} Domain key (e.g. 'flex-direction', 'padding', 'width')
 */
export function getClassDomain(cls) {
    if (!cls) return '';
    // Strip existing prefix if any
    const colonIdx = cls.lastIndexOf(':');
    const base = colonIdx !== -1 ? cls.slice(colonIdx + 1) : cls;

    if (base === 'flex-row' || base === 'flex-col' || base === 'flex-row-reverse' || base === 'flex-col-reverse') return 'flex-direction';
    if (base === 'flex-wrap' || base === 'flex-nowrap' || base === 'flex-wrap-reverse') return 'flex-wrap';
    if (base.startsWith('justify-')) return 'justify';
    if (base.startsWith('items-')) return 'items';
    if (base.startsWith('self-')) return 'self';
    if (base.startsWith('gap-')) return 'gap';
    if (base.startsWith('gap-x-')) return 'gap-x';
    if (base.startsWith('gap-y-')) return 'gap-y';
    if (base.startsWith('p-') || base.startsWith('px-') || base.startsWith('py-') ||
        base.startsWith('pt-') || base.startsWith('pr-') || base.startsWith('pb-') || base.startsWith('pl-')) return 'padding';
    if (base.startsWith('m-') || base.startsWith('mx-') || base.startsWith('my-') ||
        base.startsWith('mt-') || base.startsWith('mr-') || base.startsWith('mb-') || base.startsWith('ml-')) return 'margin';
    if (base.startsWith('w-')) return 'width';
    if (base.startsWith('h-')) return 'height';
    if (base.startsWith('text-')) {
        if (['text-left', 'text-center', 'text-right', 'text-justify'].includes(base)) return 'text-align';
        if (['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl', 'text-8xl', 'text-9xl'].includes(base) || base.startsWith('text-[')) return 'font-size';
        return 'text-color';
    }
    if (base.startsWith('font-')) return 'font-weight';
    if (base.startsWith('bg-')) return 'background';
    if (base.startsWith('rounded-') || base === 'rounded') return 'rounded';
    if (base.startsWith('shadow-') || base === 'shadow') return 'shadow';
    if (['hidden', 'block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex'].includes(base)) return 'display';

    return base;
}

/**
 * Computes responsive delta classes between a base element and variant elements across breakpoints
 * @param {Array<string>} baseClasses Classes for base/mobile viewport
 * @param {Array<{ width: number, classes: Array<string> }>} variantBreakpoints
 * @param {object} [options={}]
 * @returns {Array<string>} Merged array with responsive prefixed utilities
 */
export function mergeResponsiveTailwindClasses(baseClasses, variantBreakpoints, options = {}) {
    const mobileFirst = options.mobileFirst !== false;
    const result = [...baseClasses];

    // Map base classes by domain
    const baseDomainMap = new Map();
    for (const cls of baseClasses) {
        baseDomainMap.set(getClassDomain(cls), cls);
    }

    // Sort variant breakpoints (ascending for mobile-first, descending for desktop-first)
    const sortedVariants = [...variantBreakpoints].sort((a, b) =>
        mobileFirst ? a.width - b.width : b.width - a.width
    );

    for (const variant of sortedVariants) {
        const prefix = getTailwindBreakpointPrefix(variant.width, mobileFirst);
        if (!prefix) continue;

        for (const vCls of variant.classes) {
            const domain = getClassDomain(vCls);
            const baseCls = baseDomainMap.get(domain);

            // If variant class differs from base class for this domain, add with prefix
            if (baseCls !== vCls) {
                result.push(`${prefix}${vCls}`);
            }
        }
    }

    return deduplicateTailwindClasses(result);
}

/**
 * Synthesizes complete responsive Tailwind classes across matched nodes from AST alignment
 * @param {object} params
 * @param {object} params.canonicalNode Base canonical scene node
 * @param {Array<object>} params.pageBreakpoints Breakpoint objects with frame & width
 * @param {Map<string, object>} params.imageRegistry
 * @param {object} [params.options={}]
 * @returns {string} Combined responsive Tailwind class string
 */
export function synthesizeNodeResponsiveTailwind(canonicalNode, pageBreakpoints = [], imageRegistry = new Map(), options = {}) {
    if (!canonicalNode) return '';

    // 1. Resolve classes for base node
    const baseResult = resolveNodeTailwindClasses(canonicalNode, canonicalNode.parentNode || null, imageRegistry, options);

    if (!Array.isArray(pageBreakpoints) || pageBreakpoints.length <= 1) {
        return baseResult.classString;
    }

    // 2. Identify base breakpoint (smallest width for mobile-first, largest for desktop-first)
    const isMobileFirst = options.mobileFirst !== false;
    const sortedBps = [...pageBreakpoints].sort((a, b) => a.width - b.width);
    const baseBp = isMobileFirst ? sortedBps[0] : sortedBps[sortedBps.length - 1];
    const variantBps = sortedBps.filter(b => b !== baseBp);

    // 3. Resolve classes for variant matched nodes
    const variantClassList = [];
    for (const vBp of variantBps) {
        const matchedNode = canonicalNode.variantNodesMap?.get(vBp.width) || canonicalNode;
        const vResult = resolveNodeTailwindClasses(matchedNode, matchedNode.parentNode || null, imageRegistry, options);
        variantClassList.push({
            width: vBp.width,
            classes: vResult.classes
        });
    }

    // 4. Merge responsive classes
    const merged = mergeResponsiveTailwindClasses(baseResult.classes, variantClassList, { mobileFirst: isMobileFirst });

    return merged.join(' ');
}
