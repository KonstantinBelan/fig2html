// src/decompiler/tailwind/scale-snapper.js

/**
 * Standard Tailwind CSS spacing scale (in pixels)
 * 1 unit = 0.25rem = 4px
 */
export const SPACING_SCALE = [
    { key: '0', px: 0 },
    { key: 'px', px: 1 },
    { key: '0.5', px: 2 },
    { key: '1', px: 4 },
    { key: '1.5', px: 6 },
    { key: '2', px: 8 },
    { key: '2.5', px: 10 },
    { key: '3', px: 12 },
    { key: '3.5', px: 14 },
    { key: '4', px: 16 },
    { key: '5', px: 20 },
    { key: '6', px: 24 },
    { key: '7', px: 28 },
    { key: '8', px: 32 },
    { key: '9', px: 36 },
    { key: '10', px: 40 },
    { key: '11', px: 44 },
    { key: '12', px: 48 },
    { key: '14', px: 56 },
    { key: '16', px: 64 },
    { key: '20', px: 80 },
    { key: '24', px: 96 },
    { key: '28', px: 112 },
    { key: '32', px: 128 },
    { key: '36', px: 144 },
    { key: '40', px: 160 },
    { key: '44', px: 176 },
    { key: '48', px: 192 },
    { key: '52', px: 208 },
    { key: '56', px: 224 },
    { key: '60', px: 240 },
    { key: '64', px: 256 },
    { key: '72', px: 288 },
    { key: '80', px: 320 },
    { key: '96', px: 384 }
];

/**
 * Standard Tailwind border radius scale (in pixels)
 */
export const RADIUS_SCALE = [
    { key: 'none', px: 0 },
    { key: 'sm', px: 2 },
    { key: 'DEFAULT', px: 4 }, // rounded
    { key: 'md', px: 6 },
    { key: 'lg', px: 8 },
    { key: 'xl', px: 12 },
    { key: '2xl', px: 16 },
    { key: '3xl', px: 24 },
    { key: 'full', px: 9999 } // 50% or full pill
];

/**
 * Standard Tailwind border width scale (in pixels)
 */
export const BORDER_WIDTH_SCALE = [
    { key: '0', px: 0 },
    { key: 'DEFAULT', px: 1 }, // border
    { key: '2', px: 2 },
    { key: '4', px: 4 },
    { key: '8', px: 8 }
];

/**
 * Standard Tailwind max-width scale (in pixels)
 */
export const MAX_WIDTH_SCALE = [
    { key: '0', px: 0 },
    { key: 'xs', px: 320 },
    { key: 'sm', px: 384 },
    { key: 'md', px: 448 },
    { key: 'lg', px: 512 },
    { key: 'xl', px: 576 },
    { key: '2xl', px: 672 },
    { key: '3xl', px: 768 },
    { key: '4xl', px: 896 },
    { key: '5xl', px: 1024 },
    { key: '6xl', px: 1152 },
    { key: '7xl', px: 1280 }
];

/**
 * Finds the nearest scale item within tolerance
 * @param {number} px
 * @param {Array<{ key: string, px: number }>} scale
 * @param {number} [tolerance=1]
 * @returns {string|null}
 */
export function findNearestScaleKey(px, scale, tolerance = 1) {
    if (typeof px !== 'number' || isNaN(px)) return null;

    let closest = null;
    let minDiff = Infinity;

    for (const item of scale) {
        const diff = Math.abs(item.px - px);
        if (diff < minDiff) {
            minDiff = diff;
            closest = item;
        }
    }

    if (closest && minDiff <= tolerance) {
        return closest.key;
    }

    return null;
}

/**
 * Formats a spacing value (padding, margin, gap, width, height) into a Tailwind value key
 * @param {number} px
 * @param {object} [options={}]
 * @param {number} [options.tolerance=1]
 * @param {'auto'|'snap'|'strict'} [options.arbitrary='auto']
 * @param {boolean} [options.allowNegative=false]
 * @returns {string} e.g. '4', '6', 'px', or '[17px]'
 */
export function snapSpacing(px, options = {}) {
    const tolerance = options.tolerance !== undefined ? options.tolerance : 1;
    const mode = options.arbitrary || 'auto';
    const isNegative = px < 0;
    const absPx = Math.abs(px);

    if (absPx === 0) return '0';

    if (mode === 'snap') {
        // Snap to closest scale entry regardless of tolerance
        let closest = SPACING_SCALE[0];
        let minDiff = Infinity;
        for (const item of SPACING_SCALE) {
            const diff = Math.abs(item.px - absPx);
            if (diff < minDiff) {
                minDiff = diff;
                closest = item;
            }
        }
        return (isNegative ? '-' : '') + closest.key;
    }

    if (mode === 'strict') {
        // Only exact matches (diff === 0)
        const exact = SPACING_SCALE.find(item => item.px === absPx);
        if (exact) return (isNegative ? '-' : '') + exact.key;
        return (isNegative ? '-' : '') + `[${Math.round(absPx * 10) / 10}px]`;
    }

    // Default 'auto' mode: within tolerance use scale, otherwise arbitrary
    const match = findNearestScaleKey(absPx, SPACING_SCALE, tolerance);
    if (match !== null) {
        return (isNegative ? '-' : '') + match;
    }

    // Format clean arbitrary value: round to 1 decimal place if fractional, or integer
    const formattedVal = Math.round(absPx * 10) / 10;
    return (isNegative ? '-' : '') + `[${formattedVal}px]`;
}

/**
 * Formats a border radius into a Tailwind radius suffix
 * @param {number|string} radius px number or '50%'
 * @param {object} [options={}]
 * @returns {string} e.g. 'none', 'sm', 'DEFAULT', 'md', 'lg', 'xl', '2xl', '3xl', 'full', or '[10px]'
 */
export function snapRadius(radius, options = {}) {
    if (radius === '50%' || radius === 9999 || radius >= 999) {
        return 'full';
    }

    const num = typeof radius === 'number' ? radius : parseFloat(radius);
    if (isNaN(num) || num <= 0) return 'none';

    const tolerance = options.tolerance !== undefined ? options.tolerance : 1;
    const mode = options.arbitrary || 'auto';

    if (mode === 'snap') {
        let closest = RADIUS_SCALE[0];
        let minDiff = Infinity;
        for (const item of RADIUS_SCALE) {
            const diff = Math.abs(item.px - num);
            if (diff < minDiff) {
                minDiff = diff;
                closest = item;
            }
        }
        return closest.key;
    }

    if (mode === 'strict') {
        const exact = RADIUS_SCALE.find(item => item.px === num);
        if (exact) return exact.key;
        return `[${Math.round(num * 10) / 10}px]`;
    }

    const match = findNearestScaleKey(num, RADIUS_SCALE, tolerance);
    if (match !== null) {
        return match;
    }

    return `[${Math.round(num * 10) / 10}px]`;
}

/**
 * Formats a border width into a Tailwind border width suffix
 * @param {number} width
 * @param {object} [options={}]
 * @returns {string} e.g. '0', 'DEFAULT', '2', '4', '8', or '[3px]'
 */
export function snapBorderWidth(width, options = {}) {
    if (typeof width !== 'number' || isNaN(width) || width <= 0) return '0';

    const tolerance = options.tolerance !== undefined ? options.tolerance : 0.5;
    const match = findNearestScaleKey(width, BORDER_WIDTH_SCALE, tolerance);
    if (match !== null) {
        return match;
    }

    return `[${Math.round(width * 10) / 10}px]`;
}

/**
 * Formats a max-width value into a Tailwind max-w suffix
 * @param {number|string} val
 * @param {object} [options={}]
 * @returns {string|null} e.g. 'xs', 'md', '2xl', 'full', 'none', or '[500px]'
 */
export function snapMaxWidth(val, options = {}) {
    if (!val && val !== 0) return null;
    const str = String(val).trim().toLowerCase();
    if (str === '100%') return 'full';
    if (str === 'none') return 'none';
    if (str === '0' || str === '0px') return '0';

    const px = typeof val === 'number' ? val : parseFloat(str);
    if (isNaN(px) || px <= 0) return null;

    const tolerance = options.tolerance !== undefined ? options.tolerance : 4;
    const match = findNearestScaleKey(px, MAX_WIDTH_SCALE, tolerance);
    if (match !== null) {
        return match;
    }

    return snapSpacing(px, options);
}
