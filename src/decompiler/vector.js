// src/decompiler/vector.js
const { formatColor } = require('./css');

/**
 * Checks if a Figma node is a vector element that should be rendered as SVG
 * @param {object} node
 * @returns {boolean}
 */
function isVectorNode(node) {
    if (!node) return false;
    if (node.type === 'VECTOR' || node.type === 'STAR' || node.type === 'REGULAR_POLYGON' || node.type === 'BOOLEAN_OPERATION') {
        return true;
    }
    if (node.vectorData && (!node.children || node.children.length === 0)) {
        return true;
    }
    return false;
}

/**
 * Parses Figma commandsBlob stream into SVG path string
 * Little-Endian float32 coordinates with opcode byte:
 * 1: MoveTo (x, y)
 * 2: LineTo (x, y)
 * 4: CubicTo (cp1x, cp1y, cp2x, cp2y, x, y)
 * 0: ClosePath (Z)
 * @param {Buffer|Uint8Array} rawBlob
 * @returns {string} SVG path d attribute
 */
function parseCommandsBlob(rawBlob) {
    if (!rawBlob) return '';
    const buf = Buffer.isBuffer(rawBlob) ? rawBlob : Buffer.from(rawBlob);
    let offset = 0;
    const parts = [];
    const r = n => Math.round(n * 100) / 100;

    while (offset < buf.length) {
        const op = buf.readUInt8(offset);
        offset += 1;

        if (op === 1) { // MoveTo
            if (offset + 8 > buf.length) break;
            const x = buf.readFloatLE(offset); offset += 4;
            const y = buf.readFloatLE(offset); offset += 4;
            parts.push(`M ${r(x)} ${r(y)}`);
        } else if (op === 2) { // LineTo
            if (offset + 8 > buf.length) break;
            const x = buf.readFloatLE(offset); offset += 4;
            const y = buf.readFloatLE(offset); offset += 4;
            parts.push(`L ${r(x)} ${r(y)}`);
        } else if (op === 4) { // CubicTo
            if (offset + 24 > buf.length) break;
            const cp1x = buf.readFloatLE(offset); offset += 4;
            const cp1y = buf.readFloatLE(offset); offset += 4;
            const cp2x = buf.readFloatLE(offset); offset += 4;
            const cp2y = buf.readFloatLE(offset); offset += 4;
            const x = buf.readFloatLE(offset); offset += 4;
            const y = buf.readFloatLE(offset); offset += 4;
            parts.push(`C ${r(cp1x)} ${r(cp1y)}, ${r(cp2x)} ${r(cp2y)}, ${r(x)} ${r(y)}`);
        } else if (op === 0) { // ClosePath
            parts.push('Z');
        } else {
            // Unknown opcode, terminate command stream
            break;
        }
    }

    return parts.join(' ');
}

/**
 * Parses Figma VectorNetwork binary blob into an SVG path string
 * Binary structure:
 * - numVertices (u32), numSegments (u32), numRegions (u32)
 * - vertices: numVertices * 12 bytes (styleID u32, x f32, y f32)
 * - segments: numSegments * 28 bytes (styleID u32, start u32, tsX f32, tsY f32, end u32, teX f32, teY f32)
 * @param {Buffer|Uint8Array} rawBlob
 * @returns {string} SVG path d attribute
 */
function parseVectorNetworkBlob(rawBlob) {
    if (!rawBlob) return '';
    const buf = Buffer.isBuffer(rawBlob) ? rawBlob : Buffer.from(rawBlob);
    if (buf.length < 12) return '';

    let offset = 0;
    const numVertices = buf.readUInt32LE(offset); offset += 4;
    const numSegments = buf.readUInt32LE(offset); offset += 4;
    const numRegions = buf.readUInt32LE(offset); offset += 4;

    const vertices = [];
    for (let i = 0; i < numVertices; i++) {
        if (offset + 12 > buf.length) break;
        const styleID = buf.readUInt32LE(offset); offset += 4;
        const x = buf.readFloatLE(offset); offset += 4;
        const y = buf.readFloatLE(offset); offset += 4;
        vertices.push({ x, y, styleID });
    }

    const segments = [];
    for (let i = 0; i < numSegments; i++) {
        if (offset + 28 > buf.length) break;
        const styleID = buf.readUInt32LE(offset); offset += 4;
        const start = buf.readUInt32LE(offset); offset += 4;
        const tsX = buf.readFloatLE(offset); offset += 4;
        const tsY = buf.readFloatLE(offset); offset += 4;
        const end = buf.readUInt32LE(offset); offset += 4;
        const teX = buf.readFloatLE(offset); offset += 4;
        const teY = buf.readFloatLE(offset); offset += 4;
        segments.push({ start, tsX, tsY, end, teX, teY, styleID, index: i });
    }

    if (vertices.length === 0 || segments.length === 0) return '';

    const r = n => Math.round(n * 100) / 100;
    const unused = new Set(segments.map(s => s.index));
    const pathParts = [];

    // Calculate vertex degrees to pick optimal starting endpoints
    const vertexDegree = new Array(vertices.length).fill(0);
    for (const s of segments) {
        if (s.start < vertexDegree.length) vertexDegree[s.start]++;
        if (s.end < vertexDegree.length) vertexDegree[s.end]++;
    }

    while (unused.size > 0) {
        // Prefer starting at a vertex of degree 1 (open stroke start)
        let startSegIndex = null;
        for (const idx of unused) {
            const s = segments[idx];
            if (vertexDegree[s.start] === 1) {
                startSegIndex = idx;
                break;
            }
        }
        if (startSegIndex === null) {
            startSegIndex = unused.values().next().value;
        }

        const firstSeg = segments[startSegIndex];
        unused.delete(startSegIndex);

        let currV = firstSeg.start;
        const startV = currV;

        if (!vertices[currV] || !vertices[firstSeg.end]) continue;

        pathParts.push(`M ${r(vertices[currV].x)} ${r(vertices[currV].y)}`);

        if (firstSeg.tsX || firstSeg.tsY || firstSeg.teX || firstSeg.teY) {
            const cp1x = r(vertices[firstSeg.start].x + firstSeg.tsX);
            const cp1y = r(vertices[firstSeg.start].y + firstSeg.tsY);
            const cp2x = r(vertices[firstSeg.end].x + firstSeg.teX);
            const cp2y = r(vertices[firstSeg.end].y + firstSeg.teY);
            const ex = r(vertices[firstSeg.end].x);
            const ey = r(vertices[firstSeg.end].y);
            pathParts.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${ex} ${ey}`);
        } else {
            pathParts.push(`L ${r(vertices[firstSeg.end].x)} ${r(vertices[firstSeg.end].y)}`);
        }
        currV = firstSeg.end;

        // Walk connected segments
        while (currV !== startV) {
            let nextSegIndex = null;
            let forward = true;
            for (const idx of unused) {
                const s = segments[idx];
                if (s.start === currV) {
                    nextSegIndex = idx;
                    forward = true;
                    break;
                } else if (s.end === currV) {
                    nextSegIndex = idx;
                    forward = false;
                    break;
                }
            }

            if (nextSegIndex === null) break;
            unused.delete(nextSegIndex);
            const nextSeg = segments[nextSegIndex];

            if (forward) {
                if (!vertices[nextSeg.start] || !vertices[nextSeg.end]) break;
                if (nextSeg.tsX || nextSeg.tsY || nextSeg.teX || nextSeg.teY) {
                    const cp1x = r(vertices[nextSeg.start].x + nextSeg.tsX);
                    const cp1y = r(vertices[nextSeg.start].y + nextSeg.tsY);
                    const cp2x = r(vertices[nextSeg.end].x + nextSeg.teX);
                    const cp2y = r(vertices[nextSeg.end].y + nextSeg.teY);
                    const ex = r(vertices[nextSeg.end].x);
                    const ey = r(vertices[nextSeg.end].y);
                    pathParts.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${ex} ${ey}`);
                } else {
                    pathParts.push(`L ${r(vertices[nextSeg.end].x)} ${r(vertices[nextSeg.end].y)}`);
                }
                currV = nextSeg.end;
            } else {
                if (!vertices[nextSeg.end] || !vertices[nextSeg.start]) break;
                if (nextSeg.tsX || nextSeg.tsY || nextSeg.teX || nextSeg.teY) {
                    const cp1x = r(vertices[nextSeg.end].x + nextSeg.teX);
                    const cp1y = r(vertices[nextSeg.end].y + nextSeg.teY);
                    const cp2x = r(vertices[nextSeg.start].x + nextSeg.tsX);
                    const cp2y = r(vertices[nextSeg.start].y + nextSeg.tsY);
                    const ex = r(vertices[nextSeg.start].x);
                    const ey = r(vertices[nextSeg.start].y);
                    pathParts.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${ex} ${ey}`);
                } else {
                    pathParts.push(`L ${r(vertices[nextSeg.start].x)} ${r(vertices[nextSeg.start].y)}`);
                }
                currV = nextSeg.start;
            }

            if (currV === startV) {
                pathParts.push('Z');
                break;
            }
        }
    }

    return pathParts.join(' ');
}

/**
 * Extracts SVG path string `d` from a Figma vector node using available binary blobs
 * @param {object} node
 * @param {Array<Buffer|Uint8Array>} blobs
 * @returns {string} SVG path string
 */
function extractVectorPath(node, blobs = []) {
    if (!node || !Array.isArray(blobs)) return '';

    // 1. Try fillGeometry commandsBlob
    if (Array.isArray(node.fillGeometry) && node.fillGeometry.length > 0) {
        const parts = [];
        for (const geom of node.fillGeometry) {
            if (geom.commandsBlob !== undefined && blobs[geom.commandsBlob]) {
                const d = parseCommandsBlob(blobs[geom.commandsBlob]);
                if (d) parts.push(d);
            }
        }
        if (parts.length > 0) return parts.join(' ');
    }

    // 2. Try strokeGeometry commandsBlob
    if (Array.isArray(node.strokeGeometry) && node.strokeGeometry.length > 0) {
        const parts = [];
        for (const geom of node.strokeGeometry) {
            if (geom.commandsBlob !== undefined && blobs[geom.commandsBlob]) {
                const d = parseCommandsBlob(blobs[geom.commandsBlob]);
                if (d) parts.push(d);
            }
        }
        if (parts.length > 0) return parts.join(' ');
    }

    // 3. Try vectorNetworkBlob
    if (node.vectorData?.vectorNetworkBlob !== undefined && blobs[node.vectorData.vectorNetworkBlob]) {
        return parseVectorNetworkBlob(blobs[node.vectorData.vectorNetworkBlob]);
    }

    return '';
}

/**
 * Resolves stroke styling attributes for an SVG node
 * @param {object} node
 * @returns {{ stroke: string, strokeWidth: number|null, strokeLinecap: string|null, strokeLinejoin: string|null }}
 */
function getVectorStrokeAttributes(node) {
    let stroke = 'none';
    let strokeWidth = null;
    let strokeLinecap = null;
    let strokeLinejoin = null;

    if (Array.isArray(node.strokePaints) && node.strokePaints.length > 0 && (node.strokeWeight > 0 || node.strokeWeight === undefined)) {
        const solid = node.strokePaints.find(s => s.visible !== false && s.type === 'SOLID');
        if (solid) {
            stroke = formatColor(solid.color, solid.opacity);
            strokeWidth = Math.round((node.strokeWeight || 1) * 100) / 100;
        }
    }

    if (node.strokeCap === 'ROUND') strokeLinecap = 'round';
    else if (node.strokeCap === 'SQUARE') strokeLinecap = 'square';

    if (node.strokeJoin === 'ROUND') strokeLinejoin = 'round';
    else if (node.strokeJoin === 'BEVEL') strokeLinejoin = 'bevel';

    return { stroke, strokeWidth, strokeLinecap, strokeLinejoin };
}

/**
 * Resolves fill styling attribute for an SVG node
 * @param {object} node
 * @returns {string} fill color or 'none'
 */
function getVectorFillAttribute(node) {
    if (Array.isArray(node.fillPaints) && node.fillPaints.length > 0) {
        const solid = node.fillPaints.find(f => f.visible !== false && f.type === 'SOLID');
        if (solid) {
            return formatColor(solid.color, solid.opacity);
        }
    }
    return 'none';
}

module.exports = {
    isVectorNode,
    parseCommandsBlob,
    parseVectorNetworkBlob,
    extractVectorPath,
    getVectorStrokeAttributes,
    getVectorFillAttribute
};
