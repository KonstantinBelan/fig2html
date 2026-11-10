// src/decompiler/reader.js
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { decodeFigKiwiCanvas } from '@open-pencil/kiwi/fig/parse';

/**
 * Detects MIME type of an image buffer based on magic bytes
 * @param {Buffer} buffer
 * @returns {string} MIME type
 */
export function getImageMimeType(buffer) {
    if (!buffer || buffer.length < 4) return 'image/png';

    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'image/png';
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'image/jpeg';
    }
    // GIF: 47 49 46
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return 'image/gif';
    }
    // WebP: RIFF ... WEBP
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
        return 'image/webp';
    }
    // AVIF: ....ftypavif or ....ftypavis
    if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp' && (buffer.toString('ascii', 8, 12) === 'avif' || buffer.toString('ascii', 8, 12) === 'avis')) {
        return 'image/avif';
    }
    // SVG
    const snippet = buffer.slice(0, 100).toString('utf8').trim().toLowerCase();
    if (snippet.startsWith('<svg') || snippet.includes('<?xml') || snippet.includes('<svg')) {
        return 'image/svg+xml';
    }

    return 'image/png';
}

/**
 * Reads a .fig binary file and extracts Kiwi nodes and embedded image blobs
 * @param {string|Buffer} figInput File path or buffer of the .fig archive
 * @returns {{ nodeChanges: Array<object>, blobs: Array<Buffer>, images: Map<string, { buffer: Buffer, mime: string, base64: string }> }}
 */
export function readFigFile(figInput) {
    let zip;
    if (Buffer.isBuffer(figInput)) {
        zip = new AdmZip(figInput);
    } else if (typeof figInput === 'string') {
        const resolvedPath = path.resolve(figInput);
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Figma file not found: ${figInput}`);
        }
        zip = new AdmZip(resolvedPath);
    } else {
        throw new Error('Invalid input: figInput must be a file path string or Buffer.');
    }

    // 0. Zip Bomb protection & limit checks
    const MAX_ZIP_ENTRIES = 1000;
    const MAX_ENTRY_SIZE = 100 * 1024 * 1024; // 100 MB
    const MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500 MB

    const zipEntries = zip.getEntries();
    if (zipEntries.length > MAX_ZIP_ENTRIES) {
        throw new Error(`Invalid .fig archive: entry count (${zipEntries.length}) exceeds maximum limit of ${MAX_ZIP_ENTRIES}.`);
    }

    let totalUncompressedSize = 0;
    for (const entry of zipEntries) {
        const entrySize = entry.header ? entry.header.size : 0;
        if (entrySize > MAX_ENTRY_SIZE) {
            throw new Error(`Invalid .fig archive: entry "${entry.entryName}" uncompressed size exceeds limit of 100MB.`);
        }
        totalUncompressedSize += entrySize;
        if (totalUncompressedSize > MAX_TOTAL_SIZE) {
            throw new Error(`Invalid .fig archive: total uncompressed size exceeds maximum limit of 500MB.`);
        }
    }

    // 1. Extract canvas.fig
    const canvasEntry = zip.getEntry('canvas.fig');
    if (!canvasEntry) {
        throw new Error('Invalid .fig archive: "canvas.fig" entry not found.');
    }
    const canvasData = canvasEntry.getData();

    // 2. Decode Kiwi canvas tree
    const decodedTree = decodeFigKiwiCanvas(canvasData);
    if (!decodedTree || !Array.isArray(decodedTree.nodeChanges)) {
        throw new Error('Failed to decode Kiwi canvas tree from .fig file.');
    }

    // 3. Extract embedded images from images/<sha1> with strict Zip Slip protection
    const images = new Map();
    for (const entry of zipEntries) {
        if (!entry.isDirectory && entry.entryName.startsWith('images/')) {
            const rawName = entry.entryName.slice('images/'.length).trim();
            const baseName = path.basename(rawName).toLowerCase();

            // Strict SHA-1 hex format validation (40 hex characters)
            // Disallow any path traversal characters: .., slashes, backslashes, or non-hex
            if (
                /^[a-f0-9]{40}$/i.test(baseName) &&
                baseName === rawName.toLowerCase() &&
                !rawName.includes('..') &&
                !rawName.includes('/') &&
                !rawName.includes('\\')
            ) {
                const imgBuf = entry.getData();
                const mime = getImageMimeType(imgBuf);
                images.set(baseName, {
                    buffer: imgBuf,
                    mime: mime,
                    _base64: null,
                    get base64() {
                        if (!this._base64) {
                            this._base64 = `data:${this.mime};base64,${this.buffer.toString('base64')}`;
                        }
                        return this._base64;
                    }
                });
            } else {
                console.warn(`[WARN] Blocked unsafe or invalid image entry name "${entry.entryName}" in .fig archive (Zip Slip protection).`);
            }
        }
    }

    return {
        nodeChanges: decodedTree.nodeChanges,
        blobs: decodedTree.blobs || [],
        images: images,
        figKiwiVersion: decodedTree.figKiwiVersion
    };
}
