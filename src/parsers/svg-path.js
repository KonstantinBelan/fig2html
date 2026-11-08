// src/parsers/svg-path.js
import { parseColor } from './color.js';

/**
 * Tokenizes an SVG path data string (d attribute)
 * @param {string} d
 * @returns {Array<string|number>}
 */
export function tokenizePath(d) {
    if (!d || typeof d !== 'string') return [];
    const tokens = [];
    const regex = /([a-df-z])|([-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/gi;
    let match;
    while ((match = regex.exec(d)) !== null) {
        if (match[1]) {
            tokens.push(match[1]);
        } else {
            tokens.push(parseFloat(match[2]));
        }
    }
    return tokens;
}

/**
 * Converts an SVG elliptical arc to cubic bezier curves
 */
function arcToBeziers(px, py, cx, cy, rx, ry, xAxisRotation, largeArcFlag, sweepFlag) {
    if (rx === 0 || ry === 0) return [{ type: 'L', x: cx, y: cy }];
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const phi = (xAxisRotation || 0) * Math.PI / 180;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    const dx = (px - cx) / 2;
    const dy = (py - cy) / 2;
    const x1p = cosPhi * dx + sinPhi * dy;
    const y1p = -sinPhi * dx + cosPhi * dy;

    let crx = rx, cry = ry;
    const lambda = (x1p * x1p) / (crx * crx) + (y1p * y1p) / (cry * cry);
    if (lambda > 1) {
        const sqrtL = Math.sqrt(lambda);
        crx *= sqrtL;
        cry *= sqrtL;
    }

    const sign = largeArcFlag === sweepFlag ? -1 : 1;
    const sq = Math.max(0, ((crx * crx * cry * cry) - (crx * crx * y1p * y1p) - (cry * cry * x1p * x1p)) /
        ((crx * crx * y1p * y1p) + (cry * cry * x1p * x1p)));
    const coef = sign * Math.sqrt(sq);
    const cxp = coef * (crx * y1p) / cry;
    const cyp = coef * -(cry * x1p) / crx;

    const centerC = {
        x: cosPhi * cxp - sinPhi * cyp + (px + cx) / 2,
        y: sinPhi * cxp + cosPhi * cyp + (py + cy) / 2
    };

    const v1 = { x: (x1p - cxp) / crx, y: (y1p - cyp) / cry };
    const v2 = { x: (-x1p - cxp) / crx, y: (-y1p - cyp) / cry };

    function angle(u, v) {
        const dot = u.x * v.x + u.y * v.y;
        const len = Math.sqrt(u.x * u.x + u.y * u.y) * Math.sqrt(v.x * v.x + v.y * v.y);
        let ang = Math.acos(Math.max(-1, Math.min(1, dot / len)));
        if (u.x * v.y - u.y * v.x < 0) ang = -ang;
        return ang;
    }

    const theta1 = angle({ x: 1, y: 0 }, v1);
    let dTheta = angle(v1, v2);
    if (!sweepFlag && dTheta > 0) dTheta -= 2 * Math.PI;
    else if (sweepFlag && dTheta < 0) dTheta += 2 * Math.PI;

    const segments = Math.max(Math.ceil(Math.abs(dTheta) / (Math.PI / 2)), 1);
    const delta = dTheta / segments;
    const beziers = [];

    let curTheta = theta1;

    for (let i = 0; i < segments; i++) {
        const nextTheta = curTheta + delta;
        const t = 4 / 3 * Math.tan(delta / 4);

        const sinT = Math.sin(curTheta), cosT = Math.cos(curTheta);
        const sinNT = Math.sin(nextTheta), cosNT = Math.cos(nextTheta);

        const e1p = { x: crx * (cosT - t * sinT), y: cry * (sinT + t * cosT) };
        const e2p = { x: crx * (cosNT + t * sinNT), y: cry * (sinNT - t * cosNT) };
        const ep = { x: crx * cosNT, y: cry * sinNT };

        const cp1 = { x: cosPhi * e1p.x - sinPhi * e1p.y + centerC.x, y: sinPhi * e1p.x + cosPhi * e1p.y + centerC.y };
        const cp2 = { x: cosPhi * e2p.x - sinPhi * e2p.y + centerC.x, y: sinPhi * e2p.x + cosPhi * e2p.y + centerC.y };
        const end = (i === segments - 1) ? { x: cx, y: cy } : { x: cosPhi * ep.x - sinPhi * ep.y + centerC.x, y: sinPhi * ep.x + cosPhi * ep.y + centerC.y };

        beziers.push({ type: 'C', cp1x: cp1.x, cp1y: cp1.y, cp2x: cp2.x, cp2y: cp2.y, x: end.x, y: end.y });
        curTheta = nextTheta;
    }
    return beziers;
}

/**
 * Parses an SVG path data string into an array of normalized commands:
 * M (MoveTo), L (LineTo), C (CubicTo), Z (ClosePath)
 * @param {string} d
 * @returns {Array<object>}
 */
export function parseSvgPath(d) {
    const tokens = tokenizePath(d);
    if (tokens.length === 0) return [];

    const commands = [];
    let curX = 0;
    let curY = 0;
    let startX = 0;
    let startY = 0;
    let lastControlX = 0;
    let lastControlY = 0;
    let lastCommand = '';

    let i = 0;
    while (i < tokens.length) {
        let cmd = tokens[i];
        if (typeof cmd !== 'string') {
            // Implicit repeat of previous command
            if (lastCommand === 'M') cmd = 'L';
            else if (lastCommand === 'm') cmd = 'l';
            else cmd = lastCommand;
        } else {
            i++;
        }

        const isRel = cmd === cmd.toLowerCase() && cmd !== 'z';
        const type = cmd.toUpperCase();

        if (type === 'M') {
            let x = tokens[i++];
            let y = tokens[i++];
            if (isRel) { x += curX; y += curY; }
            commands.push({ type: 'M', x, y });
            curX = startX = x;
            curY = startY = y;
            lastCommand = cmd;

            // Subsequent coordinates under M/m become implicit L/l
            while (i < tokens.length && typeof tokens[i] === 'number') {
                let lx = tokens[i++];
                let ly = tokens[i++];
                if (isRel) { lx += curX; ly += curY; }
                commands.push({ type: 'L', x: lx, y: ly });
                curX = lx;
                curY = ly;
            }
        } else if (type === 'L') {
            while (i < tokens.length && typeof tokens[i] === 'number') {
                let x = tokens[i++];
                let y = tokens[i++];
                if (isRel) { x += curX; y += curY; }
                commands.push({ type: 'L', x, y });
                curX = x;
                curY = y;
            }
            lastCommand = cmd;
        } else if (type === 'H') {
            while (i < tokens.length && typeof tokens[i] === 'number') {
                let x = tokens[i++];
                if (isRel) x += curX;
                commands.push({ type: 'L', x, y: curY });
                curX = x;
            }
            lastCommand = cmd;
        } else if (type === 'V') {
            while (i < tokens.length && typeof tokens[i] === 'number') {
                let y = tokens[i++];
                if (isRel) y += curY;
                commands.push({ type: 'L', x: curX, y });
                curY = y;
            }
            lastCommand = cmd;
        } else if (type === 'C') {
            while (i + 5 < tokens.length && typeof tokens[i] === 'number') {
                let cp1x = tokens[i++];
                let cp1y = tokens[i++];
                let cp2x = tokens[i++];
                let cp2y = tokens[i++];
                let x = tokens[i++];
                let y = tokens[i++];
                if (isRel) {
                    cp1x += curX; cp1y += curY;
                    cp2x += curX; cp2y += curY;
                    x += curX; y += curY;
                }
                commands.push({ type: 'C', cp1x, cp1y, cp2x, cp2y, x, y });
                lastControlX = cp2x;
                lastControlY = cp2y;
                curX = x;
                curY = y;
            }
            lastCommand = cmd;
        } else if (type === 'S') {
            while (i + 3 < tokens.length && typeof tokens[i] === 'number') {
                let cp2x = tokens[i++];
                let cp2y = tokens[i++];
                let x = tokens[i++];
                let y = tokens[i++];
                if (isRel) {
                    cp2x += curX; cp2y += curY;
                    x += curX; y += curY;
                }
                // Reflect previous control point
                let cp1x = curX;
                let cp1y = curY;
                if (['C', 'c', 'S', 's'].includes(lastCommand)) {
                    cp1x = 2 * curX - lastControlX;
                    cp1y = 2 * curY - lastControlY;
                }
                commands.push({ type: 'C', cp1x, cp1y, cp2x, cp2y, x, y });
                lastControlX = cp2x;
                lastControlY = cp2y;
                curX = x;
                curY = y;
                lastCommand = cmd;
            }
        } else if (type === 'Q') {
            while (i + 3 < tokens.length && typeof tokens[i] === 'number') {
                let qx = tokens[i++];
                let qy = tokens[i++];
                let x = tokens[i++];
                let y = tokens[i++];
                if (isRel) {
                    qx += curX; qy += curY;
                    x += curX; y += curY;
                }
                // Degree elevation to cubic
                const cp1x = curX + (2 / 3) * (qx - curX);
                const cp1y = curY + (2 / 3) * (qy - curY);
                const cp2x = x + (2 / 3) * (qx - x);
                const cp2y = y + (2 / 3) * (qy - y);
                commands.push({ type: 'C', cp1x, cp1y, cp2x, cp2y, x, y });
                lastControlX = qx;
                lastControlY = qy;
                curX = x;
                curY = y;
            }
            lastCommand = cmd;
        } else if (type === 'T') {
            while (i + 1 < tokens.length && typeof tokens[i] === 'number') {
                let x = tokens[i++];
                let y = tokens[i++];
                if (isRel) { x += curX; y += curY; }
                let qx = curX;
                let qy = curY;
                if (['Q', 'q', 'T', 't'].includes(lastCommand)) {
                    qx = 2 * curX - lastControlX;
                    qy = 2 * curY - lastControlY;
                }
                const cp1x = curX + (2 / 3) * (qx - curX);
                const cp1y = curY + (2 / 3) * (qy - curY);
                const cp2x = x + (2 / 3) * (qx - x);
                const cp2y = y + (2 / 3) * (qy - y);
                commands.push({ type: 'C', cp1x, cp1y, cp2x, cp2y, x, y });
                lastControlX = qx;
                lastControlY = qy;
                curX = x;
                curY = y;
                lastCommand = cmd;
            }
        } else if (type === 'A') {
            while (i + 6 < tokens.length && typeof tokens[i] === 'number') {
                const rx = tokens[i++];
                const ry = tokens[i++];
                const rot = tokens[i++];
                const large = tokens[i++];
                const sweep = tokens[i++];
                let x = tokens[i++];
                let y = tokens[i++];
                if (isRel) { x += curX; y += curY; }

                const beziers = arcToBeziers(curX, curY, x, y, rx, ry, rot, large, sweep);
                for (const b of beziers) {
                    commands.push(b);
                }
                curX = x;
                curY = y;
            }
            lastCommand = cmd;
        } else if (type === 'Z') {
            commands.push({ type: 'Z' });
            curX = startX;
            curY = startY;
            lastCommand = cmd;
        } else {
            // Unrecognized token, advance
            i++;
        }
    }

    return commands;
}

/**
 * Converts basic SVG shapes (<rect>, <circle>, <ellipse>, <line>, <polygon>, <polyline>) to path commands
 * @param {Element} element
 * @returns {Array<object>}
 */
export function shapeToCommands(element) {
    if (!element) return [];
    const tag = element.tagName.toLowerCase();

    if (tag === 'path') {
        const d = element.getAttribute('d') || '';
        return parseSvgPath(d);
    }

    if (tag === 'rect') {
        const x = parseFloat(element.getAttribute('x')) || 0;
        const y = parseFloat(element.getAttribute('y')) || 0;
        const w = parseFloat(element.getAttribute('width')) || 0;
        const h = parseFloat(element.getAttribute('height')) || 0;
        let rx = parseFloat(element.getAttribute('rx')) || 0;
        let ry = parseFloat(element.getAttribute('ry')) || rx;
        if (rx > w / 2) rx = w / 2;
        if (ry > h / 2) ry = h / 2;

        if (rx === 0 && ry === 0) {
            return [
                { type: 'M', x, y },
                { type: 'L', x: x + w, y },
                { type: 'L', x: x + w, y: y + h },
                { type: 'L', x, y: y + h },
                { type: 'Z' }
            ];
        }
        // Rounded rectangle using cubic beziers (k = 0.5522847498)
        const kx = 0.5522847498 * rx;
        const ky = 0.5522847498 * ry;
        return [
            { type: 'M', x: x + rx, y },
            { type: 'L', x: x + w - rx, y },
            { type: 'C', cp1x: x + w - rx + kx, cp1y: y, cp2x: x + w, cp2y: y + ry - ky, x: x + w, y: y + ry },
            { type: 'L', x: x + w, y: y + h - ry },
            { type: 'C', cp1x: x + w, cp1y: y + h - ry + ky, cp2x: x + w - rx + kx, cp2y: y + h, x: x + w - rx, y: y + h },
            { type: 'L', x: x + rx, y: y + h },
            { type: 'C', cp1x: x + rx - kx, cp1y: y + h, cp2x: x, cp2y: y + h - ry + ky, x, y: y + h - ry },
            { type: 'L', x, y: y + ry },
            { type: 'C', cp1x: x, cp1y: y + ry - ky, cp2x: x + rx - kx, cp2y: y, x: x + rx, y },
            { type: 'Z' }
        ];
    }

    if (tag === 'circle') {
        const cx = parseFloat(element.getAttribute('cx')) || 0;
        const cy = parseFloat(element.getAttribute('cy')) || 0;
        const r = parseFloat(element.getAttribute('r')) || 0;
        if (r <= 0) return [];
        const k = 0.5522847498 * r;
        return [
            { type: 'M', x: cx, y: cy - r },
            { type: 'C', cp1x: cx + k, cp1y: cy - r, cp2x: cx + r, cp2y: cy - k, x: cx + r, y: cy },
            { type: 'C', cp1x: cx + r, cp1y: cy + k, cp2x: cx + k, cp2y: cy + r, x: cx, y: cy + r },
            { type: 'C', cp1x: cx - k, cp1y: cy + r, cp2x: cx - r, cp2y: cy + k, x: cx - r, y: cy },
            { type: 'C', cp1x: cx - r, cp1y: cy - k, cp2x: cx - k, cp2y: cy - r, x: cx, y: cy - r },
            { type: 'Z' }
        ];
    }

    if (tag === 'ellipse') {
        const cx = parseFloat(element.getAttribute('cx')) || 0;
        const cy = parseFloat(element.getAttribute('cy')) || 0;
        const rx = parseFloat(element.getAttribute('rx')) || 0;
        const ry = parseFloat(element.getAttribute('ry')) || 0;
        if (rx <= 0 || ry <= 0) return [];
        const kx = 0.5522847498 * rx;
        const ky = 0.5522847498 * ry;
        return [
            { type: 'M', x: cx, y: cy - ry },
            { type: 'C', cp1x: cx + kx, cp1y: cy - ry, cp2x: cx + rx, cp2y: cy - ky, x: cx + rx, y: cy },
            { type: 'C', cp1x: cx + rx, cp1y: cy + ky, cp2x: cx + kx, cp2y: cy + ry, x: cx, y: cy + ry },
            { type: 'C', cp1x: cx - kx, cp1y: cy + ry, cp2x: cx - rx, cp2y: cy + ky, x: cx - rx, y: cy },
            { type: 'C', cp1x: cx - rx, cp1y: cy - ky, cp2x: cx - kx, cp2y: cy - ry, x: cx, y: cy - ry },
            { type: 'Z' }
        ];
    }

    if (tag === 'line') {
        const x1 = parseFloat(element.getAttribute('x1')) || 0;
        const y1 = parseFloat(element.getAttribute('y1')) || 0;
        const x2 = parseFloat(element.getAttribute('x2')) || 0;
        const y2 = parseFloat(element.getAttribute('y2')) || 0;
        return [
            { type: 'M', x: x1, y: y1 },
            { type: 'L', x: x2, y: y2 }
        ];
    }

    if (tag === 'polygon' || tag === 'polyline') {
        const ptsRaw = (element.getAttribute('points') || '').trim();
        const coords = ptsRaw.split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));
        if (coords.length < 4) return [];
        const cmds = [];
        cmds.push({ type: 'M', x: coords[0], y: coords[1] });
        for (let i = 2; i < coords.length; i += 2) {
            if (i + 1 < coords.length) {
                cmds.push({ type: 'L', x: coords[i], y: coords[i + 1] });
            }
        }
        if (tag === 'polygon') cmds.push({ type: 'Z' });
        return cmds;
    }

    return [];
}

/**
 * Computes bounding box for path commands
 * @param {Array<object>} commands
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }}
 */
export function computePathBounds(commands) {
    if (!commands || commands.length === 0) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    function expand(x, y) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }

    for (const cmd of commands) {
        if (cmd.x !== undefined && cmd.y !== undefined) {
            expand(cmd.x, cmd.y);
        }
        if (cmd.cp1x !== undefined && cmd.cp1y !== undefined) {
            expand(cmd.cp1x, cmd.cp1y);
        }
        if (cmd.cp2x !== undefined && cmd.cp2y !== undefined) {
            expand(cmd.cp2x, cmd.cp2y);
        }
    }

    if (minX === Infinity) {
        minX = minY = maxX = maxY = 0;
    }

    return {
        minX,
        minY,
        maxX,
        maxY,
        width: Math.max(0, maxX - minX),
        height: Math.max(0, maxY - minY)
    };
}

/**
 * Encodes normalized path commands into binary Figma commandsBlob
 * 1: MoveTo (x, y) - 9 bytes
 * 2: LineTo (x, y) - 9 bytes
 * 4: CubicTo (cp1x, cp1y, cp2x, cp2y, x, y) - 25 bytes
 * 0: ClosePath (Z) - 1 byte
 * @param {Array<object>} commands
 * @returns {Buffer}
 */
export function encodeCommandsBlob(commands) {
    let size = 0;
    for (const cmd of commands) {
        if (cmd.type === 'M' || cmd.type === 'L') size += 1 + 8;
        else if (cmd.type === 'C') size += 1 + 24;
        else if (cmd.type === 'Z') size += 1;
    }

    const buf = Buffer.alloc(size);
    let offset = 0;

    for (const cmd of commands) {
        if (cmd.type === 'M') {
            buf.writeUInt8(1, offset++);
            buf.writeFloatLE(cmd.x, offset); offset += 4;
            buf.writeFloatLE(cmd.y, offset); offset += 4;
        } else if (cmd.type === 'L') {
            buf.writeUInt8(2, offset++);
            buf.writeFloatLE(cmd.x, offset); offset += 4;
            buf.writeFloatLE(cmd.y, offset); offset += 4;
        } else if (cmd.type === 'C') {
            buf.writeUInt8(4, offset++);
            buf.writeFloatLE(cmd.cp1x, offset); offset += 4;
            buf.writeFloatLE(cmd.cp1y, offset); offset += 4;
            buf.writeFloatLE(cmd.cp2x, offset); offset += 4;
            buf.writeFloatLE(cmd.cp2y, offset); offset += 4;
            buf.writeFloatLE(cmd.x, offset); offset += 4;
            buf.writeFloatLE(cmd.y, offset); offset += 4;
        } else if (cmd.type === 'Z') {
            buf.writeUInt8(0, offset++);
        }
    }

    return buf;
}

/**
 * Encodes normalized path commands into binary Figma vectorNetworkBlob
 * Binary layout:
 * - numVertices (u32), numSegments (u32), numRegions (u32)
 * - vertices: numVertices * 12 bytes (styleID u32, x f32, y f32)
 * - segments: numSegments * 28 bytes (styleID u32, start u32, tsX f32, tsY f32, end u32, teX f32, teY f32)
 * @param {Array<object>} commands
 * @returns {Buffer}
 */
export function encodeVectorNetworkBlob(commands) {
    const vertices = [];
    const segments = [];

    let currentVertexIdx = -1;
    let subpathStartIdx = -1;

    function addVertex(x, y) {
        // Find existing vertex at identical position with fuzzy equality (0.01px)
        for (let i = 0; i < vertices.length; i++) {
            if (Math.abs(vertices[i].x - x) < 0.01 && Math.abs(vertices[i].y - y) < 0.01) {
                return i;
            }
        }
        const idx = vertices.length;
        vertices.push({ x, y, styleID: 0 });
        return idx;
    }

    for (const cmd of commands) {
        if (cmd.type === 'M') {
            currentVertexIdx = addVertex(cmd.x, cmd.y);
            subpathStartIdx = currentVertexIdx;
        } else if (cmd.type === 'L') {
            if (currentVertexIdx === -1) {
                currentVertexIdx = addVertex(0, 0);
                subpathStartIdx = currentVertexIdx;
            }
            const nextIdx = addVertex(cmd.x, cmd.y);
            if (nextIdx !== currentVertexIdx) {
                segments.push({
                    styleID: 0,
                    start: currentVertexIdx,
                    tsX: 0, tsY: 0,
                    end: nextIdx,
                    teX: 0, teY: 0
                });
            }
            currentVertexIdx = nextIdx;
        } else if (cmd.type === 'C') {
            if (currentVertexIdx === -1) {
                currentVertexIdx = addVertex(0, 0);
                subpathStartIdx = currentVertexIdx;
            }
            const startV = vertices[currentVertexIdx];
            const nextIdx = addVertex(cmd.x, cmd.y);
            const endV = vertices[nextIdx];

            segments.push({
                styleID: 0,
                start: currentVertexIdx,
                tsX: cmd.cp1x - startV.x,
                tsY: cmd.cp1y - startV.y,
                end: nextIdx,
                teX: cmd.cp2x - endV.x,
                teY: cmd.cp2y - endV.y
            });
            currentVertexIdx = nextIdx;
        } else if (cmd.type === 'Z') {
            if (currentVertexIdx !== -1 && subpathStartIdx !== -1 && currentVertexIdx !== subpathStartIdx) {
                segments.push({
                    styleID: 0,
                    start: currentVertexIdx,
                    tsX: 0, tsY: 0,
                    end: subpathStartIdx,
                    teX: 0, teY: 0
                });
            }
            currentVertexIdx = subpathStartIdx;
        }
    }

    const numV = vertices.length;
    const numS = segments.length;
    const numR = 0; // 0 regions for raw vector networks

    const size = 12 + numV * 12 + numS * 28;
    const buf = Buffer.alloc(size);
    let offset = 0;

    buf.writeUInt32LE(numV, offset); offset += 4;
    buf.writeUInt32LE(numS, offset); offset += 4;
    buf.writeUInt32LE(numR, offset); offset += 4;

    for (const v of vertices) {
        buf.writeUInt32LE(v.styleID || 0, offset); offset += 4;
        buf.writeFloatLE(v.x, offset); offset += 4;
        buf.writeFloatLE(v.y, offset); offset += 4;
    }

    for (const s of segments) {
        buf.writeUInt32LE(s.styleID || 0, offset); offset += 4;
        buf.writeUInt32LE(s.start, offset); offset += 4;
        buf.writeFloatLE(s.tsX || 0, offset); offset += 4;
        buf.writeFloatLE(s.tsY || 0, offset); offset += 4;
        buf.writeUInt32LE(s.end, offset); offset += 4;
        buf.writeFloatLE(s.teX || 0, offset); offset += 4;
        buf.writeFloatLE(s.teY || 0, offset); offset += 4;
    }

    return buf;
}

/**
 * Extracts vector shape candidates from an SVG element
 * @param {Element} svgElement
 * @param {string} defaultColor
 * @param {Window} win
 * @returns {Array<object>}
 */
export function extractSvgShapeElements(svgElement, defaultColor = '#000000', win = null) {
    if (!svgElement) return [];
    const validTags = ['path', 'rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline'];
    const candidates = svgElement.querySelectorAll(validTags.join(', '));
    const results = [];

    const inheritedFill = svgElement.getAttribute('fill') || 'currentColor';
    const inheritedStroke = svgElement.getAttribute('stroke');
    const inheritedStrokeWidth = parseFloat(svgElement.getAttribute('stroke-width')) || 1;

    for (const el of candidates) {
        const cmds = shapeToCommands(el);
        if (cmds.length === 0) continue;

        let fillAttr = el.getAttribute('fill') || inheritedFill;
        let strokeAttr = el.getAttribute('stroke') || inheritedStroke;
        let strokeWidthAttr = parseFloat(el.getAttribute('stroke-width')) || inheritedStrokeWidth;
        const fillRuleAttr = (el.getAttribute('fill-rule') || svgElement.getAttribute('fill-rule') || 'nonzero').toLowerCase();

        // Resolve currentColor
        if (fillAttr === 'currentColor') fillAttr = defaultColor;
        if (strokeAttr === 'currentColor') strokeAttr = defaultColor;

        const fillNone = fillAttr === 'none';
        const strokeNone = !strokeAttr || strokeAttr === 'none';

        if (fillNone && strokeNone) continue;

        const bounds = computePathBounds(cmds);

        results.push({
            element: el,
            name: el.id || el.getAttribute('name') || el.tagName.toLowerCase(),
            commands: cmds,
            bounds,
            fill: fillNone ? null : fillAttr,
            fillRule: fillRuleAttr === 'evenodd' ? 'ODD' : 'NONZERO',
            stroke: strokeNone ? null : strokeAttr,
            strokeWidth: strokeNone ? 0 : strokeWidthAttr,
            strokeCap: (el.getAttribute('stroke-linecap') || 'round').toUpperCase(),
            strokeJoin: (el.getAttribute('stroke-linejoin') || 'round').toUpperCase()
        });
    }

    return results;
}
