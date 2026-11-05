// src/decompiler/index.js
const fs = require('fs');
const path = require('path');
const { readFigFile } = require('./reader');
const { buildSceneTree } = require('./tree');
const { generateFullHtmlDocument } = require('./html');
const { getExtensionForMime, formatColor } = require('./css');
const { StylesheetManager } = require('./stylesheet');
const { isVectorContainer } = require('./vector');
const { optimizeAllImages, optimizeBuffer } = require('./image-optimizer');
const { applySmartLayout, synthesizeLayoutTree, detectGrid } = require('./synthesizer');
const { detectAndExtractContainers } = require('./container-detector');
const { BoundingBox } = require('./geometry');
const {
    detectPages,
    stripPageTag,
    hasExcludeTag,
    filterScreenOutliers,
    slugifyPageName,
    sanitizeFileName,
    DEFAULT_PAGE_TAGS,
    DEFAULT_EXCLUDE_TAGS,
    DEFAULT_MIN_PAGE_WIDTH,
    DEFAULT_MIN_PAGE_HEIGHT
} = require('./page-detector');
const { groupFramesIntoResponsivePages } = require('./breakpoint-detector');
const { alignBreakpointTrees } = require('./ast-aligner');
const { synthesizeResponsiveStyles } = require('./responsive-css');

/**
 * Converts a Figma .fig binary file into a clean, standalone HTML/CSS document (or multi-page project)
 * @param {string|Buffer} figInput File path or buffer of the .fig file
 * @param {object} [options={}]
 * @param {string} [options.outputHtmlPath] Optional output path to save the generated HTML or output directory
 * @param {string} [options.pageName='Page 1'] Name of the Figma page (CANVAS) to convert
 * @param {boolean} [options.multiPage=true] Enable multi-page export mode (auto-detected by default)
 * @param {boolean} [options.singlePage=false] Force single-page export only
 * @param {string|Array<string>} [options.pageTag] Custom tag or comma-separated list of tags in frame names
 * @param {string|Array<string>} [options.pages] Comma-separated filter of pages to export
 * @param {boolean} [options.allCanvases=false] Export all document canvases as separate HTML pages
 * @param {number} [options.minPageWidth=320] Minimum frame width for screen artboard recognition
 * @param {number} [options.minPageHeight=400] Minimum frame height for screen artboard recognition
 * @param {string} [options.classScope='modifier'] CSS collision resolution: 'modifier' | 'scoped' | 'numbered'
 * @param {boolean} [options.inlineImages=true] Whether to inline images as base64 data URIs
 * @param {boolean} [options.separateFiles=false] Whether to extract CSS to css/style.css and images to img/
 * @param {boolean} [options.extractCss=false] Extract stylesheet into a separate .css file
 * @param {string} [options.cssFile='css/style.css'] Relative or absolute path for external CSS file
 * @param {string} [options.assetsDir='img'] Directory to write extracted image files (if inlineImages=false)
 * @param {string} [options.assetUrlPrefix] URL prefix for image sources in HTML
 * @param {string} [options.cssAssetUrlPrefix] URL prefix for image sources in CSS
 * @param {number} [options.imageScale=2] Multiplier for CSS dimensions (default: 2 for 2x retina)
 * @param {boolean} [options.responsiveImages=true] Generate srcset and sizes for different devices
 * @param {boolean} [options.compress=false] Lossless image compression without quality loss
 * @param {string} [options.imageFormat='original'] Modern format conversion: 'original' | 'webp' | 'avif'
 * @param {string} [options.title] Custom HTML document title
 * @param {boolean} [options.verbose=false] Print progress logs
 * @returns {Promise<{ html: string, css: string|null, outputPath: string|null, cssPath: string|null, assetsDir: string|null, totalNodes: number, imagesCount: number, durationMs: number, stats: object, isMultiPage?: boolean, pages?: Array<object> }>}
 */
async function convertFigToHtml(figInput, options = {}) {
    const startTime = Date.now();
    const log = (msg) => {
        if (options.verbose) console.log(`[DECOMPILE] ${msg}`);
    };
    const reportProgress = (percent, msg) => {
        if (typeof options.onProgress === 'function') {
            options.onProgress(percent, msg);
        }
    };

    const isSeparateFiles = Boolean(options.separateFiles);
    const isExtractCss = isSeparateFiles || Boolean(options.extractCss);
    const isInlineImages = isSeparateFiles
        ? false
        : (options.inlineImages !== undefined ? options.inlineImages : (options.assetsDir ? false : true));
    const assetsRelDir = options.assetsDir || 'img';
    const cssRelPath = options.cssFile || 'css/style.css';

    const outputPath = options.outputHtmlPath ? path.resolve(options.outputHtmlPath) : null;
    const baseDir = outputPath
        ? (outputPath.endsWith('.html') ? path.dirname(outputPath) : outputPath)
        : process.cwd();

    // 1. Read .fig file and extract Kiwi AST and images
    reportProgress(5, 'Reading .fig archive & decompressing...');
    log('Reading .fig archive and decoding Kiwi stream...');
    const { nodeChanges, blobs, images } = readFigFile(figInput);

    // 2. Build hierarchical scene tree
    reportProgress(20, `Decoding Kiwi stream (${nodeChanges.length} nodes)...`);
    log(`Building scene tree from ${nodeChanges.length} nodes...`);
    const { rootNodes, canvas, canvases, variableSets, variables, allNodesMap } = buildSceneTree(nodeChanges, {
        pageName: options.pageName
    });

    log(`Target canvas "${canvas.name}" with ${rootNodes.length} top-level nodes.`);
    if (variables && variables.length > 0) {
        log(`Found ${variables.length} native Figma variables across ${variableSets?.length || 0} collections.`);
    }

    // 2.1 Detect Pages (Multi-Page Import Engine v1.3.0)
    const detectedPages = detectPages({
        canvases,
        canvas,
        rootNodes,
        allNodesMap
    }, {
        multiPage: options.multiPage !== false && options.singlePage !== true,
        singlePage: options.singlePage === true,
        pageTag: options.pageTag,
        excludeTag: options.excludeTag || options.excludeTags,
        outlierDetection: options.outlierDetection,
        pages: options.pages,
        allCanvases: Boolean(options.allCanvases || options.allPages),
        minPageWidth: options.minPageWidth,
        minPageHeight: options.minPageHeight,
        pageName: options.pageName
    });

    const isMultiPage = detectedPages.length > 1 && !options.singlePage && options.multiPage !== false;
    if (isMultiPage) {
        log(`Multi-page mode active: detected ${detectedPages.length} pages via ${detectedPages[0].strategy} strategy: ${detectedPages.map(p => p.fileName).join(', ')}`);
    }

    // Determine target nodes for processing
    const isSmartLayout = options.smartLayout !== false && options.noSmartLayout !== true;
    const assetsPrefix = options.assetUrlPrefix || (assetsRelDir ? `${assetsRelDir.replace(/\/+$/, '')}/` : 'img/');
    const cssPrefix = options.cssAssetUrlPrefix || (isExtractCss ? `../${assetsPrefix}` : assetsPrefix);
    const isResponsive = options.responsiveImages !== false && options.srcset !== false;
    const layoutMode = options.layoutMode || (options.fluid ? 'fluid' : (options.relative || options.rem ? 'relative' : 'default'));

    // =========================================================================
    // BRANCH R: ADAPTIVE MULTI-BREAKPOINT ENGINE (v1.4.0)
    // =========================================================================
    const isResponsiveEngineEnabled = options.responsive !== false && options.noResponsive !== true;
    let responsiveGroups = [];
    if (isResponsiveEngineEnabled) {
        let candidateFrames = Boolean(options.allCanvases || options.allPages)
            ? canvases.flatMap(c => c.children || [])
            : rootNodes;

        // If single wrapper container (e.g. body or canvas frame) and children contain screen frames
        if (candidateFrames.length === 1 && Array.isArray(candidateFrames[0].children) && candidateFrames[0].children.length >= 2) {
            candidateFrames = candidateFrames[0].children;
        }

        responsiveGroups = groupFramesIntoResponsivePages(candidateFrames, options);
    }
    const hasResponsivePages = responsiveGroups.length > 0 && responsiveGroups.some(p => p.isResponsive);

    if (hasResponsivePages) {
        log(`Responsive engine active: detected ${responsiveGroups.filter(p => p.isResponsive).length} responsive page groups.`);

        // R.1 AST Reconciliation for responsive pages
        reportProgress(30, 'Reconciling multi-breakpoint AST trees...');
        for (const page of responsiveGroups) {
            if (page.isResponsive) {
                const isMobileFirst = Boolean(options.mobileFirst);
                let baseBp = page.baseBreakpoint;
                if (isMobileFirst) {
                    baseBp = page.breakpoints.reduce((min, b) => b.width < min.width ? b : min, page.breakpoints[0]);
                }
                const variantBps = page.breakpoints.filter(b => b !== baseBp);
                const { canonicalTree, nodeAlignmentMap, exclusiveNodes } = alignBreakpointTrees(baseBp.frame, variantBps);
                page.canonicalTree = canonicalTree;
                page.rootNodes = [canonicalTree];
                page.width = baseBp.width;
                page.height = baseBp.height;
                page.exclusiveNodes = exclusiveNodes;
            } else {
                page.canonicalTree = page.rootNodes[0];
            }
        }

        // R.2 Smart Layout Synthesis across canonical trees
        if (isSmartLayout) {
            reportProgress(38, 'Synthesizing adaptive layout across responsive trees...');
            log('Running Smart Layout Synthesis across responsive canonical trees...');
            for (const page of responsiveGroups) {
                applySmartLayout(page.rootNodes, options);
            }
        }

        // R.3 Image Optimization across all breakpoints
        const allResponsiveFrames = responsiveGroups.flatMap(p => p.breakpoints ? p.breakpoints.map(b => b.frame) : p.rootNodes);
        reportProgress(48, `Optimizing responsive images (${images.size} items)...`);
        log('Optimizing project-wide images across all breakpoints...');
        const { processedImages, nodeImageMap, filesToWrite, stats: imgStats } = await optimizeAllImages(images, allResponsiveFrames, {
            imageScale: options.imageScale !== undefined ? options.imageScale : 2,
            responsiveImages: isResponsive,
            compress: options.compress || options.lossless,
            imageFormat: options.imageFormat || options.format || 'original',
            inlineImages: isInlineImages,
            assetUrlPrefix: assetsPrefix,
            cssAssetUrlPrefix: cssPrefix,
            onProgress: (current, total) => {
                const pct = 48 + Math.round((current / Math.max(1, total)) * 24);
                reportProgress(pct, `Optimizing images (${current}/${total})...`);
            }
        });

        // R.4 Extract image files if not inline
        let outAssetsDir = null;
        if (isInlineImages === false) {
            reportProgress(72, 'Writing extracted image files...');
            outAssetsDir = path.resolve(baseDir, assetsRelDir);
            if (!fs.existsSync(outAssetsDir)) {
                fs.mkdirSync(outAssetsDir, { recursive: true });
            }
            for (const file of filesToWrite) {
                const filePath = path.join(outAssetsDir, file.fileName);
                fs.writeFileSync(filePath, file.buffer);
            }
            log(`Extracted ${filesToWrite.length} image files to ${outAssetsDir}`);
        }

        // R.5 Node Statistics
        const stats = { frames: 0, textNodes: 0, images: 0, shapes: 0 };
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
        for (const page of responsiveGroups) {
            for (const r of page.rootNodes) collectStats(r);
        }

        // R.6 Unified Responsive Stylesheet & Style Synthesis
        reportProgress(76, 'Building unified responsive stylesheet (clamp + @media)...');
        log('Synthesizing fluid clamp() and breakpoint media queries...');
        const isMulti = responsiveGroups.length > 1;
        const stylesheetManager = new StylesheetManager({
            ...options,
            isMultiPage: isMulti,
            classScope: options.classScope || 'modifier'
        });

        if (variables && variables.length > 0) {
            stylesheetManager.registerFigmaVariables(variables, variableSets || []);
        }

        function registerTree(node, parent, isRoot = false) {
            if (!node || node.visible === false || node.mask === true || node.isMask === true) return;
            stylesheetManager.registerNode(node, parent, processedImages, { ...options, isRoot });
            stylesheetManager.registerVariants(node, processedImages, options);
            if (isVectorContainer(node)) return;
            if (node.children) {
                for (const child of node.children) {
                    registerTree(child, node, false);
                }
            }
        }

        for (const page of responsiveGroups) {
            stylesheetManager.setPageContext(page.slug, page.cleanName || page.pageName);
            for (const root of page.rootNodes) {
                registerTree(root, null, true);
            }
            if (page.isResponsive) {
                synthesizeResponsiveStyles({
                    canonicalTree: page.canonicalTree,
                    pageBreakpoints: page.breakpoints,
                    imageRegistry: processedImages,
                    stylesheetManager,
                    options
                });
            }
        }

        let rootBg = '#0d1117';
        for (const page of responsiveGroups) {
            const root = page.rootNodes[0];
            if (root && Array.isArray(root.fillPaints)) {
                const solid = root.fillPaints.find(f => f.type === 'SOLID' && f.visible !== false);
                if (solid) {
                    rootBg = formatColor(solid.color, solid.opacity);
                    break;
                }
            }
        }

        const unifiedCss = stylesheetManager.generateFullStylesheet(rootBg);
        const tokens = stylesheetManager.exportDesignTokens();

        let extractedCssPath = null;
        if (isExtractCss && unifiedCss) {
            extractedCssPath = path.resolve(baseDir, cssRelPath);
            const cssDir = path.dirname(extractedCssPath);
            if (!fs.existsSync(cssDir)) {
                fs.mkdirSync(cssDir, { recursive: true });
            }
            fs.writeFileSync(extractedCssPath, unifiedCss, 'utf8');
            log(`Saved shared external stylesheet to ${extractedCssPath} (${Buffer.byteLength(unifiedCss, 'utf8')} bytes)`);
        }

        let extractedTokensPath = null;
        if ((options.extractTokens || options.tokens) && tokens) {
            const tokensRelPath = typeof options.tokens === 'string' ? options.tokens : 'tokens.json';
            extractedTokensPath = path.isAbsolute(tokensRelPath)
                ? tokensRelPath
                : (path.dirname(tokensRelPath) !== '.' ? path.resolve(process.cwd(), tokensRelPath) : path.resolve(baseDir, tokensRelPath));
            const tokensDir = path.dirname(extractedTokensPath);
            if (!fs.existsSync(tokensDir)) {
                fs.mkdirSync(tokensDir, { recursive: true });
            }
            fs.writeFileSync(extractedTokensPath, JSON.stringify(tokens, null, 2), 'utf8');
            log(`Saved design tokens to ${extractedTokensPath}`);
        }

        // R.7 Generate HTML for each responsive page
        const generatedPages = [];
        for (let i = 0; i < responsiveGroups.length; i++) {
            const page = responsiveGroups[i];
            const pageNum = i + 1;
            const total = responsiveGroups.length;
            reportProgress(82 + Math.round((pageNum / total) * 16), `Generating HTML (Page ${pageNum}/${total}: ${page.fileName})...`);

            const docResult = generateFullHtmlDocument(page.rootNodes, processedImages, {
                ...options,
                stylesheetManager,
                skipRegisterTree: true,
                skipRegisterVariables: true,
                cssContent: unifiedCss,
                pageSlug: page.slug,
                isMultiPage: isMulti,
                title: page.cleanName || page.pageName,
                inlineImages: isInlineImages,
                inlineStyles: options.inlineStyles === true,
                extractCss: isExtractCss,
                cssHref: cssRelPath,
                assetUrlPrefix: assetsPrefix,
                cssAssetUrlPrefix: cssPrefix,
                blobs,
                variables,
                variableSets,
                nodeImageMap,
                responsiveImages: isResponsive,
                layoutMode,
                canvasWidth: page.width,
                canvasHeight: page.height
            });

            const pageHtml = typeof docResult === 'string' ? docResult : docResult.html;

            let pageOutputPath = null;
            if (outputPath) {
                if (outputPath.endsWith('.html')) {
                    const outDir = path.dirname(outputPath);
                    if (page.slug === 'index' || (i === 0 && !responsiveGroups.some(p => p.slug === 'index'))) {
                        pageOutputPath = outputPath;
                    } else {
                        pageOutputPath = path.join(outDir, page.fileName);
                    }
                } else {
                    pageOutputPath = path.join(outputPath, page.fileName);
                }
                const pDir = path.dirname(pageOutputPath);
                if (!fs.existsSync(pDir)) {
                    fs.mkdirSync(pDir, { recursive: true });
                }
                fs.writeFileSync(pageOutputPath, pageHtml, 'utf8');
                log(`Saved HTML page [${page.slug}] to ${pageOutputPath}`);
            }

            generatedPages.push({
                name: page.pageName,
                cleanName: page.cleanName,
                slug: page.slug,
                fileName: page.fileName,
                isResponsive: page.isResponsive,
                breakpoints: page.breakpoints,
                outputPath: pageOutputPath,
                html: pageHtml,
                rootNodes: page.rootNodes
            });
        }

        reportProgress(100, 'Complete');
        const durationMs = Date.now() - startTime;
        const mainPage = generatedPages.find(p => p.slug === 'index') || generatedPages[0];

        return {
            html: mainPage.html,
            css: (isExtractCss || options.returnCss || options.extractCss) ? unifiedCss : null,
            tokens,
            tokensPath: extractedTokensPath,
            outputPath: mainPage.outputPath || outputPath,
            cssPath: extractedCssPath,
            assetsDir: isInlineImages === false ? outAssetsDir : null,
            totalNodes: nodeChanges.length,
            imagesCount: processedImages.size,
            durationMs,
            isResponsive: true,
            isMultiPage: isMulti,
            pages: generatedPages,
            stats: {
                ...stats,
                pagesCount: generatedPages.length,
                breakpointsCount: responsiveGroups.reduce((acc, p) => acc + (p.breakpoints ? p.breakpoints.length : 1), 0),
                variablesCount: variables?.length || 0,
                variableSetsCount: variableSets?.length || 0,
                imageOptimization: imgStats,
                exportedFilesCount: filesToWrite.length
            }
        };
    }

    // =========================================================================
    // BRANCH A: MULTI-PAGE EXPORT PIPELINE
    // =========================================================================
    if (isMultiPage) {
        // A.1 Smart Layout Synthesis across all detected pages
        if (isSmartLayout) {
            reportProgress(35, 'Synthesizing adaptive layout across all pages...');
            log('Running Smart Layout Synthesis across detected pages...');
            for (const page of detectedPages) {
                applySmartLayout(page.rootNodes, options);
            }
        }

        // A.2 Image Optimization across all pages (unified deduplicated pool)
        const allProjectRootNodes = detectedPages.flatMap(p => p.rootNodes);
        reportProgress(45, `Optimizing images across ${detectedPages.length} pages (${images.size} items)...`);
        log('Optimizing project-wide images...');
        const { processedImages, nodeImageMap, filesToWrite, stats: imgStats } = await optimizeAllImages(images, allProjectRootNodes, {
            imageScale: options.imageScale !== undefined ? options.imageScale : 2,
            responsiveImages: isResponsive,
            compress: options.compress || options.lossless,
            imageFormat: options.imageFormat || options.format || 'original',
            inlineImages: isInlineImages,
            assetUrlPrefix: assetsPrefix,
            cssAssetUrlPrefix: cssPrefix,
            onProgress: (current, total) => {
                const pct = 45 + Math.round((current / Math.max(1, total)) * 25);
                reportProgress(pct, `Optimizing images (${current}/${total})...`);
            }
        });

        // A.3 Extract image files if not inline
        let outAssetsDir = null;
        if (isInlineImages === false) {
            reportProgress(72, 'Writing extracted image files...');
            outAssetsDir = path.resolve(baseDir, assetsRelDir);
            if (!fs.existsSync(outAssetsDir)) {
                fs.mkdirSync(outAssetsDir, { recursive: true });
            }
            for (const file of filesToWrite) {
                const filePath = path.join(outAssetsDir, file.fileName);
                fs.writeFileSync(filePath, file.buffer);
            }
            log(`Extracted ${filesToWrite.length} image files to ${outAssetsDir}`);
        }

        // A.4 Collect node statistics
        const stats = { frames: 0, textNodes: 0, images: 0, shapes: 0 };
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
        for (const r of allProjectRootNodes) {
            collectStats(r);
        }

        // A.5 Multi-Page Stylesheet Registration (Smart DRY CSS & Collision Isolation)
        reportProgress(76, 'Building unified multi-page stylesheet...');
        log('Registering nodes across all pages into StylesheetManager...');
        const stylesheetManager = new StylesheetManager({
            ...options,
            isMultiPage: true,
            classScope: options.classScope || 'modifier'
        });

        if (variables && variables.length > 0) {
            stylesheetManager.registerFigmaVariables(variables, variableSets || []);
        }

        function registerTree(node, parent, isRoot = false) {
            if (!node || node.visible === false || node.mask === true || node.isMask === true) return;
            stylesheetManager.registerNode(node, parent, processedImages, { ...options, isRoot });
            stylesheetManager.registerVariants(node, processedImages, options);
            if (isVectorContainer(node)) return;
            if (node.children) {
                for (const child of node.children) {
                    registerTree(child, node, false);
                }
            }
        }

        for (const page of detectedPages) {
            stylesheetManager.setPageContext(page.slug, page.cleanName);
            for (const root of page.rootNodes) {
                registerTree(root, null, true);
            }
        }

        // Determine primary root background
        let rootBg = '#0d1117';
        for (const page of detectedPages) {
            const root = page.rootNodes[0];
            if (root && Array.isArray(root.fillPaints)) {
                const solid = root.fillPaints.find(f => f.type === 'SOLID' && f.visible !== false);
                if (solid) {
                    rootBg = formatColor(solid.color, solid.opacity);
                    break;
                }
            }
        }

        const unifiedCss = stylesheetManager.generateFullStylesheet(rootBg);
        const tokens = stylesheetManager.exportDesignTokens();

        // Write shared external CSS file if requested
        let extractedCssPath = null;
        if (isExtractCss && unifiedCss) {
            extractedCssPath = path.resolve(baseDir, cssRelPath);
            const cssDir = path.dirname(extractedCssPath);
            if (!fs.existsSync(cssDir)) {
                fs.mkdirSync(cssDir, { recursive: true });
            }
            fs.writeFileSync(extractedCssPath, unifiedCss, 'utf8');
            log(`Saved shared external stylesheet to ${extractedCssPath} (${Buffer.byteLength(unifiedCss, 'utf8')} bytes)`);
        }

        // Export Design Tokens JSON if requested
        let extractedTokensPath = null;
        if ((options.extractTokens || options.tokens) && tokens) {
            const tokensRelPath = typeof options.tokens === 'string' ? options.tokens : 'tokens.json';
            extractedTokensPath = path.isAbsolute(tokensRelPath)
                ? tokensRelPath
                : (path.dirname(tokensRelPath) !== '.' ? path.resolve(process.cwd(), tokensRelPath) : path.resolve(baseDir, tokensRelPath));
            const tokensDir = path.dirname(extractedTokensPath);
            if (!fs.existsSync(tokensDir)) {
                fs.mkdirSync(tokensDir, { recursive: true });
            }
            fs.writeFileSync(extractedTokensPath, JSON.stringify(tokens, null, 2), 'utf8');
            log(`Saved design tokens to ${extractedTokensPath}`);
        }

        // A.6 Generate HTML for each detected page
        const generatedPages = [];
        for (let i = 0; i < detectedPages.length; i++) {
            const page = detectedPages[i];
            const pageNum = i + 1;
            const total = detectedPages.length;
            reportProgress(80 + Math.round((pageNum / total) * 18), `Generating HTML (Page ${pageNum}/${total}: ${page.fileName})...`);

            const pWidth = Math.round(page.width || canvas.size?.x || 1440);
            const pHeight = Math.round(page.height || canvas.size?.y || 900);

            const docResult = generateFullHtmlDocument(page.rootNodes, processedImages, {
                ...options,
                stylesheetManager,
                skipRegisterTree: true,
                skipRegisterVariables: true,
                cssContent: unifiedCss,
                pageSlug: page.slug,
                isMultiPage: true,
                title: page.cleanName || page.name,
                inlineImages: isInlineImages,
                inlineStyles: options.inlineStyles === true,
                extractCss: isExtractCss,
                cssHref: cssRelPath,
                assetUrlPrefix: assetsPrefix,
                cssAssetUrlPrefix: cssPrefix,
                blobs,
                variables,
                variableSets,
                nodeImageMap,
                responsiveImages: isResponsive,
                layoutMode,
                canvasWidth: pWidth,
                canvasHeight: pHeight
            });

            const pageHtml = typeof docResult === 'string' ? docResult : docResult.html;

            // Output path for this page
            let pageOutputPath = null;
            if (outputPath) {
                if (outputPath.endsWith('.html')) {
                    const outDir = path.dirname(outputPath);
                    if (page.slug === 'index' || (i === 0 && !detectedPages.some(p => p.slug === 'index'))) {
                        pageOutputPath = outputPath;
                    } else {
                        pageOutputPath = path.join(outDir, page.fileName);
                    }
                } else {
                    pageOutputPath = path.join(outputPath, page.fileName);
                }
                const pDir = path.dirname(pageOutputPath);
                if (!fs.existsSync(pDir)) {
                    fs.mkdirSync(pDir, { recursive: true });
                }
                fs.writeFileSync(pageOutputPath, pageHtml, 'utf8');
                log(`Saved HTML page [${page.slug}] to ${pageOutputPath}`);
            }

            generatedPages.push({
                name: page.name,
                cleanName: page.cleanName,
                slug: page.slug,
                fileName: page.fileName,
                strategy: page.strategy,
                outputPath: pageOutputPath,
                html: pageHtml,
                rootNodes: page.rootNodes
            });
        }

        reportProgress(100, 'Complete');
        const durationMs = Date.now() - startTime;
        const mainPage = generatedPages.find(p => p.slug === 'index') || generatedPages[0];

        return {
            html: mainPage.html,
            css: (isExtractCss || options.returnCss || options.extractCss) ? unifiedCss : null,
            tokens,
            tokensPath: extractedTokensPath,
            outputPath: mainPage.outputPath || outputPath,
            cssPath: extractedCssPath,
            assetsDir: isInlineImages === false ? outAssetsDir : null,
            totalNodes: nodeChanges.length,
            imagesCount: processedImages.size,
            durationMs,
            isMultiPage: true,
            pages: generatedPages,
            stats: {
                ...stats,
                pagesCount: generatedPages.length,
                detectionStrategy: detectedPages[0].strategy,
                variablesCount: variables?.length || 0,
                variableSetsCount: variableSets?.length || 0,
                imageOptimization: imgStats,
                exportedFilesCount: filesToWrite.length
            }
        };
    }

    // =========================================================================
    // BRANCH B: SINGLE-PAGE EXPORT PIPELINE (100% Backwards Compatible)
    // =========================================================================

    // 2.2 Smart Layout Synthesis (Phase 1-5: XY-Cut & Container Induction)
    if (isSmartLayout) {
        reportProgress(38, 'Synthesizing adaptive layout (Flexbox & Grid)...');
        log('Running Smart Layout Synthesis (XY-Cut & Container Induction)...');
        applySmartLayout(rootNodes, options);
    }

    // 3. Optimize images (2x CSS scaling, responsive srcset, lossless compression, modern formats)
    reportProgress(50, `Optimizing images (${images.size} items)...`);
    log('Optimizing images and generating responsive device variants...');
    const { processedImages, nodeImageMap, filesToWrite, stats: imgStats } = await optimizeAllImages(images, rootNodes, {
        imageScale: options.imageScale !== undefined ? options.imageScale : 2,
        responsiveImages: isResponsive,
        compress: options.compress || options.lossless,
        imageFormat: options.imageFormat || options.format || 'original',
        inlineImages: isInlineImages,
        assetUrlPrefix: assetsPrefix,
        cssAssetUrlPrefix: cssPrefix,
        onProgress: (current, total) => {
            const pct = 50 + Math.round((current / Math.max(1, total)) * 30);
            reportProgress(pct, `Optimizing images (${current}/${total})...`);
        }
    });

    // 4. Handle images export if inlineImages is false
    let outAssetsDir = null;
    if (isInlineImages === false) {
        reportProgress(82, 'Writing extracted image files...');
        outAssetsDir = path.resolve(baseDir, assetsRelDir);
        if (!fs.existsSync(outAssetsDir)) {
            fs.mkdirSync(outAssetsDir, { recursive: true });
        }
        for (const file of filesToWrite) {
            const filePath = path.join(outAssetsDir, file.fileName);
            fs.writeFileSync(filePath, file.buffer);
        }
        log(`Extracted ${filesToWrite.length} image files to ${outAssetsDir}`);
    }

    // 5. Calculate node statistics
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

    // 6. Generate semantic HTML and CSS styles
    reportProgress(86, 'Generating semantic HTML5 and CSS styles...');
    log('Generating semantic HTML5 and CSS styles...');

    const canvasWidth = Math.round(canvas.size?.x || rootNodes[0]?.size?.x || 1440);
    const canvasHeight = Math.round(canvas.size?.y || rootNodes[0]?.size?.y || 900);

    const docResult = generateFullHtmlDocument(rootNodes, processedImages, {
        inlineImages: isInlineImages,
        inlineStyles: options.inlineStyles === true,
        extractCss: isExtractCss,
        returnTokens: true,
        cssHref: cssRelPath,
        assetUrlPrefix: assetsPrefix,
        cssAssetUrlPrefix: cssPrefix,
        blobs: blobs,
        variables,
        variableSets,
        title: options.title || canvas.name || 'Exported Figma Design',
        nodeImageMap,
        responsiveImages: isResponsive,
        layoutMode,
        canvasWidth,
        canvasHeight
    });

    const html = typeof docResult === 'string' ? docResult : docResult.html;
    const css = typeof docResult === 'string' ? null : (docResult.css || null);
    const tokens = typeof docResult === 'string' ? null : (docResult.tokens || null);

    // 7. Write external CSS file if requested
    let extractedCssPath = null;
    if (isExtractCss && css) {
        reportProgress(94, 'Writing external CSS stylesheet...');
        extractedCssPath = path.resolve(baseDir, cssRelPath);
        const cssDir = path.dirname(extractedCssPath);
        if (!fs.existsSync(cssDir)) {
            fs.mkdirSync(cssDir, { recursive: true });
        }
        fs.writeFileSync(extractedCssPath, css, 'utf8');
        log(`Saved external stylesheet to ${extractedCssPath} (${Buffer.byteLength(css, 'utf8')} bytes)`);
    }

    // 7.1 Write Design Tokens JSON if requested
    let extractedTokensPath = null;
    if ((options.extractTokens || options.tokens) && tokens) {
        reportProgress(96, 'Exporting design tokens JSON...');
        const tokensRelPath = typeof options.tokens === 'string' ? options.tokens : 'tokens.json';
        extractedTokensPath = path.isAbsolute(tokensRelPath)
            ? tokensRelPath
            : (path.dirname(tokensRelPath) !== '.' ? path.resolve(process.cwd(), tokensRelPath) : path.resolve(baseDir, tokensRelPath));
        const tokensDir = path.dirname(extractedTokensPath);
        if (!fs.existsSync(tokensDir)) {
            fs.mkdirSync(tokensDir, { recursive: true });
        }
        fs.writeFileSync(extractedTokensPath, JSON.stringify(tokens, null, 2), 'utf8');
        log(`Saved design tokens to ${extractedTokensPath}`);
    }

    // 8. Write output HTML file if requested
    if (outputPath) {
        reportProgress(98, 'Writing standalone HTML file...');
        const outDir = path.dirname(outputPath);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        fs.writeFileSync(outputPath, html, 'utf8');
        log(`Saved HTML to ${outputPath} (${Buffer.byteLength(html, 'utf8')} bytes)`);
    }

    reportProgress(100, 'Complete');
    const durationMs = Date.now() - startTime;

    return {
        html,
        css: (isExtractCss || options.returnCss || options.extractCss) ? css : null,
        tokens,
        tokensPath: extractedTokensPath,
        outputPath,
        cssPath: extractedCssPath,
        assetsDir: isInlineImages === false ? outAssetsDir : null,
        totalNodes: nodeChanges.length,
        imagesCount: processedImages.size,
        durationMs,
        isMultiPage: false,
        stats: {
            ...stats,
            variablesCount: variables?.length || 0,
            variableSetsCount: variableSets?.length || 0,
            imageOptimization: imgStats,
            exportedFilesCount: filesToWrite.length
        }
    };
}

module.exports = {
    convertFigToHtml,
    readFigFile,
    buildSceneTree,
    generateFullHtmlDocument,
    optimizeAllImages,
    optimizeBuffer,
    applySmartLayout,
    synthesizeLayoutTree,
    detectGrid,
    detectAndExtractContainers,
    BoundingBox,
    detectPages,
    stripPageTag,
    hasExcludeTag,
    filterScreenOutliers,
    slugifyPageName,
    sanitizeFileName,
    DEFAULT_PAGE_TAGS,
    DEFAULT_EXCLUDE_TAGS,
    DEFAULT_MIN_PAGE_WIDTH,
    DEFAULT_MIN_PAGE_HEIGHT
};
