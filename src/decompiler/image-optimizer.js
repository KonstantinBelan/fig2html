// src/decompiler/image-optimizer.js
const crypto = require('crypto');
const sharp = require('sharp');
const { getExtensionForMime, getLinearGradientAngle, hasExplicitMaskTag } = require('./css');
const { findAllGraphicChains, collapseGraphicSubtree } = require('./graphic-collapser');

/**
 * Traverses root nodes to find all image fills and their target CSS dimensions
 * @param {Array<object>} rootNodes
 * @returns {Array<{ node: object, hashHex: string, scaleMode: string, cssWidth: number, cssHeight: number, isImgElement: boolean }>}
 */
function collectImageUsages(rootNodes) {
    const usages = [];

    function traverse(node) {
        if (!node || node.visible === false) return;

        if (Array.isArray(node.fillPaints)) {
            for (const f of node.fillPaints) {
                if (f.type === 'IMAGE' && f.visible !== false && f.image?.hash) {
                    const hashHex = (typeof f.image.hash === 'string')
                        ? f.image.hash.toLowerCase()
                        : Buffer.from(f.image.hash).toString('hex').toLowerCase();
                    const isMask = node.mask === true || node.isMask === true;
                    const isImg = (node.type === 'RECTANGLE' || node.type === 'ROUNDED_RECTANGLE' || node.isCollapsedGraphicRoot) && (!node.children || node.children.length === 0) && !isMask;
                    const cssW = Math.round(node.size?.x || 0);
                    const cssH = Math.round(node.size?.y || 0);

                    usages.push({
                        node,
                        hashHex,
                        scaleMode: f.imageScaleMode || 'FILL',
                        cssWidth: cssW,
                        cssHeight: cssH,
                        isImgElement: isImg
                    });
                }
            }
        }

        if (node.children) {
            for (const child of node.children) {
                traverse(child);
            }
        }
    }

    for (const r of rootNodes) {
        traverse(r);
    }

    return usages;
}

/**
 * Calculates responsive device widths and CSS sizes attribute for an element width
 * @param {number} cssWidth
 * @param {number} [scaleMultiplier=2]
 * @returns {{ widths: number[], sizes: string }}
 */
function calculateDeviceWidths(cssWidth, scaleMultiplier = 2) {
    const baseW = Math.max(1, Math.round(cssWidth || 100));
    const target2x = Math.round(baseW * scaleMultiplier);

    let widths;
    let sizes;

    if (baseW <= 120) {
        // Small icon / avatar
        widths = [baseW, target2x];
        sizes = `${baseW}px`;
    } else if (baseW <= 400) {
        // Medium element (thumbnail, card image)
        const mobileW = Math.round(baseW * 0.75);
        widths = [mobileW, baseW, target2x];
        sizes = `(max-width: ${baseW}px) 100vw, ${baseW}px`;
    } else {
        // Large image (hero, slide, banner)
        const mobileW = Math.min(480, Math.round(baseW * 0.5));
        const tabletW = Math.min(768, Math.round(baseW * 0.75));
        widths = [mobileW, tabletW, baseW, target2x];
        sizes = `(max-width: 768px) 100vw, ${baseW}px`;
    }

    const uniqueWidths = Array.from(new Set(widths.filter(w => w > 0))).sort((a, b) => a - b);

    return {
        widths: uniqueWidths,
        sizes
    };
}

/**
 * Optimizes, resizes, and converts a single image buffer using Sharp
 * @param {Buffer} inputBuffer
 * @param {object} [options={}]
 * @param {number} [options.targetWidth]
 * @param {number} [options.targetHeight]
 * @param {string} [options.scaleMode='FILL']
 * @param {string} [options.format='original'] 'original' | 'webp' | 'avif' | 'jpeg' | 'png'
 * @param {boolean} [options.compress=false] Lossless compression
 * @param {string} [options.sourceMime='image/png']
 * @returns {Promise<{ buffer: Buffer, mime: string, ext: string, width: number, height: number }>}
 */
async function optimizeBuffer(inputBuffer, options = {}) {
    const {
        targetWidth,
        targetHeight,
        scaleMode = 'FILL',
        format = 'original',
        compress = false,
        sourceMime = 'image/png'
    } = options;

    if (!inputBuffer || inputBuffer.length === 0) {
        return null;
    }

    // Pass through SVGs without rasterization
    if (sourceMime === 'image/svg+xml') {
        return {
            buffer: inputBuffer,
            mime: 'image/svg+xml',
            ext: 'svg',
            width: targetWidth || null,
            height: targetHeight || null
        };
    }

    try {
        let outFormat = (format || 'original').toLowerCase().trim();
        if (outFormat === 'original') {
            if (sourceMime === 'image/jpeg') outFormat = 'jpeg';
            else if (sourceMime === 'image/webp') outFormat = 'webp';
            else if (sourceMime === 'image/avif') outFormat = 'avif';
            else if (sourceMime === 'image/gif') outFormat = 'gif';
            else outFormat = 'png';
        }

        let pipeline = sharp(inputBuffer);
        const meta = await pipeline.metadata().catch(() => null);

        if (targetWidth && targetHeight) {
            pipeline = pipeline.resize({
                width: targetWidth,
                height: targetHeight,
                fit: scaleMode === 'FIT' ? 'contain' : 'cover',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            });
        } else if (targetWidth) {
            pipeline = pipeline.resize({
                width: targetWidth,
                fit: 'inside',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            });
        }

        let mime = 'image/png';
        let ext = 'png';

        if (outFormat === 'webp') {
            mime = 'image/webp';
            ext = 'webp';
            if (compress) {
                pipeline = pipeline.webp({ lossless: true, effort: 6 });
            } else {
                pipeline = pipeline.webp({ quality: 85, effort: 4 });
            }
        } else if (outFormat === 'avif') {
            mime = 'image/avif';
            ext = 'avif';
            if (compress) {
                pipeline = pipeline.avif({ lossless: true, effort: 6 });
            } else {
                pipeline = pipeline.avif({ quality: 80, effort: 4 });
            }
        } else if (outFormat === 'jpeg' || outFormat === 'jpg') {
            mime = 'image/jpeg';
            ext = 'jpg';
            if (compress) {
                pipeline = pipeline.jpeg({ quality: 100, mozjpeg: true, chromaSubsampling: '4:4:4' });
            } else {
                pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
            }
        } else if (outFormat === 'png') {
            mime = 'image/png';
            ext = 'png';
            if (compress) {
                pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 });
            } else {
                pipeline = pipeline.png({ compressionLevel: 8 });
            }
        } else if (outFormat === 'gif') {
            mime = 'image/gif';
            ext = 'gif';
            pipeline = pipeline.gif();
        }

        const outBuf = await pipeline.toBuffer();
        return {
            buffer: outBuf,
            mime,
            ext,
            width: targetWidth || meta?.width || 100,
            height: targetHeight || meta?.height || 100
        };
    } catch (err) {
        // Fallback to original buffer if sharp fails on corrupt data
        const fallbackExt = getExtensionForMime(sourceMime);
        return {
            buffer: inputBuffer,
            mime: sourceMime,
            ext: fallbackExt,
            width: targetWidth || 100,
            height: targetHeight || 100
        };
    }
}

/**
 * Maps Figma blend mode string to Sharp blend mode string
 * @param {string} blendMode
 * @returns {string} Sharp blend mode ('over', 'add', 'multiply', 'screen', etc.)
 */
function mapFigmaBlendModeToSharp(blendMode) {
    if (!blendMode) return 'over';
    switch (blendMode.toUpperCase()) {
        case 'NORMAL':
        case 'PASS_THROUGH':
            return 'over';
        case 'LINEAR_DODGE':
            return 'add';
        case 'MULTIPLY':
            return 'multiply';
        case 'SCREEN':
            return 'screen';
        case 'OVERLAY':
            return 'overlay';
        case 'COLOR_DODGE':
            return 'color-dodge';
        case 'COLOR_BURN':
            return 'color-burn';
        case 'DARKEN':
            return 'darken';
        case 'LIGHTEN':
            return 'lighten';
        case 'HARD_LIGHT':
            return 'hard-light';
        case 'SOFT_LIGHT':
            return 'soft-light';
        case 'DIFFERENCE':
            return 'difference';
        case 'EXCLUSION':
            return 'exclusion';
        default:
            return 'over';
    }
}

/**
 * Checks if a paintFilter object contains non-trivial adjustments
 * @param {object} pf
 * @returns {boolean}
 */
function hasNonTrivialPaintFilter(pf) {
    if (!pf || typeof pf !== 'object') return false;
    const exposure = pf.exposure || 0;
    const contrast = pf.contrast || 0;
    const sat = (pf.vibrance !== undefined ? pf.vibrance : pf.saturation) || 0;
    const temp = pf.temperature || 0;
    const tint = pf.tint || 0;
    return Math.abs(exposure) > 0.01 ||
           Math.abs(contrast) > 0.01 ||
           Math.abs(sat) > 0.01 ||
           Math.abs(temp) > 0.01 ||
           Math.abs(tint) > 0.01;
}

/**
 * Applies Figma paintFilter adjustments (exposure, contrast, saturation, temperature, tint) to Sharp pipeline
 * @param {sharp.Sharp} pipeline
 * @param {object} paintFilter
 * @returns {sharp.Sharp}
 */
function applyPaintFilterToPipeline(pipeline, paintFilter) {
    if (!paintFilter || typeof paintFilter !== 'object') return pipeline;

    const exposure = paintFilter.exposure || 0;
    const contrast = paintFilter.contrast || 0;
    const sat = (paintFilter.vibrance !== undefined ? paintFilter.vibrance : paintFilter.saturation) || 0;
    const temp = paintFilter.temperature || 0;
    const tint = paintFilter.tint || 0;

    const brightnessVal = Math.max(0, 1 + exposure);
    const saturationVal = sat <= -0.99 ? 0 : Math.max(0, 1 + sat);
    const hueShift = Math.round((tint * 45) + (temp < 0 ? temp * 30 : 0));

    const needsModulate = Math.abs(exposure) > 0.01 || Math.abs(sat) > 0.01 || Math.abs(hueShift) > 0;
    if (needsModulate) {
        pipeline = pipeline.modulate({
            brightness: brightnessVal,
            saturation: saturationVal,
            hue: hueShift
        });
    }

    if (Math.abs(contrast) > 0.01) {
        const contrastFactor = Math.max(0.01, 1 + contrast);
        const offset = 128 * (1 - contrastFactor);
        pipeline = pipeline.linear(contrastFactor, offset);
    }

    return pipeline;
}

/**
 * Generates an SVG buffer for a SOLID fill
 * @param {object} fill
 * @param {number} w
 * @param {number} h
 * @returns {Buffer|null}
 */
function generateSolidSvg(fill, w, h) {
    if (!fill) return null;
    const col = fill.color || fill.authoredColor || { r: 0, g: 0, b: 0, a: 1 };
    const r = Math.round((col.r || 0) * 255);
    const g = Math.round((col.g || 0) * 255);
    const b = Math.round((col.b || 0) * 255);
    const a = (col.a !== undefined ? col.a : 1);
    const op = Math.round(a * (fill.opacity ?? 1) * 1000) / 1000;
    return Buffer.from(
        `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="${w}" height="${h}" fill="rgb(${r}, ${g}, ${b})" fill-opacity="${op}" />` +
        `</svg>`
    );
}

/**
 * Generates an SVG buffer for a GRADIENT_LINEAR fill
 * @param {object} fill
 * @param {number} w
 * @param {number} h
 * @returns {Buffer|null}
 */
function generateLinearGradientSvg(fill, w, h) {
    if (!fill || !fill.stops || fill.stops.length < 2) return null;
    const angle = getLinearGradientAngle(fill.transform);
    const stopsXml = fill.stops.map(s => {
        const pct = Math.round((s.position !== undefined ? s.position : 0) * 1000) / 10 + '%';
        const col = s.color || s.authoredColor || { r: 0, g: 0, b: 0, a: 1 };
        const r = Math.round((col.r || 0) * 255);
        const g = Math.round((col.g || 0) * 255);
        const b = Math.round((col.b || 0) * 255);
        const a = (col.a !== undefined ? col.a : 1);
        const op = Math.round(a * (fill.opacity ?? 1) * 1000) / 1000;
        return `<stop offset="${pct}" stop-color="rgb(${r}, ${g}, ${b})" stop-opacity="${op}" />`;
    }).join('\n');

    return Buffer.from(
        `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">` +
        `<defs><linearGradient id="g" gradientTransform="rotate(${angle - 90} 0.5 0.5)">` +
        stopsXml +
        `</linearGradient></defs>` +
        `<rect width="${w}" height="${h}" fill="url(#g)" />` +
        `</svg>`
    );
}

/**
 * Generates an SVG buffer for a GRADIENT_RADIAL fill
 * @param {object} fill
 * @param {number} w
 * @param {number} h
 * @returns {Buffer|null}
 */
function generateRadialGradientSvg(fill, w, h) {
    if (!fill || !fill.stops || fill.stops.length < 2) return null;
    const stopsXml = fill.stops.map(s => {
        const pct = Math.round((s.position !== undefined ? s.position : 0) * 1000) / 10 + '%';
        const col = s.color || s.authoredColor || { r: 0, g: 0, b: 0, a: 1 };
        const r = Math.round((col.r || 0) * 255);
        const g = Math.round((col.g || 0) * 255);
        const b = Math.round((col.b || 0) * 255);
        const a = (col.a !== undefined ? col.a : 1);
        const op = Math.round(a * (fill.opacity ?? 1) * 1000) / 1000;
        return `<stop offset="${pct}" stop-color="rgb(${r}, ${g}, ${b})" stop-opacity="${op}" />`;
    }).join('\n');

    return Buffer.from(
        `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">` +
        `<defs><radialGradient id="g" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">` +
        stopsXml +
        `</radialGradient></defs>` +
        `<rect width="${w}" height="${h}" fill="url(#g)" />` +
        `</svg>`
    );
}

/**
 * Collects all image nodes that belong to mask containers (excluding explicit [mask] tags)
 * @param {Array<object>} rootNodes
 * @returns {Set<object>}
 */
function collectMaskedImageNodes(rootNodes) {
    const maskedNodes = new Set();
    function findMaskContainers(nodes) {
        const res = [];
        for (const n of nodes) {
            if (n.children && n.children.some(c => c.mask === true || c.isMask === true)) {
                res.push(n);
            }
            if (n.children) res.push(...findMaskContainers(n.children));
        }
        return res;
    }

    function findImagesInSubtree(node) {
        const res = [];
        if (node.fillPaints?.some(f => f.type === 'IMAGE' && f.image?.hash && f.visible !== false)) {
            res.push(node);
        }
        if (node.children) {
            for (const c of node.children) {
                res.push(...findImagesInSubtree(c));
            }
        }
        return res;
    }

    const containers = findMaskContainers(rootNodes);
    for (const container of containers) {
        if (hasExplicitMaskTag(container)) continue;
        const maskChild = container.children.find(c => c.mask === true || c.isMask === true);
        if (!maskChild || hasExplicitMaskTag(maskChild)) continue;

        const siblings = container.children.filter(c => c !== maskChild);
        const images = siblings.flatMap(s => findImagesInSubtree(s));
        for (const img of images) {
            maskedNodes.add(img);
        }
    }
    return maskedNodes;
}

/**
 * Bakes multi-fills (SOLID underlays, GRADIENT overlays with blend modes) and color correction
 * filters (paintFilter) directly into image assets using Sharp compositing.
 *
 * @param {Map<string, { buffer: Buffer, mime: string }>|object} rawImages
 * @param {Array<object>} rootNodes
 * @param {object} [options={}]
 * @returns {Promise<number>} Count of baked image nodes
 */
async function bakeImageFillsAndFilters(rawImages, rootNodes, options = {}) {
    const imageCount = typeof rawImages?.size === 'number' ? rawImages.size : (rawImages ? Object.keys(rawImages).length : 0);
    if (!rawImages || imageCount === 0 || !Array.isArray(rootNodes) || rootNodes.length === 0) {
        return 0;
    }

    let bakedCount = 0;
    const scaleMultiplier = typeof options.imageScale === 'number' && options.imageScale > 0 ? options.imageScale : 2;

    const getRawImage = (hash) => {
        if (!rawImages) return null;
        if (typeof rawImages.get === 'function') return rawImages.get(hash);
        const item = rawImages[hash];
        if (!item) return null;
        if (Buffer.isBuffer(item)) return { buffer: item, mime: 'image/png' };
        return item;
    };

    const setRawImage = (hash, item) => {
        if (!rawImages) return;
        if (typeof rawImages.set === 'function') {
            rawImages.set(hash, item);
        } else {
            rawImages[hash] = item;
        }
    };

    const maskedNodes = collectMaskedImageNodes(rootNodes);
    const candidates = [];

    function traverse(node) {
        if (!node || node.visible === false) return;
        if (Array.isArray(node.fillPaints) && node.fillPaints.length > 0) {
            const visibleFills = node.fillPaints.filter(f => f.visible !== false);
            const imgPaint = visibleFills.find(f => f.type === 'IMAGE' && f.image?.hash);
            if (imgPaint) {
                const hasMultiFills = visibleFills.length > 1;
                const isMasked = maskedNodes.has(node) || node.mask === true || node.isMask === true;
                const hasPf = visibleFills.some(f => hasNonTrivialPaintFilter(f.paintFilter));

                if (hasMultiFills || (isMasked && hasPf)) {
                    candidates.push({ node, imgPaint, visibleFills });
                }
            }
        }
        if (node.children) {
            for (const child of node.children) {
                traverse(child);
            }
        }
    }

    for (const r of rootNodes) {
        traverse(r);
    }

    for (const { node, imgPaint, visibleFills } of candidates) {
        const rawHash = (typeof imgPaint.image.hash === 'string')
            ? imgPaint.image.hash.toLowerCase()
            : Buffer.from(imgPaint.image.hash).toString('hex').toLowerCase();
        const rawItem = getRawImage(rawHash);
        if (!rawItem?.buffer) continue;

        const cssW = Math.round(node.size?.x || 100);
        const cssH = Math.round(node.size?.y || 100);
        const targetW = Math.max(1, Math.round(cssW * scaleMultiplier));
        const targetH = Math.max(1, Math.round(cssH * scaleMultiplier));

        try {
            const layers = [];

            for (const fill of visibleFills) {
                const blend = mapFigmaBlendModeToSharp(fill.blendMode);

                if (fill.type === 'SOLID') {
                    const solidSvg = generateSolidSvg(fill, targetW, targetH);
                    if (solidSvg) {
                        const solidBuf = await sharp(solidSvg).png().toBuffer();
                        layers.push({ input: solidBuf, blend });
                    }
                } else if (fill.type === 'GRADIENT_LINEAR') {
                    const gradSvg = generateLinearGradientSvg(fill, targetW, targetH);
                    if (gradSvg) {
                        const gradBuf = await sharp(gradSvg).png().toBuffer();
                        layers.push({ input: gradBuf, blend });
                    }
                } else if (fill.type === 'GRADIENT_RADIAL') {
                    const radSvg = generateRadialGradientSvg(fill, targetW, targetH);
                    if (radSvg) {
                        const radBuf = await sharp(radSvg).png().toBuffer();
                        layers.push({ input: radBuf, blend });
                    }
                } else if (fill.type === 'IMAGE' && fill.image?.hash) {
                    const fHash = (typeof fill.image.hash === 'string')
                        ? fill.image.hash.toLowerCase()
                        : Buffer.from(fill.image.hash).toString('hex').toLowerCase();
                    const fRaw = getRawImage(fHash);
                    if (!fRaw?.buffer) continue;

                    let pipeline = sharp(fRaw.buffer)
                        .resize(targetW, targetH, {
                            fit: fill.imageScaleMode === 'FIT' ? 'contain' : 'cover',
                            background: { r: 0, g: 0, b: 0, alpha: 0 }
                        })
                        .ensureAlpha();

                    if (fill.paintFilter) {
                        pipeline = applyPaintFilterToPipeline(pipeline, fill.paintFilter);
                    }

                    if (fill.opacity !== undefined && fill.opacity !== null && fill.opacity < 0.999) {
                        pipeline = pipeline.linear([1, 1, 1, Math.max(0, fill.opacity)], [0, 0, 0, 0]);
                    }

                    const photoBuf = await pipeline.png().toBuffer();
                    layers.push({ input: photoBuf, blend });
                }
            }

            if (layers.length === 0) continue;

            let bakedBuf;
            if (layers.length === 1 && layers[0].blend === 'over') {
                bakedBuf = layers[0].input;
            } else {
                const baseCanvas = sharp({
                    create: {
                        width: targetW,
                        height: targetH,
                        channels: 4,
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    }
                });
                bakedBuf = await baseCanvas.composite(layers).png().toBuffer();
            }

            const bakedHashHex = crypto.createHash('sha1').update(bakedBuf).digest('hex');
            setRawImage(bakedHashHex, { buffer: bakedBuf, mime: 'image/png' });

            imgPaint.image.hash = Buffer.isBuffer(imgPaint.image.hash) || typeof imgPaint.image.hash === 'object'
                ? Buffer.from(bakedHashHex, 'hex')
                : bakedHashHex;

            node.isImageFillsBaked = true;
            bakedCount++;
        } catch (err) {
            // Ignore sharp failures on corrupt data
        }
    }

    return bakedCount;
}

/**
 * Detects mask containers without explicit [mask] / [маска] tag and bakes the mask into the image
 * using Sharp compositing (blend: 'dest-in'), producing a clean PNG with transparent alpha.
 *
 * @param {Map<string, { buffer: Buffer, mime: string }>} rawImages
 * @param {Array<object>} rootNodes
 * @param {object} [options={}]
 */
async function bakeMasksIntoImages(rawImages, rootNodes, options = {}) {
    const imageCount = typeof rawImages?.size === 'number' ? rawImages.size : (rawImages ? Object.keys(rawImages).length : 0);
    if (!rawImages || imageCount === 0 || !Array.isArray(rootNodes) || rootNodes.length === 0) {
        return 0;
    }

    let bakedCount = 0;
    const scaleMultiplier = typeof options.imageScale === 'number' && options.imageScale > 0 ? options.imageScale : 2;

    function findMaskContainers(nodes) {
        const res = [];
        for (const n of nodes) {
            if (n.children && n.children.some(c => c.mask === true || c.isMask === true)) {
                res.push(n);
            }
            if (n.children) res.push(...findMaskContainers(n.children));
        }
        return res;
    }

    function findImagesInSubtree(node) {
        const res = [];
        if (node.fillPaints?.some(f => f.type === 'IMAGE' && f.image?.hash && f.visible !== false)) {
            res.push(node);
        }
        if (node.children) {
            for (const c of node.children) {
                res.push(...findImagesInSubtree(c));
            }
        }
        return res;
    }

    function generateMaskSvg(maskChild, w, h) {
        if (!maskChild) return null;

        const radPaint = maskChild.fillPaints?.find(f => f.type === 'GRADIENT_RADIAL' && f.visible !== false);
        if (radPaint && radPaint.stops && radPaint.stops.length >= 2) {
            const stopsXml = radPaint.stops.map(s => {
                const pct = Math.round((s.position !== undefined ? s.position : 0) * 100);
                const a = s.color?.a !== undefined ? s.color.a : 1;
                const op = Math.round(a * (radPaint.opacity ?? 1) * 1000) / 1000;
                return `<stop offset="${pct}%" stop-color="white" stop-opacity="${op}" />`;
            }).join('\n');

            return Buffer.from(
                `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">` +
                `<defs><radialGradient id="m" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">` +
                stopsXml +
                `</radialGradient></defs>` +
                `<rect width="${w}" height="${h}" fill="url(#m)" />` +
                `</svg>`
            );
        }

        const linPaint = maskChild.fillPaints?.find(f => f.type === 'GRADIENT_LINEAR' && f.visible !== false);
        if (linPaint && linPaint.stops && linPaint.stops.length >= 2) {
            const angle = getLinearGradientAngle(linPaint.transform);
            const stopsXml = linPaint.stops.map(s => {
                const pct = Math.round((s.position !== undefined ? s.position : 0) * 100);
                const a = s.color?.a !== undefined ? s.color.a : 1;
                const op = Math.round(a * (linPaint.opacity ?? 1) * 1000) / 1000;
                return `<stop offset="${pct}%" stop-color="white" stop-opacity="${op}" />`;
            }).join('\n');

            return Buffer.from(
                `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">` +
                `<defs><linearGradient id="m" gradientTransform="rotate(${angle - 90} 0.5 0.5)">` +
                stopsXml +
                `</linearGradient></defs>` +
                `<rect width="${w}" height="${h}" fill="url(#m)" />` +
                `</svg>`
            );
        }

        if (maskChild.type === 'ELLIPSE') {
            return Buffer.from(
                `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">` +
                `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="white" />` +
                `</svg>`
            );
        }

        if (maskChild.cornerRadius) {
            const r = Math.round(maskChild.cornerRadius * scaleMultiplier);
            return Buffer.from(
                `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">` +
                `<rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white" />` +
                `</svg>`
            );
        }

        return null;
    }

    const containers = findMaskContainers(rootNodes);

    const getRawImage = (hash) => {
        if (!rawImages) return null;
        if (typeof rawImages.get === 'function') return rawImages.get(hash);
        const item = rawImages[hash];
        if (!item) return null;
        if (Buffer.isBuffer(item)) return { buffer: item, mime: 'image/png' };
        return item;
    };

    const setRawImage = (hash, item) => {
        if (!rawImages) return;
        if (typeof rawImages.set === 'function') {
            rawImages.set(hash, item);
        } else {
            rawImages[hash] = item;
        }
    };

    for (const container of containers) {
        if (hasExplicitMaskTag(container)) continue;
        const maskChild = container.children.find(c => c.mask === true || c.isMask === true);
        if (!maskChild || hasExplicitMaskTag(maskChild)) continue;

        const siblings = container.children.filter(c => c !== maskChild);
        const images = siblings.flatMap(s => findImagesInSubtree(s));
        if (images.length === 0) continue;

        for (const targetImageNode of images) {
            const targetPaint = targetImageNode.fillPaints.find(f => f.type === 'IMAGE' && f.image?.hash);
            if (!targetPaint) continue;
            const targetHash = (typeof targetPaint.image.hash === 'string')
                ? targetPaint.image.hash.toLowerCase()
                : Buffer.from(targetPaint.image.hash).toString('hex').toLowerCase();
            const targetRaw = getRawImage(targetHash);
            if (!targetRaw?.buffer) continue;

            const cssW = Math.round(maskChild.size?.x || container.size?.x || targetImageNode.size?.x || 100);
            const cssH = Math.round(maskChild.size?.y || container.size?.y || targetImageNode.size?.y || 100);
            const targetW = Math.max(1, Math.round(cssW * scaleMultiplier));
            const targetH = Math.max(1, Math.round(cssH * scaleMultiplier));

            let maskRasterBuf = null;
            try {
                // Check if mask has its own image fill (e.g. PNG alpha mask)
                const maskImgPaint = maskChild.fillPaints?.find(f => f.type === 'IMAGE' && f.image?.hash && f.visible !== false);
                if (maskImgPaint) {
                    const mHash = (typeof maskImgPaint.image.hash === 'string')
                        ? maskImgPaint.image.hash.toLowerCase()
                        : Buffer.from(maskImgPaint.image.hash).toString('hex').toLowerCase();
                    const mRaw = getRawImage(mHash);
                    if (mRaw?.buffer) {
                        maskRasterBuf = await sharp(mRaw.buffer).resize(targetW, targetH, { fit: 'cover' }).toBuffer();
                    }
                } else {
                    const svgBuf = generateMaskSvg(maskChild, targetW, targetH);
                    if (svgBuf) {
                        maskRasterBuf = await sharp(svgBuf).png().toBuffer();
                    }
                }

                if (!maskRasterBuf) continue;

                const targetRaster = await sharp(targetRaw.buffer)
                    .resize(targetW, targetH, { fit: 'cover' })
                    .ensureAlpha()
                    .toBuffer();

                const bakedBuf = await sharp(targetRaster)
                    .composite([{ input: maskRasterBuf, blend: 'dest-in' }])
                    .png()
                    .toBuffer();

                const bakedHashHex = crypto.createHash('sha1').update(bakedBuf).digest('hex');
                setRawImage(bakedHashHex, { buffer: bakedBuf, mime: 'image/png' });

                // Update target node image fill
                targetPaint.image.hash = (typeof targetPaint.image.hash === 'string')
                    ? bakedHashHex
                    : Buffer.from(bakedHashHex, 'hex');
                targetImageNode.isMaskBaked = true;
                container.isMaskBaked = true;
                maskChild.isMaskBaked = true;
                bakedCount++;
            } catch (err) {
                // Ignore sharp failures on corrupt buffers
            }
        }
    }
    return bakedCount;
}

/**
 * Bakes a degenerate graphic wrapper chain asset into a single raster buffer via Sharp:
 * - Scales according to cumulative scale and target scale multiplier (e.g. 2 for Retina)
 * - Rotates by cumulative angle theta with transparent background
 * - Applies any intermediate masks if not already baked
 * - Centers and clips the resulting raster onto the exact root canvas boundary (e.g. 300x332 @1x -> 600x664 @2x)
 * - Stores the resulting buffer in rawImages under its SHA-1 hash
 *
 * @param {object} chainInfo Result from detectGraphicSubtreeChain
 * @param {Map<string, { buffer: Buffer, mime: string }>|object} rawImages
 * @param {object} [options={}]
 * @returns {Promise<{ bakedHash: string, buffer: Buffer, canvasW: number, canvasH: number }|null>}
 */
async function bakeGraphicChainAsset(chainInfo, rawImages, options = {}) {
    if (!chainInfo || !rawImages) return null;

    const imgPaint = chainInfo.leaf?.fillPaints?.find(f => f.type === 'IMAGE' && f.image?.hash);
    if (!imgPaint) return null;

    const rawHash = (typeof imgPaint.image.hash === 'string')
        ? imgPaint.image.hash.toLowerCase()
        : Buffer.from(imgPaint.image.hash).toString('hex').toLowerCase();

    const getRawImage = (hash) => {
        if (!rawImages) return null;
        if (typeof rawImages.get === 'function') return rawImages.get(hash);
        const item = rawImages[hash];
        if (!item) return null;
        if (Buffer.isBuffer(item)) return { buffer: item, mime: 'image/png' };
        return item;
    };

    const setRawImage = (hash, item) => {
        if (!rawImages) return;
        if (typeof rawImages.set === 'function') {
            rawImages.set(hash, item);
        } else {
            rawImages[hash] = item;
        }
    };

    const rawItem = getRawImage(rawHash);
    if (!rawItem?.buffer) return null;

    const scaleMultiplier = typeof options.imageScale === 'number' && options.imageScale > 0 ? options.imageScale : 2;

    const canvasW = Math.max(1, Math.round(chainInfo.canvasWidth * scaleMultiplier));
    const canvasH = Math.max(1, Math.round(chainInfo.canvasHeight * scaleMultiplier));

    const wLeaf = chainInfo.leaf.size?.x || chainInfo.canvasWidth;
    const hLeaf = chainInfo.leaf.size?.y || chainInfo.canvasHeight;
    const decomp = chainInfo.decomposition;

    const wScaled = Math.max(1, Math.round(wLeaf * (decomp.scaleX || 1) * scaleMultiplier));
    const hScaled = Math.max(1, Math.round(hLeaf * (decomp.scaleY || 1) * scaleMultiplier));

    // 1. Scale and rotate raster with transparent background
    let rotatedBuf;
    try {
        rotatedBuf = await sharp(rawItem.buffer)
            .resize(wScaled, hScaled, { fit: 'fill' })
            .rotate(decomp.rotateDeg || 0, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toBuffer();
    } catch (err) {
        return null;
    }

    const metaRot = await sharp(rotatedBuf).metadata().catch(() => null);
    if (!metaRot?.width || !metaRot?.height) return null;

    // 2. Center calculation in Root Canvas space
    const m = chainInfo.cumulativeTransform;
    const cxLeaf = wLeaf / 2;
    const cyLeaf = hLeaf / 2;
    const cxRoot = m.m00 * cxLeaf + m.m01 * cyLeaf + m.m02;
    const cyRoot = m.m10 * cxLeaf + m.m11 * cyLeaf + m.m12;

    const CX = cxRoot * scaleMultiplier;
    const CY = cyRoot * scaleMultiplier;

    const left = Math.round(CX - metaRot.width / 2);
    const top = Math.round(CY - metaRot.height / 2);

    const cx1 = Math.max(0, left);
    const cy1 = Math.max(0, top);
    const cx2 = Math.min(canvasW, left + metaRot.width);
    const cy2 = Math.min(canvasH, top + metaRot.height);

    const fw = cx2 - cx1;
    const fh = cy2 - cy1;

    let finalBuf;
    if (fw <= 0 || fh <= 0) {
        // Completely outside canvas boundary: create empty transparent canvas
        finalBuf = await sharp({
            create: {
                width: canvasW,
                height: canvasH,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        }).png().toBuffer();
    } else {
        const fx = cx1 - left;
        const fy = cy1 - top;

        const extracted = await sharp(rotatedBuf).extract({
            left: fx,
            top: fy,
            width: fw,
            height: fh
        }).toBuffer();

        finalBuf = await sharp({
            create: {
                width: canvasW,
                height: canvasH,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        }).composite([{
            input: extracted,
            left: cx1,
            top: cy1
        }]).png().toBuffer();
    }

    const bakedHash = crypto.createHash('sha1').update(finalBuf).digest('hex');
    setRawImage(bakedHash, { buffer: finalBuf, mime: 'image/png' });

    return {
        bakedHash,
        buffer: finalBuf,
        canvasW,
        canvasH
    };
}

/**
 * Automatically detects degenerate graphic wrapper chains in rootNodes,
 * bakes their cumulative affine composition via Sharp, and collapses the AST hierarchy.
 *
 * @param {Map<string, { buffer: Buffer, mime: string }>|object} rawImages
 * @param {Array<object>} rootNodes
 * @param {object} [options={}]
 * @returns {Promise<number>} Number of collapsed chains
 */
async function bakeAndCollapseGraphicChains(rawImages, rootNodes, options = {}) {
    const imageCount = typeof rawImages?.size === 'number' ? rawImages.size : (rawImages ? Object.keys(rawImages).length : 0);
    if (!rawImages || imageCount === 0 || !Array.isArray(rootNodes) || rootNodes.length === 0) {
        return 0;
    }

    const chains = findAllGraphicChains(rootNodes);
    if (!chains || chains.length === 0) return 0;

    let collapsedCount = 0;
    for (const chain of chains) {
        try {
            const baked = await bakeGraphicChainAsset(chain, rawImages, options);
            if (baked && baked.bakedHash) {
                collapseGraphicSubtree(chain, baked.bakedHash);
                collapsedCount++;
            }
        } catch (err) {
            // Ignore error on individual corrupted chain
        }
    }
    return collapsedCount;
}

/**
 * Optimizes all images extracted from a .fig file:
 * 1. Resizes according to CSS dimensions with multiplier (default 2x for high quality retina)
 * 2. Generates responsive device variants for srcset / sizes (with option to disable)
 * 3. Compresses losslessly if requested
 * 4. Converts to modern media formats (WebP, AVIF) if requested
 *
 * @param {Map<string, { buffer: Buffer, mime: string, base64?: string }>} rawImages
 * @param {Array<object>} rootNodes
 * @param {object} [options={}]
 * @param {number} [options.imageScale=2] Multiplier for CSS dimensions (default: 2)
 * @param {boolean} [options.responsiveImages=true] Generate srcset and sizes
 * @param {boolean} [options.compress=false] Lossless compression
 * @param {string} [options.imageFormat='original'] 'original' | 'webp' | 'avif' | 'webp,avif'
 * @param {boolean} [options.inlineImages=true]
 * @param {string} [options.assetUrlPrefix='img/']
 * @returns {Promise<{ processedImages: Map<string, object>, nodeImageMap: Map<object, object>, filesToWrite: Array<{ fileName: string, buffer: Buffer }>, stats: { totalBeforeBytes: number, totalAfterBytes: number, optimizedCount: number } }>}
 */
async function optimizeAllImages(rawImages, rootNodes, options = {}) {
    const scaleMultiplier = typeof options.imageScale === 'number' && options.imageScale > 0 ? options.imageScale : 2;
    const isResponsive = options.responsiveImages !== false;
    const isLossless = Boolean(options.compress || options.lossless);
    const targetFormat = (options.imageFormat || options.format || 'original').toLowerCase().trim();
    const isInline = options.inlineImages !== false;
    const prefix = options.assetUrlPrefix || 'img/';

    // 0. Bake fills & filters into images first
    await bakeImageFillsAndFilters(rawImages, rootNodes, options);

    // 0b. Bake masks into images if not explicitly tagged with [mask] / [маска]
    await bakeMasksIntoImages(rawImages, rootNodes, options);

    // 0c. Cumulative graphic subtree collapsing & baking
    await bakeAndCollapseGraphicChains(rawImages, rootNodes, options);

    const usages = collectImageUsages(rootNodes);
    const usagesByHash = new Map();

    for (const u of usages) {
        if (!usagesByHash.has(u.hashHex)) {
            usagesByHash.set(u.hashHex, []);
        }
        usagesByHash.get(u.hashHex).push(u);
    }

    const processedImages = new Map();
    const nodeImageMap = new Map();
    const filesToWriteMap = new Map(); // fileName -> buffer

    let totalBeforeBytes = 0;
    let totalAfterBytes = 0;
    let optimizedCount = 0;
    let imgIdx = 0;
    const totalImgs = rawImages.size;

    for (const [hashHex, rawImg] of rawImages.entries()) {
        imgIdx++;
        if (typeof options.onProgress === 'function') {
            options.onProgress(imgIdx, totalImgs, hashHex);
        }
        totalBeforeBytes += rawImg.buffer.length;

        const imgUsages = usagesByHash.get(hashHex) || [];
        let primaryWidth = 100;
        let primaryHeight = 100;
        let primaryScaleMode = 'FILL';

        if (imgUsages.length > 0) {
            // Pick the usage with largest CSS area as primary
            let maxArea = -1;
            for (const u of imgUsages) {
                const area = u.cssWidth * u.cssHeight;
                if (area > maxArea) {
                    maxArea = area;
                    primaryWidth = u.cssWidth;
                    primaryHeight = u.cssHeight;
                    primaryScaleMode = u.scaleMode;
                }
            }
        } else {
            // Unreferenced image in node tree: read native metadata
            try {
                const meta = await sharp(rawImg.buffer).metadata();
                primaryWidth = meta.width || 100;
                primaryHeight = meta.height || 100;
            } catch (_) {
                primaryWidth = 100;
                primaryHeight = 100;
            }
        }

        // 1. Target 2x resized primary image
        const target2xW = Math.round(primaryWidth * scaleMultiplier);
        const target2xH = Math.round(primaryHeight * scaleMultiplier);

        const primaryResult = await optimizeBuffer(rawImg.buffer, {
            targetWidth: target2xW,
            targetHeight: target2xH,
            scaleMode: primaryScaleMode,
            format: targetFormat.includes(',') ? targetFormat.split(',')[0].trim() : targetFormat,
            compress: isLossless,
            sourceMime: rawImg.mime
        });

        const mainBuffer = primaryResult.buffer;
        const mainMime = primaryResult.mime;
        const mainExt = primaryResult.ext;
        const mainBase64 = `data:${mainMime};base64,${mainBuffer.toString('base64')}`;
        const mainFileName = `${hashHex}.${mainExt}`;

        filesToWriteMap.set(mainFileName, mainBuffer);
        totalAfterBytes += mainBuffer.length;
        optimizedCount++;

        // 2. Responsive variants & srcset for usages
        const primaryVariants = [];

        if (isResponsive) {
            const { widths, sizes } = calculateDeviceWidths(primaryWidth, scaleMultiplier);

            for (const w of widths) {
                const h = Math.round(primaryHeight * (w / primaryWidth));
                const variantResult = await optimizeBuffer(rawImg.buffer, {
                    targetWidth: w,
                    targetHeight: h,
                    scaleMode: primaryScaleMode,
                    format: targetFormat.includes(',') ? targetFormat.split(',')[0].trim() : targetFormat,
                    compress: isLossless,
                    sourceMime: rawImg.mime
                });

                const vFileName = `${hashHex}-${w}w.${mainExt}`;
                const vBase64 = `data:${variantResult.mime};base64,${variantResult.buffer.toString('base64')}`;

                primaryVariants.push({
                    width: w,
                    height: h,
                    fileName: vFileName,
                    buffer: variantResult.buffer,
                    base64: vBase64,
                    descriptor: `${w}w`
                });

                filesToWriteMap.set(vFileName, variantResult.buffer);
            }
        }

        // Build primary srcset
        let primarySrcset = '';
        if (primaryVariants.length > 0) {
            primarySrcset = primaryVariants
                .map(v => isInline ? `${v.base64} ${v.descriptor}` : `${prefix}${v.fileName} ${v.descriptor}`)
                .join(', ');
        }
        const { sizes: primarySizes } = calculateDeviceWidths(primaryWidth, scaleMultiplier);

        // Map per-node specific details
        for (const u of imgUsages) {
            let nodeSrcset = primarySrcset;
            let nodeSizes = primarySizes;

            if (isResponsive && (u.cssWidth !== primaryWidth || u.cssHeight !== primaryHeight)) {
                const { widths: uWidths, sizes: uSizes } = calculateDeviceWidths(u.cssWidth, scaleMultiplier);
                const uVariants = [];

                for (const w of uWidths) {
                    const h = Math.round(u.cssHeight * (w / u.cssWidth));
                    const varRes = await optimizeBuffer(rawImg.buffer, {
                        targetWidth: w,
                        targetHeight: h,
                        scaleMode: u.scaleMode,
                        format: targetFormat.includes(',') ? targetFormat.split(',')[0].trim() : targetFormat,
                        compress: isLossless,
                        sourceMime: rawImg.mime
                    });

                    const vFileName = `${hashHex}-${w}w.${mainExt}`;
                    const vBase64 = `data:${varRes.mime};base64,${varRes.buffer.toString('base64')}`;

                    uVariants.push({
                        width: w,
                        height: h,
                        fileName: vFileName,
                        buffer: varRes.buffer,
                        base64: vBase64,
                        descriptor: `${w}w`
                    });

                    filesToWriteMap.set(vFileName, varRes.buffer);
                }

                nodeSrcset = uVariants
                    .map(v => isInline ? `${v.base64} ${v.descriptor}` : `${prefix}${v.fileName} ${v.descriptor}`)
                    .join(', ');
                nodeSizes = uSizes;
            }

            nodeImageMap.set(u.node, {
                hashHex,
                mainFileName,
                mainBase64,
                mime: mainMime,
                ext: mainExt,
                srcset: isResponsive ? nodeSrcset : null,
                sizes: isResponsive ? nodeSizes : null,
                cssWidth: u.cssWidth,
                cssHeight: u.cssHeight,
                targetWidth: target2xW,
                targetHeight: target2xH
            });
        }

        // Store in processedImages registry
        processedImages.set(hashHex, {
            buffer: mainBuffer,
            mime: mainMime,
            ext: mainExt,
            base64: mainBase64,
            mainFileName,
            srcset: isResponsive ? primarySrcset : null,
            sizes: isResponsive ? primarySizes : null,
            variants: primaryVariants,
            cssWidth: primaryWidth,
            cssHeight: primaryHeight,
            targetWidth: target2xW,
            targetHeight: target2xH
        });
    }

    const filesToWrite = Array.from(filesToWriteMap.entries()).map(([fileName, buffer]) => ({
        fileName,
        buffer
    }));

    return {
        processedImages,
        nodeImageMap,
        filesToWrite,
        stats: {
            totalBeforeBytes,
            totalAfterBytes,
            optimizedCount
        }
    };
}

module.exports = {
    collectImageUsages,
    calculateDeviceWidths,
    optimizeBuffer,
    optimizeAllImages,
    bakeMasksIntoImages,
    bakeImageFillsAndFilters,
    bakeGraphicChainAsset,
    bakeAndCollapseGraphicChains
};
