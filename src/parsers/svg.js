// src/parsers/svg.js
const { Resvg } = require('@resvg/resvg-js');

/**
 * Serializes an SVG DOM element into a valid, standalone SVG string,
 * inlining any <use href="#symbolId"> references and resolving currentColor.
 */
function serializeSvgElement(svgElement, colorString = '', targetWidth = 24, targetHeight = 24) {
    const clone = svgElement.cloneNode(true);
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
function getSvgDimensions(svgElement, win) {
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
 * Renders SVG XML into a high-DPI PNG buffer using Resvg
 */
function renderSvgToPng(svgXml, targetWidth = 64) {
    try {
        let clean = svgXml.trim();
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

module.exports = {
    serializeSvgElement,
    getSvgDimensions,
    renderSvgToPng
};
