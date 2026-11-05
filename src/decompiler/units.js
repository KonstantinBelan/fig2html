// src/decompiler/units.js

/**
 * Converts pixels to rem (assuming 1rem = 16px)
 * @param {number} px
 * @param {number} [base=16]
 * @returns {string}
 */
function toRem(px, base = 16) {
    if (!px || Math.abs(px) < 0.001) return '0';
    const val = Math.round((px / base) * 10000) / 10000;
    return `${val}rem`;
}

/**
 * Converts pixels to em relative to base font size
 * @param {number} px
 * @param {number} [base=16]
 * @returns {string}
 */
function toEm(px, base = 16) {
    if (!px || Math.abs(px) < 0.001) return '0';
    const val = Math.round((px / base) * 10000) / 10000;
    return `${val}em`;
}

/**
 * Converts pixels to vw relative to viewport width
 * @param {number} px
 * @param {number} [viewportWidth=1440]
 * @returns {string}
 */
function toVw(px, viewportWidth = 1440) {
    if (!px || Math.abs(px) < 0.001) return '0';
    const vw = Math.round((px / (viewportWidth || 1440)) * 100 * 1000) / 1000;
    return `${vw}vw`;
}

/**
 * Converts pixels to vh relative to viewport height
 * @param {number} px
 * @param {number} [viewportHeight=900]
 * @returns {string}
 */
function toVh(px, viewportHeight = 900) {
    if (!px || Math.abs(px) < 0.001) return '0';
    const vh = Math.round((px / (viewportHeight || 900)) * 100 * 1000) / 1000;
    return `${vh}vh`;
}

/**
 * Formats a fluid font-size using clamp(min, preferred, max)
 * @param {number} px
 * @param {number} [canvasWidth=1440]
 * @returns {string}
 */
function formatFluidFontSize(px, canvasWidth = 1440) {
    if (!px) return '1rem';
    const maxRem = toRem(px);

    // Minimum font size: scaled to mobile (approx 70-85% of desktop, minimum 12px)
    let minPx;
    if (px >= 36) {
        minPx = Math.max(22, Math.round(px * 0.65));
    } else if (px >= 24) {
        minPx = Math.max(18, Math.round(px * 0.75));
    } else if (px >= 18) {
        minPx = Math.max(15, Math.round(px * 0.8));
    } else if (px >= 14) {
        minPx = Math.max(12, Math.round(px * 0.85));
    } else {
        minPx = Math.max(10, px);
    }
    const minRem = toRem(minPx);

    if (minRem === maxRem) {
        return maxRem;
    }

    const vw = toVw(px, canvasWidth);
    return `clamp(${minRem}, ${vw}, ${maxRem})`;
}

/**
 * Formats fluid spacing (gap, padding, margin) using clamp(min, preferred, max)
 * @param {number} px
 * @param {number} [canvasWidth=1440]
 * @returns {string}
 */
function formatFluidSpacing(px, canvasWidth = 1440) {
    if (!px || Math.abs(px) < 0.001) return '0';

    // For small spacing (<= 8px), keep compact rem
    if (Math.abs(px) <= 8) {
        return toRem(px);
    }

    const maxRem = toRem(px);
    const minRem = toRem(Math.round(px * 0.6));
    const vw = toVw(px, canvasWidth);

    return `clamp(${minRem}, ${vw}, ${maxRem})`;
}

/**
 * Formats fluid element dimension (width / height) using min(), max(), clamp()
 * @param {number} px
 * @param {number} [canvasDimension=1440]
 * @param {boolean} [isWidth=true]
 * @returns {string}
 */
function formatFluidDimension(px, canvasDimension = 1440, isWidth = true) {
    if (!px || Math.abs(px) < 0.001) return '0';

    if (isWidth) {
        if (px >= 600) {
            // Large section / container: clamp with min(100%, ...)
            const minRem = toRem(Math.min(320, Math.round(px * 0.5)));
            const maxRem = toRem(px);
            const vw = toVw(px, canvasDimension);
            return `min(100%, clamp(${minRem}, ${vw}, ${maxRem}))`;
        } else if (px >= 160) {
            // Medium cards / columns
            const minRem = toRem(Math.round(px * 0.7));
            const maxRem = toRem(px);
            const vw = toVw(px, canvasDimension);
            return `clamp(${minRem}, ${vw}, ${maxRem})`;
        } else {
            // Small elements (icons, badges, buttons)
            return toRem(px);
        }
    } else {
        // Height
        if (px >= 500) {
            const minRem = toRem(Math.round(px * 0.6));
            const maxRem = toRem(px);
            const vh = toVh(px, canvasDimension || 900);
            return `clamp(${minRem}, ${vh}, ${maxRem})`;
        } else if (px >= 120) {
            const minRem = toRem(Math.round(px * 0.75));
            const maxRem = toRem(px);
            const vh = toVh(px, canvasDimension || 900);
            return `clamp(${minRem}, ${vh}, ${maxRem})`;
        } else {
            return toRem(px);
        }
    }
}

/**
 * Formats shadows and blurs according to layout mode
 * @param {Array<object>} effects
 * @param {object} options
 * @param {Function} formatColorFn
 * @returns {{ boxShadow: string|null, filter: string|null, backdropFilter: string|null }}
 */
function formatEffectsWithUnits(effects, options = {}, formatColorFn) {
    if (!Array.isArray(effects) || effects.length === 0) {
        return { boxShadow: null, filter: null, backdropFilter: null };
    }

    const isFluid = options.layoutMode === 'fluid';
    const isRelative = options.layoutMode === 'relative';
    const useRelativeUnits = isFluid || isRelative;

    const shadows = [];
    let filter = null;
    let backdropFilter = null;

    for (const eff of effects) {
        if (!eff || eff.visible === false) continue;

        if (eff.type === 'DROP_SHADOW' || eff.type === 'INNER_SHADOW') {
            const isInset = eff.type === 'INNER_SHADOW';
            const oxNum = Math.round((eff.offset?.x || 0) * 10) / 10;
            const oyNum = Math.round((eff.offset?.y || 0) * 10) / 10;
            const blurNum = Math.round((eff.radius || 0) * 10) / 10;
            const spreadNum = Math.round((eff.spread || 0) * 10) / 10;
            const col = formatColorFn(eff.color);

            const oxStr = useRelativeUnits ? toRem(oxNum) : `${oxNum}px`;
            const oyStr = useRelativeUnits ? toRem(oyNum) : `${oyNum}px`;
            const blurStr = useRelativeUnits ? toRem(blurNum) : `${blurNum}px`;
            const spreadStr = spreadNum
                ? (useRelativeUnits ? `${toRem(spreadNum)} ` : `${spreadNum}px `)
                : '';

            let s = `${oxStr} ${oyStr} ${blurStr} ${spreadStr}${col}`.trim();
            if (isInset) s = `inset ${s}`;
            shadows.push(s);
        } else if (eff.type === 'FOREGROUND_BLUR') {
            const r = Math.round((eff.radius || 0) * 10) / 10;
            if (r > 0) {
                const rStr = useRelativeUnits ? toRem(r) : `${r}px`;
                filter = `blur(${rStr})`;
            }
        } else if (eff.type === 'BACKGROUND_BLUR') {
            const r = Math.round((eff.radius || 0) * 10) / 10;
            if (r > 0) {
                const rStr = useRelativeUnits ? toRem(r) : `${r}px`;
                backdropFilter = `blur(${rStr})`;
            }
        }
    }

    return {
        boxShadow: shadows.length > 0 ? shadows.join(', ') : null,
        filter,
        backdropFilter
    };
}

module.exports = {
    toRem,
    toEm,
    toVw,
    toVh,
    formatFluidFontSize,
    formatFluidSpacing,
    formatFluidDimension,
    formatEffectsWithUnits
};
