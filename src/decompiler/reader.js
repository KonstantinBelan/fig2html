// src/decompiler/reader.js
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { decodeFigKiwiCanvas } = require('@open-pencil/kiwi/fig/parse');

/**
 * Detects MIME type of an image buffer based on magic bytes
 * @param {Buffer} buffer
 * @returns {string} MIME type
 */
function getImageMimeType(buffer) {
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
function readFigFile(figInput) {
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

    // 3. Extract embedded images from images/<sha1>
    const images = new Map();
    const zipEntries = zip.getEntries();
    for (const entry of zipEntries) {
        if (!entry.isDirectory && entry.entryName.startsWith('images/')) {
            const sha1Hex = entry.entryName.slice('images/'.length).trim().toLowerCase();
            if (sha1Hex) {
                const imgBuf = entry.getData();
                const mime = getImageMimeType(imgBuf);
                const base64 = `data:${mime};base64,${imgBuf.toString('base64')}`;
                images.set(sha1Hex, {
                    buffer: imgBuf,
                    mime: mime,
                    base64: base64
                });
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

module.exports = {
    readFigFile,
    getImageMimeType
};
