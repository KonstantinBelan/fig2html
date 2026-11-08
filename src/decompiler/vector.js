// src/decompiler/vector.js
import { formatColor } from './css/index.js';

/**
 * Checks if a Figma node is a vector element that should be rendered as SVG
 * @param {object} node
 * @returns {boolean}
 */
export function isVectorNode(node) {
    if (!node) return false;
    if (node.type === 'VECTOR' || node.type === 'STAR' || node.type === 'REGULAR_POLYGON' || node.type === 'BOOLEAN_OPERATION') {
        return true;
    }
    if (node.type === 'RECTANGLE' || node.type === 'ROUNDED_RECTANGLE' || node.type === 'ELLIPSE') {
        return false;
    }
    if (node.vectorData && (!node.children || node.children.length === 0)) {
        return true;
    }
    return false;
}

/**
 * Checks if a node is a pure transparent grouping container whose descendants are all vector shapes
 * @param {object} node
 * @returns {boolean}
 */
function isPureVectorSubgroup(node) {
    if (!node || !Array.isArray(node.children) || node.children.length === 0) return false;
    const isFrame = ['FRAME', 'GROUP', 'INSTANCE', 'SYMBOL', 'BOOLEAN_OPERATION'].includes(node.type);
    if (!isFrame) return false;
    if (node.mask === true || node.isMask === true) return false;
    const hasVisibleFills = Array.isArray(node.fillPaints) && node.fillPaints.some(f => f.visible !== false);
    const hasVisibleStrokes = Array.isArray(node.strokePaints) && node.strokePaints.some(s => s.visible !== false);
    const hasVisibleEffects = Array.isArray(node.effects) && node.effects.some(e => e.visible !== false);
    if (hasVisibleFills || hasVisibleStrokes || hasVisibleEffects) return false;
    const visibleChildren = node.children.filter(c => c && c.visible !== false);
    if (visibleChildren.length === 0) return false;
    return visibleChildren.every(c => isVectorNode(c) || c.type === 'LINE' || isPureVectorSubgroup(c));
}

/**
 * Checks if a node is a container whose visual content consists solely of vector shapes (e.g. an icon frame)
 * @param {object} node
 * @returns {boolean}
 */
export function isVectorContainer(node) {
    if (!node || !Array.isArray(node.children) || node.children.length === 0) return false;
    const isFrame = ['FRAME', 'GROUP', 'INSTANCE', 'SYMBOL', 'BOOLEAN_OPERATION'].includes(node.type);
    if (!isFrame) return false;

    // Must not have image fills
    const hasImageFill = Array.isArray(node.fillPaints) && node.fillPaints.some(f => f.type === 'IMAGE' && f.visible !== false);
    if (hasImageFill) return false;

    const visibleChildren = node.children.filter(c => c && c.visible !== false);
    if (visibleChildren.length === 0) return false;

    // Direct children must all be vectors or lines
    if (visibleChildren.every(c => isVectorNode(c) || c.type === 'LINE')) {
        return true;
    }

    // Icon container (<= 200x200) with no own fills/strokes/effects whose children are vectors or pure vector subgroups
    const w = node.size?.x || 0;
    const h = node.size?.y || 0;
    if (w > 0 && w <= 200 && h > 0 && h <= 200 && isPureVectorSubgroup(node)) {
        return true;
    }

    return false;
}

/**
 * Multiplies two 2x3 affine transformation matrices
 * @param {object} m1
 * @param {object} m2
 * @returns {object}
 */
export function multiplyMatrix(m1, m2) {
    const a1 = m1?.m00 ?? 1, c1 = m1?.m01 ?? 0, e1 = m1?.m02 ?? 0;
    const b1 = m1?.m10 ?? 0, d1 = m1?.m11 ?? 1, f1 = m1?.m12 ?? 0;

    const a2 = m2?.m00 ?? 1, c2 = m2?.m01 ?? 0, e2 = m2?.m02 ?? 0;
    const b2 = m2?.m10 ?? 0, d2 = m2?.m11 ?? 1, f2 = m2?.m12 ?? 0;

    return {
        m00: a1 * a2 + c1 * b2,
        m01: a1 * c2 + c1 * d2,
        m02: a1 * e2 + c1 * f2 + e1,
        m10: b1 * a2 + d1 * b2,
        m11: b1 * c2 + d1 * d2,
        m12: b1 * e2 + d1 * f2 + f1
    };
}

/**
 * Recursively collects vector leaf nodes with their accumulated translation and transform matrix
 * @param {object} parent
 * @param {object|null} [parentMatrix=null]
 * @returns {Array<{ node: object, tx: number, ty: number, transform: object }>}
 */
export function collectVectorLeaves(parent, parentMatrix = null) {
    const leaves = [];
    if (!parent || !Array.isArray(parent.children)) return leaves;

    for (const child of parent.children) {
        if (!child || child.visible === false || child.mask === true || child.isMask === true) continue;
        const childTransform = child.transform || { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
        const combinedMatrix = parentMatrix ? multiplyMatrix(parentMatrix, childTransform) : childTransform;

        if (isVectorNode(child)) {
            leaves.push({
                node: child,
                tx: combinedMatrix.m02 || 0,
                ty: combinedMatrix.m12 || 0,
                transform: combinedMatrix
            });
        } else if (child.children && child.children.length > 0) {
            leaves.push(...collectVectorLeaves(child, combinedMatrix));
        }
    }
    return leaves;
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
export function parseCommandsBlob(rawBlob) {
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
export function parseVectorNetworkBlob(rawBlob, node = null) {
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

    // Synthesize arrowheads for open endpoint vertices with ARROW_LINES / ARROW_EQUILATERAL / TRIANGLE_FILLED strokeCap
    if (node) {
        const capByStyleId = new Map();
        if (Array.isArray(node.vectorData?.styleOverrideTable)) {
            for (const entry of node.vectorData.styleOverrideTable) {
                if (entry && entry.styleID !== undefined && entry.strokeCap) {
                    capByStyleId.set(entry.styleID, entry.strokeCap);
                }
            }
        }

        const sx = (node.vectorData?.normalizedSize?.x && node.size?.x)
            ? (node.size.x / node.vectorData.normalizedSize.x)
            : ((node.vectorData?.normalizedSize?.y && node.size?.y)
                ? (node.size.y / node.vectorData.normalizedSize.y)
                : 1);
        const normSw = (node.strokeWeight || 2) / (sx || 1);
        const arm = normSw * 3.182;

        for (let vIdx = 0; vIdx < vertices.length; vIdx++) {
            if (vertexDegree[vIdx] !== 1) continue;
            const v = vertices[vIdx];
            const cap = capByStyleId.get(v.styleID) || node.strokeCap;
            if (cap !== 'ARROW_LINES' && cap !== 'ARROW_EQUILATERAL' && cap !== 'TRIANGLE_FILLED') continue;

            const seg = segments.find(s => s.start === vIdx || s.end === vIdx);
            if (!seg) continue;

            let dx = 0;
            let dy = 0;
            if (seg.end === vIdx) {
                const sv = vertices[seg.start];
                if (!sv) continue;
                dx = v.x - (seg.teX ? (v.x + seg.teX) : sv.x);
                dy = v.y - (seg.teY ? (v.y + seg.teY) : sv.y);
            } else {
                const ev = vertices[seg.end];
                if (!ev) continue;
                dx = v.x - (seg.tsX ? (v.x + seg.tsX) : ev.x);
                dy = v.y - (seg.tsY ? (v.y + seg.tsY) : ev.y);
            }

            const len = Math.hypot(dx, dy);
            if (len < 1e-4) continue;
            const ux = dx / len;
            const uy = dy / len;
            const px = -uy;
            const py = ux;

            const p1x = r(v.x - ux * arm + px * arm);
            const p1y = r(v.y - uy * arm + py * arm);
            const p2x = r(v.x - ux * arm - px * arm);
            const p2y = r(v.y - uy * arm - py * arm);

            if (cap === 'ARROW_EQUILATERAL' || cap === 'TRIANGLE_FILLED') {
                pathParts.push(`M ${p1x} ${p1y} L ${r(v.x)} ${r(v.y)} L ${p2x} ${p2y} Z`);
            } else {
                pathParts.push(`M ${p1x} ${p1y} L ${r(v.x)} ${r(v.y)} L ${p2x} ${p2y}`);
            }
        }
    }

    return pathParts.join(' ');
}

/**
 * Extracts SVG path string `d` and normalization metadata from a Figma vector node
 * @param {object} node
 * @param {Array<Buffer|Uint8Array>} blobs
 * @returns {{ d: string, isNormalized: boolean }}
 */
export function extractVectorPathInfo(node, blobs = []) {
    if (!node || !Array.isArray(blobs)) return { d: '', isNormalized: false, fillRule: null };

    const hasOddWinding = Array.isArray(node.fillGeometry) &&
        node.fillGeometry.some(g => g.windingRule === 'ODD' || g.windingRule === 'EVENODD');
    const resolveFillRule = (d) => {
        if (hasOddWinding) return 'evenodd';
        if ((d.match(/Z/g) || []).length >= 2 && Array.isArray(node.fillPaints) && node.fillPaints.some(f => f.visible !== false)) {
            return 'evenodd';
        }
        return null;
    };

    // 1. If stroked vector without fillGeometry, prefer raw centerline vectorNetworkBlob
    if (node.strokePaints?.length && (!node.fillGeometry || node.fillGeometry.length === 0)) {
        if (node.vectorData?.vectorNetworkBlob !== undefined && blobs[node.vectorData.vectorNetworkBlob]) {
            const d = parseVectorNetworkBlob(blobs[node.vectorData.vectorNetworkBlob], node);
            if (d) return { d, isNormalized: true, fillRule: resolveFillRule(d) };
        }
    }

    // 2. Try fillGeometry commandsBlob
    if (Array.isArray(node.fillGeometry) && node.fillGeometry.length > 0) {
        const parts = [];
        for (const geom of node.fillGeometry) {
            if (geom.commandsBlob !== undefined && blobs[geom.commandsBlob]) {
                const d = parseCommandsBlob(blobs[geom.commandsBlob]);
                if (d) parts.push(d);
            }
        }
        if (parts.length > 0) {
            const d = parts.join(' ');
            return { d, isNormalized: false, fillRule: resolveFillRule(d) };
        }
    }

    // 3. Try vectorNetworkBlob
    if (node.vectorData?.vectorNetworkBlob !== undefined && blobs[node.vectorData.vectorNetworkBlob]) {
        const d = parseVectorNetworkBlob(blobs[node.vectorData.vectorNetworkBlob], node);
        if (d) return { d, isNormalized: true, fillRule: resolveFillRule(d) };
    }

    // 4. Try strokeGeometry commandsBlob
    if (Array.isArray(node.strokeGeometry) && node.strokeGeometry.length > 0) {
        const parts = [];
        for (const geom of node.strokeGeometry) {
            if (geom.commandsBlob !== undefined && blobs[geom.commandsBlob]) {
                const d = parseCommandsBlob(blobs[geom.commandsBlob]);
                if (d) parts.push(d);
            }
        }
        if (parts.length > 0) {
            const d = parts.join(' ');
            return { d, isNormalized: false, fillRule: resolveFillRule(d) };
        }
    }

    // 5. Parametric STAR / REGULAR_POLYGON fallback when geometry blobs are not baked in .fig
    if (node.type === 'STAR' || node.type === 'REGULAR_POLYGON') {
        const d = buildParametricPolygonOrStarPath(node);
        if (d) return { d, isNormalized: false, fillRule: null };
    }

    return { d: '', isNormalized: false, fillRule: null };
}

/**
 * Synthesizes SVG path string for parametric STAR or REGULAR_POLYGON nodes
 * @param {object} node
 * @returns {string}
 */
function buildParametricPolygonOrStarPath(node) {
    if (!node || (node.type !== 'STAR' && node.type !== 'REGULAR_POLYGON')) return '';
    const w = node.size?.x || 24;
    const h = node.size?.y || 24;
    const cx = w / 2;
    const cy = h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const count = Math.max(3, Math.round(node.count || 5));
    const isStar = node.type === 'STAR';
    const innerScale = isStar ? (node.starInnerScale ?? 0.381966) : 1;
    const totalPoints = isStar ? count * 2 : count;
    const pts = [];
    for (let i = 0; i < totalPoints; i++) {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / totalPoints;
        const scale = (isStar && (i % 2 === 1)) ? innerScale : 1;
        pts.push({
            x: cx + Math.cos(angle) * rx * scale,
            y: cy + Math.sin(angle) * ry * scale
        });
    }
    const r = n => Math.round(n * 100) / 100;
    const cr = node.cornerRadius || 0;
    if (cr > 0 && pts.length >= 3) {
        const parts = [];
        for (let i = 0; i < pts.length; i++) {
            const prev = pts[(i - 1 + pts.length) % pts.length];
            const curr = pts[i];
            const next = pts[(i + 1) % pts.length];
            const dx1 = prev.x - curr.x;
            const dy1 = prev.y - curr.y;
            const len1 = Math.hypot(dx1, dy1);
            const dx2 = next.x - curr.x;
            const dy2 = next.y - curr.y;
            const len2 = Math.hypot(dx2, dy2);
            const cut = Math.min(cr, len1 * 0.4, len2 * 0.4);
            const p1x = curr.x + (dx1 / (len1 || 1)) * cut;
            const p1y = curr.y + (dy1 / (len1 || 1)) * cut;
            const p2x = curr.x + (dx2 / (len2 || 1)) * cut;
            const p2y = curr.y + (dy2 / (len2 || 1)) * cut;
            if (i === 0) {
                parts.push(`M ${r(p1x)} ${r(p1y)}`);
            } else {
                parts.push(`L ${r(p1x)} ${r(p1y)}`);
            }
            parts.push(`Q ${r(curr.x)} ${r(curr.y)} ${r(p2x)} ${r(p2y)}`);
        }
        parts.push('Z');
        return parts.join(' ');
    }
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${r(p.x)} ${r(p.y)}`).join(' ') + ' Z';
}

/**
 * Extracts SVG path string `d` from a Figma vector node using available binary blobs
 * @param {object} node
 * @param {Array<Buffer|Uint8Array>} blobs
 * @returns {string} SVG path string
 */
export function extractVectorPath(node, blobs = []) {
    return extractVectorPathInfo(node, blobs).d;
}

/**
 * Resolves stroke styling attributes for an SVG node
 * @param {object} node
 * @returns {{ stroke: string, strokeWidth: number|null, strokeLinecap: string|null, strokeLinejoin: string|null }}
 */
export function getVectorStrokeAttributes(node) {
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

    const overrideCaps = Array.isArray(node.vectorData?.styleOverrideTable)
        ? node.vectorData.styleOverrideTable.map(e => e?.strokeCap).filter(Boolean)
        : [];
    const hasRoundOrArrowOverride = overrideCaps.some(c => c === 'ROUND' || c === 'ARROW_LINES' || c === 'ARROW_EQUILATERAL');

    if (node.strokeCap === 'ROUND' || hasRoundOrArrowOverride) strokeLinecap = 'round';
    else if (node.strokeCap === 'SQUARE') strokeLinecap = 'square';

    if (node.strokeJoin === 'ROUND' || hasRoundOrArrowOverride) strokeLinejoin = 'round';
    else if (node.strokeJoin === 'BEVEL') strokeLinejoin = 'bevel';

    return { stroke, strokeWidth, strokeLinecap, strokeLinejoin };
}

/**
 * Resolves fill styling attribute for an SVG node
 * @param {object} node
 * @returns {string} fill color or 'none'
 */
export function getVectorFillAttribute(node) {
    if (Array.isArray(node.fillPaints) && node.fillPaints.length > 0) {
        const solid = node.fillPaints.find(f => f.visible !== false && f.type === 'SOLID');
        if (solid) {
            return formatColor(solid.color, solid.opacity);
        }
    }
    return 'none';
}
