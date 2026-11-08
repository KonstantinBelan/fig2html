// src/decompiler/css/gradient-formatter.js
const { formatColor } = require('./color-formatter');

/**
 * Calculates CSS linear gradient angle from Figma 2x3 affine matrix
 * @param {{ m00: number, m01: number, m02: number, m10: number, m11: number, m12: number }} transform
 * @returns {number} Angle in degrees [0..360)
 */
function getLinearGradientAngle(transform) {
    if (!transform) return 180;
    const rad = Math.atan2(transform.m01 || 0, transform.m00 || 0);
    let deg = Math.round((rad * (180 / Math.PI) + 90 + 360) % 360);
    return deg;
}

/**
 * Decomposes a 2x3 affine matrix into scale, rotation (in degrees)
 * @param {{ m00: number, m01: number, m02: number, m10: number, m11: number, m12: number }} transform
 * @returns {{ scaleX: number, scaleY: number, rotateDeg: number } | null}
 */
function parseTransformMatrix(transform) {
    if (!transform) return null;
    const m00 = transform.m00 ?? 1;
    const m01 = transform.m01 ?? 0;
    const m10 = transform.m10 ?? 0;
    const m11 = transform.m11 ?? 1;

    // Check if identity (no rotation, no scale/flip)
    if (Math.abs(m00 - 1) < 0.001 && Math.abs(m11 - 1) < 0.001 && Math.abs(m01) < 0.001 && Math.abs(m10) < 0.001) {
        return null;
    }

    const det = m00 * m11 - m01 * m10;

    // Pure horizontal flip: m00 == -1, m11 == 1, m01 == 0, m10 == 0
    if (Math.abs(m00 - (-1)) < 0.001 && Math.abs(m11 - 1) < 0.001 && Math.abs(m01) < 0.001 && Math.abs(m10) < 0.001) {
        return { scaleX: -1, scaleY: 1, rotateDeg: 0 };
    }

    // Pure vertical flip: m00 == 1, m11 == -1, m01 == 0, m10 == 0
    if (Math.abs(m00 - 1) < 0.001 && Math.abs(m11 - (-1)) < 0.001 && Math.abs(m01) < 0.001 && Math.abs(m10) < 0.001) {
        return { scaleX: 1, scaleY: -1, rotateDeg: 0 };
    }

    if (det < 0) {
        // Reflection + rotation: R(theta) * scaleX(-1) => m00 = -cos(theta), m10 = -sin(theta)
        const rad = Math.atan2(-m10, -m00);
        const deg = Math.round(rad * (180 / Math.PI) * 100) / 100;
        return { scaleX: -1, scaleY: 1, rotateDeg: Math.abs(deg) > 0.01 ? deg : 0 };
    }

    // Standard rotation (det > 0)
    const rad = Math.atan2(m10, m00);
    const deg = Math.round(rad * (180 / Math.PI) * 100) / 100;
    const rotateDeg = Math.abs(deg) > 0.01 ? deg : 0;

    return { scaleX: 1, scaleY: 1, rotateDeg };
}

/**
 * Gets transform information (rotation, flip) for a node
 * @param {object} node
 * @returns {{ scaleX: number, scaleY: number, rotateDeg: number } | null}
 */
function getNodeTransformInfo(node) {
    if (!node) return null;
    const info = parseTransformMatrix(node.transform);
    if (info) return info;
    if (typeof node.rotation === 'number' && Math.abs(node.rotation) > 0.01) {
        const deg = Math.abs(node.rotation) <= 2 * Math.PI
            ? Math.round(node.rotation * (180 / Math.PI) * 100) / 100
            : Math.round(node.rotation * 100) / 100;
        if (Math.abs(deg) > 0.01) {
            return { scaleX: 1, scaleY: 1, rotateDeg: deg };
        }
    }
    return null;
}

/**
 * Formats a Figma gradient paint object into CSS gradient string
 * @param {object} paint
 * @returns {string|null} CSS gradient
 */
function formatGradient(paint) {
    if (!paint || !paint.stops || paint.stops.length < 2) return null;

    const stopStrings = paint.stops.map(s => {
        const col = formatColor(s.color, paint.opacity);
        const pos = Math.round((s.position !== undefined ? s.position : 0) * 100);
        return `${col} ${pos}%`;
    });

    if (paint.type === 'GRADIENT_LINEAR') {
        const angle = getLinearGradientAngle(paint.transform);
        return `linear-gradient(${angle}deg, ${stopStrings.join(', ')})`;
    }

    if (paint.type === 'GRADIENT_RADIAL') {
        return `radial-gradient(50% 50% at 50% 50%, ${stopStrings.join(', ')})`;
    }

    return null;
}

module.exports = {
    getLinearGradientAngle,
    parseTransformMatrix,
    getNodeTransformInfo,
    formatGradient
};
