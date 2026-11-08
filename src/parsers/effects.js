// src/parsers/effects.js
import { parseColor } from './color.js';
import { splitTopLevelCommas } from './gradient.js';

/**
 * Parses a single box-shadow definition
 * e.g. "0 4px 6px -1px rgba(0, 0, 0, 0.1)" or "inset 0 2px 4px #000"
 */
export function parseSingleBoxShadow(shadowStr) {
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

    // 1. Functional colors: rgba(...), rgb(...), hsla(...), hsl(...)
    const funcMatch = str.match(/(?:rgba?|hsla?)\([^)]+\)/i);
    if (funcMatch) {
        const parsed = parseColor(funcMatch[0]);
        if (parsed) {
            color = parsed;
            str = str.replace(funcMatch[0], ' ').trim();
        }
    }

    // 2. Hex colors: #fff, #ffffff, #ffffff80
    if (!color) {
        const hexMatch = str.match(/#[0-9a-fA-F]{3,8}\b/);
        if (hexMatch) {
            const parsed = parseColor(hexMatch[0]);
            if (parsed) {
                color = parsed;
                str = str.replace(hexMatch[0], ' ').trim();
            }
        }
    }

    // 3. Named color words (e.g. blue, black, transparent), skipping units (px, em, rem)
    if (!color) {
        const words = str.match(/\b[a-zA-Z]+\b/g);
        if (words) {
            for (const word of words) {
                if (['px', 'em', 'rem', 'vh', 'vw', 'pt', 'inset'].includes(word.toLowerCase())) continue;
                const parsed = parseColor(word);
                if (parsed) {
                    color = parsed;
                    str = str.replace(new RegExp(`\\b${word}\\b`), ' ').trim();
                    break;
                }
            }
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
export function parseBoxShadows(cssBoxShadow) {
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
export function parseBlurFilter(filterValue, isBackdrop = false) {
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
export function parseAllEffects(boxShadow, filter, backdropFilter) {
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
