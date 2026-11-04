// src/parsers/images.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { renderSvgToPng } = require('./svg');

/**
 * Extracts width and height from common image formats (PNG, JPEG, GIF, WebP, SVG)
 */
function getImageDimensions(buffer) {
    if (!buffer || buffer.length < 8) return null;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return {
            width: buffer.readUInt32BE(16),
            height: buffer.readUInt32BE(20)
        };
    }

    // GIF: "GIF87a" or "GIF89a"
    if (buffer.length >= 10 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return {
            width: buffer.readUInt16LE(6),
            height: buffer.readUInt16LE(8)
        };
    }

    // JPEG: FF D8 FF
    if (buffer.length >= 4 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
        let offset = 2;
        while (offset < buffer.length) {
            if (buffer[offset] !== 0xFF) break;
            const marker = buffer[offset + 1];
            // SOF markers: 0xC0 to 0xC3, 0xC5 to 0xC7, 0xC9 to 0xCB, 0xCD to 0xCF
            if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) ||
                (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
                if (offset + 9 <= buffer.length) {
                    return {
                        height: buffer.readUInt16BE(offset + 5),
                        width: buffer.readUInt16BE(offset + 7)
                    };
                }
            }
            const length = buffer.readUInt16BE(offset + 2);
            offset += 2 + length;
        }
    }

    // WebP: RIFF ... WEBP
    if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
        const vp8Type = buffer.toString('ascii', 12, 16);
        if (vp8Type === 'VP8 ' && buffer.length >= 30) {
            return {
                width: buffer.readUInt16LE(26) & 0x3fff,
                height: buffer.readUInt16LE(28) & 0x3fff
            };
        }
        if (vp8Type === 'VP8L' && buffer.length >= 25) {
            const b1 = buffer[21], b2 = buffer[22], b3 = buffer[23], b4 = buffer[24];
            return {
                width: 1 + (((b2 & 0x3f) << 8) | b1),
                height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6))
            };
        }
    }

    // SVG: check text for width/height or viewBox
    const textStart = buffer.slice(0, 1024).toString('utf8');
    if (textStart.includes('<svg')) {
        const vbMatch = textStart.match(/viewBox\s*=\s*["']([\d.\s,-]+)["']/i);
        if (vbMatch) {
            const parts = vbMatch[1].trim().split(/[\s,]+/).map(parseFloat);
            if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
                return { width: Math.round(parts[2]), height: Math.round(parts[3]) };
            }
        }
        const wMatch = textStart.match(/width\s*=\s*["']([\d.]+)(?:px)?["']/i);
        const hMatch = textStart.match(/height\s*=\s*["']([\d.]+)(?:px)?["']/i);
        if (wMatch && hMatch) {
            return { width: parseFloat(wMatch[1]), height: parseFloat(hMatch[1]) };
        }
    }

    return null;
}

/**
 * Creates a 1x1 transparent PNG buffer fallback
 */
function createFallbackImage() {
    return Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
    );
}

class ImageRegistry {
    constructor(options = {}) {
        this.baseDir = options.baseDir || process.cwd();
        this.allowRemote = options.allowRemote !== false;
        this.images = new Map(); // sha1Hex -> Buffer
        this.sourceCache = new Map(); // srcKey -> { sha1Hex, sha1Buffer, width, height }
    }

    registerBuffer(buffer, name = 'image', targetWidth = 100) {
        if (!buffer || buffer.length === 0) {
            buffer = createFallbackImage();
        }

        // If buffer is SVG XML, rasterize it to high-res PNG for native Figma rendering
        const headerText = buffer.slice(0, 100).toString('utf8').trim();
        if (headerText.startsWith('<svg') || headerText.includes('<?xml') || headerText.includes('<svg')) {
            const pngBuf = renderSvgToPng(buffer.toString('utf8'), targetWidth);
            if (pngBuf) {
                buffer = pngBuf;
            }
        }

        const sha1 = crypto.createHash('sha1').update(buffer).digest();
        const sha1Hex = sha1.toString('hex');

        if (!this.images.has(sha1Hex)) {
            this.images.set(sha1Hex, buffer);
        }

        const dims = getImageDimensions(buffer) || { width: 300, height: 200 };

        return {
            sha1Hex,
            sha1Buffer: new Uint8Array(sha1),
            width: dims.width,
            height: dims.height,
            name
        };
    }

    async resolveImage(src, name = 'image', targetWidth = 200) {
        if (!src) return null;
        const cleanSrc = src.trim();

        if (this.sourceCache.has(cleanSrc)) {
            return this.sourceCache.get(cleanSrc);
        }

        let buffer = null;

        // 1. Data URI
        if (cleanSrc.startsWith('data:')) {
            const commaIdx = cleanSrc.indexOf(',');
            if (commaIdx !== -1) {
                const meta = cleanSrc.slice(0, commaIdx);
                const data = cleanSrc.slice(commaIdx + 1);

                if (meta.includes(';base64')) {
                    buffer = Buffer.from(data, 'base64');
                } else {
                    buffer = Buffer.from(decodeURIComponent(data), 'utf8');
                }
            }
        }
        // 2. Remote URL (http / https)
        else if (cleanSrc.startsWith('http://') || cleanSrc.startsWith('https://')) {
            if (this.allowRemote && typeof fetch === 'function') {
                try {
                    const res = await fetch(cleanSrc, { signal: AbortSignal.timeout(5000) });
                    if (res.ok) {
                        const arrayBuf = await res.arrayBuffer();
                        buffer = Buffer.from(arrayBuf);
                    }
                } catch (e) {
                    console.warn(`[WARN] Failed to fetch remote image "${cleanSrc}": ${e.message}`);
                }
            }
        }
        // 3. Local file path
        else {
            const localPath = path.isAbsolute(cleanSrc)
                ? cleanSrc
                : path.resolve(this.baseDir, cleanSrc);

            if (fs.existsSync(localPath)) {
                try {
                    buffer = fs.readFileSync(localPath);
                } catch (e) {
                    console.warn(`[WARN] Failed to read local image "${localPath}": ${e.message}`);
                }
            }
        }

        if (!buffer) {
            buffer = createFallbackImage();
        }

        const registered = this.registerBuffer(buffer, name, targetWidth);
        this.sourceCache.set(cleanSrc, registered);
        return registered;
    }

    createImagePaint(registeredImage, scaleMode = 'FILL', opacity = 1.0) {
        return {
            type: 'IMAGE',
            opacity: opacity,
            visible: true,
            blendMode: 'NORMAL',
            image: {
                hash: registeredImage.sha1Buffer,
                name: registeredImage.name
            },
            imageScaleMode: scaleMode,
            transform: {
                m00: 1, m01: 0, m02: 0,
                m10: 0, m11: 1, m12: 0
            }
        };
    }

    getAllImages() {
        return this.images;
    }
}

module.exports = {
    ImageRegistry,
    getImageDimensions,
    createFallbackImage
};
