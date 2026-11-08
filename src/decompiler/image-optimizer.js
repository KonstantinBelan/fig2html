// src/decompiler/image-optimizer.js
import crypto from 'node:crypto';
import sharp from 'sharp';
import { getExtensionForMime, getLinearGradientAngle, hasExplicitMaskTag } from './css/index.js';
import {
    findAllGraphicChains,
    collapseGraphicSubtree,
    multiplyAffineMatrices,
    decomposeAffineMatrix,
    identityMatrix
} from './graphic-collapser.js';

/**
 * Traverses root nodes to find all image fills and their target CSS dimensions
 * @param {Array<object>} rootNodes
 * @returns {Array<{ node: object, hashHex: string, scaleMode: string, cssWidth: number, cssHeight: number, isImgElement: boolean }>}
 */
export function collectImageUsages(rootNodes) {
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
export function calculateDeviceWidths(cssWidth, scaleMultiplier = 2) {
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
export async function optimizeBuffer(inputBuffer, options = {}) {
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
 * Computes SVG <linearGradient> x1, y1, x2, y2 coordinates in objectBoundingBox space [0..1]
 * from a Figma 2x3 gradient transform matrix so that scale, offset, and rotation are preserved.
 * @param {object} transform
 * @returns {{ x1: number, y1: number, x2: number, y2: number }}
 */
function getSvgLinearGradientCoords(transform) {
    if (!transform) return { x1: 0, y1: 0, x2: 0, y2: 1 };
    const m00 = transform.m00 ?? 1;
    const m01 = transform.m01 ?? 0;
    const m02 = transform.m02 ?? 0;
    const l2 = m00 * m00 + m01 * m01;
    if (l2 < 1e-6) return { x1: 0, y1: 0, x2: 0, y2: 1 };
    return {
        x1: Math.round(((-m02 * m00) / l2) * 10000) / 10000,
        y1: Math.round(((-m02 * m01) / l2) * 10000) / 10000,
        x2: Math.round((((1 - m02) * m00) / l2) * 10000) / 10000,
        y2: Math.round((((1 - m02) * m01) / l2) * 10000) / 10000
    };
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
    const { x1, y1, x2, y2 } = getSvgLinearGradientCoords(fill.transform);
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
        `<defs><linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
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
export async function bakeImageFillsAndFilters(rawImages, rootNodes, options = {}) {
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
 * Generates an SVG alpha mask buffer for a Figma mask node
 * @param {object} maskChild
 * @param {number} w
 * @param {number} h
 * @param {number} [scaleMultiplier=2]
 * @returns {Buffer|null}
 */
function generateMaskSvg(maskChild, w, h, scaleMultiplier = 2) {
    if (!maskChild) return null;

    const radPaint = maskChild.fillPaints?.find(f => f.type === 'GRADIENT_RADIAL' && f.visible !== false);
    if (radPaint && radPaint.stops && radPaint.stops.length >= 2) {
        const stopsXml = radPaint.stops.map(s => {
            const pct = Math.round((s.position !== undefined ? s.position : 0) * 1000) / 10;
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
        const { x1, y1, x2, y2 } = getSvgLinearGradientCoords(linPaint.transform);
        const stopsXml = linPaint.stops.map(s => {
            const pct = Math.round((s.position !== undefined ? s.position : 0) * 1000) / 10;
            const a = s.color?.a !== undefined ? s.color.a : 1;
            const op = Math.round(a * (linPaint.opacity ?? 1) * 1000) / 1000;
            return `<stop offset="${pct}%" stop-color="white" stop-opacity="${op}" />`;
        }).join('\n');

        return Buffer.from(
            `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">` +
            `<defs><linearGradient id="m" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
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

/**
 * Detects mask containers without explicit [mask] / [маска] tag and bakes the mask into the image
 * using Sharp compositing (blend: 'dest-in'), producing a clean PNG with transparent alpha.
 *
 * @param {Map<string, { buffer: Buffer, mime: string }>} rawImages
 * @param {Array<object>} rootNodes
 * @param {object} [options={}]
 */
export async function bakeMasksIntoImages(rawImages, rootNodes, options = {}) {
    const imageCount = typeof rawImages?.size === 'number' ? rawImages.size : (rawImages ? Object.keys(rawImages).length : 0);
    if (!rawImages || imageCount === 0 || !Array.isArray(rootNodes) || rootNodes.length === 0) {
        return 0;
    }

    let bakedCount = 0;
    const scaleMultiplier = typeof options.imageScale === 'number' && options.imageScale > 0 ? options.imageScale : 2;

    // Collect nodes belonging to collapsible graphic chains so we don't prematurely
    // center-crop their offset/rotated leaf images before bakeGraphicChainAsset runs.
    const graphicChainNodes = new Set();
    const graphicChains = findAllGraphicChains(rootNodes);
    function markSubtree(n) {
        if (!n || graphicChainNodes.has(n)) return;
        graphicChainNodes.add(n);
        if (Array.isArray(n.children)) {
            for (const c of n.children) markSubtree(c);
        }
    }
    for (const gc of graphicChains) {
        markSubtree(gc.rootNode);
    }

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
        if (graphicChainNodes.has(container)) continue;
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
                    const svgBuf = generateMaskSvg(maskChild, targetW, targetH, scaleMultiplier);
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
 * Bakes MULTIPLY blendMode images with solid/near-white backgrounds into true alpha transparency.
 * This ensures raster logos (e.g. JPEGs on white) render seamlessly with transparent backgrounds
 * even when placed inside containers with opacity/overflow that isolate CSS stacking contexts.
 *
 * @param {Map<string, { buffer: Buffer, mime: string }>|object} rawImages
 * @param {Array<object>} rootNodes
 * @param {object} [options={}]
 * @returns {Promise<number>} Count of baked multiply image nodes
 */
export async function bakeMultiplyImages(rawImages, rootNodes, options = {}) {
    const imageCount = typeof rawImages?.size === 'number' ? rawImages.size : (rawImages ? Object.keys(rawImages).length : 0);
    if (!rawImages || imageCount === 0 || !Array.isArray(rootNodes) || rootNodes.length === 0) {
        return 0;
    }

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

    const candidates = [];
    function traverse(node) {
        if (!node || node.visible === false) return;
        const hasMultiply = node.blendMode === 'MULTIPLY' || (Array.isArray(node.fillPaints) && node.fillPaints.some(f => f.visible !== false && f.blendMode === 'MULTIPLY'));
        if (hasMultiply && Array.isArray(node.fillPaints)) {
            const imgPaint = node.fillPaints.find(f => f.type === 'IMAGE' && f.image?.hash && f.visible !== false);
            if (imgPaint) {
                candidates.push({ node, imgPaint });
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

    if (candidates.length === 0) return 0;

    let bakedCount = 0;
    const bakedCache = new Map(); // rawHash -> bakedHashHex

    for (const { node, imgPaint } of candidates) {
        const rawHash = (typeof imgPaint.image.hash === 'string')
            ? imgPaint.image.hash.toLowerCase()
            : Buffer.from(imgPaint.image.hash).toString('hex').toLowerCase();

        if (bakedCache.has(rawHash)) {
            const bakedHashHex = bakedCache.get(rawHash);
            imgPaint.image.hash = Buffer.isBuffer(imgPaint.image.hash) || typeof imgPaint.image.hash === 'object'
                ? Buffer.from(bakedHashHex, 'hex')
                : bakedHashHex;
            node.isMultiplyBaked = true;
            bakedCount++;
            continue;
        }

        const rawItem = getRawImage(rawHash);
        if (!rawItem?.buffer) continue;

        try {
            const img = sharp(rawItem.buffer);
            const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
            const { width, height, channels } = info;

            // Check if image has light/white background (corners check)
            const checkPixelBrightness = (x, y) => {
                const idx = (y * width + x) * channels;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                return (r + g + b) / 3;
            };

            const corners = [
                checkPixelBrightness(0, 0),
                checkPixelBrightness(width - 1, 0),
                checkPixelBrightness(0, height - 1),
                checkPixelBrightness(width - 1, height - 1)
            ];
            const avgCornerBrightness = corners.reduce((a, b) => a + b, 0) / 4;

            // Only bake if corners are light (>= 220), indicating a white/light canvas background intended for Multiply
            if (avgCornerBrightness < 220) {
                continue;
            }

            const outData = Buffer.alloc(width * height * 4);
            for (let i = 0; i < width * height; i++) {
                const srcOffset = i * channels;
                const dstOffset = i * 4;
                const r = data[srcOffset];
                const g = data[srcOffset + 1];
                const b = data[srcOffset + 2];
                const origA = channels === 4 ? data[srcOffset + 3] : 255;

                const minVal = Math.min(r, g, b);
                const whitenessAlpha = 255 - minVal;
                const alpha = Math.round((origA / 255) * whitenessAlpha);

                if (alpha <= 0) {
                    outData[dstOffset] = 0;
                    outData[dstOffset + 1] = 0;
                    outData[dstOffset + 2] = 0;
                    outData[dstOffset + 3] = 0;
                } else {
                    const aNorm = alpha / 255;
                    const newR = Math.max(0, Math.min(255, Math.round(255 - (255 - r) / aNorm)));
                    const newG = Math.max(0, Math.min(255, Math.round(255 - (255 - g) / aNorm)));
                    const newB = Math.max(0, Math.min(255, Math.round(255 - (255 - b) / aNorm)));

                    outData[dstOffset] = newR;
                    outData[dstOffset + 1] = newG;
                    outData[dstOffset + 2] = newB;
                    outData[dstOffset + 3] = alpha;
                }
            }

            const bakedBuf = await sharp(outData, {
                raw: { width, height, channels: 4 }
            }).png().toBuffer();

            const bakedHashHex = crypto.createHash('sha1').update(bakedBuf).digest('hex');
            setRawImage(bakedHashHex, { buffer: bakedBuf, mime: 'image/png' });
            bakedCache.set(rawHash, bakedHashHex);

            imgPaint.image.hash = Buffer.isBuffer(imgPaint.image.hash) || typeof imgPaint.image.hash === 'object'
                ? Buffer.from(bakedHashHex, 'hex')
                : bakedHashHex;
            node.isMultiplyBaked = true;
            bakedCount++;
        } catch (err) {
            // Ignore sharp errors on corrupt image
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
export async function bakeGraphicChainAsset(chainInfo, rawImages, options = {}) {
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

    // Find the node in the chain that introduces rotation (if any)
    let rotIndex = -1;
    if (Array.isArray(chainInfo.chain)) {
        for (let j = 0; j < chainInfo.chain.length; j++) {
            const m = chainInfo.chain[j].transform;
            if (m && (Math.abs(m.m01 || 0) > 0.001 || Math.abs(m.m10 || 0) > 0.001)) {
                rotIndex = j;
                break;
            }
        }
    }
    if (rotIndex === -1 && Array.isArray(chainInfo.chain) && chainInfo.chain.length > 0) {
        rotIndex = chainInfo.chain.length - 1;
    }

    const rotNode = (rotIndex >= 0 && chainInfo.chain) ? chainInfo.chain[rotIndex] : chainInfo.leaf;
    const leafNode = chainInfo.leaf;

    // Outer transform: from root down to rotNode
    let mToRot = identityMatrix();
    if (Array.isArray(chainInfo.chain)) {
        for (let j = 0; j <= rotIndex; j++) {
            mToRot = multiplyAffineMatrices(mToRot, chainInfo.chain[j].transform);
        }
    }

    // Inner transform: from rotNode down to leaf
    let mInner = identityMatrix();
    if (Array.isArray(chainInfo.chain)) {
        for (let j = rotIndex + 1; j < chainInfo.chain.length; j++) {
            mInner = multiplyAffineMatrices(mInner, chainInfo.chain[j].transform);
        }
    }

    const decompOuter = decomposeAffineMatrix(mToRot);
    const decompInner = decomposeAffineMatrix(mInner);

    const W = rotNode.size?.x || leafNode.size?.x || chainInfo.canvasWidth;
    const H = rotNode.size?.y || leafNode.size?.y || chainInfo.canvasHeight;

    // 4 corners of the rotated unit in root canvas coordinates
    const corners = [
        { x: 0, y: 0 },
        { x: W, y: 0 },
        { x: W, y: H },
        { x: 0, y: H }
    ].map(p => ({
        x: mToRot.m00 * p.x + mToRot.m01 * p.y + mToRot.m02,
        y: mToRot.m10 * p.x + mToRot.m11 * p.y + mToRot.m12
    }));

    const xMin = Math.min(...corners.map(c => c.x));
    const yMin = Math.min(...corners.map(c => c.y));

    const wRotUnit = Math.max(1, Math.round(W * scaleMultiplier));
    const hRotUnit = Math.max(1, Math.round(H * scaleMultiplier));

    const wLeaf = Math.max(1, Math.round((leafNode.size?.x || W) * (decompInner.scaleX || 1) * scaleMultiplier));
    const hLeaf = Math.max(1, Math.round((leafNode.size?.y || H) * (decompInner.scaleY || 1) * scaleMultiplier));

    const xInner = Math.round((mInner.m02 || 0) * scaleMultiplier);
    const yInner = Math.round((mInner.m12 || 0) * scaleMultiplier);

    let resizedLeaf;
    try {
        resizedLeaf = await sharp(rawItem.buffer)
            .resize(wLeaf, hLeaf, { fit: 'cover' })
            .ensureAlpha()
            .toBuffer();
    } catch (err) {
        return null;
    }

    // Composite leaf inside rotNode canvas
    const leftCrop = Math.max(0, -xInner);
    const topCrop = Math.max(0, -yInner);
    const extractW = Math.min(wLeaf - leftCrop, wRotUnit - Math.max(0, xInner));
    const extractH = Math.min(hLeaf - topCrop, hRotUnit - Math.max(0, yInner));

    let rotUnitCanvas;
    if (extractW <= 0 || extractH <= 0) {
        rotUnitCanvas = await sharp({
            create: { width: wRotUnit, height: hRotUnit, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
        }).png().toBuffer();
    } else {
        const croppedLeaf = await sharp(resizedLeaf).extract({
            left: leftCrop,
            top: topCrop,
            width: extractW,
            height: extractH
        }).toBuffer();

        rotUnitCanvas = await sharp({
            create: { width: wRotUnit, height: hRotUnit, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
        }).composite([{
            input: croppedLeaf,
            left: Math.max(0, xInner),
            top: Math.max(0, yInner)
        }]).png().toBuffer();
    }

    // Apply any masks in chainInfo.masks onto rotUnitCanvas (in rotNode coordinate space)
    if (Array.isArray(chainInfo.masks) && chainInfo.masks.length > 0) {
        const maskLayers = [];
        for (const maskChild of chainInfo.masks) {
            if (!maskChild || maskChild.isMaskBaked) continue;
            try {
                let maskRasterBuf = null;
                const maskImgPaint = maskChild.fillPaints?.find(f => f.type === 'IMAGE' && f.image?.hash && f.visible !== false);
                if (maskImgPaint) {
                    const mHash = (typeof maskImgPaint.image.hash === 'string')
                        ? maskImgPaint.image.hash.toLowerCase()
                        : Buffer.from(maskImgPaint.image.hash).toString('hex').toLowerCase();
                    const mRaw = getRawImage(mHash);
                    if (mRaw?.buffer) {
                        maskRasterBuf = await sharp(mRaw.buffer)
                            .resize(wRotUnit, hRotUnit, { fit: 'cover' })
                            .ensureAlpha()
                            .toBuffer();
                    }
                } else {
                    const svgBuf = generateMaskSvg(maskChild, wRotUnit, hRotUnit, scaleMultiplier);
                    if (svgBuf) {
                        maskRasterBuf = await sharp(svgBuf).png().toBuffer();
                    }
                }
                if (maskRasterBuf) {
                    maskLayers.push({ input: maskRasterBuf, blend: 'dest-in' });
                }
            } catch (err) {
                // Ignore individual mask rasterization failure
            }
        }
        if (maskLayers.length > 0) {
            rotUnitCanvas = await sharp(rotUnitCanvas)
                .composite(maskLayers)
                .png()
                .toBuffer();
        }
    }

    // Rotate rotUnitCanvas with transparent background
    let rotated;
    try {
        rotated = await sharp(rotUnitCanvas)
            .rotate(decompOuter.rotateDeg || 0, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toBuffer();
    } catch (err) {
        return null;
    }

    const metaRot = await sharp(rotated).metadata().catch(() => null);
    if (!metaRot?.width || !metaRot?.height) return null;

    // Composite onto root canvas (canvasW x canvasH)
    const posX = Math.round(xMin * scaleMultiplier);
    const posY = Math.round(yMin * scaleMultiplier);

    const rTopCrop = Math.max(0, -posY);
    const rLeftCrop = Math.max(0, -posX);
    const rExtractW = Math.min(metaRot.width - rLeftCrop, canvasW - Math.max(0, posX));
    const rExtractH = Math.min(metaRot.height - rTopCrop, canvasH - Math.max(0, posY));

    let finalBuf;
    if (rExtractW <= 0 || rExtractH <= 0) {
        finalBuf = await sharp({
            create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
        }).png().toBuffer();
    } else {
        const rExtracted = await sharp(rotated).extract({
            left: rLeftCrop,
            top: rTopCrop,
            width: rExtractW,
            height: rExtractH
        }).toBuffer();

        finalBuf = await sharp({
            create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
        }).composite([{
            input: rExtracted,
            left: Math.max(0, posX),
            top: Math.max(0, posY)
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
export async function bakeAndCollapseGraphicChains(rawImages, rootNodes, options = {}) {
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
/**
 * Bakes Figma crop transforms (`imageScaleMode === 'STRETCH'` or non-identity `fill.transform`)
 * directly into cropped image assets before resizing or mask/filter baking.
 *
 * @param {Map<string, { buffer: Buffer, mime: string }>|object} rawImages
 * @param {Array<object>} rootNodes
 * @param {object} [options={}]
 * @returns {Promise<number>} Number of cropped image fills baked
 */
export async function bakeCroppedImages(rawImages, rootNodes, options = {}) {
    const imageCount = typeof rawImages?.size === 'number' ? rawImages.size : (rawImages ? Object.keys(rawImages).length : 0);
    if (!rawImages || imageCount === 0 || !Array.isArray(rootNodes) || rootNodes.length === 0) {
        return 0;
    }

    const getRaw = (k) => (typeof rawImages.get === 'function' ? rawImages.get(k) : rawImages[k]);
    const setRaw = (k, v) => {
        if (typeof rawImages.set === 'function') rawImages.set(k, v);
        else rawImages[k] = v;
    };

    const cropCache = new Map();
    let bakedCount = 0;

    async function walk(nodes) {
        for (const node of nodes) {
            if (!node || node.visible === false) continue;
            if (Array.isArray(node.fillPaints)) {
                for (const fill of node.fillPaints) {
                    if (!fill || fill.visible === false || fill.type !== 'IMAGE' || !fill.image?.hash) continue;
                    const t = fill.transform;
                    if (!t || typeof t.m00 !== 'number' || typeof t.m11 !== 'number') continue;

                    const m00 = t.m00;
                    const m01 = t.m01 || 0;
                    const m02 = t.m02 || 0;
                    const m10 = t.m10 || 0;
                    const m11 = t.m11;
                    const m12 = t.m12 || 0;

                    if (m00 <= 0.001 || m11 <= 0.001) continue;
                    if (Math.abs(m01) > 0.01 || Math.abs(m10) > 0.01) continue;

                    const isNonIdentityCrop =
                        Math.abs(m00 - 1) > 0.01 ||
                        Math.abs(m11 - 1) > 0.01 ||
                        Math.abs(m02) > 0.01 ||
                        Math.abs(m12) > 0.01;
                    if (!isNonIdentityCrop) continue;

                    const origHashHex = (typeof fill.image.hash === 'string')
                        ? fill.image.hash.toLowerCase()
                        : Buffer.from(fill.image.hash).toString('hex').toLowerCase();
                    const rawEntry = getRaw(origHashHex);
                    if (!rawEntry || !rawEntry.buffer) continue;

                    const cacheKey = `${origHashHex}:${m00.toFixed(4)}:${m02.toFixed(4)}:${m11.toFixed(4)}:${m12.toFixed(4)}`;
                    let newHashHex = cropCache.get(cacheKey);

                    if (!newHashHex) {
                        try {
                            const meta = await sharp(rawEntry.buffer).metadata();
                            const imgW = meta.width || fill.originalImageWidth || 0;
                            const imgH = meta.height || fill.originalImageHeight || 0;
                            if (imgW <= 0 || imgH <= 0) continue;

                            const rawLeft = Math.round(m02 * imgW);
                            const rawTop = Math.round(m12 * imgH);
                            const rawW = Math.max(1, Math.round(m00 * imgW));
                            const rawH = Math.max(1, Math.round(m11 * imgH));

                            const extractLeft = Math.max(0, Math.min(imgW - 1, rawLeft));
                            const extractTop = Math.max(0, Math.min(imgH - 1, rawTop));
                            const extractRight = Math.max(extractLeft + 1, Math.min(imgW, rawLeft + rawW));
                            const extractBottom = Math.max(extractTop + 1, Math.min(imgH, rawTop + rawH));
                            const extractW = extractRight - extractLeft;
                            const extractH = extractBottom - extractTop;

                            let croppedBuf;
                            if (rawLeft >= 0 && rawTop >= 0 && rawLeft + rawW <= imgW && rawTop + rawH <= imgH) {
                                croppedBuf = await sharp(rawEntry.buffer)
                                    .extract({ left: extractLeft, top: extractTop, width: extractW, height: extractH })
                                    .png()
                                    .toBuffer();
                            } else {
                                const partBuf = await sharp(rawEntry.buffer)
                                    .extract({ left: extractLeft, top: extractTop, width: extractW, height: extractH })
                                    .png()
                                    .toBuffer();
                                const dstLeft = Math.max(0, extractLeft - rawLeft);
                                const dstTop = Math.max(0, extractTop - rawTop);
                                croppedBuf = await sharp({
                                    create: {
                                        width: rawW,
                                        height: rawH,
                                        channels: 4,
                                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                                    }
                                })
                                    .composite([{ input: partBuf, left: dstLeft, top: dstTop }])
                                    .png()
                                    .toBuffer();
                            }

                            newHashHex = crypto.createHash('sha1').update(croppedBuf).digest('hex');
                            setRaw(newHashHex, {
                                buffer: croppedBuf,
                                mime: 'image/png',
                                ext: 'png',
                                base64: `data:image/png;base64,${croppedBuf.toString('base64')}`
                            });
                            cropCache.set(cacheKey, newHashHex);
                        } catch (_) {
                            continue;
                        }
                    }

                    if (newHashHex) {
                        fill.image.hash = Uint8Array.from(Buffer.from(newHashHex, 'hex'));
                        fill.imageScaleMode = 'FILL';
                        fill.transform = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
                        bakedCount++;
                    }
                }
            }
            if (Array.isArray(node.children) && node.children.length > 0) {
                await walk(node.children);
            }
        }
    }

    await walk(rootNodes);
    return bakedCount;
}

export async function optimizeAllImages(rawImages, rootNodes, options = {}) {
    const scaleMultiplier = typeof options.imageScale === 'number' && options.imageScale > 0 ? options.imageScale : 2;
    const isResponsive = options.responsiveImages !== false;
    const isLossless = Boolean(options.compress || options.lossless);
    const targetFormat = (options.imageFormat || options.format || 'original').toLowerCase().trim();
    const isInline = options.inlineImages !== false;
    const prefix = options.assetUrlPrefix || 'img/';

    // 0a. Bake stretched/cropped image transforms first so subsequent fill/mask/resize steps use the cropped region
    await bakeCroppedImages(rawImages, rootNodes, options);

    // 0. Bake fills & filters into images first
    await bakeImageFillsAndFilters(rawImages, rootNodes, options);

    // 0b. Bake masks into images if not explicitly tagged with [mask] / [маска]
    await bakeMasksIntoImages(rawImages, rootNodes, options);

    // 0c. Cumulative graphic subtree collapsing & baking
    await bakeAndCollapseGraphicChains(rawImages, rootNodes, options);

    // 0d. Bake MULTIPLY blendMode images into genuine alpha transparency
    await bakeMultiplyImages(rawImages, rootNodes, options);

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
