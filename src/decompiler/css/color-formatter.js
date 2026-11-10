// src/decompiler/css/color-formatter.js

/**
 * Maps an image MIME type to its standard file extension
 * @param {string} mime
 * @returns {string} File extension ('jpg', 'png', 'svg', 'webp', 'gif')
 */
export function getExtensionForMime(mime) {
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/svg+xml') return 'svg';
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/avif') return 'avif';
    if (mime === 'image/gif') return 'gif';
    return 'png';
}

/**
 * Converts a Figma normalized RGBA color object to a CSS color string
 * @param {{ r: number, g: number, b: number, a?: number }} color
 * @param {number} [opacityMultiplier=1]
 * @returns {string} CSS color (hex or rgba)
 */
export function formatColor(color, opacityMultiplier = 1) {
    if (!color) return 'transparent';
    const r = Math.round((color.r || 0) * 255);
    const g = Math.round((color.g || 0) * 255);
    const b = Math.round((color.b || 0) * 255);
    const rawA = color.a !== undefined ? color.a : 1.0;
    const a = Math.round(rawA * opacityMultiplier * 1000) / 1000;

    if (a <= 0) return 'transparent';
    if (a >= 1.0) {
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Resolves a CSS color string from a paint (SOLID or GRADIENT_*).
 * For gradients, extracts a solid fallback color from the first visible color stop (alpha > 0.05) or the first stop.
 * @param {object} paint
 * @returns {string|null} CSS color string (hex or rgba) or null if invisible/empty
 */
export function getColorFromPaint(paint) {
    if (!paint || paint.visible === false) return null;
    if (paint.type === 'SOLID' && paint.color) {
        return formatColor(paint.color, paint.opacity);
    }
    if (paint.type && paint.type.startsWith('GRADIENT_') && Array.isArray(paint.stops) && paint.stops.length > 0) {
        const stop = paint.stops.find(s => s?.color && (s.color.a === undefined || s.color.a > 0.05)) || paint.stops[0];
        if (stop && stop.color) {
            return formatColor(stop.color, paint.opacity);
        }
    }
    return null;
}
