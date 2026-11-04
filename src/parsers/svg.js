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

    let width = parseFloat(computed.width) || parseFloat(attrWidth);
    let height = parseFloat(computed.height) || parseFloat(attrHeight);

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

    if ((!width || isNaN(width) || width === 0) && effectiveVb) {
        const parts = effectiveVb.trim().split(/[\s,]+/).map(parseFloat);
        if (parts.length >= 4 && parts[2] > 0) {
            width = parts[2];
        }
    }

    if ((!height || isNaN(height) || height === 0) && effectiveVb) {
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
