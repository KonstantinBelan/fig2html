// src/parsers/svg.js
const { Resvg } = require('@resvg/resvg-js');

/**
 * Serializes an SVG DOM element into a valid, standalone SVG string
 */
function serializeSvgElement(svgElement) {
    let xml = svgElement.outerHTML;

    // Ensure xmlns is present
    if (!xml.includes('xmlns=')) {
        xml = xml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    return xml;
}

/**
 * Extracts width and height from SVG element
 */
function getSvgDimensions(svgElement, win) {
    const computed = win.getComputedStyle(svgElement);
    const attrWidth = svgElement.getAttribute('width');
    const attrHeight = svgElement.getAttribute('height');
    const viewBox = svgElement.getAttribute('viewBox');

    let width = parseFloat(computed.width) || parseFloat(attrWidth);
    let height = parseFloat(computed.height) || parseFloat(attrHeight);

    if ((!width || isNaN(width) || width === 0) && viewBox) {
        const parts = viewBox.trim().split(/[\s,]+/).map(parseFloat);
        if (parts.length >= 4 && parts[2] > 0) {
            width = parts[2];
        }
    }

    if ((!height || isNaN(height) || height === 0) && viewBox) {
        const parts = viewBox.trim().split(/[\s,]+/).map(parseFloat);
        if (parts.length >= 4 && parts[3] > 0) {
            height = parts[3];
        }
    }

    return {
        width: width && !isNaN(width) ? width : 24,
        height: height && !isNaN(height) ? height : 24
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
