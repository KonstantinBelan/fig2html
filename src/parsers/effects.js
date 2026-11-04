// src/parsers/effects.js
const { parseColor } = require('./color');
const { splitTopLevelCommas } = require('./gradient');

/**
 * Parses a single box-shadow definition
 * e.g. "0 4px 6px -1px rgba(0, 0, 0, 0.1)" or "inset 0 2px 4px #000"
 */
function parseSingleBoxShadow(shadowStr) {
    if (!shadowStr) return null;
    let str = shadowStr.trim();
    if (str === 'none') return null;

    let isInset = false;
    if (/\binset\b/i.test(str)) {
        isInset = true;
        str = str.replace(/\binset\b/gi, '').trim();
    }

    // Color can be at the beginning (e.g. rgba(0,0,0,0.1) 0 4px) or at the end
    let color = null;
    let colorMatch = str.match(/(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]+|[a-zA-Z]+)/);
    if (colorMatch) {
        const potentialColor = colorMatch[0];
        const parsed = parseColor(potentialColor);
        if (parsed) {
            color = parsed;
            // Remove color from the string to easily extract lengths
            str = str.replace(potentialColor, '').trim();
        }
    }

    if (!color) {
        color = { r: 0, g: 0, b: 0, a: 0.25 };
    }

    // Extract numbers with px/em/%/etc.
    const numMatches = str.match(/-?[\d.]+(?:px|em|rem)?/g);
    if (!numMatches || numMatches.length < 2) return null;

    const parsePx = (val) => {
        if (!val) return 0;
        return parseFloat(val) || 0;
    };

    const offsetX = parsePx(numMatches[0]);
    const offsetY = parsePx(numMatches[1]);
    const blurRadius = numMatches.length >= 3 ? Math.max(0, parsePx(numMatches[2])) : 0;
    const spreadRadius = numMatches.length >= 4 ? parsePx(numMatches[3]) : 0;

    return {
        type: isInset ? 'INNER_SHADOW' : 'DROP_SHADOW',
        color: color,
        offset: { x: offsetX, y: offsetY },
        radius: blurRadius,
        spread: spreadRadius,
        visible: true,
        blendMode: 'NORMAL'
    };
}

/**
 * Parses full box-shadow property string (handles multiple shadows)
 * @param {string} cssBoxShadow
 * @returns {Array<object>} Array of Figma Effect objects
 */
function parseBoxShadows(cssBoxShadow) {
    if (!cssBoxShadow || cssBoxShadow === 'none') return [];
    const parts = splitTopLevelCommas(cssBoxShadow);
    const effects = [];

    for (const part of parts) {
        const effect = parseSingleBoxShadow(part);
        if (effect) {
            effects.push(effect);
        }
    }
    return effects;
}

/**
 * Parses filter and backdrop-filter for blur effects
 * @param {string} filterValue
 * @param {boolean} isBackdrop
 * @returns {object|null} Figma Effect object
 */
function parseBlurFilter(filterValue, isBackdrop = false) {
    if (!filterValue || filterValue === 'none') return null;

    const blurMatch = filterValue.match(/blur\(([\d.]+)px\)/i);
    if (blurMatch) {
        const radius = parseFloat(blurMatch[1]);
        if (!isNaN(radius) && radius > 0) {
            return {
                type: isBackdrop ? 'BACKGROUND_BLUR' : 'FOREGROUND_BLUR',
                radius: radius,
                visible: true
            };
        }
    }
    return null;
}

/**
 * Combines box-shadow, filter, and backdrop-filter into a list of Figma effects
 */
function parseAllEffects(boxShadow, filter, backdropFilter) {
    const effects = [];

    if (boxShadow) {
        effects.push(...parseBoxShadows(boxShadow));
    }

    if (filter) {
        const fgBlur = parseBlurFilter(filter, false);
        if (fgBlur) effects.push(fgBlur);
    }

    if (backdropFilter) {
        const bgBlur = parseBlurFilter(backdropFilter, true);
        if (bgBlur) effects.push(bgBlur);
    }

    return effects;
}

module.exports = {
    parseSingleBoxShadow,
    parseBoxShadows,
    parseBlurFilter,
    parseAllEffects
};
