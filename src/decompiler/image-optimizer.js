// src/decompiler/image-optimizer.js
const crypto = require('crypto');
const sharp = require('sharp');
const { getExtensionForMime, getLinearGradientAngle, hasExplicitMaskTag } = require('./css');

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
                    const hashHex = Buffer.from(f.image.hash).toString('hex').toLowerCase();
                    const isMask = node.mask === true || node.isMask === true;
                    const isImg = (node.type === 'RECTANGLE' || node.type === 'ROUNDED_RECTANGLE') && (!node.children || node.children.length === 0) && !isMask;
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
            const targetHash = Buffer.isBuffer(targetPaint.image.hash)
                ? targetPaint.image.hash.toString('hex').toLowerCase()
                : String(targetPaint.image.hash).toLowerCase();
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
                    const mHash = Buffer.isBuffer(maskImgPaint.image.hash)
                        ? maskImgPaint.image.hash.toString('hex').toLowerCase()
                        : String(maskImgPaint.image.hash).toLowerCase();
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
                targetPaint.image.hash = Buffer.isBuffer(targetPaint.image.hash)
                    ? Buffer.from(bakedHashHex, 'hex')
                    : bakedHashHex;
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

    // 0. Bake masks into images if not explicitly tagged with [mask] / [маска]
    await bakeMasksIntoImages(rawImages, rootNodes, options);

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
    bakeMasksIntoImages
};
