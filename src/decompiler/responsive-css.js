// src/decompiler/responsive-css.js
import { computeNodeStyles } from './css/index.js';

/**
 * Continuous properties eligible for fluid clamp() calculation
 */
export const CONTINUOUS_PROPERTIES = new Set([
    'font-size',
    'line-height',
    'letter-spacing',
    'gap',
    'row-gap',
    'column-gap',
    'padding',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'margin',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'border-radius',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
    'width',
    'max-width',
    'min-width',
    'height',
    'min-height'
]);

/**
 * Parses a single CSS dimension string to pixels (e.g. "24px", "1.5rem", "32")
 * @param {string|number} valStr
 * @returns {number|null}
 */
export function parsePxValue(valStr) {
    if (typeof valStr === 'number') return isNaN(valStr) ? null : valStr;
    if (!valStr || typeof valStr !== 'string') return null;
    const trimmed = valStr.trim();
    if (/^-?\d+(\.\d+)?px$/i.test(trimmed)) {
        return parseFloat(trimmed);
    }
    if (/^-?\d+(\.\d+)?rem$/i.test(trimmed)) {
        return parseFloat(trimmed) * 16;
    }
    if (/^-?\d+(\.\d+)?$/i.test(trimmed)) {
        return parseFloat(trimmed);
    }
    return null;
}

/**
 * Parses multi-value spacing/dimension property (e.g. "16px 24px" or "10px 20px 10px 20px")
 * @param {string} valStr
 * @returns {Array<number>|null}
 */
export function parseMultiPxValue(valStr) {
    if (!valStr || typeof valStr !== 'string') return null;
    const parts = valStr.trim().split(/\s+/);
    if (parts.length <= 1) return null;
    const parsed = parts.map(parsePxValue);
    if (parsed.some(p => p === null)) return null;
    return parsed;
}

/**
 * Calculates a fluid clamp() string between two pixel values across two viewport widths
 * Formula: clamp(min, slope * 100vw + intercept, max)
 *
 * @param {number} valDesktop Value at desktop (px)
 * @param {number} widthDesktop Desktop viewport width (px)
 * @param {number} valMobile Value at mobile (px)
 * @param {number} widthMobile Mobile viewport width (px)
 * @param {object} [options={}]
 * @returns {string|null} CSS clamp() or px string
 */
export function calculateFluidClamp(valDesktop, widthDesktop, valMobile, widthMobile, options = {}) {
    if (typeof valDesktop !== 'number' || typeof valMobile !== 'number') return null;
    if (isNaN(valDesktop) || isNaN(valMobile)) return null;

    const w1 = widthDesktop || 1440;
    const w2 = widthMobile || 375;

    // If values are equal or viewport difference is negligible, return static value
    if (Math.abs(valDesktop - valMobile) < 0.5 || Math.abs(w1 - w2) < 10) {
        return `${Math.round(valDesktop)}px`;
    }

    const minVal = Math.min(valDesktop, valMobile);
    const maxVal = Math.max(valDesktop, valMobile);

    // Rate of change per viewport pixel
    const slope = (valDesktop - valMobile) / (w1 - w2);
    // Y-intercept at 0px viewport width
    const interceptPx = valDesktop - (slope * w1);
    // Slope converted to vw units (1vw = viewportWidth / 100)
    const slopeVw = slope * 100;

    const useRem = options.useRem !== false;
    const interceptRem = interceptPx / 16;

    const round2 = (n) => Math.round(n * 100) / 100;
    const round3 = (n) => Math.round(n * 1000) / 1000;
    const round4 = (n) => Math.round(n * 10000) / 10000;

    const minStr = useRem ? `${round4(minVal / 16)}rem` : `${round2(minVal)}px`;
    const maxStr = useRem ? `${round4(maxVal / 16)}rem` : `${round2(maxVal)}px`;

    let prefStr;
    const sign = slopeVw >= 0 ? '+' : '-';
    const absSlopeVw = Math.abs(slopeVw);

    if (useRem) {
        prefStr = `${round4(interceptRem)}rem ${sign} ${round3(absSlopeVw)}vw`;
    } else {
        prefStr = `${round2(interceptPx)}px ${sign} ${round3(absSlopeVw)}vw`;
    }

    return `clamp(${minStr}, ${prefStr}, ${maxStr})`;
}

/**
 * Returns media query string for a target breakpoint
 * @param {object} bp Target breakpoint { name, width }
 * @param {Array<object>} allBreakpoints
 * @param {boolean} [mobileFirst=false]
 * @returns {string} e.g. "@media (max-width: 768px)"
 */
export function getBreakpointMediaQuery(bp, allBreakpoints = [], mobileFirst = false) {
    if (mobileFirst) {
        return `@media (min-width: ${bp.width}px)`;
    }
    return `@media (max-width: ${bp.width}px)`;
}

/**
 * Compares two style dictionaries and separates continuous deltas from discrete deltas
 * @param {Record<string, string>} baseStyles
 * @param {Record<string, string>} variantStyles
 * @returns {{ continuousDeltas: Record<string, string>, discreteDeltas: Record<string, string> }}
 */
export function diffNodeStyles(baseStyles = {}, variantStyles = {}) {
    const continuousDeltas = {};
    const discreteDeltas = {};

    for (const [prop, vVal] of Object.entries(variantStyles)) {
        const bVal = baseStyles[prop];
        if (bVal === vVal) continue;

        if (CONTINUOUS_PROPERTIES.has(prop)) {
            continuousDeltas[prop] = vVal;
        } else {
            discreteDeltas[prop] = vVal;
        }
    }

    return { continuousDeltas, discreteDeltas };
}

/**
 * Synthesizes responsive CSS rules (fluid clamp and @media queries) across all breakpoints for a canonical tree
 *
 * @param {object} params
 * @param {object} params.canonicalTree Canonical AST with responsiveMetadata
 * @param {Array<object>} params.pageBreakpoints Breakpoints for current page (sorted by width)
 * @param {Map<string, object>} params.imageRegistry
 * @param {object} params.stylesheetManager Instance of StylesheetManager
 * @param {object} [params.options={}] Configuration options
 */
export function synthesizeResponsiveStyles({
    canonicalTree,
    pageBreakpoints = [],
    imageRegistry,
    stylesheetManager,
    options = {}
}) {
    if (!canonicalTree || !stylesheetManager || pageBreakpoints.length <= 1) {
        return;
    }

    const isMobileFirst = Boolean(options.mobileFirst);
    const isFluid = options.fluid !== false;

    // Identify base and variant breakpoints
    let baseBp;
    let variantBps;

    if (isMobileFirst) {
        // Base is narrowest (e.g. mobile 375)
        baseBp = pageBreakpoints.reduce((min, b) => b.width < min.width ? b : min, pageBreakpoints[0]);
        variantBps = pageBreakpoints.filter(b => b !== baseBp).sort((a, b) => a.width - b.width);
    } else {
        // Desktop-first: base is widest (e.g. desktop 1440)
        baseBp = pageBreakpoints.reduce((max, b) => b.width > max.width ? b : max, pageBreakpoints[0]);
        variantBps = pageBreakpoints.filter(b => b !== baseBp).sort((a, b) => b.width - a.width);
    }

    const desktopWidth = Math.max(...pageBreakpoints.map(b => b.width));
    const mobileWidth = Math.min(...pageBreakpoints.map(b => b.width));

    // Ensure root container is responsive (width: 100%, max-width: desktopWidth)
    const rootClass = stylesheetManager.getNodeClass(canonicalTree);
    if (rootClass) {
        const primaryRootClass = rootClass.split(/\s+/)[0];
        const rootRule = stylesheetManager.uniqueRules.get(primaryRootClass);
        if (rootRule) {
            rootRule['width'] = '100%';
            rootRule['max-width'] = `${desktopWidth}px`;
            rootRule['margin'] = '0 auto';
            rootRule['box-sizing'] = 'border-box';
        }
    }

    /**
     * Resolves the corresponding variant parent node for accurate contextual style computation
     * @param {object|null} p
     * @param {string} bpName
     * @returns {object|null}
     */
    function getVariantParent(p, bpName) {
        if (!p) return null;
        if (p.responsiveMetadata && p.responsiveMetadata.alignedVariants && p.responsiveMetadata.alignedVariants[bpName]) {
            return p.responsiveMetadata.alignedVariants[bpName];
        }
        return p;
    }

    /**
     * Recursively walks canonical tree to synthesize styles
     * @param {object} node
     * @param {object|null} parent
     */
    function walk(node, parent) {
        if (!node || node.visible === false || node.mask === true || node.isMask === true) return;

        const assignedClass = stylesheetManager.getNodeClass(node);
        const primaryClass = assignedClass ? assignedClass.split(/\s+/)[0] : null;

        if (primaryClass && node.responsiveMetadata) {
            const meta = node.responsiveMetadata;
            const visibility = meta.visibility || {};
            const alignedVariants = meta.alignedVariants || {};
            const isExclusive = meta.isExclusive;

            // =================================================================
            // CASE 1: EXCLUSIVE ELEMENTS (Desktop-only or Mobile-only)
            // =================================================================
            if (isExclusive) {
                if (!isMobileFirst) {
                    // Desktop-first
                    if (visibility[baseBp.name] === false) {
                        // Mobile-only element: hide on desktop base
                        const baseRule = stylesheetManager.uniqueRules.get(primaryClass);
                        if (baseRule) {
                            baseRule['display'] = 'none';
                        }
                        // Show in matching variant media queries
                        for (const vBp of variantBps) {
                            if (visibility[vBp.name]) {
                                const vNode = alignedVariants[vBp.name] || node;
                                const vParent = getVariantParent(parent, vBp.name);
                                const vStyles = computeNodeStyles(vNode, vParent, imageRegistry, options);
                                const vDisplay = vStyles['display'] || (['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE'].includes(vNode.type) ? 'flex' : 'block');
                                const mq = getBreakpointMediaQuery(vBp, pageBreakpoints, false);
                                stylesheetManager.addMediaRule(mq, `.${primaryClass}`, { 'display': vDisplay });
                            }
                        }
                    } else {
                        // Desktop-only element: visible on desktop, hide in variant media queries where invisible
                        for (const vBp of variantBps) {
                            if (!visibility[vBp.name]) {
                                const mq = getBreakpointMediaQuery(vBp, pageBreakpoints, false);
                                stylesheetManager.addMediaRule(mq, `.${primaryClass}`, { 'display': 'none' });
                            }
                        }
                    }
                } else {
                    // Mobile-first
                    if (visibility[baseBp.name] === false) {
                        // Desktop-only: hide on mobile base
                        const baseRule = stylesheetManager.uniqueRules.get(primaryClass);
                        if (baseRule) {
                            baseRule['display'] = 'none';
                        }
                        for (const vBp of variantBps) {
                            if (visibility[vBp.name]) {
                                const vNode = alignedVariants[vBp.name] || node;
                                const vParent = getVariantParent(parent, vBp.name);
                                const vStyles = computeNodeStyles(vNode, vParent, imageRegistry, options);
                                const vDisplay = vStyles['display'] || (['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE'].includes(vNode.type) ? 'flex' : 'block');
                                const mq = getBreakpointMediaQuery(vBp, pageBreakpoints, true);
                                stylesheetManager.addMediaRule(mq, `.${primaryClass}`, { 'display': vDisplay });
                            }
                        }
                    } else {
                        // Mobile-only: visible on mobile base, hide on wider breakpoints
                        for (const vBp of variantBps) {
                            if (!visibility[vBp.name]) {
                                const mq = getBreakpointMediaQuery(vBp, pageBreakpoints, true);
                                stylesheetManager.addMediaRule(mq, `.${primaryClass}`, { 'display': 'none' });
                            }
                        }
                    }
                }
            } else {
                // =============================================================
                // CASE 2: MATCHED NODES ACROSS BREAKPOINTS
                // =============================================================
                const baseNode = alignedVariants[baseBp.name] || node;
                const baseStyles = stylesheetManager.getNodeStyles(node) || computeNodeStyles(baseNode, parent, imageRegistry, options);

                // 2.1 Fluid clamp synthesis between widest and narrowest
                if (isFluid) {
                    const narrowBp = pageBreakpoints.reduce((prev, curr) => curr.width < prev.width ? curr : prev);
                    const wideBp = pageBreakpoints.reduce((prev, curr) => curr.width > prev.width ? curr : prev);

                    const narrowNode = alignedVariants[narrowBp.name];
                    const wideNode = alignedVariants[wideBp.name] || baseNode;

                    if (narrowNode && wideNode && narrowBp !== wideBp) {
                        const narrowParent = getVariantParent(parent, narrowBp.name);
                        const wideParent = getVariantParent(parent, wideBp.name);
                        const narrowStyles = computeNodeStyles(narrowNode, narrowParent, imageRegistry, options);
                        const wideStyles = computeNodeStyles(wideNode, wideParent, imageRegistry, options);

                        for (const prop of CONTINUOUS_PROPERTIES) {
                            const wideVal = wideStyles[prop] || baseStyles[prop];
                            const narrowVal = narrowStyles[prop];
                            if (!wideVal || !narrowVal || wideVal === narrowVal) continue;

                            // Single scalar pixel value
                            const widePx = parsePxValue(wideVal);
                            const narrowPx = parsePxValue(narrowVal);
                            if (widePx !== null && narrowPx !== null) {
                                const clampStr = calculateFluidClamp(widePx, desktopWidth, narrowPx, mobileWidth, options);
                                if (clampStr) {
                                    const baseRule = stylesheetManager.uniqueRules.get(primaryClass);
                                    if (baseRule) {
                                        baseRule[prop] = clampStr;
                                    }
                                }
                            } else {
                                // Multi-value (e.g. padding: 16px 24px vs 8px 12px)
                                const wideMulti = parseMultiPxValue(wideVal);
                                const narrowMulti = parseMultiPxValue(narrowVal);
                                if (wideMulti && narrowMulti && wideMulti.length === narrowMulti.length) {
                                    const clampedParts = wideMulti.map((wPx, idx) => {
                                        return calculateFluidClamp(wPx, desktopWidth, narrowMulti[idx], mobileWidth, options);
                                    });
                                    if (clampedParts.every(Boolean)) {
                                        const baseRule = stylesheetManager.uniqueRules.get(primaryClass);
                                        if (baseRule) {
                                            baseRule[prop] = clampedParts.join(' ');
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // 2.2 Discrete differences and non-clamped properties in media queries
                for (const vBp of variantBps) {
                    const vNode = alignedVariants[vBp.name];
                    if (!vNode) continue;

                    const vParent = getVariantParent(parent, vBp.name);
                    const vStyles = computeNodeStyles(vNode, vParent, imageRegistry, options);
                    const mq = getBreakpointMediaQuery(vBp, pageBreakpoints, isMobileFirst);
                    const diffStyles = {};

                    for (const [prop, vVal] of Object.entries(vStyles)) {
                        // Skip internal absolute offsets if not positioned absolutely
                        if (['left', 'top', 'right', 'bottom'].includes(prop) && !['ABSOLUTE', 'FIXED'].includes(vNode.stackPositioning)) {
                            continue;
                        }

                        const bVal = baseStyles[prop];
                        if (bVal === vVal) continue;

                        // If continuous and already successfully clamped in base rule, do not duplicate in media query
                        if (isFluid && CONTINUOUS_PROPERTIES.has(prop)) {
                            const baseRule = stylesheetManager.uniqueRules.get(primaryClass);
                            const currentRuleVal = baseRule ? baseRule[prop] : null;
                            if (currentRuleVal && currentRuleVal.startsWith('clamp(')) {
                                continue;
                            }
                        }

                        diffStyles[prop] = vVal;
                    }

                    // Reset flex / width if base had it but variant does not (e.g. switching from flex-row grow to column fill)
                    if (baseStyles['flex'] && !vStyles['flex']) {
                        diffStyles['flex'] = 'none';
                    }
                    if (baseStyles['min-width'] && !vStyles['min-width']) {
                        diffStyles['min-width'] = 'auto';
                    }
                    if (baseStyles['width'] && !vStyles['width'] && vStyles['align-self'] === 'stretch') {
                        diffStyles['width'] = '100%';
                    }
                    if (baseStyles['left'] && !vStyles['left'] && vStyles['right']) {
                        diffStyles['left'] = 'auto';
                    }
                    if (baseStyles['right'] && !vStyles['right'] && vStyles['left']) {
                        diffStyles['right'] = 'auto';
                    }
                    if (baseStyles['top'] && !vStyles['top'] && vStyles['bottom']) {
                        diffStyles['top'] = 'auto';
                    }
                    if (baseStyles['bottom'] && !vStyles['bottom'] && vStyles['top']) {
                        diffStyles['bottom'] = 'auto';
                    }

                    if (Object.keys(diffStyles).length > 0) {
                        stylesheetManager.addMediaRule(mq, `.${primaryClass}`, diffStyles);
                    }
                }
            }
        }

        // Recurse into children
        if (Array.isArray(node.children)) {
            for (const child of node.children) {
                walk(child, node);
            }
        }
    }

    walk(canonicalTree, null);
}
