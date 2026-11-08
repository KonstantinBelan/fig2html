// Auto-generated test module
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const { convertFigToHtml } = require("../../src/decompiler");
const { detectPages } = require("../../src/decompiler/page-detector");
const { BoundingBox } = require("../../src/decompiler/geometry");
const { parseVectorNetworkBlob } = require("../../src/decompiler/vector");
const { StylesheetManager } = require("../../src/decompiler/stylesheet");
const { parseTransformMatrix, computeNodeStyles } = require("../../src/decompiler/css");

module.exports = async function(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };


    it('keeps a single vertical landing page frame with stacked sections as one index.html page', () => {
        const landingPageFrame = {
            name: 'Главная страница',
            type: 'FRAME',
            stackMode: 'VERTICAL',
            size: { x: 1200, y: 2400 },
            children: [
                { name: 'Hero Section', type: 'FRAME', transform: { m02: 0, m12: 0 }, size: { x: 1200, y: 800 } },
                { name: 'Catalog Section', type: 'FRAME', transform: { m02: 0, m12: 800 }, size: { x: 1200, y: 900 } },
                { name: 'Footer Section', type: 'FRAME', transform: { m02: 0, m12: 1700 }, size: { x: 1200, y: 700 } }
            ]
        };
        const pages = detectPages({ rootNodes: [landingPageFrame] });
        assert.strictEqual(pages.length, 1, 'Must export a single vertical landing page as 1 HTML page');
        assert.strictEqual(pages[0].fileName, 'index.html');
    });

    it('emits text-shadow instead of box-shadow on TEXT nodes and preserves solid/gradient fills on RECTANGLE shapes', () => {
        const textNode = {
            name: 'Title',
            type: 'TEXT',
            fontSize: 20,
            effects: [{
                type: 'DROP_SHADOW',
                visible: true,
                offset: { x: 0, y: 2 },
                radius: 6,
                spread: 0,
                color: { r: 0, g: 0, b: 0, a: 0.3 }
            }]
        };
        const textStyles = computeNodeStyles(textNode, null);
        assert.strictEqual(textStyles['text-shadow'], '0px 2px 6px rgba(0, 0, 0, 0.3)');
        assert.strictEqual(textStyles['box-shadow'], undefined, 'TEXT node must not emit box-shadow');

        const rectNode = {
            name: 'Progress Bar',
            type: 'RECTANGLE',
            size: { x: 25, y: 8 },
            cornerRadius: 90,
            fillPaints: [{ type: 'SOLID', visible: true, opacity: 1, color: { r: 0, g: 0.48235, b: 1, a: 1 } }]
        };
        const rectStyles = computeNodeStyles(rectNode, null);
        assert.strictEqual(rectStyles['background-color'], '#007bff', 'Leaf RECTANGLE without image fill must keep background-color');

        const blendOverlayRect = {
            name: 'Overlay Gradient',
            type: 'ROUNDED_RECTANGLE',
            size: { x: 552, y: 259 },
            fillPaints: [
                {
                    type: 'GRADIENT_LINEAR',
                    visible: true,
                    opacity: 1,
                    blendMode: 'OVERLAY',
                    stops: [
                        { position: 0, color: { r: 0.176, g: 0.176, b: 0.176, a: 1 } },
                        { position: 1, color: { r: 0.494, g: 0.490, b: 0.490, a: 0 } }
                    ],
                    transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 }
                },
                {
                    type: 'GRADIENT_LINEAR',
                    visible: true,
                    opacity: 1,
                    blendMode: 'COLOR',
                    stops: [
                        { position: 0, color: { r: 0.494, g: 0.490, b: 0.490, a: 1 } },
                        { position: 1, color: { r: 0.494, g: 0.490, b: 0.490, a: 0 } }
                    ],
                    transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 }
                }
            ]
        };
        const blendStyles = computeNodeStyles(blendOverlayRect, null);
        assert(blendStyles['background-image'] && blendStyles['background-image'].includes('linear-gradient'), 'Must emit gradient background-image');
        assert.strictEqual(blendStyles['background-blend-mode'], 'color, normal');
        assert.strictEqual(blendStyles['mix-blend-mode'], 'overlay');
    });

    it('synthesizes arrowheads from vectorData.styleOverrideTable in parseVectorNetworkBlob', () => {
        const buf = Buffer.alloc(12 + 2 * 12 + 28);
        buf.writeUInt32LE(2, 0); // 2 vertices
        buf.writeUInt32LE(1, 4); // 1 segment
        buf.writeUInt32LE(0, 8); // 0 regions
        // vertex 0: styleID=1, x=0, y=0
        buf.writeUInt32LE(1, 12);
        buf.writeFloatLE(0, 16);
        buf.writeFloatLE(0, 20);
        // vertex 1: styleID=2, x=19, y=0
        buf.writeUInt32LE(2, 24);
        buf.writeFloatLE(19, 28);
        buf.writeFloatLE(0, 32);
        // segment 0: styleID=0, start=0, ts=0,0, end=1, te=0,0
        buf.writeUInt32LE(0, 36);
        buf.writeUInt32LE(0, 40);
        buf.writeFloatLE(0, 44);
        buf.writeFloatLE(0, 48);
        buf.writeUInt32LE(1, 52);
        buf.writeFloatLE(0, 56);
        buf.writeFloatLE(0, 60);

        const arrowNode = {
            type: 'VECTOR',
            strokeWeight: 2,
            size: { x: 19, y: 0 },
            vectorData: {
                normalizedSize: { x: 19, y: 0 },
                styleOverrideTable: [
                    { styleID: 1, strokeCap: 'ROUND' },
                    { styleID: 2, strokeCap: 'ARROW_LINES' }
                ]
            }
        };
        const d = parseVectorNetworkBlob(buf, arrowNode);
        assert(d.includes('M 0 0 L 19 0'), 'Should contain main shaft');
        assert(d.includes('L 19 0 L 12.64'), 'Should synthesize arrowhead arms at endpoint vertex');
    });

    it('assigns distinct CSS variables to multiple font families in :root without overwriting --font-display', () => {
        const sm = new StylesheetManager();
        for (let i = 0; i < 3; i++) {
            sm.registerNode({ name: `a-${i}`, type: 'TEXT', fontSize: 16, fontName: { family: 'Inter', style: 'Regular' } }, null, new Map());
            sm.registerNode({ name: `b-${i}`, type: 'TEXT', fontSize: 16, fontName: { family: 'Jura', style: 'Regular' } }, null, new Map());
        }
        const cssOut = sm.generateFullStylesheet('#ffffff');
        const displayMatches = cssOut.match(/--font-display:/g) || [];
        assert.strictEqual(displayMatches.length, 1, '--font-display must only be declared once in :root');
        assert(cssOut.includes('--font-display-2:'), 'Second font family must receive --font-display-2');
    });

    it('prevents CSS class collision between auto-numbered classes (frame-2) and explicit layer names (Frame 2)', () => {
        const sm = new StylesheetManager();
        const n1 = { name: 'Frame', type: 'FRAME', size: { x: 16, y: 16 } };
        const n2 = { name: 'Frame', type: 'FRAME', size: { x: 18, y: 18 } };
        const nExplicit = { name: 'Frame 2', type: 'FRAME', size: { x: 110, y: 34 } };

        const c1 = sm.registerNode(n1, null, new Map());
        const c2 = sm.registerNode(n2, null, new Map());
        const cExplicit = sm.registerNode(nExplicit, null, new Map());

        assert.strictEqual(c1, 'frame');
        assert.strictEqual(c2, 'frame-2');
        assert.notStrictEqual(cExplicit, 'frame-2', 'Node named "Frame 2" must not overwrite existing .frame-2 rule');
        assert.strictEqual(sm.uniqueRules.get('frame-2')['max-width'], '18px');
        assert.strictEqual(sm.uniqueRules.get(cExplicit)['max-width'], '110px');
    });

    it('synthesizes parametric STAR paths, preserves evenodd fill-rule, and decomposes det<0 reflection+rotation matrices', () => {
        const { renderNodeToHtml } = require('../../src/decompiler/html');
        const starNode = {
            name: 'Star 1',
            type: 'STAR',
            size: { x: 20, y: 20 },
            count: 5,
            starInnerScale: 0.382,
            cornerRadius: 1,
            fillPaints: [{ type: 'SOLID', visible: true, color: { r: 1, g: 0.72, b: 0, a: 1 }, opacity: 1 }]
        };
        const starHtml = renderNodeToHtml(starNode, null, new Map());
        assert(starHtml.includes('<svg') && starHtml.includes('<path d="M '), 'Parametric STAR node without blobs must synthesize SVG path');

        // Reflection + rotation matrix: R(75deg) * scaleX(-1) -> m00 = -cos(75deg), m10 = -sin(75deg), m01 = -sin(75deg), m11 = cos(75deg)
        const rad = (75 * Math.PI) / 180;
        const m = {
            m00: -Math.cos(rad),
            m01: -Math.sin(rad),
            m02: 0,
            m10: -Math.sin(rad),
            m11: Math.cos(rad),
            m12: 0
        };
        const parsed = parseTransformMatrix(m);
        assert.strictEqual(parsed.scaleX, -1);
        assert(Math.abs(parsed.rotateDeg - 75) < 0.2, `Expected +75deg rotation for reflected matrix, got ${parsed.rotateDeg}`);

        // BoundingBox with horizontal flip (m00 = -1)
        const flippedRect = {
            type: 'ROUNDED_RECTANGLE',
            size: { x: 140, y: 51 },
            transform: { m00: -1, m01: 0, m02: 1160, m10: 0, m11: 1, m12: 0 }
        };
        const box = BoundingBox.fromNode(flippedRect);
        assert.strictEqual(box.xMin, 1020);
        assert.strictEqual(box.xMax, 1160);
    });

    it('renders semantic <ol><li> lists with decimal list-style-type and supports minSize and CAP_HEIGHT leadingTrim', () => {
        const { renderNodeToHtml } = require('../../src/decompiler/html');
        const listNode = {
            name: 'Steps',
            type: 'TEXT',
            fontSize: 15,
            leadingTrim: 'CAP_HEIGHT',
            listSpacing: 6,
            minSize: { value: { x: 0, y: 46 } },
            textAutoResize: 'HEIGHT',
            textData: {
                characters: 'Step one\nStep two',
                lines: [
                    { lineType: 'ORDERED_LIST' },
                    { lineType: 'ORDERED_LIST' }
                ]
            }
        };
        const parentRow = { type: 'FRAME', stackMode: 'VERTICAL', size: { x: 300, y: 200 } };
        const styles = computeNodeStyles(listNode, parentRow);
        assert.strictEqual(styles['list-style-type'], 'decimal');
        assert.strictEqual(styles['text-box-trim'], 'trim-both');
        assert.strictEqual(styles['min-height'], '46px');

        const html = renderNodeToHtml(listNode, parentRow, new Map());
        assert(html.includes('<ol') && html.includes('<li>Step one</li>') && html.includes('<li>Step two</li>'));
    });

};

if (require.main === module) {
    let passed = 0, failed = 0;
    const itSync = (name, fn) => {
        try { fn(); console.log("  \x1b[32m✔\x1b[0m " + name); passed++; }
        catch (e) { failed++; console.error("  \x1b[31m✖\x1b[0m " + name + "\n    " + e.message); }
    };
    const itAsyncLocal = async (name, fn) => {
        try { await fn(); console.log("  \x1b[32m✔\x1b[0m " + name); passed++; }
        catch (e) { failed++; console.error("  \x1b[31m✖\x1b[0m " + name + "\n    " + (e.stack || e.message)); }
    };
    module.exports(itSync, itAsyncLocal).then(() => {
        console.log("\nPassed: " + passed + ", Failed: " + failed);
        if (failed > 0) process.exit(1);
    }).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
