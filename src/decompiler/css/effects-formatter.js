// src/decompiler/css/effects-formatter.js
const { formatColor } = require('./color-formatter');
const { formatEffectsWithUnits } = require('../units');

/**
 * Formats Figma shadow and blur effects into CSS declarations
 * @param {Array<object>} effects
 * @param {object} [options={}]
 * @returns {{ boxShadow: string|null, textShadow: string|null, filter: string|null, backdropFilter: string|null }}
 */
function formatEffects(effects, options = {}) {
    if (!Array.isArray(effects) || effects.length === 0) {
        return { boxShadow: null, textShadow: null, filter: null, backdropFilter: null };
    }

    if (options.layoutMode === 'fluid' || options.layoutMode === 'relative') {
        return formatEffectsWithUnits(effects, options, formatColor);
    }

    const shadows = [];
    const textShadows = [];
    let filter = null;
    let backdropFilter = null;

    for (const eff of effects) {
        if (!eff || eff.visible === false) continue;

        if (eff.type === 'DROP_SHADOW' || eff.type === 'INNER_SHADOW') {
            const isInset = eff.type === 'INNER_SHADOW';
            const ox = Math.round((eff.offset?.x || 0) * 10) / 10;
            const oy = Math.round((eff.offset?.y || 0) * 10) / 10;
            const blur = Math.round((eff.radius || 0) * 10) / 10;
            const spread = Math.round((eff.spread || 0) * 10) / 10;
            const col = formatColor(eff.color);

            let s = `${ox}px ${oy}px ${blur}px ${spread ? spread + 'px ' : ''}${col}`.trim();
            if (isInset) s = `inset ${s}`;
            shadows.push(s);
            if (!isInset) {
                textShadows.push(`${ox}px ${oy}px ${blur}px ${col}`.trim());
            }
        } else if (eff.type === 'FOREGROUND_BLUR') {
            const r = Math.round((eff.radius || 0) * 10) / 10;
            if (r > 0) filter = `blur(${r}px)`;
        } else if (eff.type === 'BACKGROUND_BLUR') {
            const r = Math.round((eff.radius || 0) * 10) / 10;
            if (r > 0) backdropFilter = `blur(${r}px)`;
        }
    }

    return {
        boxShadow: shadows.length > 0 ? shadows.join(', ') : null,
        textShadow: textShadows.length > 0 ? textShadows.join(', ') : null,
        filter,
        backdropFilter
    };
}

/**
 * Formats Figma image paintFilter adjustments into CSS filter functions
 * (exposure, contrast, saturation/vibrance, temperature, tint, highlights, shadows)
 * @param {object} paintFilter
 * @returns {string|null} CSS filter string
 */
function formatPaintFilter(paintFilter) {
    if (!paintFilter || typeof paintFilter !== 'object') return null;
    const parts = [];

    // 1. Exposure (Brightness) [-1..1]
    const exposure = paintFilter.exposure || 0;
    if (Math.abs(exposure) > 0.01) {
        const bVal = Math.max(0, Math.round((1 + exposure) * 100) / 100);
        parts.push(`brightness(${bVal})`);
    }

    // 2. Contrast [-1..1]
    const contrast = paintFilter.contrast || 0;
    if (Math.abs(contrast) > 0.01) {
        const cVal = Math.max(0, Math.round((1 + contrast) * 100) / 100);
        parts.push(`contrast(${cVal})`);
    }

    // 3. Saturation / Vibrance [-1..1]
    const sat = (paintFilter.vibrance !== undefined ? paintFilter.vibrance : paintFilter.saturation) || 0;
    if (Math.abs(sat) > 0.01) {
        if (sat <= -0.99) {
            parts.push('grayscale(1)');
        } else {
            const sVal = Math.max(0, Math.round((1 + sat) * 100) / 100);
            parts.push(`saturate(${sVal})`);
        }
    }

    // 4. Temperature [-1..1] (Warmth / Coolness)
    const temp = paintFilter.temperature || 0;
    if (Math.abs(temp) > 0.01) {
        if (temp > 0) {
            parts.push(`sepia(${Math.round(temp * 40)}%)`);
        } else {
            parts.push(`hue-rotate(${Math.round(temp * 30)}deg)`);
        }
    }

    // 5. Tint [-1..1]
    const tint = paintFilter.tint || 0;
    if (Math.abs(tint) > 0.01) {
        parts.push(`hue-rotate(${Math.round(tint * 45)}deg)`);
    }

    return parts.length > 0 ? parts.join(' ') : null;
}

module.exports = {
    formatEffects,
    formatPaintFilter
};
