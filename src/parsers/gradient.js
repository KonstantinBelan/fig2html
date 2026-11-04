// src/parsers/gradient.js
const { parseColor, clamp01 } = require('./color');

/**
 * Splits CSS comma-separated lists while respecting parentheses
 */
function splitTopLevelCommas(str) {
    const result = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '(') depth++;
        else if (char === ')') depth--;

        if (char === ',' && depth === 0) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim().length > 0) {
        result.push(current.trim());
    }
    return result;
}

/**
 * Parses direction or angle from the first argument of linear-gradient
 * Returns angle in degrees [0..360)
 */
function parseLinearDirection(dirStr) {
    if (!dirStr) return 180; // default to bottom
    const clean = dirStr.trim().toLowerCase();

    if (clean.endsWith('deg')) {
        let deg = parseFloat(clean);
        return ((deg % 360) + 360) % 360;
    }
    if (clean.endsWith('turn')) {
        let turn = parseFloat(clean);
        return (((turn * 360) % 360) + 360) % 360;
    }
    if (clean.endsWith('rad')) {
        let rad = parseFloat(clean);
        return (((rad * (180 / Math.PI)) % 360) + 360) % 360;
    }

    // Direction keywords
    switch (clean) {
        case 'to top': return 0;
        case 'to top right':
        case 'to right top': return 45;
        case 'to right': return 90;
        case 'to bottom right':
        case 'to right bottom': return 135;
        case 'to bottom': return 180;
        case 'to bottom left':
        case 'to left bottom': return 225;
        case 'to left': return 270;
        case 'to top left':
        case 'to left top': return 315;
        default: return 180;
    }
}

/**
 * Calculates Figma gradient 2x3 transform matrix from an angle in degrees.
 * Figma gradient matrix maps unit square coords (0,0)-(1,1) centered at (0.5, 0.5)
 */
function createGradientTransform(angleDeg) {
    // In CSS: 0deg points UP (to top), 90deg points RIGHT, 180deg points DOWN
    // Convert CSS angle to standard math angle
    const rad = (angleDeg - 90) * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Figma matrix format:
    // [ m00, m01, m02 ]
    // [ m10, m11, m12 ]
    return {
        m00: Math.round(cos * 10000) / 10000,
        m01: Math.round(sin * 10000) / 10000,
        m02: Math.round((0.5 - 0.5 * (cos + sin)) * 10000) / 10000,
        m10: Math.round(-sin * 10000) / 10000,
        m11: Math.round(cos * 10000) / 10000,
        m12: Math.round((0.5 - 0.5 * (-sin + cos)) * 10000) / 10000
    };
}

/**
 * Parses color stops from gradient argument list
 */
function parseColorStops(stopStrings) {
    const rawStops = [];

    for (let i = 0; i < stopStrings.length; i++) {
        const item = stopStrings[i].trim();
        // Item is like "rgba(255, 0, 0, 0.5) 20%" or "#fff" or "red 100px"
        // Find trailing percentage or position
        const match = item.match(/^(.*?)(?:\s+([\d.]+%|[\d.]+px))?$/);
        if (!match) continue;

        const colorStr = match[1].trim();
        const posStr = match[2];

        const parsedColor = parseColor(colorStr);
        if (!parsedColor) continue;

        let position = null;
        if (posStr && posStr.endsWith('%')) {
            position = clamp01(parseFloat(posStr) / 100);
        }

        rawStops.push({
            color: parsedColor,
            position: position
        });
    }

    if (rawStops.length === 0) return [];
    if (rawStops.length === 1) {
        return [
            { color: rawStops[0].color, position: 0.0 },
            { color: rawStops[0].color, position: 1.0 }
        ];
    }

    // Assign default positions to first and last if unset
    if (rawStops[0].position === null) rawStops[0].position = 0.0;
    if (rawStops[rawStops.length - 1].position === null) rawStops[rawStops.length - 1].position = 1.0;

    // Interpolate unset positions between set ones
    let lastSetIdx = 0;
    for (let i = 1; i < rawStops.length; i++) {
        if (rawStops[i].position !== null) {
            const startPos = rawStops[lastSetIdx].position;
            const endPos = rawStops[i].position;
            const count = i - lastSetIdx;

            for (let j = 1; j < count; j++) {
                rawStops[lastSetIdx + j].position = startPos + (endPos - startPos) * (j / count);
            }
            lastSetIdx = i;
        }
    }

    return rawStops.map(s => ({
        color: s.color,
        position: Math.round(clamp01(s.position) * 10000) / 10000
    }));
}

/**
 * Parses a CSS gradient string (linear-gradient or radial-gradient)
 * @param {string} cssGradient
 * @returns {object|null} Figma Paint object
 */
function parseGradient(cssGradient) {
    if (!cssGradient) return null;
    const clean = cssGradient.trim();

    // 1. linear-gradient(...) and repeating-linear-gradient(...)
    const linearMatch = clean.match(/^(?:repeating-)?linear-gradient\((.*)\)$/is);
    if (linearMatch) {
        const parts = splitTopLevelCommas(linearMatch[1]);
        if (parts.length === 0) return null;

        let angle = 180;
        let stopParts = parts;

        // Check if first part is a direction/angle
        const first = parts[0].trim().toLowerCase();
        if (first.startsWith('to ') || first.endsWith('deg') || first.endsWith('turn') || first.endsWith('rad')) {
            angle = parseLinearDirection(first);
            stopParts = parts.slice(1);
        }

        const stops = parseColorStops(stopParts);
        if (stops.length < 2) return null;

        return {
            type: 'GRADIENT_LINEAR',
            stops: stops,
            transform: createGradientTransform(angle),
            opacity: 1.0,
            visible: true,
            blendMode: 'NORMAL'
        };
    }

    // 2. radial-gradient(...) and repeating-radial-gradient(...)
    const radialMatch = clean.match(/^(?:repeating-)?radial-gradient\((.*)\)$/is);
    if (radialMatch) {
        const parts = splitTopLevelCommas(radialMatch[1]);
        if (parts.length === 0) return null;

        let stopParts = parts;
        const first = parts[0].trim().toLowerCase();
        if (first.includes('circle') || first.includes('ellipse') || first.includes('at ')) {
            stopParts = parts.slice(1);
        }

        const stops = parseColorStops(stopParts);
        if (stops.length < 2) return null;

        // Radial transform centered in unit circle
        return {
            type: 'GRADIENT_RADIAL',
            stops: stops,
            transform: {
                m00: 0.5, m01: 0, m02: 0.25,
                m10: 0, m11: 0.5, m12: 0.25
            },
            opacity: 1.0,
            visible: true,
            blendMode: 'NORMAL'
        };
    }

    return null;
}

module.exports = {
    parseGradient,
    parseLinearDirection,
    createGradientTransform,
    parseColorStops,
    splitTopLevelCommas
};
