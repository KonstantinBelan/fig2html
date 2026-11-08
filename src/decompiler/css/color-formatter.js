// src/decompiler/css/color-formatter.js

/**
 * Maps an image MIME type to its standard file extension
 * @param {string} mime
 * @returns {string} File extension ('jpg', 'png', 'svg', 'webp', 'gif')
 */
function getExtensionForMime(mime) {
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
function formatColor(color, opacityMultiplier = 1) {
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

module.exports = {
    getExtensionForMime,
    formatColor
};
