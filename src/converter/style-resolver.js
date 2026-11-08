// src/converter/style-resolver.js
import { parseColor, clamp01 } from '../parsers/color.js';
import { parseGradient, splitTopLevelCommas } from '../parsers/gradient.js';
import { parseAllEffects } from '../parsers/effects.js';

export function cloneNode(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Parses CSS grid-template-columns into an array of column size definitions
 * @param {string} gridCols
 * @returns {string[]}
 */
export function parseGridColumns(gridCols) {
    if (!gridCols || gridCols === 'none') return ['1fr'];
    const clean = String(gridCols).trim();

    const repeatMatch = clean.match(/repeat\((\d+),\s*([^)]+)\)/i);
    if (repeatMatch) {
        const count = parseInt(repeatMatch[1], 10) || 1;
        const val = repeatMatch[2].trim();
        return Array(count).fill(val);
    }

    const tokens = clean.split(/\s+/).filter(Boolean);
    return tokens.length > 0 ? tokens : ['1fr'];
}

export const BLEND_MODE_MAP = {
    'normal': 'NORMAL',
    'multiply': 'MULTIPLY',
    'screen': 'SCREEN',
    'overlay': 'OVERLAY',
    'darken': 'DARKEN',
    'lighten': 'LIGHTEN',
    'color-dodge': 'COLOR_DODGE',
    'color-burn': 'COLOR_BURN',
    'hard-light': 'HARD_LIGHT',
    'soft-light': 'SOFT_LIGHT',
    'difference': 'DIFFERENCE',
    'exclusion': 'EXCLUSION',
    'hue': 'HUE',
    'saturation': 'SATURATION',
    'color': 'COLOR',
    'luminosity': 'LUMINOSITY'
};

/**
 * Parses CSS box shorthands (padding, margin) with 1, 2, 3, or 4 tokens into 4 offsets
 */
export function parseBoxOffsets(shorthand, top, right, bottom, left) {
    let t = 0, r = 0, b = 0, l = 0;
    if (shorthand && shorthand !== '0' && shorthand !== 'none') {
        const parts = shorthand.trim().split(/\s+/).map(p => parseFloat(p) || 0);
        if (parts.length === 1) {
            t = r = b = l = parts[0];
        } else if (parts.length === 2) {
            t = b = parts[0];
            r = l = parts[1];
        } else if (parts.length === 3) {
            t = parts[0];
            r = l = parts[1];
            b = parts[2];
        } else if (parts.length >= 4) {
            t = parts[0];
            r = parts[1];
            b = parts[2];
            l = parts[3];
        }
    }
    if (top !== undefined && top !== null && top !== '') t = parseFloat(top) || 0;
    if (right !== undefined && right !== null && right !== '') r = parseFloat(right) || 0;
    if (bottom !== undefined && bottom !== null && bottom !== '') b = parseFloat(bottom) || 0;
    if (left !== undefined && left !== null && left !== '') l = parseFloat(left) || 0;
    return { top: t, right: r, bottom: b, left: l };
}

/**
 * Parses CSS border shorthand (e.g. "1px solid var(--border)") into width, style, and color
 */
export function parseBorderProperty(borderStr, widthStr, styleStr, colorStr) {
    let width = parseFloat(widthStr) || 0;
    let style = styleStr || '';
    let color = colorStr || '';

    if (borderStr && borderStr !== 'none') {
        const parts = borderStr.trim();
        const wMatch = parts.match(/([0-9.]+)(?:px|rem|em)?/);
        if (!width && wMatch) {
            width = parseFloat(wMatch[1]) || 0;
        }
        const sMatch = parts.match(/\b(solid|dashed|dotted|double|groove|ridge|inset|outset|none)\b/i);
        if (!style && sMatch) {
            style = sMatch[1].toLowerCase();
        }
        if (!color) {
            let rem = parts;
            if (wMatch) rem = rem.replace(wMatch[0], '');
            if (sMatch) rem = rem.replace(new RegExp('\\b' + sMatch[1] + '\\b', 'i'), '');
            color = rem.trim();
        }
    }
    return { width, style: style || 'none', color };
}

export function extractVarName(rawStr) {
    if (!rawStr || typeof rawStr !== 'string') return null;
    const match = rawStr.match(/var\(\s*(--[a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}

/**
 * Resolves full computed style dictionary and parsed Figma properties for an element
 */
export async function resolveElementStyles(element, win, context, parentContext = null) {
    const inline = element.style;
    const computed = win.getComputedStyle(element);

    const getProp = (...props) => {
        for (const p of props) {
            const raw = inline[p] || inline.getPropertyValue(p) || computed[p] || computed.getPropertyValue(p);
            if (raw !== undefined && raw !== null && raw !== '') {
                return context.resolveVar(raw, element);
            }
        }
        return '';
    };

    const getRawProp = (...props) => {
        for (const p of props) {
            const raw = inline[p] || inline.getPropertyValue(p) || computed[p] || computed.getPropertyValue(p);
            if (raw !== undefined && raw !== null && raw !== '') {
                return raw;
            }
        }
        return '';
    };

    const getVarForProp = (...props) => {
        for (const p of props) {
            const raw = inline[p] || inline.getPropertyValue(p) || computed[p] || computed.getPropertyValue(p);
            if (raw !== undefined && raw !== null && raw !== '') {
                const varName = extractVarName(raw);
                if (varName && context.varMap && context.varMap.has(varName)) {
                    return context.varMap.get(varName);
                }
            }
        }
        return null;
    };

    const display = getProp('display', 'display');
    const visibility = getProp('visibility', 'visibility');
    const isVisible = visibility !== 'hidden';

    // Opacity
    const rawOpacity = getProp('opacity', 'opacity');
    const opacity = (rawOpacity !== undefined && rawOpacity !== null && rawOpacity !== '' && !isNaN(parseFloat(rawOpacity)))
        ? clamp01(parseFloat(rawOpacity))
        : 1.0;

    const mixBlend = getProp('mix-blend-mode', 'mixBlendMode');
    const blendMode = (mixBlend && mixBlend.toLowerCase() !== 'normal')
        ? (BLEND_MODE_MAP[mixBlend.toLowerCase()] || undefined)
        : undefined;

    // Position
    const position = getProp('position', 'position');
    const isAbsolute = position === 'absolute' || position === 'fixed';
    const topStr = getProp('top', 'top');
    const leftStr = getProp('left', 'left');
    const rightStr = getProp('right', 'right');
    const bottomStr = getProp('bottom', 'bottom');
    const insetStr = getProp('inset', 'inset');

    // Containing block dimensions
    const containerW = parentContext ? (parentContext.containerWidth || parentContext.width) : 1440;
    const containerH = parentContext ? (parentContext.containerHeight || parentContext.height) : 900;
    const flowW = parentContext ? parentContext.width : 1440;
    const flowH = parentContext ? parentContext.height : 900;

    // Dimensions
    const rawWidthStr = getProp('width', 'width');
    const rawHeightStr = getProp('height', 'height');

    let width = 0;
    let isWidthPercent = false;
    if (rawWidthStr) {
        if (rawWidthStr.endsWith('%')) {
            isWidthPercent = true;
            const pct = (parseFloat(rawWidthStr) || 100) / 100;
            width = Math.round((isAbsolute ? containerW : flowW) * pct);
        } else if (rawWidthStr !== 'auto') {
            width = parseFloat(rawWidthStr) || 0;
        }
    }
    if (!width && element.getAttribute('width')) {
        const attrW = element.getAttribute('width');
        if (attrW.endsWith('%')) {
            isWidthPercent = true;
            const pct = (parseFloat(attrW) || 100) / 100;
            width = Math.round((isAbsolute ? containerW : flowW) * pct);
        } else {
            width = parseFloat(attrW) || 0;
        }
    }
    if ((!width || width === 0) && (insetStr === '0' || insetStr === '0px' || (topStr === '0' && leftStr === '0' && rightStr === '0')) && isAbsolute) {
        width = containerW;
    }

    let height = 0;
    let isHeightPercent = false;
    if (rawHeightStr) {
        if (rawHeightStr.endsWith('%')) {
            isHeightPercent = true;
            const pct = (parseFloat(rawHeightStr) || 100) / 100;
            height = Math.round((isAbsolute ? containerH : flowH) * pct);
        } else if (rawHeightStr !== 'auto') {
            height = parseFloat(rawHeightStr) || 0;
        }
    }
    if (!height && element.getAttribute('height')) {
        const attrH = element.getAttribute('height');
        if (attrH.endsWith('%')) {
            isHeightPercent = true;
            const pct = (parseFloat(attrH) || 100) / 100;
            height = Math.round((isAbsolute ? containerH : flowH) * pct);
        } else {
            height = parseFloat(attrH) || 0;
        }
    }
    if ((!height || height === 0) && (insetStr === '0' || insetStr === '0px' || (topStr === '0' && bottomStr === '0')) && isAbsolute) {
        height = containerH;
    }

    const hasExplicitWidth = width > 0 && !isWidthPercent;
    const hasExplicitHeight = height > 0;

    let posX = 0;
    let posY = 0;
    if (isAbsolute) {
        if (leftStr && leftStr !== 'auto') {
            posX = parseFloat(leftStr) || 0;
        } else if (rightStr && rightStr !== 'auto' && parentContext) {
            const rVal = parseFloat(rightStr) || 0;
            posX = Math.max(0, containerW - rVal - (width || 0));
        }

        if (topStr && topStr !== 'auto') {
            posY = parseFloat(topStr) || 0;
        } else if (bottomStr && bottomStr !== 'auto' && parentContext) {
            const bVal = parseFloat(bottomStr) || 0;
            posY = Math.max(0, containerH - bVal - (height || 0));
        }
    }

    let x = posX || parseFloat(getProp('left', 'left')) || 0;
    let y = posY || parseFloat(getProp('top', 'top')) || 0;

    const rawFlex = getProp('flex', 'flex');
    let flexGrow = parseFloat(getProp('flex-grow', 'flexGrow')) || 0;
    if (!flexGrow && rawFlex) {
        flexGrow = parseFloat(rawFlex) || 0;
    }
    const alignSelf = getProp('align-self', 'alignSelf');

    // Margins
    const marginOffsets = parseBoxOffsets(
        getProp('margin', 'margin'),
        getProp('margin-top', 'marginTop'),
        getProp('margin-right', 'marginRight'),
        getProp('margin-bottom', 'marginBottom'),
        getProp('margin-left', 'marginLeft')
    );
    const marginStr = getProp('margin', 'margin');
    const mlStr = getProp('margin-left', 'marginLeft');
    const mrStr = getProp('margin-right', 'marginRight');
    const isMarginAuto = marginStr.includes('auto') || (mlStr === 'auto' && mrStr === 'auto');

    // Inherited styles
    const elementColorVar = getVarForProp('color', 'color');
    const inheritedColorVar = elementColorVar || (parentContext?.inherited?.colorVar);
    const inheritedStyles = {
        fontFamily: getProp('font-family', 'fontFamily') || (parentContext?.inherited?.fontFamily) || 'Inter',
        color: getProp('color', 'color') || (parentContext?.inherited?.color) || '#000000',
        colorVar: inheritedColorVar,
        lineHeight: getProp('line-height', 'lineHeight') || (parentContext?.inherited?.lineHeight) || 'normal',
        letterSpacing: getProp('letter-spacing', 'letterSpacing') || (parentContext?.inherited?.letterSpacing) || 'normal',
        fontWeight: getProp('font-weight', 'fontWeight') || (parentContext?.inherited?.fontWeight) || 'normal',
        fontStyle: getProp('font-style', 'fontStyle') || (parentContext?.inherited?.fontStyle) || 'normal',
        fontSize: parseFloat(getProp('font-size', 'fontSize')) || (parentContext?.inherited?.fontSize) || 16
    };

    // Flex row auto-distribution
    if (parentContext && parentContext.isFlex && !parentContext.isColumn && flexGrow > 0) {
        if (parentContext.width > 0 && (!hasExplicitWidth || width === 0)) {
            const gap = parentContext.gap || 0;
            const siblingsCount = Math.max(1, element.parentElement?.children?.length || 1);
            const totalGaps = gap * (siblingsCount - 1);
            width = Math.floor((parentContext.width - totalGaps) / siblingsCount);
        }
    }

    // Fills
    const fills = [];
    const bgImage = getProp('background-image', 'backgroundImage');
    const bgVal = getProp('background', 'background');
    const bgColor = getProp('background-color', 'backgroundColor');
    const bgVar = getVarForProp('background-color', 'backgroundColor', 'background');

    const bgCandidates = [bgImage, bgVal].filter(Boolean);
    for (const candidate of bgCandidates) {
        const parts = splitTopLevelCommas(candidate);
        for (const part of parts) {
            if (part.includes('gradient')) {
                const gradPaint = parseGradient(part);
                if (gradPaint) fills.push(gradPaint);
            } else if (part.includes('url(')) {
                const urlMatch = part.match(/url\(["']?(.*?)["']?\)/);
                if (urlMatch && context.imageRegistry) {
                    const imgRes = await context.imageRegistry.resolveImage(urlMatch[1], 'bg-image');
                    if (imgRes) {
                        fills.push(context.imageRegistry.createImagePaint(imgRes, 'FILL'));
                        if (context.stats) context.stats.images++;
                    }
                }
            } else {
                const col = parseColor(part);
                if (col && col.a > 0 && !fills.some(f => f.type === 'SOLID')) {
                    const solidPaint = {
                        type: 'SOLID',
                        color: col,
                        opacity: col.a,
                        visible: true,
                        blendMode: 'NORMAL'
                    };
                    const candidateVarName = extractVarName(part);
                    const candidateVar = (candidateVarName && context.varMap?.get(candidateVarName)) || bgVar ||
                        (col.a === 1 && context.colorToVarMap ? context.colorToVarMap.get(context.colorToHexKey(col)) : null);
                    const cVar = context.createColorVar ? context.createColorVar(candidateVar) : undefined;
                    if (cVar) solidPaint.colorVar = cVar;
                    fills.push(solidPaint);
                }
            }
        }
    }

    if (bgColor) {
        const parsedBgColor = parseColor(bgColor);
        if (parsedBgColor && parsedBgColor.a > 0 && !fills.some(f => f.type === 'SOLID')) {
            const solidPaint = {
                type: 'SOLID',
                color: parsedBgColor,
                opacity: parsedBgColor.a,
                visible: true,
                blendMode: 'NORMAL'
            };
            const cVar = (context.createColorVar ? context.createColorVar(bgVar) : undefined) ||
                (parsedBgColor.a === 1 && context.createColorVar && context.colorToVarMap ? context.createColorVar(context.colorToVarMap.get(context.colorToHexKey(parsedBgColor))) : undefined);
            if (cVar) solidPaint.colorVar = cVar;
            fills.push(solidPaint);
        }
    }

    // Borders & Strokes
    const strokePaints = [];
    const mainBorder = parseBorderProperty(
        getProp('border', 'border'),
        getProp('border-width', 'borderWidth'),
        getProp('border-style', 'borderStyle'),
        getProp('border-color', 'borderColor')
    );
    const borderWidth = mainBorder.width;
    const parsedBorderColor = parseColor(mainBorder.color);
    const strokeVar = getVarForProp('border-color', 'borderColor', 'border');

    if (borderWidth > 0 && mainBorder.style !== 'none' && parsedBorderColor && parsedBorderColor.a > 0) {
        const strokePaint = {
            type: 'SOLID',
            color: parsedBorderColor,
            opacity: parsedBorderColor.a,
            visible: true,
            blendMode: 'NORMAL'
        };
        const cVar = (context.createColorVar ? context.createColorVar(strokeVar) : undefined) ||
            (parsedBorderColor.a === 1 && context.createColorVar && context.colorToVarMap ? context.createColorVar(context.colorToVarMap.get(context.colorToHexKey(parsedBorderColor))) : undefined);
        if (cVar) strokePaint.colorVar = cVar;
        strokePaints.push(strokePaint);
    }

    // Individual borders
    const topB = parseBorderProperty(getProp('border-top', 'borderTop'), getProp('border-top-width', 'borderTopWidth'), getProp('border-top-style', 'borderTopStyle'), getProp('border-top-color', 'borderTopColor'));
    const bottomB = parseBorderProperty(getProp('border-bottom', 'borderBottom'), getProp('border-bottom-width', 'borderBottomWidth'), getProp('border-bottom-style', 'borderBottomStyle'), getProp('border-bottom-color', 'borderBottomColor'));
    const leftB = parseBorderProperty(getProp('border-left', 'borderLeft'), getProp('border-left-width', 'borderLeftWidth'), getProp('border-left-style', 'borderLeftStyle'), getProp('border-left-color', 'borderLeftColor'));
    const rightB = parseBorderProperty(getProp('border-right', 'borderRight'), getProp('border-right-width', 'borderRightWidth'), getProp('border-right-style', 'borderRightStyle'), getProp('border-right-color', 'borderRightColor'));

    const borderTopW = topB.width || borderWidth;
    const borderBottomW = bottomB.width || borderWidth;
    const borderLeftW = leftB.width || borderWidth;
    const borderRightW = rightB.width || borderWidth;

    const hasIndependentBorders =
        borderTopW !== borderBottomW || borderLeftW !== borderRightW || borderTopW !== borderLeftW;

    if (strokePaints.length === 0 && (borderTopW > 0 || borderBottomW > 0 || borderLeftW > 0 || borderRightW > 0)) {
        const sideColor = parseColor(topB.color || bottomB.color || leftB.color || rightB.color || mainBorder.color);
        if (sideColor && sideColor.a > 0) {
            const sideVar = getVarForProp(
                'border-top-color', 'borderTopColor', 'border-top', 'borderTop',
                'border-bottom-color', 'borderBottomColor', 'border-bottom', 'borderBottom',
                'border-left-color', 'borderLeftColor', 'border-left', 'borderLeft',
                'border-right-color', 'borderRightColor', 'border-right', 'borderRight',
                'border-color', 'borderColor', 'border'
            );
            const strokePaint = {
                type: 'SOLID',
                color: sideColor,
                opacity: sideColor.a,
                visible: true,
                blendMode: 'NORMAL'
            };
            const cVar = (context.createColorVar ? context.createColorVar(sideVar) : undefined) ||
                (sideColor.a === 1 && context.createColorVar && context.colorToVarMap ? context.createColorVar(context.colorToVarMap.get(context.colorToHexKey(sideColor))) : undefined);
            if (cVar) strokePaint.colorVar = cVar;
            strokePaints.push(strokePaint);
        }
    }

    // Border Radius
    const borderRadius = parseFloat(getProp('border-radius', 'borderRadius')) || 0;
    const tlRadius = parseFloat(getProp('border-top-left-radius', 'borderTopLeftRadius')) || borderRadius;
    const trRadius = parseFloat(getProp('border-top-right-radius', 'borderTopRightRadius')) || borderRadius;
    const brRadius = parseFloat(getProp('border-bottom-right-radius', 'borderBottomRightRadius')) || borderRadius;
    const blRadius = parseFloat(getProp('border-bottom-left-radius', 'borderBottomLeftRadius')) || borderRadius;
    const hasIndependentCorners =
        tlRadius !== trRadius || brRadius !== blRadius || tlRadius !== brRadius;

    // Effects
    const boxShadow = getProp('box-shadow', 'boxShadow');
    const filter = getProp('filter', 'filter');
    const backdropFilter = getProp('backdrop-filter', 'backdropFilter');
    const effects = parseAllEffects(boxShadow, filter, backdropFilter);

    return {
        getProp,
        getRawProp,
        getVarForProp,
        display,
        visibility,
        isVisible,
        opacity,
        blendMode,
        position,
        isAbsolute,
        topStr,
        leftStr,
        rightStr,
        bottomStr,
        insetStr,
        containerW,
        containerH,
        flowW,
        flowH,
        width,
        height,
        rawWidthStr,
        rawHeightStr,
        hasExplicitWidth,
        hasExplicitHeight,
        isWidthPercent,
        isHeightPercent,
        posX,
        posY,
        x,
        y,
        flexGrow,
        alignSelf,
        marginOffsets,
        isMarginAuto,
        inheritedStyles,
        fills,
        strokePaints,
        borderWidth,
        borderTopW,
        borderBottomW,
        borderLeftW,
        borderRightW,
        hasIndependentBorders,
        borderRadius,
        tlRadius,
        trRadius,
        brRadius,
        blRadius,
        hasIndependentCorners,
        effects
    };
}
