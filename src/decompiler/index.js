// src/decompiler/index.js
const fs = require('fs');
const path = require('path');
const { readFigFile } = require('./reader');
const { buildSceneTree } = require('./tree');
const { generateFullHtmlDocument } = require('./html');

/**
 * Converts a Figma .fig binary file into a clean, standalone HTML/CSS document
 * @param {string|Buffer} figInput File path or buffer of the .fig file
 * @param {object} [options={}]
 * @param {string} [options.outputHtmlPath] Optional output path to save the generated HTML
 * @param {string} [options.pageName='Page 1'] Name of the Figma page (CANVAS) to convert
 * @param {boolean} [options.inlineImages=true] Whether to inline images as base64 data URIs
 * @param {string} [options.assetsDir] Directory to write extracted image files (if inlineImages=false)
 * @param {string} [options.assetUrlPrefix='images/'] URL prefix for image sources
 * @param {string} [options.title] Custom HTML document title
 * @param {boolean} [options.verbose=false] Print progress logs
 * @returns {Promise<{ html: string, outputPath: string|null, totalNodes: number, imagesCount: number, durationMs: number, stats: object }>}
 */
async function convertFigToHtml(figInput, options = {}) {
    const startTime = Date.now();
    const log = (msg) => {
        if (options.verbose) console.log(`[DECOMPILE] ${msg}`);
    };

    // 1. Read .fig file and extract Kiwi AST and images
    log('Reading .fig archive and decoding Kiwi stream...');
    const { nodeChanges, images } = readFigFile(figInput);

    // 2. Build hierarchical scene tree
    log(`Building scene tree from ${nodeChanges.length} nodes...`);
    const { rootNodes, canvas } = buildSceneTree(nodeChanges, {
        pageName: options.pageName
    });

    log(`Target canvas "${canvas.name}" with ${rootNodes.length} top-level nodes.`);

    // 3. Handle images export if inlineImages is false
    if (options.inlineImages === false && options.assetsDir) {
        const outDir = path.resolve(options.assetsDir);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        for (const [hashHex, imgObj] of images.entries()) {
            const ext = imgObj.mime === 'image/jpeg' ? 'jpg' : (imgObj.mime === 'image/svg+xml' ? 'svg' : 'png');
            const filePath = path.join(outDir, `${hashHex}.${ext}`);
            fs.writeFileSync(filePath, imgObj.buffer);
        }
    }

    // 4. Calculate node statistics
    const stats = {
        frames: 0,
        textNodes: 0,
        images: 0,
        shapes: 0
    };

    function collectStats(node) {
        if (!node) return;
        if (node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'COMPONENT' || node.type === 'INSTANCE') stats.frames++;
        else if (node.type === 'TEXT') stats.textNodes++;
        else if (node.type === 'RECTANGLE' && node.fillPaints?.some(f => f.type === 'IMAGE')) stats.images++;
        else stats.shapes++;

        if (node.children) {
            for (const c of node.children) collectStats(c);
        }
    }

    for (const r of rootNodes) {
        collectStats(r);
    }

    // 5. Generate full HTML document
    log('Generating semantic HTML5 and CSS styles...');
    const html = generateFullHtmlDocument(rootNodes, images, {
        inlineImages: options.inlineImages !== false,
        assetUrlPrefix: options.assetUrlPrefix || 'images/',
        title: options.title || canvas.name || 'Exported Figma Design'
    });

    // 6. Write output file if requested
    let outputPath = null;
    if (options.outputHtmlPath) {
        outputPath = path.resolve(options.outputHtmlPath);
        const outDir = path.dirname(outputPath);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        fs.writeFileSync(outputPath, html, 'utf8');
        log(`Saved HTML to ${outputPath} (${Buffer.byteLength(html, 'utf8')} bytes)`);
    }

    const durationMs = Date.now() - startTime;

    return {
        html,
        outputPath,
        totalNodes: nodeChanges.length,
        imagesCount: images.size,
        durationMs,
        stats
    };
}

module.exports = {
    convertFigToHtml,
    readFigFile,
    buildSceneTree,
    generateFullHtmlDocument
};
