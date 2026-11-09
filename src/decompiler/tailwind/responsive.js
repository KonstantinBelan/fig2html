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

    // Match exact standard breakpoints or nearest within 2px
    for (let i = TAILWIND_BREAKPOINTS.length - 1; i >= 0; i--) {
        const bp = TAILWIND_BREAKPOINTS[i];
        if (Math.abs(width - bp.width) <= 2) {
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
 * @param {boolean} [detailed=false] When true, separates directional sub-properties (e.g. padding-x vs padding-y)
 * @returns {string} Domain key (e.g. 'flex-direction', 'padding', 'width')
 */
export function getClassDomain(cls, detailed = false) {
    if (!cls) return '';
    // Strip existing prefix if any
    const colonIdx = cls.lastIndexOf(':');
    const base = colonIdx !== -1 ? cls.slice(colonIdx + 1) : cls;

    // Flex layout
    if (base === 'flex-row' || base === 'flex-col' || base === 'flex-row-reverse' || base === 'flex-col-reverse') return 'flex-direction';
    if (base === 'flex-wrap' || base === 'flex-nowrap' || base === 'flex-wrap-reverse') return 'flex-wrap';
    if (base.startsWith('justify-')) return 'justify';
    if (base.startsWith('items-')) return 'items';
    if (base.startsWith('self-')) return 'self';
    if (['flex-1', 'flex-auto', 'flex-initial', 'flex-none'].includes(base) || base.startsWith('flex-[')) return 'flex-sizing';
    if (base === 'grow' || base === 'grow-0') return 'flex-grow';
    if (base === 'shrink' || base === 'shrink-0') return 'flex-shrink';

    // Grid layout
    if (base.startsWith('grid-cols-')) return 'grid-cols';
    if (base.startsWith('grid-rows-')) return 'grid-rows';
    if (base.startsWith('col-span-') || base.startsWith('col-start-') || base.startsWith('col-end-')) return 'col-placement';
    if (base.startsWith('row-span-') || base.startsWith('row-start-') || base.startsWith('row-end-')) return 'row-placement';

    // Gap
    if (base.startsWith('gap-x-')) return 'gap-x';
    if (base.startsWith('gap-y-')) return 'gap-y';
    if (base.startsWith('gap-')) return 'gap';

    // Sizing - check max/min before generic w-/h- and before m-
    if (base.startsWith('max-w-')) return 'max-width';
    if (base.startsWith('min-w-')) return 'min-width';
    if (base.startsWith('max-h-')) return 'max-height';
    if (base.startsWith('min-h-')) return 'min-height';
    if (base.startsWith('w-')) return 'width';
    if (base.startsWith('h-')) return 'height';

    // Padding
    if (detailed) {
        if (base.startsWith('px-')) return 'padding-x';
        if (base.startsWith('py-')) return 'padding-y';
        if (base.startsWith('pt-')) return 'padding-top';
        if (base.startsWith('pr-')) return 'padding-right';
        if (base.startsWith('pb-')) return 'padding-bottom';
        if (base.startsWith('pl-')) return 'padding-left';
        if (base.startsWith('p-')) return 'padding';
    } else {
        if (base.startsWith('p-') || base.startsWith('px-') || base.startsWith('py-') ||
            base.startsWith('pt-') || base.startsWith('pr-') || base.startsWith('pb-') || base.startsWith('pl-')) return 'padding';
    }

    // Margin
    if (detailed) {
        if (base.startsWith('mx-')) return 'margin-x';
        if (base.startsWith('my-')) return 'margin-y';
        if (base.startsWith('mt-')) return 'margin-top';
        if (base.startsWith('mr-')) return 'margin-right';
        if (base.startsWith('mb-')) return 'margin-bottom';
        if (base.startsWith('ml-')) return 'margin-left';
        if (base.startsWith('m-')) return 'margin';
    } else {
        if (base.startsWith('m-') || base.startsWith('mx-') || base.startsWith('my-') ||
            base.startsWith('mt-') || base.startsWith('mr-') || base.startsWith('mb-') || base.startsWith('ml-')) return 'margin';
    }

    // Typography
    if (base === 'font-sans' || base === 'font-serif' || base === 'font-mono' || base.startsWith('font-[')) return 'font-family';
    if (base.startsWith('font-')) return 'font-weight';
    if (base.startsWith('leading-')) return 'line-height';
    if (base.startsWith('tracking-')) return 'letter-spacing';
    if (base.startsWith('text-')) {
        if (['text-left', 'text-center', 'text-right', 'text-justify'].includes(base)) return 'text-align';
        if (['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl', 'text-8xl', 'text-9xl'].includes(base) || base.startsWith('text-[')) return 'font-size';
        return 'text-color';
    }

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

    // Map base classes by detailed domain
    const baseDomainMap = new Map();
    for (const cls of baseClasses) {
        baseDomainMap.set(getClassDomain(cls, true), cls);
    }

    // Sort variant breakpoints (ascending for mobile-first, descending for desktop-first)
    const sortedVariants = [...variantBreakpoints].sort((a, b) =>
        mobileFirst ? a.width - b.width : b.width - a.width
    );

    for (const variant of sortedVariants) {
        const prefix = getTailwindBreakpointPrefix(variant.width, mobileFirst);
        if (!prefix) continue;

        const variantDomainMap = new Map();
        for (const vCls of variant.classes) {
            const domain = getClassDomain(vCls, true);
            variantDomainMap.set(domain, vCls);
            const baseCls = baseDomainMap.get(domain);

            // If variant class differs from base class for this domain, add with prefix
            if (baseCls !== vCls) {
                result.push(`${prefix}${vCls}`);
            }
        }

        // Check if base has a property that was intentionally removed in variant
        if (baseDomainMap.has('flex-sizing') && !variantDomainMap.has('flex-sizing')) {
            const baseFlex = baseDomainMap.get('flex-sizing');
            if (baseFlex === 'flex-1' || baseFlex === 'flex-auto') {
                result.push(`${prefix}flex-none`);
            }
        }
    }

    return deduplicateTailwindClasses(result);
}

/**
 * Synthesizes complete responsive Tailwind classes across matched nodes from AST alignment
 * @param {object|object} canonicalNodeOrParams Base canonical scene node or parameter bag
 * @param {Array<object>} [pageBreakpoints=[]] Breakpoint objects with frame & width
 * @param {Map<string, object>} [imageRegistry=new Map()]
 * @param {object} [options={}]
 * @param {object|null} [parentNode=null]
 * @returns {{ classes: Array<string>, classString: string, remainingStyles: Record<string, string>, toString: Function }}
 */
export function synthesizeNodeResponsiveTailwind(canonicalNodeOrParams, pageBreakpoints = [], imageRegistry = new Map(), options = {}, parentNode = null) {
    let canonicalNode = canonicalNodeOrParams;
    if (canonicalNodeOrParams && typeof canonicalNodeOrParams === 'object' && 'canonicalNode' in canonicalNodeOrParams) {
        canonicalNode = canonicalNodeOrParams.canonicalNode;
        pageBreakpoints = canonicalNodeOrParams.pageBreakpoints || pageBreakpoints;
        imageRegistry = canonicalNodeOrParams.imageRegistry || imageRegistry;
        options = canonicalNodeOrParams.options || options;
        parentNode = canonicalNodeOrParams.parentNode || parentNode;
    }

    if (!canonicalNode) {
        return {
            classes: [],
            classString: '',
            remainingStyles: {},
            toString() { return ''; }
        };
    }

    const meta = canonicalNode.responsiveMetadata;
    const visibility = meta?.visibility || {};
    const alignedVariants = meta?.alignedVariants || {};
    const isExclusive = Boolean(meta?.isExclusive);

    const isMobileFirst = Boolean(options.mobileFirst);

    // If single breakpoint or none, resolve base directly
    if (!Array.isArray(pageBreakpoints) || pageBreakpoints.length <= 1) {
        const baseResult = resolveNodeTailwindClasses(canonicalNode, parentNode, imageRegistry, options);
        return {
            classes: baseResult.classes,
            classString: baseResult.classString,
            remainingStyles: baseResult.remainingStyles || {},
            toString() { return this.classString; }
        };
    }

    // 1. Identify base breakpoint (largest width for desktop-first, smallest for mobile-first)
    const sortedBps = [...pageBreakpoints].sort((a, b) =>
        isMobileFirst ? a.width - b.width : b.width - a.width
    );
    const baseBp = sortedBps[0];
    const variantBps = sortedBps.filter(b => b !== baseBp);

    // Helper to resolve aligned variant node
    function getVariantNode(n, bp) {
        if (!n) return null;
        const nMeta = n.responsiveMetadata;
        const nAligned = nMeta?.alignedVariants;
        if (n.variantNodesMap?.has(bp.width)) {
            return n.variantNodesMap.get(bp.width);
        }
        if (nAligned) {
            if (nAligned[bp.name]) return nAligned[bp.name];
            if (nAligned[bp.width]) return nAligned[bp.width];
            if (bp.width <= 650 && nAligned['mobile']) return nAligned['mobile'];
            if (bp.width > 650 && nAligned['desktop']) return nAligned['desktop'];
        }
        return n;
    }

    const baseNode = getVariantNode(canonicalNode, baseBp) || canonicalNode;
    const baseParent = getVariantNode(parentNode, baseBp) || parentNode;

    const baseResult = resolveNodeTailwindClasses(baseNode, baseParent, imageRegistry, options);
    let baseClasses = [...baseResult.classes];

    // Handle exclusive visibility on base breakpoint
    if (isExclusive && visibility[baseBp.name] === false) {
        if (!baseClasses.includes('hidden')) {
            baseClasses.push('hidden');
        }
    }

    // 2. Resolve variant classes for each variant breakpoint
    const variantClassList = [];
    for (const vBp of variantBps) {
        // If exclusive and hidden on this breakpoint:
        if (isExclusive && visibility[vBp.name] === false) {
            variantClassList.push({
                width: vBp.width,
                classes: ['hidden']
            });
            continue;
        }

        // If exclusive and hidden on base, but visible on this breakpoint:
        if (isExclusive && visibility[baseBp.name] === false && visibility[vBp.name]) {
            const vDisplay = ['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE'].includes(canonicalNode.type) ? 'flex' : 'block';
            variantClassList.push({
                width: vBp.width,
                classes: [vDisplay]
            });
            continue;
        }

        const matchedNode = getVariantNode(canonicalNode, vBp) || canonicalNode;
        const vParent = getVariantNode(parentNode, vBp) || parentNode;

        const vResult = resolveNodeTailwindClasses(matchedNode, vParent, imageRegistry, options);
        variantClassList.push({
            width: vBp.width,
            classes: vResult.classes
        });
    }

    // 3. Merge responsive classes
    const merged = mergeResponsiveTailwindClasses(baseClasses, variantClassList, { mobileFirst: isMobileFirst });

    return {
        classes: merged,
        classString: merged.join(' '),
        remainingStyles: baseResult.remainingStyles || {},
        toString() { return this.classString; }
    };
}
