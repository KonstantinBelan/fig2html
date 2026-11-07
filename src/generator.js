// src/generator.js
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const fzstd = require('fzstd');
const { ZstdCodec } = require('zstd-codec');
const container = require('@open-pencil/kiwi/fig/container');
const { decodeFigKiwiCanvas } = require('@open-pencil/kiwi/fig/parse');
const { getCompiledSchema } = require('./schema');
const { convertHtmlToNodes } = require('./converter');
const { ImageRegistry } = require('./parsers/images');

let zstdInstance = null;
async function getZstd() {
    if (!zstdInstance) {
        zstdInstance = await new Promise(resolve => ZstdCodec.run(resolve));
    }
    return zstdInstance;
}

/**
 * Generates a valid Figma .fig binary file from an HTML file
 * @param {object} options
 * @param {string} [options.htmlPath] Path to HTML file
 * @param {string} [options.htmlContent] Direct HTML content string
 * @param {string} [options.outputPath='output.fig'] Target .fig output path
 * @param {string} [options.templatePath='templates/template.fig'] Base template .fig path
 * @param {string} [options.pageName='Page 1'] Target page name
 * @param {boolean} [options.allowRemoteImages=true] Allow fetching remote images
 * @param {boolean} [options.verbose=false] Print verbose logs
 * @param {function} [options.onProgress] Progress reporting callback
 * @returns {Promise<object>} Result and statistics
 */
async function generateFigFile(options = {}) {
    const startTime = Date.now();
    const progress = (stepOrPct, msg, maybeStep) => {
        let pct = 0;
        let step = 'STEP';
        let text = msg || '';
        if (typeof stepOrPct === 'number') {
            pct = stepOrPct;
            step = maybeStep || '';
        } else {
            step = stepOrPct;
        }

        if (typeof options.onProgress === 'function') {
            options.onProgress(pct, text, step);
        } else if (options.verbose) {
            console.log(`[${step}] ${text}`);
        }
    };

    let templatePath = options.templatePath;
    if (!templatePath || !fs.existsSync(templatePath)) {
        const candidatePaths = [
            templatePath,
            path.resolve(__dirname, '../templates/template.fig'),
            path.resolve(process.cwd(), 'templates/template.fig'),
            path.resolve(__dirname, '../template.fig'),
            path.resolve(process.cwd(), 'template.fig')
        ].filter(Boolean);
        const found = candidatePaths.find(p => fs.existsSync(p));
        if (found) {
            templatePath = found;
        }
    }
    const outputPath = options.outputPath || 'output.fig';

    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template file not found at: ${templatePath}`);
    }

    let htmlContent = options.htmlContent;
    let baseDir = process.cwd();

    if (options.htmlPath) {
        let resolvedHtmlPath = options.htmlPath;
        if (!fs.existsSync(resolvedHtmlPath)) {
            const fallbackPath = path.resolve(process.cwd(), 'test', options.htmlPath);
            if (fs.existsSync(fallbackPath)) {
                resolvedHtmlPath = fallbackPath;
            } else {
                throw new Error(`HTML input file not found at: ${options.htmlPath}`);
            }
        }
        htmlContent = fs.readFileSync(resolvedHtmlPath, 'utf8');
        baseDir = path.dirname(path.resolve(resolvedHtmlPath));
    }

    if (!htmlContent) {
        throw new Error('No HTML content or htmlPath provided.');
    }

    progress(10, `Loading template from ${path.basename(templatePath)}...`, 'TEMPLATE');
    const templateZip = new AdmZip(templatePath);
    const canvasEntry = templateZip.getEntry('canvas.fig');
    if (!canvasEntry) {
        throw new Error('Invalid template.fig: canvas.fig entry not found.');
    }
    const templateCanvas = canvasEntry.getData();

    // 1. Parse Kiwi chunks from template canvas
    const chunks = container.parseFigKiwiChunks(templateCanvas);
    if (!chunks || chunks.length < 2) {
        throw new Error('Failed to extract Kiwi chunks from template.fig');
    }
    const schemaDeflated = chunks[0];

    // 2. Compile Kiwi schema (cached)
    progress(22, 'Compiling Figma Kiwi binary schema...', 'SCHEMA');
    const compiledSchema = getCompiledSchema(schemaDeflated);

    // 3. Decode template canvas tree
    progress(35, 'Decoding template canvas tree...', 'CANVAS');
    const templateTree = decodeFigKiwiCanvas(templateCanvas);

    // Find target page (Page 1 or first CANVAS)
    const pageName = options.pageName || 'Page 1';
    const targetCanvas = templateTree.nodeChanges.find(
        n => n.type === 'CANVAS' && n.name === pageName
    ) || templateTree.nodeChanges.find(n => n.type === 'CANVAS');

    if (!targetCanvas) {
        throw new Error(`Target canvas page "${pageName}" not found in template.`);
    }

    // 4. Initialize image registry & convert HTML to nodes
    progress(48, 'Converting HTML and CSS into Figma node hierarchy...', 'CONVERT');
    const imageRegistry = new ImageRegistry({
        baseDir: baseDir,
        allowRemote: options.allowRemoteImages !== false
    });

    const conversion = await convertHtmlToNodes(htmlContent, targetCanvas.guid, {
        baseDir: baseDir,
        allowRemoteImages: options.allowRemoteImages !== false,
        imageRegistry: imageRegistry,
        blobOffset: templateTree.blobs ? templateTree.blobs.length : 0,
        verbose: options.verbose
    });

    const allNodeChanges = [...templateTree.nodeChanges, ...conversion.nodeChanges];

    const allBlobs = [...(templateTree.blobs || []), ...(conversion.blobs || [])].map(b => {
        if (b && b.bytes) return b;
        return { bytes: b };
    });

    // 5. Build NODE_CHANGES message
    const messageToEncode = {
        type: 'NODE_CHANGES',
        sessionID: 0,
        ackID: 0,
        nodeChanges: allNodeChanges,
        blobs: allBlobs
    };

    // 6. Encode message with compiled schema
    progress(70, `Encoding ${allNodeChanges.length} nodes to Kiwi binary...`, 'ENCODE');
    const encodedBytes = compiledSchema.encodeMessage(messageToEncode);

    // 7. Compress with Zstandard
    progress(85, 'Compressing binary stream with Zstandard...', 'COMPRESS');
    const zstd = await getZstd();
    const simpleZstd = new zstd.Simple();
    const dataCompressed = simpleZstd.compress(encodedBytes);

    // Verify compression integrity
    const check = fzstd.decompress(dataCompressed);
    if (check.length !== encodedBytes.length) {
        throw new Error('Zstandard integrity verification failed.');
    }

    // 8. Assemble canvas.fig (v101)
    const totalLength = 16 + schemaDeflated.length + 4 + dataCompressed.length;
    const canvasFig = Buffer.alloc(totalLength);
    canvasFig.write('fig-kiwi', 0, 8, 'ascii');
    canvasFig.writeUInt32LE(101, 8);
    canvasFig.writeUInt32LE(schemaDeflated.length, 12);
    Buffer.from(schemaDeflated).copy(canvasFig, 16);

    const chunk1Offset = 16 + schemaDeflated.length;
    canvasFig.writeUInt32LE(dataCompressed.length, chunk1Offset);
    Buffer.from(dataCompressed).copy(canvasFig, chunk1Offset + 4);

    // 9. Assemble output .fig ZIP container with embedded images
    progress(95, `Packaging into ${outputPath} with embedded images...`, 'PACKAGE');
    const outputZip = new AdmZip(templatePath);
    outputZip.deleteFile('canvas.fig');
    outputZip.addFile('canvas.fig', canvasFig);

    // Inject all images into images/<sha1Hex>
    let embeddedImagesCount = 0;
    const allImages = imageRegistry.getAllImages();
    for (const [sha1Hex, imgBuffer] of allImages.entries()) {
        outputZip.addFile(`images/${sha1Hex}`, imgBuffer);
        embeddedImagesCount++;
    }

    // Ensure output directory exists
    const outputDir = path.dirname(path.resolve(outputPath));
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    outputZip.writeZip(outputPath);

    const durationMs = Date.now() - startTime;
    const outStat = fs.statSync(outputPath);

    progress(100, `Successfully generated ${outputPath}`, 'DONE');

    return {
        outputPath: outputPath,
        fileSizeBytes: outStat.size,
        totalNodes: allNodeChanges.length,
        generatedNodes: conversion.nodeChanges.length,
        embeddedImagesCount: embeddedImagesCount,
        encodedBytes: encodedBytes.length,
        compressedBytes: dataCompressed.length,
        compressionRatio: (encodedBytes.length / dataCompressed.length).toFixed(2),
        durationMs: durationMs,
        stats: conversion.stats
    };
}

module.exports = {
    generateFigFile
};
