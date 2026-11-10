// src/parsers/svg.js
import { Resvg } from '@resvg/resvg-js';

/**
 * Serializes an SVG DOM element into a valid, standalone SVG string,
 * inlining any <use href="#symbolId"> references and resolving computed CSS styles & currentColor.
 */
export function serializeSvgElement(svgElement, colorString = '', targetWidth = 24, targetHeight = 24, win = null) {
    const clone = svgElement.cloneNode(true);
    const resolvedWin = win || (svgElement.ownerDocument ? svgElement.ownerDocument.defaultView : null);

    // Extract computed styles from DOM if available to preserve CSS-styled SVGs (e.g. stroke, fill)
    if (resolvedWin) {
        try {
            const computed = resolvedWin.getComputedStyle(svgElement);
            const fill = computed.fill || computed.getPropertyValue('fill');
            const stroke = computed.stroke || computed.getPropertyValue('stroke');
            const strokeWidth = computed.strokeWidth || computed.getPropertyValue('stroke-width');
            const strokeLinecap = computed.strokeLinecap || computed.getPropertyValue('stroke-linecap');
            const strokeLinejoin = computed.strokeLinejoin || computed.getPropertyValue('stroke-linejoin');
            const effectiveColor = colorString || computed.color || computed.getPropertyValue('color') || '#ffffff';

            if (fill && !clone.hasAttribute('fill')) {
                clone.setAttribute('fill', fill === 'currentColor' ? effectiveColor : fill);
            }
            if (stroke && stroke !== 'none' && !clone.hasAttribute('stroke')) {
                clone.setAttribute('stroke', stroke === 'currentColor' ? effectiveColor : stroke);
            }
            if (strokeWidth && strokeWidth !== 'none' && !clone.hasAttribute('stroke-width')) {
                clone.setAttribute('stroke-width', strokeWidth);
            }
            if (strokeLinecap && !clone.hasAttribute('stroke-linecap')) {
                clone.setAttribute('stroke-linecap', strokeLinecap);
            }
            if (strokeLinejoin && !clone.hasAttribute('stroke-linejoin')) {
                clone.setAttribute('stroke-linejoin', strokeLinejoin);
            }
        } catch (_) {}
    }

    const uses = clone.querySelectorAll('use');
    for (const use of uses) {
        const href = use.getAttribute('href') || use.getAttribute('xlink:href');
        if (href && href.startsWith('#') && svgElement.ownerDocument) {
            const symId = href.slice(1);
            const symbol = svgElement.ownerDocument.getElementById(symId);
            if (symbol) {
                if (!clone.getAttribute('viewBox') && symbol.getAttribute('viewBox')) {
                    clone.setAttribute('viewBox', symbol.getAttribute('viewBox'));
                }
                const g = svgElement.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
                g.innerHTML = symbol.innerHTML;
                use.replaceWith(g);
            }
        }
    }

    if (!clone.getAttribute('viewBox') && !clone.getAttribute('width')) {
        clone.setAttribute('viewBox', `0 0 ${targetWidth} ${targetHeight}`);
    }

    let xml = clone.outerHTML;

    // Ensure xmlns is present
    if (!xml.includes('xmlns=')) {
        xml = xml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    if (colorString) {
        xml = xml.replace(/currentColor/gi, colorString);
    }

    return xml;
}

/**
 * Extracts width and height from SVG element
 */
export function getSvgDimensions(svgElement, win) {
    const attrWidth = svgElement.getAttribute('width');
    const attrHeight = svgElement.getAttribute('height');

    // If explicitly width="0" and height="0", it is an invisible symbol sprite def
    if (attrWidth === '0' && attrHeight === '0') {
        return { width: 0, height: 0, isSpriteDef: true };
    }

    const computed = win.getComputedStyle(svgElement);
    const viewBox = svgElement.getAttribute('viewBox');

    // Resolve font size for 'em' unit dimensions (e.g. width: 1em; height: 1em)
    let parentFontSize = 16;
    let cur = svgElement;
    while (cur) {
        const cs = win.getComputedStyle(cur);
        const fs = cs.fontSize || cs.getPropertyValue('font-size');
        if (fs && parseFloat(fs)) {
            parentFontSize = parseFloat(fs);
            break;
        }
        cur = cur.parentElement;
    }

    const parseDimension = (valStr, attrVal) => {
        if (valStr && typeof valStr === 'string' && valStr.trim().endsWith('em')) {
            const em = parseFloat(valStr) || 1;
            return em * parentFontSize;
        }
        if (attrVal && typeof attrVal === 'string' && attrVal.trim().endsWith('em')) {
            const em = parseFloat(attrVal) || 1;
            return em * parentFontSize;
        }
        return parseFloat(valStr) || parseFloat(attrVal) || 0;
    };

    let width = parseDimension(computed.width, attrWidth);
    let height = parseDimension(computed.height, attrHeight);

    // If using a symbol, check symbol viewBox
    let symbolViewBox = null;
    const use = svgElement.querySelector('use');
    if (use && svgElement.ownerDocument) {
        const href = use.getAttribute('href') || use.getAttribute('xlink:href');
        if (href && href.startsWith('#')) {
            const sym = svgElement.ownerDocument.getElementById(href.slice(1));
            if (sym) symbolViewBox = sym.getAttribute('viewBox');
        }
    }

    const effectiveVb = viewBox || symbolViewBox;

    if ((!width || isNaN(width) || width <= 1) && effectiveVb) {
        const parts = effectiveVb.trim().split(/[\s,]+/).map(parseFloat);
        if (parts.length >= 4 && parts[2] > 0) {
            width = parts[2];
        }
    }

    if ((!height || isNaN(height) || height <= 1) && effectiveVb) {
        const parts = effectiveVb.trim().split(/[\s,]+/).map(parseFloat);
        if (parts.length >= 4 && parts[3] > 0) {
            height = parts[3];
        }
    }

    return {
        width: width && !isNaN(width) && width > 0 ? width : 24,
        height: height && !isNaN(height) && height > 0 ? height : 24,
        isSpriteDef: false
    };
}

/**
 * Sanitizes SVG XML to prevent XXE, recursive entity expansion, script execution,
 * and unauthorized external resource loading.
 * @param {string} svgXml
 * @returns {string}
 */
export function sanitizeSvg(svgXml) {
    if (!svgXml || typeof svgXml !== 'string') return '';
    let clean = svgXml;

    // 1. Remove DOCTYPE declarations (prevents DTD entity attacks / XXE)
    clean = clean.replace(/<!DOCTYPE[\s\S]*?(?:\[[\s\S]*?\])?\s*>/gi, '');

    // 2. Remove standalone ENTITY definitions
    clean = clean.replace(/<!ENTITY[\s\S]*?>/gi, '');

    // 3. Remove <script> tags and inline script handlers
    clean = clean.replace(/<script[\s\S]*?<\/script>/gi, '');
    clean = clean.replace(/<script[^>]*\/>/gi, '');
    clean = clean.replace(/\son[a-z]+\s*=\s*["'][^"']*["']/gi, '');

    // 4. Remove <foreignObject> tags (often used for HTML/script embedding in SVG)
    clean = clean.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
    clean = clean.replace(/<foreignObject[^>]*\/>/gi, '');

    // 5. Sanitize external URL references in <use> and <image> (xlink:href / href pointing to http/https/file)
    clean = clean.replace(/\b(href|xlink:href)\s*=\s*["'](?:https?:|\/\/|file:)[^"']*["']/gi, '$1=""');

    return clean;
}

/**
 * Renders SVG XML into a high-DPI PNG buffer using Resvg
 */
export function renderSvgToPng(svgXml, targetWidth = 64) {
    try {
        let clean = sanitizeSvg(svgXml).trim();
        if (!clean.includes('xmlns=')) {
            clean = clean.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        const pixelWidth = Math.max(32, Math.round(targetWidth * 2));
        const resvg = new Resvg(clean, {
            fitTo: { mode: 'width', value: pixelWidth }
        });
        const png = resvg.render().asPng();
        return png;
    } catch (e) {
        console.warn(`[WARN] SVG rasterization failed: ${e.message}`);
        return null;
    }
}
