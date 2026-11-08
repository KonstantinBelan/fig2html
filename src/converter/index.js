// src/converter/index.js
const { JSDOM } = require('jsdom');
const { GuidGenerator, FractionalIndexer } = require('../utils/guid');
const { ImageRegistry } = require('../parsers/images');
const { extractWebFonts } = require('../parsers/typography');
const { collectVariables } = require('./variables-collector');
const { resolveElementStyles } = require('./style-resolver');

const { isImageElement, processImageElement } = require('./element-processors/image');
const { isSvgElement, processSvgElement } = require('./element-processors/svg');
const { isMediaElement, processMediaElement } = require('./element-processors/media');
const { isTextElement, processTextElement } = require('./element-processors/text');
const { isInteractiveElement, processInteractiveElement } = require('./element-processors/interactive');
const { processContainerElement } = require('./element-processors/container');

/**
 * Main controller converting an HTML string into native Figma AST nodeChanges
 * @param {string} htmlString
 * @param {object} parentCanvasGuid
 * @param {object} [options={}]
 * @returns {Promise<{ nodeChanges: Array<object>, imageRegistry: ImageRegistry, blobs: Array<Buffer>, stats: object }>}
 */
async function convertHtmlToNodes(htmlString, parentCanvasGuid, options = {}) {
    const dom = new JSDOM(htmlString);
    const win = dom.window;
    const doc = win.document;
    const guidGen = new GuidGenerator(options.sessionId || 1, options.startLocalId || 100);
    const conversionBlobs = [];
    const blobOffset = options.blobOffset || 0;
    const imageRegistry = options.imageRegistry || new ImageRegistry({
        baseDir: options.baseDir || process.cwd(),
        allowRemote: options.allowRemoteImages !== false
    });

    // 1. Collect CSS custom properties and variables
    const varsData = collectVariables(doc, guidGen, options);
    const {
        rootVars,
        ruleVars,
        resolveVar,
        variableChanges,
        varMap,
        colorToVarMap,
        floatToVarMap,
        radiusToVarMap,
        spaceToVarMap,
        createColorVar,
        createFloatVar,
        colorToHexKey
    } = varsData;

    // 2. Extract Web Fonts references (Google Fonts)
    const webFonts = extractWebFonts(doc);

    // 3. Collect interactive pseudo-class rules (:hover, :active, :focus)
    const pseudoRules = { hover: [], active: [], focus: [] };
    for (const styleEl of doc.querySelectorAll('style')) {
        const css = styleEl.textContent || '';
        const ruleRegex = /([^{]+)\{([^}]+)\}/g;
        let match;
        while ((match = ruleRegex.exec(css)) !== null) {
            const selector = match[1].trim();
            const body = match[2];
            if (selector.includes(':hover')) {
                const baseSel = selector.replace(/:hover/g, '').trim();
                pseudoRules.hover.push({ selector: baseSel, body });
            } else if (selector.includes(':active')) {
                const baseSel = selector.replace(/:active/g, '').trim();
                pseudoRules.active.push({ selector: baseSel, body });
            } else if (selector.includes(':focus')) {
                const baseSel = selector.replace(/:focus/g, '').trim();
                pseudoRules.focus.push({ selector: baseSel, body });
            }
        }
    }

    const nodeChanges = [];
    const stats = {
        totalNodes: 0,
        frames: 0,
        textNodes: 0,
        images: 0,
        shapes: 0,
        variables: variableChanges.length
    };

    const nextCompSetYState = { y: 40 };

    const context = {
        win,
        doc,
        guidGen,
        conversionBlobs,
        blobOffset,
        imageRegistry,
        stats,
        nodeChanges,
        parentCanvasGuid,
        options,
        rootVars,
        ruleVars,
        resolveVar,
        varMap,
        colorToVarMap,
        floatToVarMap,
        radiusToVarMap,
        spaceToVarMap,
        createColorVar,
        createFloatVar,
        colorToHexKey,
        pseudoRules,
        nextCompSetYState,
        processElement: null
    };

    /**
     * Traverses and processes a single DOM element node
     */
    async function processElement(element, parentGuid, orderPosition = '!', parentContext = null) {
        if (!element || element.nodeType !== 1) return null;

        if (['SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TEMPLATE', 'NOSCRIPT', 'TITLE'].includes(element.tagName)) {
            return null;
        }

        const styles = await resolveElementStyles(element, win, context, parentContext);
        if (styles.display === 'none') {
            return null;
        }

        styles.currentGuid = guidGen.next();

        if (isImageElement(element)) {
            return await processImageElement(element, parentGuid, orderPosition, parentContext, styles, context);
        }

        if (isSvgElement(element)) {
            return await processSvgElement(element, parentGuid, orderPosition, parentContext, styles, context);
        }

        if (isMediaElement(element)) {
            return processMediaElement(element, parentGuid, orderPosition, parentContext, styles, context);
        }

        if (isTextElement(element, styles)) {
            return processTextElement(element, parentGuid, orderPosition, parentContext, styles, context);
        }

        if (isInteractiveElement(element)) {
            return processInteractiveElement(element, parentGuid, orderPosition, parentContext, styles, context);
        }

        return await processContainerElement(element, parentGuid, orderPosition, parentContext, styles, context);
    }

    context.processElement = processElement;

    // Process root body element
    if (doc.body) {
        const rootPos = FractionalIndexer.getPosition(0);
        await processElement(doc.body, parentCanvasGuid, rootPos, null);
    }

    if (variableChanges.length > 0) {
        nodeChanges.unshift(...variableChanges);
    }

    return {
        nodeChanges,
        imageRegistry,
        blobs: conversionBlobs,
        stats
    };
}

module.exports = {
    convertHtmlToNodes
};
