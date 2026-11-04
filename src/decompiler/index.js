// src/decompiler/index.js
const fs = require('fs');
const path = require('path');
const { readFigFile } = require('./reader');
const { buildSceneTree } = require('./tree');
const { generateFullHtmlDocument } = require('./html');
const { getExtensionForMime } = require('./css');

/**
 * Converts a Figma .fig binary file into a clean, standalone HTML/CSS document
 * @param {string|Buffer} figInput File path or buffer of the .fig file
 * @param {object} [options={}]
 * @param {string} [options.outputHtmlPath] Optional output path to save the generated HTML
 * @param {string} [options.pageName='Page 1'] Name of the Figma page (CANVAS) to convert
 * @param {boolean} [options.inlineImages=true] Whether to inline images as base64 data URIs
 * @param {boolean} [options.separateFiles=false] Whether to extract CSS to css/style.css and images to img/
 * @param {boolean} [options.extractCss=false] Extract stylesheet into a separate .css file
 * @param {string} [options.cssFile='css/style.css'] Relative or absolute path for external CSS file
 * @param {string} [options.assetsDir='img'] Directory to write extracted image files (if inlineImages=false)
 * @param {string} [options.assetUrlPrefix] URL prefix for image sources in HTML
 * @param {string} [options.cssAssetUrlPrefix] URL prefix for image sources in CSS
 * @param {string} [options.title] Custom HTML document title
 * @param {boolean} [options.verbose=false] Print progress logs
 * @returns {Promise<{ html: string, css: string|null, outputPath: string|null, cssPath: string|null, assetsDir: string|null, totalNodes: number, imagesCount: number, durationMs: number, stats: object }>}
 */
async function convertFigToHtml(figInput, options = {}) {
    const startTime = Date.now();
    const log = (msg) => {
        if (options.verbose) console.log(`[DECOMPILE] ${msg}`);
    };

    const isSeparateFiles = Boolean(options.separateFiles);
    const isExtractCss = isSeparateFiles || Boolean(options.extractCss);
    const isInlineImages = isSeparateFiles
        ? false
        : (options.inlineImages !== undefined ? options.inlineImages : (options.assetsDir ? false : true));
    const assetsRelDir = options.assetsDir || 'img';
    const cssRelPath = options.cssFile || 'css/style.css';

    const outputPath = options.outputHtmlPath ? path.resolve(options.outputHtmlPath) : null;
    const baseDir = outputPath ? path.dirname(outputPath) : process.cwd();

    // 1. Read .fig file and extract Kiwi AST and images
    log('Reading .fig archive and decoding Kiwi stream...');
    const { nodeChanges, blobs, images } = readFigFile(figInput);

    // 2. Build hierarchical scene tree
    log(`Building scene tree from ${nodeChanges.length} nodes...`);
    const { rootNodes, canvas } = buildSceneTree(nodeChanges, {
        pageName: options.pageName
    });

    log(`Target canvas "${canvas.name}" with ${rootNodes.length} top-level nodes.`);

    // 3. Handle images export if inlineImages is false
    let outAssetsDir = null;
    if (isInlineImages === false) {
        outAssetsDir = path.resolve(baseDir, assetsRelDir);
        if (!fs.existsSync(outAssetsDir)) {
            fs.mkdirSync(outAssetsDir, { recursive: true });
        }
        for (const [hashHex, imgObj] of images.entries()) {
            const ext = getExtensionForMime(imgObj.mime);
            const filePath = path.join(outAssetsDir, `${hashHex}.${ext}`);
            fs.writeFileSync(filePath, imgObj.buffer);
        }
        log(`Extracted ${images.size} image files to ${outAssetsDir}`);
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

    // 5. Generate semantic HTML and CSS styles
    log('Generating semantic HTML5 and CSS styles...');
    const assetsPrefix = options.assetUrlPrefix || (assetsRelDir ? `${assetsRelDir.replace(/\/+$/, '')}/` : 'img/');
    const cssPrefix = options.cssAssetUrlPrefix || (isExtractCss ? `../${assetsPrefix}` : assetsPrefix);

    const docResult = generateFullHtmlDocument(rootNodes, images, {
        inlineImages: isInlineImages,
        inlineStyles: options.inlineStyles === true,
        extractCss: isExtractCss,
        cssHref: cssRelPath,
        assetUrlPrefix: assetsPrefix,
        cssAssetUrlPrefix: cssPrefix,
        blobs: blobs,
        title: options.title || canvas.name || 'Exported Figma Design'
    });

    const html = typeof docResult === 'string' ? docResult : docResult.html;
    const css = typeof docResult === 'string' ? null : (docResult.css || null);

    // 6. Write external CSS file if requested
    let extractedCssPath = null;
    if (isExtractCss && css) {
        extractedCssPath = path.resolve(baseDir, cssRelPath);
        const cssDir = path.dirname(extractedCssPath);
        if (!fs.existsSync(cssDir)) {
            fs.mkdirSync(cssDir, { recursive: true });
        }
        fs.writeFileSync(extractedCssPath, css, 'utf8');
        log(`Saved external stylesheet to ${extractedCssPath} (${Buffer.byteLength(css, 'utf8')} bytes)`);
    }

    // 7. Write output HTML file if requested
    if (outputPath) {
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
        css: isExtractCss ? css : null,
        outputPath,
        cssPath: extractedCssPath,
        assetsDir: isInlineImages === false ? outAssetsDir : null,
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
