// test/test-graphic-collapser.js
const assert = require('assert');
const sharp = require('sharp');
const crypto = require('crypto');
const {
    identityMatrix,
    multiplyAffineMatrices,
    multiplyChain,
    decomposeAffineMatrix,
    detectGraphicSubtreeChain,
    findAllGraphicChains,
    collapseGraphicSubtree,
    hasTextOrInteractive
} = require('../src/decompiler/graphic-collapser');
const { bakeGraphicChainAsset, bakeAndCollapseGraphicChains } = require('../src/decompiler/image-optimizer');
const { computeNodeStyles } = require('../src/decompiler/css');
const { renderNodeToHtml } = require('../src/decompiler/html');
const { StylesheetManager } = require('../src/decompiler/stylesheet');

async function runGraphicCollapserTests({ it, itAsync }) {
    it('creates identity 2D affine matrix', () => {
        const id = identityMatrix();
        assert.strictEqual(id.m00, 1);
        assert.strictEqual(id.m01, 0);
        assert.strictEqual(id.m02, 0);
        assert.strictEqual(id.m10, 0);
        assert.strictEqual(id.m11, 1);
        assert.strictEqual(id.m12, 0);
    });

    it('multiplies 2D affine matrices accurately', () => {
        // Translation A by (10, 20)
        const a = { m00: 1, m01: 0, m02: 10, m10: 0, m11: 1, m12: 20 };
        // Translation B by (5, -3)
        const b = { m00: 1, m01: 0, m02: 5, m10: 0, m11: 1, m12: -3 };

        const c = multiplyAffineMatrices(a, b);
        assert.strictEqual(c.m00, 1);
        assert.strictEqual(c.m01, 0);
        assert.strictEqual(c.m02, 15);
        assert.strictEqual(c.m10, 0);
        assert.strictEqual(c.m11, 1);
        assert.strictEqual(c.m12, 17);
    });

    it('computes cumulative affine matrix and decomposes -15deg rotation from Figma Jetlife chain', () => {
        // Chain transforms from test/demo/jetlife/jetlife.fig:
        // Frame 116047416 -> Group 116047490 -> Mask group 5 (-15 deg) -> Group 116047492 -> Gemini... 1
        const mGroup1 = { m00: 1, m01: 0, m02: -103.38, m10: 0, m11: 1, m12: -55.70 };
        // -15 deg: cos(-15) = 0.9659, sin(-15) = -0.2588
        const mMaskGroup = {
            m00: 0.9659258,
            m01: 0.2588190,
            m02: 0,
            m10: -0.2588190,
            m11: 0.9659258,
            m12: 111.81
        };
        const mGroup2 = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
        const mImage = { m00: 1, m01: 0, m02: -68.48, m10: 0, m11: 1, m12: -83.35 };

        const mCum = multiplyChain([mGroup1, mMaskGroup, mGroup2, mImage]);
        const decomp = decomposeAffineMatrix(mCum);

        assert.strictEqual(decomp.rotateDeg, -15);
        assert(Math.abs(decomp.scaleX - 1) < 0.01);
        assert(Math.abs(decomp.scaleY - 1) < 0.01);
        assert(decomp.translateX < -190);
        assert(Math.abs(decomp.translateY) < 10);
    });

    it('detectGraphicSubtreeChain identifies degenerate 5-level wrapper chain', () => {
        const dummyHash = Buffer.alloc(20, 1);
        const chainTree = {
            name: 'Frame 116047416',
            type: 'FRAME',
            size: { x: 300, y: 332 },
            children: [
                {
                    name: 'Group 116047490',
                    type: 'FRAME',
                    size: { x: 527, y: 520 },
                    transform: { m00: 1, m01: 0, m02: -103.4, m10: 0, m11: 1, m12: -55.7 },
                    children: [
                        {
                            name: 'Mask group 5',
                            type: 'FRAME',
                            size: { x: 432, y: 423 },
                            transform: { m00: 0.9659, m01: 0.2588, m02: 0, m10: -0.2588, m11: 0.9659, m12: 111.8 },
                            children: [
                                {
                                    name: 'Mask Vector',
                                    type: 'ROUNDED_RECTANGLE',
                                    mask: true,
                                    size: { x: 432, y: 423 }
                                },
                                {
                                    name: 'Group 116047492',
                                    type: 'FRAME',
                                    size: { x: 432, y: 423 },
                                    transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
                                    children: [
                                        {
                                            name: 'Gemini Bottle Image',
                                            type: 'ROUNDED_RECTANGLE',
                                            size: { x: 569, y: 762 },
                                            transform: { m00: 1, m01: 0, m02: -68.5, m10: 0, m11: 1, m12: -83.3 },
                                            fillPaints: [{ type: 'IMAGE', visible: true, image: { hash: dummyHash } }]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        };

        const chainInfo = detectGraphicSubtreeChain(chainTree);
        assert(chainInfo !== null, 'Should detect degenerate chain');
        assert.strictEqual(chainInfo.isRootReplaced, true, 'Root frame with no fills should be replaced');
        assert.strictEqual(chainInfo.canvasWidth, 300);
        assert.strictEqual(chainInfo.canvasHeight, 332);
        assert.strictEqual(chainInfo.decomposition.rotateDeg, -15);
        assert.strictEqual(chainInfo.hasRotation, true);
        assert.strictEqual(chainInfo.hasMask, true);
        assert.strictEqual(chainInfo.chainDepth, 4);
    });

    it('protects against false positives: rejects subtrees containing TEXT or interactive nodes', () => {
        const textTree = {
            name: 'Card with Text',
            type: 'FRAME',
            size: { x: 300, y: 200 },
            children: [
                {
                    name: 'Inner Group',
                    type: 'FRAME',
                    children: [
                        { name: 'Headline', type: 'TEXT', characters: 'Buy Now' },
                        { name: 'Photo', type: 'RECTANGLE', fillPaints: [{ type: 'IMAGE', visible: true, image: { hash: 'abc' } }] }
                    ]
                }
            ]
        };

        assert.strictEqual(detectGraphicSubtreeChain(textTree), null, 'Must reject tree with text');

        const buttonTree = {
            name: 'Button Container',
            type: 'FRAME',
            size: { x: 120, y: 40 },
            children: [
                {
                    name: 'Button',
                    type: 'FRAME',
                    children: [
                        { name: 'Icon', type: 'RECTANGLE', fillPaints: [{ type: 'IMAGE', visible: true, image: { hash: 'abc' } }] }
                    ]
                }
            ]
        };
        assert.strictEqual(detectGraphicSubtreeChain(buttonTree), null, 'Must reject tree with button');
    });

    it('protects against false positives: rejects parallel content elements', () => {
        const multiChildTree = {
            name: 'Multi Column Layout',
            type: 'FRAME',
            size: { x: 500, y: 300 },
            children: [
                { name: 'Col 1', type: 'RECTANGLE', fillPaints: [{ type: 'IMAGE', visible: true, image: { hash: 'a' } }] },
                { name: 'Col 2', type: 'RECTANGLE', fillPaints: [{ type: 'IMAGE', visible: true, image: { hash: 'b' } }] }
            ]
        };
        assert.strictEqual(detectGraphicSubtreeChain(multiChildTree), null, 'Must reject multiple visual children');
    });

    await itAsync('bakes composite rotated asset onto exact canvas dimensions with 2x Retina scaling via Sharp', async () => {
        // Create a 200x300 test red rectangle image
        const sampleBuffer = await sharp({
            create: {
                width: 200,
                height: 300,
                channels: 4,
                background: { r: 255, g: 0, b: 0, alpha: 1 }
            }
        }).png().toBuffer();

        const imgHash = crypto.createHash('sha1').update(sampleBuffer).digest('hex');
        const rawImages = new Map();
        rawImages.set(imgHash, { buffer: sampleBuffer, mime: 'image/png' });

        const chainTree = {
            name: 'Frame 100',
            type: 'FRAME',
            size: { x: 150, y: 150 },
            children: [
                {
                    name: 'Group 1',
                    type: 'FRAME',
                    transform: { m00: 0.9659, m01: 0.2588, m02: 0, m10: -0.2588, m11: 0.9659, m12: 0 },
                    children: [
                        {
                            name: 'Group 2',
                            type: 'FRAME',
                            transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
                            children: [
                                {
                                    name: 'Leaf Image',
                                    type: 'ROUNDED_RECTANGLE',
                                    size: { x: 100, y: 150 },
                                    transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
                                    fillPaints: [{ type: 'IMAGE', visible: true, image: { hash: imgHash } }]
                                }
                            ]
                        }
                    ]
                }
            ]
        };

        const chainInfo = detectGraphicSubtreeChain(chainTree);
        assert(chainInfo !== null);

        const baked = await bakeGraphicChainAsset(chainInfo, rawImages, { imageScale: 2 });
        assert(baked !== null, 'Baking should succeed');
        assert(baked.bakedHash, 'Should produce baked SHA-1 hash');
        assert.strictEqual(baked.canvasW, 300, '2x retina canvas width should be 300');
        assert.strictEqual(baked.canvasH, 300, '2x retina canvas height should be 300');

        const meta = await sharp(baked.buffer).metadata();
        assert.strictEqual(meta.width, 300);
        assert.strictEqual(meta.height, 300);
        assert.strictEqual(meta.hasAlpha, true);

        // Verify buffer was saved to rawImages
        assert(rawImages.has(baked.bakedHash));
    });

    it('collapses AST tree and generates clean HTML <img> and CSS without parasitic padding/flex', () => {
        const dummyHash = '1234567890abcdef1234567890abcdef12345678';
        const rootNode = {
            name: 'Frame 116047416',
            type: 'FRAME',
            size: { x: 300, y: 332 },
            stackMode: 'VERTICAL',
            paddingTop: 24,
            paddingBottom: 24,
            paddingLeft: 24,
            paddingRight: 24,
            stackSpacing: 32,
            transform: { m00: 1, m01: 0, m02: 360, m10: 0, m11: 1, m12: 0 },
            children: [
                {
                    name: 'Group 116047490',
                    type: 'FRAME',
                    children: [
                        {
                            name: 'Mask group 5',
                            type: 'FRAME',
                            children: [
                                {
                                    name: 'Gemini Bottle',
                                    type: 'ROUNDED_RECTANGLE',
                                    fillPaints: [{ type: 'IMAGE', visible: true, image: { hash: dummyHash } }]
                                }
                            ]
                        }
                    ]
                }
            ]
        };

        const chainInfo = detectGraphicSubtreeChain(rootNode);
        assert(chainInfo !== null);

        // Collapse subtree
        collapseGraphicSubtree(chainInfo, dummyHash);

        // Verify AST simplified
        assert.strictEqual(rootNode.isCollapsedGraphicRoot, true);
        assert.strictEqual(rootNode.children.length, 0, 'Intermediate wrapper children should be removed');
        assert.strictEqual(rootNode.fillPaints.length, 1);
        assert.strictEqual(rootNode.fillPaints[0].type, 'IMAGE');
        assert.strictEqual(rootNode.stackMode, 'NONE');
        assert.strictEqual(rootNode.paddingTop, 0);

        // Image Registry
        const imageRegistry = new Map();
        imageRegistry.set(dummyHash, {
            mainFileName: `${dummyHash}.png`,
            base64: 'data:image/png;base64,...',
            mime: 'image/png',
            ext: 'png'
        });

        // Verify CSS styles (standalone and inside parent frame)
        const styles = computeNodeStyles(rootNode, null, imageRegistry, {});
        assert.strictEqual(styles['object-fit'], 'contain');
        assert.strictEqual(styles['width'], '300px');
        assert.strictEqual(styles['height'], '332px');
        assert.strictEqual(styles['pointer-events'], 'none');
        assert.strictEqual(styles['padding'], undefined, 'Parasitic padding should be removed');
        assert.strictEqual(styles['display'], undefined, 'Parasitic flex display should be removed');
        assert.strictEqual(styles['gap'], undefined, 'Parasitic gap should be removed');
        assert.strictEqual(styles['transform'], undefined, 'Parasitic transform should be removed');

        const parentFrame = {
            name: 'Frame 116047481',
            type: 'FRAME',
            size: { x: 1440, y: 800 }
        };
        const stylesWithParent = computeNodeStyles(rootNode, parentFrame, imageRegistry, {});
        assert.strictEqual(stylesWithParent['position'], 'absolute');
        assert.strictEqual(stylesWithParent['left'], '360px');
        assert.strictEqual(stylesWithParent['top'], '0px');
        assert.strictEqual(stylesWithParent['width'], '300px');
        assert.strictEqual(stylesWithParent['height'], '332px');
        assert.strictEqual(stylesWithParent['object-fit'], 'contain');

        // Verify HTML element is <img ...>
        const stylesheetManager = new StylesheetManager();
        stylesheetManager.registerNode(rootNode, parentFrame, imageRegistry, {});
        const html = renderNodeToHtml(rootNode, parentFrame, imageRegistry, { stylesheetManager, inlineImages: false, assetUrlPrefix: 'img/' });
        assert(html.trim().startsWith('<img '), `Expected <img> element, got: ${html}`);
        assert(html.includes('class="frame-116047416"'));
        assert(html.includes(`src="img/${dummyHash}.png"`));
        assert(!html.includes('Group 116047490'), 'Intermediate group div must not be present');
        assert(!html.includes('Mask group 5'), 'Mask group div must not be present');
    });
}

// Support running standalone: `node test/test-graphic-collapser.js`
if (require.main === module) {
    let total = 0;
    let passed = 0;

    const localIt = (name, fn) => {
        total++;
        try {
            fn();
            console.log(`  \x1b[32m✔\x1b[0m ${name}`);
            passed++;
        } catch (e) {
            console.error(`  \x1b[31m✖\x1b[0m ${name}`);
            console.error(`    ${e.stack || e.message}`);
        }
    };

    const localItAsync = async (name, fn) => {
        total++;
        try {
            await fn();
            console.log(`  \x1b[32m✔\x1b[0m ${name}`);
            passed++;
        } catch (e) {
            console.error(`  \x1b[31m✖\x1b[0m ${name}`);
            console.error(`    ${e.stack || e.message}`);
        }
    };

    console.log('\n\x1b[1m=== Graphic Subtree Collapsing & Cumulative Baking Engine Tests ===\x1b[0m\n');
    runGraphicCollapserTests({ it: localIt, itAsync: localItAsync }).then(() => {
        console.log(`\n\x1b[1mResults: ${passed}/${total} passed\x1b[0m\n`);
        if (passed !== total) process.exit(1);
    }).catch(err => {
        console.error('Test suite failed:', err);
        process.exit(1);
    });
}

module.exports = { runGraphicCollapserTests };
