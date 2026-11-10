// src/parsers/images.js
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import dns from 'node:dns/promises';
import { renderSvgToPng } from './svg.js';

/**
 * Checks if a target file path resides strictly inside a base directory to prevent Path Traversal,
 * resolving real disk paths via fs.realpathSync to prevent symlink bypass.
 * @param {string} targetPath
 * @param {string} baseDir
 * @returns {boolean}
 */
export function isPathInsideBaseDir(targetPath, baseDir) {
    if (!targetPath || !baseDir) return false;
    try {
        const canonicalBase = fs.existsSync(baseDir)
            ? fs.realpathSync(path.resolve(baseDir))
            : path.resolve(baseDir);
        const absTarget = path.isAbsolute(targetPath)
            ? path.resolve(targetPath)
            : path.resolve(canonicalBase, targetPath);

        let canonicalTarget = absTarget;
        if (fs.existsSync(absTarget)) {
            canonicalTarget = fs.realpathSync(absTarget);
        } else {
            // If target does not exist on disk, check closest existing directory ancestor to resolve symlinks
            let current = path.dirname(absTarget);
            let suffix = path.basename(absTarget);
            while (current && current !== path.dirname(current)) {
                if (fs.existsSync(current)) {
                    canonicalTarget = path.join(fs.realpathSync(current), suffix);
                    break;
                }
                suffix = path.join(path.basename(current), suffix);
                current = path.dirname(current);
            }
        }

        const rel = path.relative(canonicalBase, canonicalTarget);
        return !rel.startsWith('..') && !path.isAbsolute(rel);
    } catch {
        return false;
    }
}

/**
 * Parses dotted-quad IPv4 string into 32-bit unsigned integer
 * @param {string} ipStr
 * @returns {number|null}
 */
function parseIpv4Int(ipStr) {
    const parts = ipStr.split('.').map(p => Number(p));
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
    return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

/**
 * Checks if a hostname or IP address resolves to private, loopback, or cloud metadata ranges (SSRF protection)
 * @param {string} hostname
 * @returns {boolean}
 */
export function isPrivateOrRestrictedHost(hostname) {
    if (!hostname || typeof hostname !== 'string') return true;
    const clean = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');

    // 1. Localhost and local domain names
    if (clean === 'localhost' || clean.endsWith('.localhost') || clean.endsWith('.local') || clean.endsWith('.internal')) {
        return true;
    }

    // 1b. nip.io and sslip.io mapping to private IPs
    const nipMatch = clean.match(/(?:^|\.)((?:\d{1,3}\.){3}\d{1,3})\.(?:nip|sslip)\.io$/);
    if (nipMatch) {
        if (isPrivateOrRestrictedHost(nipMatch[1])) return true;
    }
    const dashedMatch = clean.match(/(?:^|\.)(\d{1,3})-(\d{1,3})-(\d{1,3})-(\d{1,3})\.(?:nip|sslip)\.io$/);
    if (dashedMatch) {
        const reconstructed = `${dashedMatch[1]}.${dashedMatch[2]}.${dashedMatch[3]}.${dashedMatch[4]}`;
        if (isPrivateOrRestrictedHost(reconstructed)) return true;
    }

    // 2. Numeric/hex/octal integer IP representations (e.g. 2130706433 or 0x7f000001)
    if (/^\d+$/.test(clean) || /^0x[0-9a-fA-F]+$/i.test(clean)) {
        return true;
    }

    const ipFamily = net.isIP(clean);

    // 3. IPv4 range checks
    if (ipFamily === 4) {
        const ipInt = parseIpv4Int(clean);
        if (ipInt === null) return true;

        // 0.0.0.0/8 (current network)
        if ((ipInt >>> 24) === 0) return true;
        // 127.0.0.0/8 (loopback)
        if ((ipInt >>> 24) === 127) return true;
        // 10.0.0.0/8 (private)
        if ((ipInt >>> 24) === 10) return true;
        // 172.16.0.0/12 (private: 172.16.0.0 - 172.31.255.255)
        if ((ipInt >>> 20) === ((172 << 4) | 1)) return true;
        // 192.168.0.0/16 (private)
        if ((ipInt >>> 16) === ((192 << 8) | 168)) return true;
        // 169.254.0.0/16 (link-local, AWS/GCP cloud metadata 169.254.169.254)
        if ((ipInt >>> 16) === ((169 << 8) | 254)) return true;
        // 100.64.0.0/10 (carrier-grade NAT)
        if ((ipInt >>> 22) === ((100 << 4) | 1)) return true;
        // 224.0.0.0/4 (multicast) & 240.0.0.0/4 (reserved)
        if ((ipInt >>> 28) >= 14) return true;
        // 255.255.255.255 (broadcast)
        if (ipInt === 0xFFFFFFFF) return true;

        return false;
    }

    // 4. IPv6 range checks
    if (ipFamily === 6) {
        // ::1 (loopback), :: (unspecified)
        if (clean === '::1' || clean === '::' || clean === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
        // fe80::/10 (link-local)
        if (/^fe[89ab]/i.test(clean)) return true;
        // fc00::/7 (unique local address)
        if (/^f[cd]/i.test(clean)) return true;
        // IPv4-mapped IPv6 (::ffff:127.0.0.1)
        if (clean.includes('::ffff:')) {
            const mapped = clean.split('::ffff:')[1];
            if (mapped && net.isIPv4(mapped)) {
                return isPrivateOrRestrictedHost(mapped);
            }
        }
        return false;
    }

    return false;
}

/**
 * Verifies magic bytes signature of common image formats (PNG, JPEG, GIF, WebP, SVG, AVIF, BMP)
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function isValidImageMagicBytes(buffer) {
    if (!buffer || buffer.length < 4) return false;

    // PNG: 89 50 4E 47
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return true;
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return true;
    }

    // GIF: "GIF8" (47 49 46 38)
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return true;
    }

    // WebP: RIFF .... WEBP
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
        return true;
    }

    // BMP: "BM" (42 4D)
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
        return true;
    }

    // AVIF: ....ftypavif or avis
    if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp' &&
        (buffer.toString('ascii', 8, 12) === 'avif' || buffer.toString('ascii', 8, 12) === 'avis')) {
        return true;
    }

    // SVG: XML text containing <svg
    const headText = buffer.slice(0, Math.min(buffer.length, 1024)).toString('utf8');
    if (headText.includes('<svg')) {
        return true;
    }

    return false;
}

/**
 * Asynchronously checks if a domain name resolves to any restricted or private IP addresses
 * @param {string} hostname
 * @returns {Promise<boolean>}
 */
export async function isRestrictedOrPrivateDomain(hostname) {
    if (!hostname || typeof hostname !== 'string') return true;
    const clean = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (isPrivateOrRestrictedHost(clean)) return true;
    if (net.isIP(clean)) return isPrivateOrRestrictedHost(clean);

    try {
        const addresses = await dns.lookup(clean, { all: true });
        if (!addresses || addresses.length === 0) return true;
        for (const addr of addresses) {
            if (isPrivateOrRestrictedHost(addr.address)) {
                return true;
            }
        }
        return false;
    } catch {
        return true;
    }
}

/**
 * Extracts width and height from common image formats (PNG, JPEG, GIF, WebP, SVG)
 */
export function getImageDimensions(buffer) {
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
export function createFallbackImage() {
    return Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
    );
}

export class ImageRegistry {
    constructor(options = {}) {
        this.baseDir = options.baseDir || process.cwd();
        this.allowRemote = options.allowRemote !== false;
        this.allowExternalPaths = options.allowExternalPaths === true;
        this.allowPrivateHosts = options.allowPrivateHosts === true;
        this.allowedDomains = Array.isArray(options.allowedDomains)
            ? options.allowedDomains.map(d => d.trim().toLowerCase())
            : null;
        this.maxImageSize = options.maxImageSize || 15 * 1024 * 1024; // 15MB default limit
        this.images = new Map(); // sha1Hex -> Buffer
        this.sourceCache = new Map(); // srcKey -> { sha1Hex, sha1Buffer, width, height }
    }

    registerBuffer(buffer, name = 'image', targetWidth = 100) {
        if (!buffer || buffer.length === 0) {
            buffer = createFallbackImage();
        }

        // If buffer is SVG XML, rasterize it to high-res PNG for native Figma rendering
        const headerText = buffer.slice(0, Math.min(buffer.length, 1024)).toString('utf8').trim();
        const isSvg = headerText.includes('<svg') || headerText.includes('<?xml');
        if (isSvg) {
            const pngBuf = renderSvgToPng(buffer.toString('utf8'), targetWidth);
            if (pngBuf) {
                buffer = pngBuf;
            }
        }

        let dims = getImageDimensions(buffer);

        // Security check: if buffer is not recognized as a valid image format,
        // do NOT register the unknown/sensitive buffer into this.images to prevent data exfiltration
        if (!dims) {
            console.warn(`[WARN] Unrecognized or invalid image format for "${name}". Using fallback image to prevent data leakage.`);
            buffer = createFallbackImage();
            dims = getImageDimensions(buffer) || { width: 1, height: 1 };
        }

        const sha1 = crypto.createHash('sha1').update(buffer).digest();
        const sha1Hex = sha1.toString('hex');

        if (!this.images.has(sha1Hex)) {
            this.images.set(sha1Hex, buffer);
        }

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

                if (!isValidImageMagicBytes(buffer)) {
                    console.warn(`[WARN] Data URI for "${name}" failed magic bytes validation. Replacing with fallback.`);
                    buffer = null;
                }
            }
        }
        // 2. Remote URL (http / https) with SSRF & private host protection
        else if (cleanSrc.startsWith('http://') || cleanSrc.startsWith('https://')) {
            if (this.allowRemote && typeof fetch === 'function') {
                try {
                    const parsedUrl = new URL(cleanSrc);
                    const hostname = parsedUrl.hostname.toLowerCase();

                    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                        console.warn(`[WARN] Blocked unsupported URL protocol "${parsedUrl.protocol}" for image "${cleanSrc}".`);
                    } else if (this.allowedDomains && this.allowedDomains.length > 0 && !this.allowedDomains.some(d => d === hostname || hostname.endsWith('.' + d))) {
                        console.warn(`[WARN] Blocked remote image "${cleanSrc}": domain "${hostname}" is not in allowedDomains list.`);
                    } else if (!this.allowPrivateHosts && isPrivateOrRestrictedHost(hostname)) {
                        console.warn(`[WARN] Blocked remote image "${cleanSrc}": resolved to private, local, or restricted host.`);
                    } else {
                        let isBlocked = false;
                        if (!this.allowPrivateHosts && !net.isIP(hostname)) {
                            // Perform DNS lookup to prevent DNS rebind / private IP domain resolution (e.g. nip.io)
                            try {
                                const addresses = await dns.lookup(hostname, { all: true });
                                if (!addresses || addresses.length === 0) {
                                    console.warn(`[WARN] Blocked remote image "${cleanSrc}": DNS lookup returned no addresses.`);
                                    isBlocked = true;
                                } else {
                                    for (const addr of addresses) {
                                        if (isPrivateOrRestrictedHost(addr.address)) {
                                            console.warn(`[WARN] Blocked remote image "${cleanSrc}": host "${hostname}" resolved to restricted IP "${addr.address}".`);
                                            isBlocked = true;
                                            break;
                                        }
                                    }
                                }
                            } catch (dnsErr) {
                                console.warn(`[WARN] DNS resolution failed for "${hostname}": ${dnsErr.message}`);
                                isBlocked = true;
                            }
                        }

                        if (!isBlocked) {
                            const res = await fetch(cleanSrc, {
                                signal: AbortSignal.timeout(5000),
                                redirect: 'error'
                            });

                            if (res.ok) {
                                // Content-Type validation
                                const rawCt = (res.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
                                const allowedMimes = [
                                    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
                                    'image/svg+xml', 'image/avif', 'image/x-icon', 'image/vnd.microsoft.icon'
                                ];
                                if (rawCt && !allowedMimes.includes(rawCt)) {
                                    throw new Error(`Invalid or disallowed image Content-Type "${rawCt}"`);
                                }

                                // Stream reading with size limit (DoS / Memory Bomb prevention)
                                const maxBytes = this.maxImageSize;
                                const clStr = res.headers.get('content-length');
                                if (clStr) {
                                    const cl = parseInt(clStr, 10);
                                    if (!isNaN(cl) && cl > maxBytes) {
                                        throw new Error(`Content-Length ${cl} exceeds maximum limit of ${maxBytes} bytes`);
                                    }
                                }

                                if (res.body && typeof res.body.getReader === 'function') {
                                    const reader = res.body.getReader();
                                    const chunks = [];
                                    let totalBytes = 0;
                                    try {
                                        while (true) {
                                            const { done, value } = await reader.read();
                                            if (done) break;
                                            if (value) {
                                                totalBytes += value.length;
                                                if (totalBytes > maxBytes) {
                                                    await reader.cancel('Max image size exceeded');
                                                    throw new Error(`Image size exceeded maximum allowed limit of ${maxBytes} bytes`);
                                                }
                                                chunks.push(value);
                                            }
                                        }
                                    } catch (streamErr) {
                                        try { await reader.cancel(); } catch (_) {}
                                        throw streamErr;
                                    }
                                    buffer = Buffer.concat(chunks);
                                } else {
                                    const arrayBuf = await res.arrayBuffer();
                                    if (arrayBuf.byteLength > maxBytes) {
                                        throw new Error(`Image size ${arrayBuf.byteLength} exceeds maximum limit of ${maxBytes} bytes`);
                                    }
                                    buffer = Buffer.from(arrayBuf);
                                }

                                // Validate magic bytes
                                if (!isValidImageMagicBytes(buffer)) {
                                    throw new Error(`Downloaded buffer for "${cleanSrc}" failed magic bytes validation`);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[WARN] Failed to fetch remote image "${cleanSrc}": ${e.message}`);
                }
            }
        }
        // 3. Local file path with Path Traversal protection
        else {
            const localPath = path.isAbsolute(cleanSrc)
                ? cleanSrc
                : path.resolve(this.baseDir, cleanSrc);

            if (!this.allowExternalPaths && !isPathInsideBaseDir(localPath, this.baseDir)) {
                console.warn(`[WARN] Blocked reading local image "${cleanSrc}": path traverses outside baseDir "${this.baseDir}".`);
            } else if (fs.existsSync(localPath)) {
                try {
                    buffer = fs.readFileSync(localPath);
                    if (!isValidImageMagicBytes(buffer)) {
                        console.warn(`[WARN] Local file "${localPath}" failed magic bytes validation. Replacing with fallback.`);
                        buffer = null;
                    }
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
