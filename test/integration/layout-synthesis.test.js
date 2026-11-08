// Auto-generated test module
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const AdmZip = require("adm-zip");
const { getCompiledSchema } = require("../../src/schema");
const { ZstdCodec } = require("zstd-codec");
const {
    BoundingBox,
    Interval,
    fuzzyEqual,
    fuzzyCompare,
    clusterValues,
    mergeIntervals,
    findGaps,
    sliceAlongAxis,
    computeMedian
} = require("../../src/decompiler/geometry");
const {
    hasContainerVisualStyles,
    isUnderlayCandidate,
    promoteToContainer,
    detectAndExtractContainers
} = require("../../src/decompiler/container-detector");
const {
    detectGrid,
    isMaskContainer,
    hasTransformRotation,
    shouldSkipLayoutSynthesis,
    synthesizeContainerLayout,
    synthesizeLayoutTree,
    applySmartLayout
} = require("../../src/decompiler/synthesizer");
const { buildSceneTree, convertFigToHtml, readFigFile } = require("../../src/decompiler");
const { computeNodeStyles } = require("../../src/decompiler/css");
const { parseArgs: parseReverseArgs } = require("../../cli-reverse");

module.exports = async function(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };


    it('verifies BoundingBox geometric operations, intersections, containment and boundaries', () => {
        const boxA = new BoundingBox(10, 20, 110, 120);
        assert.strictEqual(boxA.x, 10);
        assert.strictEqual(boxA.y, 20);
        assert.strictEqual(boxA.width, 100);
        assert.strictEqual(boxA.height, 100);
        assert.strictEqual(boxA.centerX, 60);
        assert.strictEqual(boxA.centerY, 70);
        assert.strictEqual(boxA.area, 10000);

        // Containment
        const boxB = new BoundingBox(30, 40, 80, 90);
        assert(boxA.contains(boxB));
        assert(!boxB.contains(boxA));
        assert(boxA.containsPoint(60, 70));
        assert(!boxA.containsPoint(5, 5));

        // Intersection & Union
        const boxC = new BoundingBox(90, 100, 150, 160);
        assert(boxA.intersects(boxC));
        const inter = boxA.intersection(boxC);
        assert.strictEqual(inter.width, 20);
        assert.strictEqual(inter.height, 20);

        const boxD = new BoundingBox(200, 200, 300, 300);
        assert(!boxA.intersects(boxD));
        assert.strictEqual(boxA.distanceX(boxD), 90);
        assert.strictEqual(boxA.distanceY(boxD), 80);

        // Boundary overlap (e.g. badge protruding over top edge)
        const boxBadge = new BoundingBox(80, 10, 120, 35);
        assert(boxBadge.overlapsBoundary(boxA));

        // Node bounds extraction & union computation
        const mockNode = { transform: { m02: 50, m12: 60 }, size: { x: 140, y: 80 } };
        const nodeBox = BoundingBox.fromNode(mockNode);
        assert.strictEqual(nodeBox.xMin, 50);
        assert.strictEqual(nodeBox.yMin, 60);
        assert.strictEqual(nodeBox.width, 140);
        assert.strictEqual(nodeBox.height, 80);

        const unionBox = BoundingBox.computeUnion([boxA, boxD]);
        assert.strictEqual(unionBox.xMin, 10);
        assert.strictEqual(unionBox.yMin, 20);
        assert.strictEqual(unionBox.xMax, 300);
        assert.strictEqual(unionBox.yMax, 300);
    });

    it('handles negative coordinates, touching bounds, and zero-dimension boxes in BoundingBox', () => {
        const negBox = new BoundingBox(-100, -50, -20, -10);
        assert.strictEqual(negBox.xMin, -100);
        assert.strictEqual(negBox.yMin, -50);
        assert.strictEqual(negBox.width, 80);
        assert.strictEqual(negBox.height, 40);

        // Touching boxes
        const touch1 = new BoundingBox(0, 0, 50, 50);
        const touch2 = new BoundingBox(50, 0, 100, 50);
        assert.strictEqual(touch1.distanceX(touch2), 0);
        assert(!touch1.intersects(touch2, 0)); // touching at edge without overlap
        assert(touch1.intersects(touch2, -1)); // with negative epsilon (touches)

        // Empty items list
        const emptyUnion = BoundingBox.computeUnion([]);
        assert.strictEqual(emptyUnion.area, 0);
    });

    it('clusters 1D intervals and values with fuzzy tolerance epsilon = 3px', () => {
        // Numeric clustering
        const clusters = clusterValues([10, 11, 13, 50, 52, 100], 3);
        assert.strictEqual(clusters.length, 3);
        assert.deepStrictEqual(clusters[0].values, [10, 11, 13]);
        assert.strictEqual(clusters[0].median, 11);
        assert.deepStrictEqual(clusters[1].values, [50, 52]);
        assert.deepStrictEqual(clusters[2].values, [100]);

        // Fuzzy equality & comparison
        assert(fuzzyEqual(10, 12, 3));
        assert(fuzzyEqual(10, 13, 3));
        assert(!fuzzyEqual(10, 14, 3));
        assert.strictEqual(fuzzyCompare(10, 12, 3), 0);
        assert.strictEqual(fuzzyCompare(10, 15, 3), -1);
        assert.strictEqual(fuzzyCompare(20, 10, 3), 1);

        // 1D Intervals and gap finding
        const i1 = new Interval(0, 100, 'item1');
        const i2 = new Interval(98, 150, 'item2'); // overlaps i1 with epsilon
        const i3 = new Interval(180, 250, 'item3');

        assert(i1.overlaps(i2, 3));
        assert(!i1.overlaps(i3, 3));
        assert.strictEqual(i2.distanceTo(i3), 30);

        const merged = mergeIntervals([i1, i2, i3], 3);
        assert.strictEqual(merged.length, 2);
        assert.strictEqual(merged[0].interval.start, 0);
        assert.strictEqual(merged[0].interval.end, 150);
        assert.deepStrictEqual(merged[0].items, ['item1', 'item2']);

        const gaps = findGaps(merged);
        assert.strictEqual(gaps.length, 1);
        assert.strictEqual(gaps[0].start, 150);
        assert.strictEqual(gaps[0].end, 180);
        assert.strictEqual(gaps[0].size, 30);
    });

    it('slices nodes along X and Y axes into clean projection bands', () => {
        // 3 vertically stacked blocks
        const vertNodes = [
            { transform: { m02: 0, m12: 0 }, size: { x: 200, y: 40 } },
            { transform: { m02: 0, m12: 60 }, size: { x: 200, y: 40 } },
            { transform: { m02: 0, m12: 120 }, size: { x: 200, y: 40 } }
        ];

        const yBands = sliceAlongAxis(vertNodes, 'y', 3);
        assert.strictEqual(yBands.length, 3, 'Should produce 3 distinct vertical bands');
        assert.strictEqual(yBands[0].nodes.length, 1);
        assert.strictEqual(yBands[1].nodes.length, 1);
        assert.strictEqual(yBands[2].nodes.length, 1);

        const xBands = sliceAlongAxis(vertNodes, 'x', 3);
        assert.strictEqual(xBands.length, 1, 'Should produce 1 horizontal band because all share same X interval');

        // 3 horizontally adjacent items (navbar)
        const horizNodes = [
            { transform: { m02: 0, m12: 10 }, size: { x: 100, y: 40 } },
            { transform: { m02: 150, m12: 10 }, size: { x: 200, y: 40 } },
            { transform: { m02: 400, m12: 10 }, size: { x: 120, y: 40 } }
        ];

        const h_xBands = sliceAlongAxis(horizNodes, 'x', 3);
        assert.strictEqual(h_xBands.length, 3, 'Should produce 3 horizontal bands');

        const h_yBands = sliceAlongAxis(horizNodes, 'y', 3);
        assert.strictEqual(h_yBands.length, 1, 'Should produce 1 vertical band');
    });

    it('detects visual styles and underlay card candidates', () => {
        // Fill paint
        assert(hasContainerVisualStyles({ fillPaints: [{ type: 'SOLID', visible: true }] }));
        // Stroke paint
        assert(hasContainerVisualStyles({ strokePaints: [{ type: 'SOLID', visible: true }], strokeWeight: 1 }));
        // Corner radius
        assert(hasContainerVisualStyles({ cornerRadius: 8 }));
        // Shadow effect
        assert(hasContainerVisualStyles({ effects: [{ type: 'DROP_SHADOW', visible: true }] }));
        // Empty styling
        assert(!hasContainerVisualStyles({}));
        assert(!hasContainerVisualStyles({ fillPaints: [] }));

        // Underlay candidate check
        assert(isUnderlayCandidate({ type: 'RECTANGLE', fillPaints: [{ type: 'SOLID', visible: true }] }));
        assert(!isUnderlayCandidate({ type: 'TEXT', fillPaints: [{ type: 'SOLID', visible: true }] }));
        assert(!isUnderlayCandidate({ type: 'RECTANGLE', children: [{ name: 'child' }], fillPaints: [{ type: 'SOLID' }] }));
    });

    it('promotes underlay rectangles to semantic containers and nests enclosed children', () => {
        const cardBg = {
            guid: { sessionID: 0, localID: 1 },
            type: 'RECTANGLE',
            name: 'CardBackground',
            transform: { m00: 1, m01: 0, m02: 50, m10: 0, m11: 1, m12: 100 },
            size: { x: 400, y: 300 },
            fillPaints: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, visible: true }],
            cornerRadius: 16,
            effects: [{ type: 'DROP_SHADOW', visible: true, radius: 10 }]
        };
        const titleText = {
            guid: { sessionID: 0, localID: 2 },
            type: 'TEXT',
            name: 'Title',
            transform: { m00: 1, m01: 0, m02: 70, m10: 0, m11: 1, m12: 120 },
            size: { x: 200, y: 24 }
        };
        const descText = {
            guid: { sessionID: 0, localID: 3 },
            type: 'TEXT',
            name: 'Description',
            transform: { m00: 1, m01: 0, m02: 70, m10: 0, m11: 1, m12: 160 },
            size: { x: 360, y: 60 }
        };

        const result = detectAndExtractContainers([cardBg, titleText, descText]);
        assert.strictEqual(result.length, 1, 'Should collapse underlay and contents into 1 container');

        const container = result[0];
        assert.strictEqual(container.type, 'FRAME');
        assert.strictEqual(container.isSynthesizedContainer, true);
        assert.strictEqual(container.cornerRadius, 16);
        assert.strictEqual(container.children.length, 2);

        // Child coordinates adjusted relative to container
        assert.strictEqual(titleText.transform.m02, 20);
        assert.strictEqual(titleText.transform.m12, 20);
        assert.strictEqual(descText.transform.m02, 20);
        assert.strictEqual(descText.transform.m12, 60);
    });

    it('handles multi-level nested underlay containers (card containing button)', () => {
        const outerCard = {
            guid: { sessionID: 0, localID: 10 },
            type: 'RECTANGLE',
            name: 'OuterCard',
            transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
            size: { x: 500, y: 400 },
            fillPaints: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, visible: true }]
        };
        const cardTitle = {
            guid: { sessionID: 0, localID: 11 },
            type: 'TEXT',
            name: 'CardTitle',
            transform: { m00: 1, m01: 0, m02: 30, m10: 0, m11: 1, m12: 30 },
            size: { x: 300, y: 30 }
        };
        const btnUnderlay = {
            guid: { sessionID: 0, localID: 12 },
            type: 'RECTANGLE',
            name: 'BtnBg',
            transform: { m00: 1, m01: 0, m02: 30, m10: 0, m11: 1, m12: 300 },
            size: { x: 140, y: 44 },
            fillPaints: [{ type: 'SOLID', color: { r: 0, g: 0.5, b: 1, a: 1 }, visible: true }],
            cornerRadius: 8
        };
        const btnText = {
            guid: { sessionID: 0, localID: 13 },
            type: 'TEXT',
            name: 'BtnText',
            transform: { m00: 1, m01: 0, m02: 50, m10: 0, m11: 1, m12: 312 },
            size: { x: 100, y: 20 }
        };

        const result = detectAndExtractContainers([outerCard, cardTitle, btnUnderlay, btnText]);
        assert.strictEqual(result.length, 1);

        const card = result[0];
        assert.strictEqual(card.type, 'FRAME');
        assert.strictEqual(card.children.length, 2);

        const btn = card.children.find(c => c.name === 'BtnBg');
        assert(btn);
        assert.strictEqual(btn.type, 'FRAME');
        assert.strictEqual(btn.children.length, 1);
        assert.strictEqual(btn.children[0].name, 'BtnText');

        // Relative coordinates: btn relative to card, text relative to btn
        assert.strictEqual(btn.transform.m02, 30);
        assert.strictEqual(btn.transform.m12, 300);
        assert.strictEqual(btn.children[0].transform.m02, 20);
        assert.strictEqual(btn.children[0].transform.m12, 12);
    });

    it('isolates floating decorative badges and close buttons across container boundaries', () => {
        const cardBg = {
            guid: { sessionID: 0, localID: 20 },
            type: 'RECTANGLE',
            name: 'Card',
            transform: { m00: 1, m01: 0, m02: 100, m10: 0, m11: 1, m12: 100 },
            size: { x: 400, y: 300 },
            fillPaints: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, visible: true }],
            cornerRadius: 16
        };
        const titleText = {
            guid: { sessionID: 0, localID: 21 },
            type: 'TEXT',
            name: 'Title',
            transform: { m00: 1, m01: 0, m02: 120, m10: 0, m11: 1, m12: 120 },
            size: { x: 200, y: 24 }
        };
        const badge = {
            guid: { sessionID: 0, localID: 22 },
            type: 'RECTANGLE',
            name: 'SaleBadge',
            transform: { m00: 1, m01: 0, m02: 460, m10: 0, m11: 1, m12: 88 }, // overlaps top-right corner
            size: { x: 60, y: 24 },
            fillPaints: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, visible: true }],
            cornerRadius: 12
        };

        const result = detectAndExtractContainers([cardBg, titleText, badge]);
        assert.strictEqual(result.length, 1);

        const card = result[0];
        assert.strictEqual(card.children.length, 2);

        const badgeChild = card.children.find(c => c.name === 'SaleBadge');
        assert(badgeChild);
        assert.strictEqual(badgeChild.stackPositioning, 'ABSOLUTE');
        assert.strictEqual(badgeChild.isDecorativeOverlay, true);
        assert.strictEqual(badgeChild.transform.m02, 360);
        assert.strictEqual(badgeChild.transform.m12, -12);
    });

    it('induces N x M matrix grids with uniform stride and gaps', () => {
        // 6 cards arranged in 2 rows of 3 columns
        const cards = [
            { name: 'C1', transform: { m02: 0, m12: 0 }, size: { x: 300, y: 200 } },
            { name: 'C2', transform: { m02: 320, m12: 0 }, size: { x: 300, y: 200 } },
            { name: 'C3', transform: { m02: 640, m12: 0 }, size: { x: 300, y: 200 } },
            { name: 'C4', transform: { m02: 0, m12: 240 }, size: { x: 300, y: 200 } },
            { name: 'C5', transform: { m02: 320, m12: 240 }, size: { x: 300, y: 200 } },
            { name: 'C6', transform: { m02: 640, m12: 240 }, size: { x: 300, y: 200 } }
        ];

        const gridInfo = detectGrid(cards);
        assert(gridInfo.isGrid);
        assert.strictEqual(gridInfo.rows, 2);
        assert.strictEqual(gridInfo.columns, 3);
        assert.strictEqual(gridInfo.columnGap, 20);
        assert.strictEqual(gridInfo.rowGap, 40);
        assert.strictEqual(gridInfo.orderedNodes.length, 6);

        const container = {
            type: 'FRAME',
            size: { x: 1000, y: 600 },
            children: [...cards]
        };
        synthesizeContainerLayout(container);
        assert.strictEqual(container.isGrid, true);
        assert.strictEqual(container.gridColumns, 3);
        assert.strictEqual(container.gridRows, 2);
        assert.strictEqual(container.gridColumnGap, 20);
        assert.strictEqual(container.gridRowGap, 40);
        assert.strictEqual(container.stackMode, 'HORIZONTAL');
        assert.strictEqual(container.stackWrap, 'WRAP');
    });

    it('rejects irregular card layouts in detectGrid when spacing or counts differ', () => {
        // Only 3 cards (not a full multi-row matrix)
        const fewCards = [
            { name: 'C1', transform: { m02: 0, m12: 0 }, size: { x: 300, y: 200 } },
            { name: 'C2', transform: { m02: 320, m12: 0 }, size: { x: 300, y: 200 } }
        ];
        assert.strictEqual(detectGrid(fewCards).isGrid, false);

        // Unequal column gaps (gap 1 is 20px, gap 2 is 80px)
        const irregularGapCards = [
            { name: 'C1', transform: { m02: 0, m12: 0 }, size: { x: 100, y: 100 } },
            { name: 'C2', transform: { m02: 120, m12: 0 }, size: { x: 100, y: 100 } },
            { name: 'C3', transform: { m02: 300, m12: 0 }, size: { x: 100, y: 100 } },
            { name: 'C4', transform: { m02: 0, m12: 120 }, size: { x: 100, y: 100 } },
            { name: 'C5', transform: { m02: 120, m12: 120 }, size: { x: 100, y: 100 } },
            { name: 'C6', transform: { m02: 300, m12: 120 }, size: { x: 100, y: 100 } }
        ];
        assert.strictEqual(detectGrid(irregularGapCards).isGrid, false);
    });

    it('synthesizes container layout for single child with 4-sided asymmetric padding', () => {
        const container = {
            type: 'FRAME',
            size: { x: 500, y: 300 },
            stackMode: 'NONE',
            children: [
                {
                    type: 'FRAME',
                    name: 'Hero',
                    transform: { m00: 1, m01: 0, m02: 20, m10: 0, m11: 1, m12: 30 },
                    size: { x: 400, y: 200 },
                    stackMode: 'NONE',
                    children: []
                }
            ]
        };

        synthesizeContainerLayout(container);
        assert.strictEqual(container.stackMode, 'VERTICAL');
        assert.strictEqual(container.stackHorizontalPadding, 20); // pl
        assert.strictEqual(container.stackVerticalPadding, 30);   // pt
        assert.strictEqual(container.stackPaddingRight, 80);      // pr: 500 - (20 + 400) = 80
        assert.strictEqual(container.stackPaddingBottom, 70);     // pb: 300 - (30 + 200) = 70
    });

    it('applies smart layout via buildSceneTree options', () => {
        const nodeChanges = [
            { guid: { sessionID: 0, localID: 1 }, type: 'DOCUMENT' },
            { guid: { sessionID: 0, localID: 2 }, type: 'CANVAS', name: 'Page 1' },
            {
                guid: { sessionID: 0, localID: 3 },
                type: 'FRAME',
                name: 'FlatFrame',
                parentIndex: { guid: { sessionID: 0, localID: 2 }, position: 'a' },
                size: { x: 800, y: 400 },
                stackMode: 'NONE'
            },
            {
                guid: { sessionID: 0, localID: 4 },
                type: 'TEXT',
                name: 'Title',
                parentIndex: { guid: { sessionID: 0, localID: 3 }, position: 'a' },
                transform: { m00: 1, m01: 0, m02: 40, m10: 0, m11: 1, m12: 40 },
                size: { x: 300, y: 30 }
            },
            {
                guid: { sessionID: 0, localID: 5 },
                type: 'TEXT',
                name: 'Subtitle',
                parentIndex: { guid: { sessionID: 0, localID: 3 }, position: 'b' },
                transform: { m00: 1, m01: 0, m02: 40, m10: 0, m11: 1, m12: 90 },
                size: { x: 400, y: 24 }
            }
        ];

        const tree = buildSceneTree(nodeChanges, { smartLayout: true });
        const frame = tree.rootNodes[0];
        assert.strictEqual(frame.stackMode, 'VERTICAL');
        assert.strictEqual(frame.stackVerticalPadding, 40);
        assert.strictEqual(frame.stackHorizontalPadding, 40);
        assert.strictEqual(frame.stackSpacing, 20); // 90 - (40 + 30) = 20
    });

    it('synthesizes recursive XY-Cut flex columns and rows with gap, padding and alignment', () => {
        const root = {
            type: 'FRAME',
            name: 'Page',
            size: { x: 1000, y: 800 },
            stackMode: 'NONE',
            children: [
                // Navbar: Logo + CTA button side by side
                { name: 'Logo', type: 'TEXT', transform: { m00: 1, m01: 0, m02: 40, m10: 0, m11: 1, m12: 30 }, size: { x: 100, y: 30 } },
                { name: 'CTA', type: 'RECTANGLE', transform: { m00: 1, m01: 0, m02: 860, m10: 0, m11: 1, m12: 25 }, size: { x: 100, y: 40 }, fillPaints: [{ type: 'SOLID', visible: true }] },
                // Hero title
                { name: 'Title', type: 'TEXT', transform: { m00: 1, m01: 0, m02: 40, m10: 0, m11: 1, m12: 120 }, size: { x: 600, y: 40 } },
                // Footer
                { name: 'Footer', type: 'TEXT', transform: { m00: 1, m01: 0, m02: 40, m10: 0, m11: 1, m12: 740 }, size: { x: 400, y: 20 } }
            ]
        };

        synthesizeLayoutTree(root);
        assert.strictEqual(root.stackMode, 'VERTICAL', 'Page should be a vertical stack');
        assert.strictEqual(root.children.length, 3, 'Page should have 3 rows (Navbar, Title, Footer)');

        const navbar = root.children[0];
        assert.strictEqual(navbar.type, 'FRAME');
        assert.strictEqual(navbar.stackMode, 'HORIZONTAL', 'Navbar should be a horizontal flex row');
        assert.strictEqual(navbar.stackPrimaryAlignItems, 'SPACE_BETWEEN', 'Navbar should be space-between');
        assert.strictEqual(navbar.stackCounterAlignItems, 'CENTER', 'Navbar items should be vertically center aligned');
    });

    it('parses reverse CLI arguments for --smart-layout and --no-smart-layout', () => {
        const optDefault = parseReverseArgs(['input.fig']);
        assert.strictEqual(optDefault.smartLayout, true, 'Default should enable smartLayout');

        const optNoSmart = parseReverseArgs(['input.fig', '--no-smart-layout']);
        assert.strictEqual(optNoSmart.smartLayout, false, '--no-smart-layout should disable smartLayout');

        const optNoSmartAlias = parseReverseArgs(['input.fig', '--no-smart']);
        assert.strictEqual(optNoSmartAlias.smartLayout, false, '--no-smart should disable smartLayout');

        const optSmartExplicit = parseReverseArgs(['input.fig', '--smart-layout']);
        assert.strictEqual(optSmartExplicit.smartLayout, true, '--smart-layout should enable smartLayout');
    });

    await itAsync('decompiles non-Auto Layout Figma scene into clean Flexbox & Grid without position: absolute', async () => {
        const { nodeChanges, blobs } = readFigFile('test/showcase.fig');
        // Strip all Auto Layout properties from all nodes
        const strippedNodes = nodeChanges.map(n => {
            const copy = { ...n };
            copy.stackMode = 'NONE';
            delete copy.stackSpacing;
            delete copy.stackVerticalPadding;
            delete copy.stackHorizontalPadding;
            delete copy.stackPrimaryAlignItems;
            delete copy.stackCounterAlignItems;
            delete copy.stackWrap;
            return copy;
        });

        const templateZip = new AdmZip('templates/template.fig');
        const canvasFig = templateZip.getEntry('canvas.fig').getData();
        const schemaLen = canvasFig.readUInt32LE(12);
        const schemaDeflated = canvasFig.slice(16, 16 + schemaLen);

        const schema = getCompiledSchema(schemaDeflated);
        const encoded = schema.encodeMessage({ nodeChanges: strippedNodes, blobs: blobs || [] });

        const zstd = await new Promise(resolve => ZstdCodec.run(resolve));
        const simple = new zstd.Simple();
        const compressed = simple.compress(encoded);

        const totalLen = 16 + schemaDeflated.length + 4 + compressed.length;
        const newCanvas = Buffer.alloc(totalLen);
        newCanvas.write('fig-kiwi', 0, 8, 'ascii');
        newCanvas.writeUInt32LE(101, 8);
        newCanvas.writeUInt32LE(schemaDeflated.length, 12);
        schemaDeflated.copy(newCanvas, 16);

        const chunk1Offset = 16 + schemaDeflated.length;
        newCanvas.writeUInt32LE(compressed.length, chunk1Offset);
        Buffer.from(compressed).copy(newCanvas, chunk1Offset + 4);

        const outZip = new AdmZip('test/showcase.fig');
        outZip.deleteFile('canvas.fig');
        outZip.addFile('canvas.fig', newCanvas);
        const outFigPath = path.resolve('test/e2e-no-autolayout.fig');
        outZip.writeZip(outFigPath);

        const outHtmlPath = path.resolve('test/e2e-smart-layout.html');
        const res = await convertFigToHtml(outFigPath, {
            outputHtmlPath: outHtmlPath,
            smartLayout: true,
            inlineImages: true
        });

        assert(fs.existsSync(outHtmlPath));
        const html = fs.readFileSync(outHtmlPath, 'utf8');

        // Check that layout synthesis reconstructed flexbox
        assert(html.includes('display: flex'), 'Synthesized layout should use display: flex');
        const absMatches = html.match(/position:\s*absolute/g) || [];
        assert(absMatches.length <= 5, `Expected <= 5 absolute elements (overlays only), got ${absMatches.length}`);

        fs.unlinkSync(outHtmlPath);
        fs.unlinkSync(outFigPath);
    });

    await itAsync('falls back to position: absolute when --no-smart-layout is specified', async () => {
        const { nodeChanges, blobs } = readFigFile('test/showcase.fig');
        const strippedNodes = nodeChanges.map(n => {
            const copy = { ...n };
            copy.stackMode = 'NONE';
            delete copy.stackSpacing;
            delete copy.stackVerticalPadding;
            delete copy.stackHorizontalPadding;
            delete copy.stackPrimaryAlignItems;
            delete copy.stackCounterAlignItems;
            delete copy.stackWrap;
            return copy;
        });

        const templateZip = new AdmZip('templates/template.fig');
        const canvasFig = templateZip.getEntry('canvas.fig').getData();
        const schemaLen = canvasFig.readUInt32LE(12);
        const schemaDeflated = canvasFig.slice(16, 16 + schemaLen);

        const schema = getCompiledSchema(schemaDeflated);
        const encoded = schema.encodeMessage({ nodeChanges: strippedNodes, blobs: blobs || [] });

        const zstd = await new Promise(resolve => ZstdCodec.run(resolve));
        const simple = new zstd.Simple();
        const compressed = simple.compress(encoded);

        const totalLen = 16 + schemaDeflated.length + 4 + compressed.length;
        const newCanvas = Buffer.alloc(totalLen);
        newCanvas.write('fig-kiwi', 0, 8, 'ascii');
        newCanvas.writeUInt32LE(101, 8);
        newCanvas.writeUInt32LE(schemaDeflated.length, 12);
        schemaDeflated.copy(newCanvas, 16);

        const chunk1Offset = 16 + schemaDeflated.length;
        newCanvas.writeUInt32LE(compressed.length, chunk1Offset);
        Buffer.from(compressed).copy(newCanvas, chunk1Offset + 4);

        const outZip = new AdmZip('test/showcase.fig');
        outZip.deleteFile('canvas.fig');
        outZip.addFile('canvas.fig', newCanvas);
        const outFigPath = path.resolve('test/e2e-no-autolayout-fallback.fig');
        outZip.writeZip(outFigPath);

        const outHtmlPath = path.resolve('test/e2e-fallback.html');
        const res = await convertFigToHtml(outFigPath, {
            outputHtmlPath: outHtmlPath,
            smartLayout: false,
            inlineImages: true
        });

        assert(fs.existsSync(outHtmlPath));
        const html = fs.readFileSync(outHtmlPath, 'utf8');

        // Check fallback to position: absolute
        const absMatches = html.match(/position:\s*absolute/g) || [];
        assert(absMatches.length >= 40, `Expected >= 40 absolute elements in fallback mode, got ${absMatches.length}`);

        fs.unlinkSync(outHtmlPath);
        fs.unlinkSync(outFigPath);
    });

    it('handles equal-dimension flex distribution and outlier items in row', () => {
        const mixedRow = {
            type: 'FRAME',
            name: 'Row',
            size: { x: 1000, y: 200 },
            stackMode: 'NONE',
            children: [
                { name: 'CardA', transform: { m02: 0, m12: 0 }, size: { x: 300, y: 200 }, stackMode: 'NONE' },
                { name: 'CardB', transform: { m02: 320, m12: 0 }, size: { x: 300, y: 200 }, stackMode: 'NONE' },
                { name: 'CardC', transform: { m02: 640, m12: 0 }, size: { x: 300, y: 200 }, stackMode: 'NONE' },
                { name: 'SideBadge', transform: { m02: 960, m12: 80 }, size: { x: 40, y: 40 }, stackMode: 'NONE' }
            ]
        };
        synthesizeContainerLayout(mixedRow);
        assert.strictEqual(mixedRow.stackMode, 'HORIZONTAL');
        assert.strictEqual(mixedRow.children[0].isEqualWidthGroup, true);
        assert.strictEqual(mixedRow.children[0].layoutGrow, 1);
        assert.strictEqual(mixedRow.children[1].isEqualWidthGroup, true);
        assert.strictEqual(mixedRow.children[2].isEqualWidthGroup, true);
        assert.strictEqual(mixedRow.children[3].isEqualWidthGroup, undefined);
        assert.strictEqual(mixedRow.children[3].layoutGrow, undefined);
    });

    it('marks button-like containers to hug content and omit fixed width/height', () => {
        const btnRow = {
            type: 'FRAME',
            name: 'BtnRow',
            size: { x: 300, y: 50 },
            stackMode: 'NONE',
            children: [
                { name: 'btn-submit', transform: { m02: 0, m12: 0 }, size: { x: 140, y: 44 }, stackMode: 'NONE' }
            ]
        };
        synthesizeContainerLayout(btnRow);
        assert.strictEqual(btnRow.children[0].isButton, true);
        assert.strictEqual(btnRow.children[0].stackPrimarySizing, 'RESIZE_TO_FIT');
        assert.strictEqual(btnRow.children[0].stackCounterSizing, 'RESIZE_TO_FIT');
    });

    await itAsync('decompiles unorganized.fig with clean Flexbox, no redundant width/height, and accurate section margins', async () => {
        if (!fs.existsSync('unorganized.fig')) return;
        const res = await convertFigToHtml('unorganized.fig', { smartLayout: true });
        const html = res.html;
        assert(!html.includes('height: 215px'), 'Should not contain hardcoded height: 215px');
        assert(!html.includes('width: 317px'), 'Should not contain hardcoded width: 317px');
        assert(!html.includes('width: 175px'), 'btn-primary should not contain hardcoded width: 175px');
        assert(!html.includes('height: 45px'), 'Buttons should not contain hardcoded height: 45px');
        assert(html.includes('.main-container'), 'Root container present as .main-container');

        // Ensure root container does NOT have artificial gap and uses responsive max-width
        const rootBlockMatch = html.match(/\.main-container\s*\{([^}]+)\}/);
        assert(rootBlockMatch, 'Root css block should exist');
        assert(!rootBlockMatch[1].includes('gap:'), 'Root block should not have artificial uniform gap');
        assert(rootBlockMatch[1].includes('max-width: 1080px'), 'Root container should have max-width: 1080px');
        assert(rootBlockMatch[1].includes('width: 100%'), 'Root container should have width: 100%');

        // Ensure precise margin-top rhythm is applied to sections
        assert(html.includes('margin-top: 20px') || html.includes('margin-top: var(--space-5)'), 'Title should have margin-top: 20px or var(--space-5)');
        assert(html.includes('margin-top: 10px') || html.includes('margin-top: var(--space-2-5)') || html.includes('margin-top: var(--space-10px)'), 'Subtitle should have margin-top: 10px');
        assert(html.includes('margin-top: 32px') || html.includes('margin-top: var(--space-8)'), 'Row should have margin-top: 32px or var(--space-8)');
        assert(html.includes('margin-top: 36px') || html.includes('margin-top: var(--space-9)'), 'Row-2 should have margin-top: 36px or var(--space-9)');
    });

    await itAsync('decompiles demo-absolute.fig without redundant height on rows, with elevated overlay z-index and paintFilter', async () => {
        if (!fs.existsSync('demo-absolute.fig')) return;
        const res = await convertFigToHtml('demo-absolute.fig', { smartLayout: true });
        const html = res.html;

        // 1. Row container should NOT have static height and should align to flex-start
        const rowMatch = html.match(/\.row\s*\{([^}]+)\}/);
        assert(rowMatch, '.row rule should exist');
        assert(!rowMatch[1].includes('height:'), '.row should not have hardcoded height');
        assert(!rowMatch[1].includes('flex-shrink: 0'), '.row should not have flex-shrink: 0');
        assert(rowMatch[1].includes('align-items: flex-start'), '.row should have align-items: flex-start');

        // Check text with Auto line-height in Figma is converted to normal, not 1
        const titleMatch = html.match(/\.card-title\s*\{([^}]+)\}/);
        assert(titleMatch, '.card-title rule should exist');
        assert(titleMatch[1].includes('line-height: normal'), '.card-title should have line-height: normal');
        assert(!titleMatch[1].includes('line-height: 1;'), '.card-title should not have line-height: 1');

        // 2. Main container should be responsive max-width with symmetric padding
        const mainMatch = html.match(/\.main-container\s*\{([^}]+)\}/);
        assert(mainMatch, '.main-container should exist');
        assert(mainMatch[1].includes('max-width: 1080px'), '.main-container should have max-width: 1080px');
        assert(!/(?:^|[^-])width:\s*1080px/.test(mainMatch[1]), '.main-container should not have fixed width: 1080px');
        assert(mainMatch[1].includes('padding: 46px 40px 40px 40px') || mainMatch[1].includes('padding: 46px var(--space-10) var(--space-10) var(--space-10)'), '.main-container should have symmetric 40px padding');
        assert(!mainMatch[1].includes('padding: 46px 0px 40px 40px') && !mainMatch[1].includes('padding: 46px 0px var(--space-10) var(--space-10)'), '.main-container should not lose right padding due to absolute overlay');

        // 3. Absolute overlay elements should have elevated z-index and image paintFilter
        const abs2Match = html.match(/\.absolute-element-2\s*\{([^}]+)\}/);
        assert(abs2Match, '.absolute-element-2 should exist');
        assert(abs2Match[1].includes('z-index:'), '.absolute-element-2 should have z-index');
        const zIndexVal = parseInt(abs2Match[1].match(/z-index:\s*(\d+)/)[1], 10);
        assert(zIndexVal >= 10, `Overlay z-index should be >= 10, got ${zIndexVal}`);
        assert(abs2Match[1].includes('filter: brightness(1.09) contrast(1.15) grayscale(1)'), 'Should contain image filter');

        // 4. Overlays should not be clipped by synthesized containers
        assert(!rowMatch[1].includes('overflow: hidden'), '.row should not clip overlay children');
    });

    it('isolates elements bleeding outside canvas boundaries without distorting container padding', () => {
        const frame = {
            type: 'FRAME',
            name: 'Hero',
            size: { x: 1000, y: 500 },
            stackMode: 'NONE',
            children: [
                { name: 'Title', transform: { m02: 50, m12: 40 }, size: { x: 900, y: 60 }, stackMode: 'NONE' },
                { name: 'Card', transform: { m02: 50, m12: 120 }, size: { x: 900, y: 320 }, stackMode: 'NONE' },
                // Bleeds off right edge (xMax = 1050 > 1000)
                { name: 'BleedingCoin', transform: { m02: 950, m12: 80 }, size: { x: 100, y: 100 }, stackMode: 'NONE' }
            ]
        };
        synthesizeContainerLayout(frame);
        assert.strictEqual(frame.stackPaddingRight, 50, 'Right padding should be 50px from in-flow cards, not 0');
        assert.strictEqual(frame.stackHorizontalPadding, 50, 'Left padding should be 50px');
        assert.strictEqual(frame.stackVerticalPadding, 40, 'Top padding should be 40px');
        assert.strictEqual(frame.stackPaddingBottom, 60, 'Bottom padding should be 60px');
        const coin = frame.children.find(c => c.name === 'BleedingCoin');
        assert(coin, 'Coin should be in children');
        assert.strictEqual(coin.stackPositioning, 'ABSOLUTE', 'Coin should be positioned absolutely');
        assert.strictEqual(coin.isDecorativeOverlay, true, 'Coin should be marked as decorative overlay');
    });

    it('translates Figma Auto Layout SPACE_EVENLY and SPACE_BETWEEN into justify-content: space-between', () => {
        const dummyParent = { type: 'FRAME', stackMode: 'VERTICAL' };
        const nodeEvenly = {
            type: 'FRAME',
            stackMode: 'HORIZONTAL',
            stackPrimaryAlignItems: 'SPACE_EVENLY',
            children: [{ type: 'FRAME' }, { type: 'FRAME' }]
        };
        const sEvenly = computeNodeStyles(nodeEvenly, dummyParent);
        assert.strictEqual(sEvenly['justify-content'], 'space-between');

        const nodeBetween = {
            type: 'FRAME',
            stackMode: 'HORIZONTAL',
            stackPrimaryAlignItems: 'SPACE_BETWEEN',
            children: [{ type: 'FRAME' }, { type: 'FRAME' }]
        };
        const sBetween = computeNodeStyles(nodeBetween, dummyParent);
        assert.strictEqual(sBetween['justify-content'], 'space-between');

        const nodeAround = {
            type: 'FRAME',
            stackMode: 'HORIZONTAL',
            stackPrimaryAlignItems: 'SPACE_AROUND',
            children: [{ type: 'FRAME' }, { type: 'FRAME' }]
        };
        const sAround = computeNodeStyles(nodeAround, dummyParent);
        assert.strictEqual(sAround['justify-content'], 'space-around');
    });

    it('calculates proper layer z-index for absolute underlays, overlays and adds pointer-events: none for images', () => {
        const bgVector = {
            name: 'Vector',
            type: 'VECTOR',
            stackPositioning: 'ABSOLUTE',
            transform: { m02: 0, m12: 0 },
            size: { x: 500, y: 500 }
        };
        const inFlowCard = {
            name: 'Card',
            type: 'FRAME',
            stackPositioning: 'AUTO',
            size: { x: 400, y: 300 }
        };
        const badgeOverlay = {
            name: 'Badge',
            type: 'FRAME',
            stackPositioning: 'ABSOLUTE',
            isDecorativeOverlay: true,
            transform: { m02: 380, m12: -10 },
            size: { x: 40, y: 40 }
        };

        const parent = {
            type: 'FRAME',
            stackMode: 'HORIZONTAL',
            children: [bgVector, inFlowCard, badgeOverlay]
        };

        const sBg = computeNodeStyles(bgVector, parent);
        assert.strictEqual(sBg['position'], 'absolute');
        assert.strictEqual(sBg['z-index'], undefined, 'Background underlay (before in-flow) should have z-index: auto (omitted) to avoid isolating stacking context');
        assert.strictEqual(sBg['pointer-events'], 'none', 'Vector decoration should have pointer-events: none');

        const sCard = computeNodeStyles(inFlowCard, parent);
        assert.strictEqual(sCard['position'], 'relative');
        assert.strictEqual(sCard['z-index'], '1', 'In-flow content with underlay should be elevated to z-index: 1');

        const sBadge = computeNodeStyles(badgeOverlay, parent);
        assert.strictEqual(sBadge['position'], 'absolute');
        const badgeZ = parseInt(sBadge['z-index'], 10);
        assert(badgeZ >= 10, 'Overlay badge (after in-flow) should have elevated z-index >= 10');

        // Image node should also have pointer-events: none
        const imgNode = {
            name: 'Image 1',
            type: 'RECTANGLE',
            stackPositioning: 'ABSOLUTE',
            fillPaints: [{ type: 'IMAGE', visible: true }],
            transform: { m02: 0, m12: 0 },
            size: { x: 100, y: 100 }
        };
        const sImg = computeNodeStyles(imgNode, parent);
        assert.strictEqual(sImg['pointer-events'], 'none', 'Absolute image should have pointer-events: none');
    });

    it('preserves fixed width and height for Mask Group containers and masks child images', () => {
        const maskGroup = {
            name: 'Mask group',
            type: 'FRAME',
            cornerRadius: 90,
            size: { x: 92, y: 92 },
            stackMode: 'NONE',
            children: [
                {
                    name: 'image 45',
                    type: 'ROUNDED_RECTANGLE',
                    fillPaints: [{ type: 'IMAGE', visible: true }],
                    size: { x: 110, y: 130 }
                }
            ]
        };

        const parent = {
            type: 'FRAME',
            stackMode: 'VERTICAL',
            children: [maskGroup]
        };

        assert.strictEqual(isMaskContainer(maskGroup), true);
        synthesizeContainerLayout(maskGroup);
        // Should not be turned into a flex column
        assert.notStrictEqual(maskGroup.stackMode, 'VERTICAL');

        const sMask = computeNodeStyles(maskGroup, parent);
        assert.strictEqual(sMask['width'], '92px', 'Mask group must retain fixed width');
        assert.strictEqual(sMask['height'], '92px', 'Mask group must retain fixed height');
        assert.strictEqual(sMask['overflow'], 'hidden');

        const sImg = computeNodeStyles(maskGroup.children[0], maskGroup);
        assert.strictEqual(sImg['width'], '100%');
        assert.strictEqual(sImg['height'], '100%');
        assert.strictEqual(sImg['object-fit'], 'cover');
    });

    it('parses Figma Kiwi gridColumns entries object into integer repeat count in CSS grid-template-columns', () => {
        const dummyParent = { type: 'FRAME' };
        const gridNode = {
            type: 'FRAME',
            name: 'Frame 116047436',
            stackMode: 'HORIZONTAL',
            stackWrap: 'WRAP',
            gridColumns: {
                entries: [
                    { id: { sessionID: 80, localID: 3 }, position: '!' },
                    { id: { sessionID: 80, localID: 4 }, position: '"' },
                    { id: { sessionID: 2104, localID: 1 }, position: '#' }
                ]
            },
            gridRows: {
                entries: [
                    { id: { sessionID: 80, localID: 0 }, position: '!' },
                    { id: { sessionID: 80, localID: 1 }, position: '"' }
                ]
            },
            children: [
                { type: 'FRAME', size: { x: 100, y: 100 } },
                { type: 'FRAME', size: { x: 100, y: 100 } },
                { type: 'FRAME', size: { x: 100, y: 100 } }
            ]
        };

        const styles = computeNodeStyles(gridNode, dummyParent);
        assert.strictEqual(styles['display'], 'grid');
        assert.strictEqual(styles['grid-template-columns'], 'repeat(3, 1fr)');
        assert(!styles['grid-template-columns'].includes('[object Object]'));
    });

    it('applies -webkit-background-clip: text and gradient background when text fill has GRADIENT_LINEAR or GRADIENT_RADIAL', () => {
        const dummyParent = { type: 'FRAME' };
        const textNode = {
            type: 'TEXT',
            name: 'Показать на карте',
            fontSize: 16,
            fillPaints: [
                {
                    type: 'GRADIENT_LINEAR',
                    opacity: 1,
                    visible: true,
                    stops: [
                        { color: { r: 0, g: 0.7098, b: 0.4431, a: 1 }, position: 0.24 },
                        { color: { r: 0.023, g: 0.7845, b: 0.4984, a: 1 }, position: 0.82 }
                    ],
                    transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 }
                }
            ]
        };

        const styles = computeNodeStyles(textNode, dummyParent);
        assert(styles['background'] && styles['background'].includes('linear-gradient'), 'Should set gradient background');
        assert.strictEqual(styles['-webkit-background-clip'], 'text');
        assert.strictEqual(styles['-webkit-text-fill-color'], 'transparent');
        assert.strictEqual(styles['background-clip'], 'text');
        assert(styles['color'], 'Should set fallback color from first stop');
    });

    it('preserves asymmetric vertical padding and correctly detects bottom padding: 0 when omitted by Kiwi', () => {
        const dummyParent = { type: 'FRAME' };
        const container = {
            type: 'FRAME',
            name: 'Frame 116047482',
            stackMode: 'VERTICAL',
            size: { x: 1444, y: 641 },
            stackVerticalPadding: 64,
            stackPaddingBottom: undefined,
            children: [
                {
                    type: 'FRAME',
                    name: 'Frame 1597882064',
                    transform: { m02: 0, m12: 64 },
                    size: { x: 1444, y: 577 }
                }
            ]
        };

        const styles = computeNodeStyles(container, dummyParent);
        assert.strictEqual(styles['padding'], '64px 0px 0px 0px', 'Should format as 4 values with bottom: 0px');

        // HORIZONTAL container with omitted stackPaddingBottom: 0 (e.g. Frame 116047491 / Frame 116047480)
        const horizContainer = {
            type: 'FRAME',
            name: 'Frame 116047491',
            stackMode: 'HORIZONTAL',
            size: { x: 551, y: 78 },
            stackVerticalPadding: 24,
            stackPaddingBottom: undefined,
            children: [
                {
                    type: 'FRAME',
                    name: 'Frame 116047474',
                    transform: { m02: 0, m12: 24 },
                    size: { x: 191, y: 54 }
                },
                {
                    type: 'FRAME',
                    name: 'Frame 116047475',
                    transform: { m02: 342, m12: 24 },
                    size: { x: 209, y: 54 }
                }
            ]
        };
        const horizStyles = computeNodeStyles(horizContainer, dummyParent);
        assert.strictEqual(horizStyles['padding'], '24px 0px 0px 0px', 'HORIZONTAL container with top=24 and bottom=0 should emit 24px 0px 0px 0px');

        // Preceding sibling with bleeding absolute child -> subsequent sibling gets position: relative; z-index: 1
        const parentSection = {
            type: 'FRAME',
            name: 'Frame 1597882070',
            stackMode: 'VERTICAL',
            size: { x: 1444, y: 727 },
            children: [
                {
                    type: 'FRAME',
                    name: 'Frame 116047489',
                    stackMode: 'HORIZONTAL',
                    size: { x: 1344, y: 330 },
                    children: [
                        {
                            type: 'FRAME',
                            name: 'Frame 116047490',
                            stackPositioning: 'ABSOLUTE',
                            transform: { m02: 894, m12: -113 },
                            size: { x: 500, y: 660 }
                        }
                    ]
                },
                {
                    type: 'FRAME',
                    name: 'Frame 1597882052',
                    stackMode: 'VERTICAL',
                    size: { x: 1344, y: 167 }
                }
            ]
        };
        const nextSiblingStyles = computeNodeStyles(parentSection.children[1], parentSection);
        assert.strictEqual(nextSiblingStyles['position'], 'relative');
        assert.strictEqual(nextSiblingStyles['z-index'], '1');
    });

    it('does not emit overflow: hidden when frameMaskDisabled is true (Clip Content disabled in Figma)', () => {
        const dummyParent = { type: 'FRAME' };
        const unclippedFrame = {
            type: 'FRAME',
            name: 'Frame 116047416',
            cornerRadius: 24,
            frameMaskDisabled: true,
            children: [
                {
                    type: 'FRAME',
                    size: { x: 100, y: 100 }
                }
            ]
        };

        const styles = computeNodeStyles(unclippedFrame, dummyParent);
        assert.strictEqual(styles['border-radius'], '24px');
        assert.strictEqual(styles['overflow'], undefined, 'overflow: hidden must not be set when frameMaskDisabled is true');
    });

    it('preserves underlay nodes before flow content with z-index: auto to enable mix-blend-mode without isolating stacking context', () => {
        const glowChild = {
            name: 'Glow Circle',
            type: 'ELLIPSE',
            blendMode: 'SOFT_LIGHT',
            size: { x: 269, y: 269 },
            transform: { m00: 1, m01: 0, m02: 450, m10: 0, m11: 1, m12: 50 }
        };

        const container = {
            type: 'FRAME',
            name: 'Card Container',
            size: { x: 1344, y: 354 },
            children: [
                {
                    name: 'Underlay Background',
                    type: 'FRAME',
                    size: { x: 960, y: 700 },
                    transform: { m00: 1, m01: 0, m02: 434, m10: 0, m11: 1, m12: -252 },
                    children: [glowChild]
                },
                {
                    name: 'Main Content',
                    type: 'FRAME',
                    size: { x: 660, y: 354 },
                    transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
                    children: [{ type: 'TEXT', characters: 'Hello' }]
                }
            ]
        };

        synthesizeContainerLayout(container);

        // Underlay should remain before Main Content in container.children
        assert.strictEqual(container.children[0].name, 'Underlay Background');
        assert.strictEqual(container.children[0].isDecorativeUnderlay, true);
        assert.strictEqual(container.children[1].name, 'Main Content');

        const sUnderlay = computeNodeStyles(container.children[0], container);
        assert.strictEqual(sUnderlay['position'], 'absolute');
        assert.strictEqual(sUnderlay['z-index'], undefined, 'Underlay should have z-index: auto (omitted) to avoid isolating stacking context');

        const sGlow = computeNodeStyles(glowChild, container.children[0]);
        assert.strictEqual(sGlow['mix-blend-mode'], 'soft-light', 'Inner child must retain mix-blend-mode: soft-light');

        const sContent = computeNodeStyles(container.children[1], container);
        assert.strictEqual(sContent['position'], 'relative');
        assert.strictEqual(sContent['z-index'], '1', 'In-flow content with underlay should receive z-index: 1');
    });

    it('applies gradient mask-image and -webkit-mask-image to container only when explicitly tagged with [mask]', () => {
        const maskGroupTagged = {
            type: 'FRAME',
            name: 'Group 116047498 [mask]',
            size: { x: 414, y: 326 },
            children: [
                {
                    name: 'Mask',
                    type: 'ROUNDED_RECTANGLE',
                    mask: true,
                    size: { x: 414, y: 326 },
                    fillPaints: [
                        {
                            type: 'GRADIENT_RADIAL',
                            stops: [
                                { color: { r: 1, g: 1, b: 1, a: 1 }, position: 0.59 },
                                { color: { r: 0.6, g: 0.6, b: 0.6, a: 0 }, position: 1 }
                            ],
                            transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 }
                        }
                    ]
                },
                {
                    name: 'Image',
                    type: 'ROUNDED_RECTANGLE',
                    size: { x: 414, y: 326 },
                    fillPaints: [{ type: 'IMAGE', visible: true }]
                }
            ]
        };

        const stylesTagged = computeNodeStyles(maskGroupTagged, null);
        assert(stylesTagged['mask-image'] && stylesTagged['mask-image'].includes('radial-gradient'), 'mask-image should be radial-gradient with [mask] tag');
        assert(stylesTagged['-webkit-mask-image'] && stylesTagged['-webkit-mask-image'].includes('radial-gradient'), '-webkit-mask-image should be radial-gradient with [mask] tag');
        assert.strictEqual(stylesTagged['mask-size'], '100% 100%');
        assert.strictEqual(stylesTagged['-webkit-mask-size'], '100% 100%');
        assert.strictEqual(stylesTagged['overflow'], 'hidden');

        // Without explicit tag (e.g. automatic Figma "Mask group"), CSS mask-image must NOT be set
        const maskGroupUntagged = {
            ...maskGroupTagged,
            name: 'Mask group'
        };
        const stylesUntagged = computeNodeStyles(maskGroupUntagged, null);
        assert.strictEqual(stylesUntagged['mask-image'], undefined, 'mask-image must not be set without [mask] tag');
        assert.strictEqual(stylesUntagged['-webkit-mask-image'], undefined, '-webkit-mask-image must not be set without [mask] tag');
    });

    // 11. Figma Multi-Page Import Engine (v1.3.0) Tests
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
