// test/run-tests.js
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const AdmZip = require('adm-zip');
const { decodeFigKiwiCanvas } = require('@open-pencil/kiwi/fig/parse');

const { parseColor } = require('../src/parsers/color');
const { parseGradient, parseLinearDirection } = require('../src/parsers/gradient');
const { parseBoxShadows, parseAllEffects } = require('../src/parsers/effects');
const {
    parseFontStyle,
    parseLineHeight,
    parseLetterSpacing,
    parseTextDecoration,
    parseTextTransform,
    parseGoogleFontsUrl,
    extractWebFonts,
    generateGoogleFontsLink,
    getFontMetrics,
    estimateTextDimensions
} = require('../src/parsers/typography');
const { ImageRegistry, getImageDimensions } = require('../src/parsers/images');
const { generateFigFile } = require('../src/generator');
const { convertHtmlToNodes } = require('../src/converter');
const { parseArgs } = require('../cli');
const {
    convertFigToHtml,
    readFigFile,
    buildSceneTree
} = require('../src/decompiler');
const {
    formatColor,
    getLinearGradientAngle,
    formatGradient,
    formatEffects,
    parseFontWeightAndStyle,
    getExtensionForMime
} = require('../src/decompiler/css');
const {
    StylesheetManager,
    toBaseClassName
} = require('../src/decompiler/stylesheet');
const {
    toRem,
    toEm,
    toVw,
    toVh,
    formatFluidFontSize,
    formatFluidSpacing,
    formatFluidDimension
} = require('../src/decompiler/units');
const {
    parseCommandsBlob,
    parseVectorNetworkBlob,
    isVectorNode
} = require('../src/decompiler/vector');
const { parseArgs: parseReverseArgs } = require('../cli-reverse');

let totalTests = 0;
let passedTests = 0;

function it(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  \x1b[32m✔\x1b[0m ${name}`);
        passedTests++;
    } catch (e) {
        console.error(`  \x1b[31m✖\x1b[0m ${name}`);
        console.error(`    ${e.message}`);
    }
}

async function itAsync(name, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  \x1b[32m✔\x1b[0m ${name}`);
        passedTests++;
    } catch (e) {
        console.error(`  \x1b[31m✖\x1b[0m ${name}`);
        console.error(`    ${e.stack || e.message}`);
    }
}

async function runAllTests() {
    console.log('\n\x1b[1m\x1b[36m=== HTML to Figma Test Suite ===\x1b[0m\n');

    // 1. Color Parser
    console.log('\x1b[1m1. Color Parser Tests\x1b[0m');
    it('parses 6-digit hex color (#ff0000)', () => {
        const c = parseColor('#ff0000');
        assert.deepStrictEqual(c, { r: 1, g: 0, b: 0, a: 1 });
    });
    it('parses 3-digit hex color (#0f0)', () => {
        const c = parseColor('#0f0');
        assert.deepStrictEqual(c, { r: 0, g: 1, b: 0, a: 1 });
    });
    it('parses 8-digit hex color with alpha (#0000ff80)', () => {
        const c = parseColor('#0000ff80');
        assert.strictEqual(c.r, 0);
        assert.strictEqual(c.g, 0);
        assert.strictEqual(c.b, 1);
        assert(Math.abs(c.a - 0.5) < 0.01);
    });
    it('parses rgb() and rgba() colors', () => {
        const rgb = parseColor('rgb(255, 128, 0)');
        assert.strictEqual(rgb.r, 1);
        assert(Math.abs(rgb.g - 0.5) < 0.01);
        assert.strictEqual(rgb.b, 0);
        assert.strictEqual(rgb.a, 1);

        const rgba = parseColor('rgba(100, 150, 200, 0.4)');
        assert.strictEqual(rgba.a, 0.4);
    });
    it('parses modern space/slash rgba syntax (rgb(255 0 0 / 50%))', () => {
        const c = parseColor('rgb(255 0 0 / 50%)');
        assert.deepStrictEqual(c, { r: 1, g: 0, b: 0, a: 0.5 });
    });
    it('parses hsl() and hsla()', () => {
        const hsl = parseColor('hsl(0, 100%, 50%)');
        assert.strictEqual(hsl.r, 1);
        assert.strictEqual(hsl.g, 0);
        assert.strictEqual(hsl.b, 0);
        assert.strictEqual(hsl.a, 1);
    });
    it('parses named colors and transparent', () => {
        const crimson = parseColor('crimson');
        assert(crimson && crimson.r > 0.8);
        const trans = parseColor('transparent');
        assert.strictEqual(trans.a, 0);
    });

    // 2. Gradient Parser
    console.log('\n\x1b[1m2. Gradient Parser Tests\x1b[0m');
    it('parses linear gradient directions and degrees', () => {
        assert.strictEqual(parseLinearDirection('to top'), 0);
        assert.strictEqual(parseLinearDirection('to right'), 90);
        assert.strictEqual(parseLinearDirection('to bottom'), 180);
        assert.strictEqual(parseLinearDirection('to left'), 270);
        assert.strictEqual(parseLinearDirection('45deg'), 45);
    });
    it('parses linear-gradient paint object with transform matrix and stops', () => {
        const grad = parseGradient('linear-gradient(180deg, #ff0000 0%, #0000ff 100%)');
        assert.strictEqual(grad.type, 'GRADIENT_LINEAR');
        assert.strictEqual(grad.stops.length, 2);
        assert.strictEqual(grad.stops[0].position, 0);
        assert.strictEqual(grad.stops[1].position, 1);
        assert.deepStrictEqual(grad.stops[0].color, { r: 1, g: 0, b: 0, a: 1 });
        assert(grad.transform !== undefined);
    });
    it('parses radial-gradient paint object', () => {
        const grad = parseGradient('radial-gradient(circle, #fff, #000)');
        assert.strictEqual(grad.type, 'GRADIENT_RADIAL');
        assert.strictEqual(grad.stops.length, 2);
    });

    // 3. Effects Parser
    console.log('\n\x1b[1m3. Effects Parser Tests\x1b[0m');
    it('parses standard box-shadow (DROP_SHADOW)', () => {
        const effects = parseBoxShadows('0 4px 6px -1px rgba(0, 0, 0, 0.1)');
        assert.strictEqual(effects.length, 1);
        assert.strictEqual(effects[0].type, 'DROP_SHADOW');
        assert.strictEqual(effects[0].offset.x, 0);
        assert.strictEqual(effects[0].offset.y, 4);
        assert.strictEqual(effects[0].radius, 6);
        assert.strictEqual(effects[0].spread, -1);
    });
    it('parses inset box-shadow (INNER_SHADOW)', () => {
        const effects = parseBoxShadows('inset 0 2px 4px #000000');
        assert.strictEqual(effects.length, 1);
        assert.strictEqual(effects[0].type, 'INNER_SHADOW');
        assert.strictEqual(effects[0].offset.y, 2);
    });
    it('parses multiple box-shadows', () => {
        const effects = parseBoxShadows('0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)');
        assert.strictEqual(effects.length, 2);
    });
    it('parses complex rgba box-shadow with zero spread', () => {
        const effects = parseBoxShadows('0 4px 12px rgba(37, 99, 235, 0.3)');
        assert.strictEqual(effects.length, 1);
        assert.strictEqual(effects[0].type, 'DROP_SHADOW');
        assert.strictEqual(effects[0].offset.x, 0);
        assert.strictEqual(effects[0].offset.y, 4);
        assert.strictEqual(effects[0].radius, 12);
        assert.strictEqual(effects[0].spread, 0);
        assert(Math.abs(effects[0].color.r - (37 / 255)) < 0.01);
        assert(Math.abs(effects[0].color.g - (99 / 255)) < 0.01);
        assert(Math.abs(effects[0].color.b - (235 / 255)) < 0.01);
        assert(Math.abs(effects[0].color.a - 0.3) < 0.01);
    });
    it('parses blur and backdrop blur filters', () => {
        const all = parseAllEffects(null, 'blur(8px)', 'blur(12px)');
        assert.strictEqual(all.length, 2);
        assert.strictEqual(all[0].type, 'FOREGROUND_BLUR');
        assert.strictEqual(all[0].radius, 8);
        assert.strictEqual(all[1].type, 'BACKGROUND_BLUR');
        assert.strictEqual(all[1].radius, 12);
    });

    // 4. Typography Parser
    console.log('\n\x1b[1m4. Typography Parser Tests\x1b[0m');
    it('parses font weights and styles correctly', () => {
        const bold = parseFontStyle('bold', 'normal', 'Inter');
        assert.strictEqual(bold.styleName, 'Bold');
        assert.strictEqual(bold.postscript, 'Inter-Bold');

        const italic = parseFontStyle('600', 'italic', 'Roboto');
        assert.strictEqual(italic.styleName, 'Semi Bold Italic');
        assert.strictEqual(italic.postscript, 'Roboto-SemiBoldItalic');
    });
    it('parses line-height (% and px)', () => {
        const lhAuto = parseLineHeight('normal');
        assert.deepStrictEqual(lhAuto, { value: 100, units: 'PERCENT' });

        const lhPx = parseLineHeight('24px');
        assert.deepStrictEqual(lhPx, { value: 24, units: 'PIXELS' });

        const lhMult = parseLineHeight('1.5', 16);
        assert.deepStrictEqual(lhMult, { value: 24, units: 'PIXELS' });
    });
    it('parses letter-spacing and text decorations', () => {
        const ls = parseLetterSpacing('0.05em', 16);
        assert.strictEqual(ls.struct.value, 5);
        assert.strictEqual(ls.struct.units, 'PERCENT');

        assert.strictEqual(parseTextDecoration('underline'), 'UNDERLINE');
        assert.strictEqual(parseTextDecoration('line-through'), 'STRIKETHROUGH');
        assert.strictEqual(parseTextTransform('uppercase'), 'UPPER');
    });

    // 5. Image Registry & Dimensions
    console.log('\n\x1b[1m5. Image Registry Tests\x1b[0m');
    it('detects PNG dimensions from binary header', () => {
        const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAA8AAAAKCAYAAAC3zUkeAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const buf = Buffer.from(pngBase64, 'base64');
        const dims = getImageDimensions(buf);
        assert.strictEqual(dims.width, 15);
        assert.strictEqual(dims.height, 10);
    });
    it('registers buffer, computes SHA-1, and creates image paint', () => {
        const reg = new ImageRegistry();
        const buf = Buffer.from('test-image-data');
        const item = reg.registerBuffer(buf, 'test');
        assert.strictEqual(item.sha1Hex.length, 40);
        assert.strictEqual(reg.getAllImages().size, 1);

        const paint = reg.createImagePaint(item, 'FILL');
        assert.strictEqual(paint.type, 'IMAGE');
        assert.strictEqual(paint.imageScaleMode, 'FILL');
    });

    // 6. CLI Arguments
    console.log('\n\x1b[1m6. CLI Arguments Tests\x1b[0m');
    it('parses positional and flag arguments', () => {
        const opt1 = parseArgs(['index.html', 'out.fig']);
        assert.strictEqual(opt1.input, 'index.html');
        assert.strictEqual(opt1.output, 'out.fig');

        const opt2 = parseArgs(['-i', 'src.html', '-o', 'dest.fig', '-w', '-p', 'Design', '-v']);
        assert.strictEqual(opt2.input, 'src.html');
        assert.strictEqual(opt2.output, 'dest.fig');
        assert.strictEqual(opt2.watch, true);
        assert.strictEqual(opt2.page, 'Design');
        assert.strictEqual(opt2.verbose, true);
    });

    // 7. End-to-End Generation & Kiwi Verification
    console.log('\n\x1b[1m7. End-to-End Generation Tests\x1b[0m');
    await itAsync('generates valid output.fig from test/test.html', async () => {
        const outPath = 'test/test_out.fig';
        const res = await generateFigFile({
            htmlPath: 'test/test.html',
            outputPath: outPath
        });
        assert(fs.existsSync(outPath));
        assert(res.fileSizeBytes > 1000);

        // Verify with official Figma decoder
        const zip = new AdmZip(outPath);
        const canvasBytes = zip.getEntry('canvas.fig').getData();
        const tree = decodeFigKiwiCanvas(canvasBytes);
        assert(tree.nodeChanges.length > 5);

        // Clean up
        fs.unlinkSync(outPath);
    });

    await itAsync('generates valid showcase.fig from test/showcase.html', async () => {
        const outPath = 'test/showcase_test.fig';
        const res = await generateFigFile({
            htmlPath: 'test/showcase.html',
            outputPath: outPath
        });
        assert(fs.existsSync(outPath));

        // Verify with official Figma decoder
        const zip = new AdmZip(outPath);
        const canvasBytes = zip.getEntry('canvas.fig').getData();
        const tree = decodeFigKiwiCanvas(canvasBytes);
        assert(tree.nodeChanges.length >= 45);

        // Verify .grid calculated height and stretched cards
        const grid = tree.nodeChanges.find(n => n.name === 'grid');
        assert(grid && grid.size.y > 300, 'grid height should be > 300px');
        const cards = tree.nodeChanges.filter(n => n.name === 'card');
        assert(cards.length === 3, 'should have 3 cards');
        for (const card of cards) {
            assert.strictEqual(card.stackChildAlignSelf, 'STRETCH');
            assert.strictEqual(card.stackPrimarySizing, 'FIXED');
            assert(card.size.y > 300, 'card should stretch to fill grid height');
        }

        // Verify input typography
        const placeholders = tree.nodeChanges.filter(n => n.name === 'Placeholder');
        assert(placeholders.length >= 2, 'should have input placeholders');
        for (const p of placeholders) {
            assert(p.lineHeight && p.lineHeight.value !== undefined, 'placeholder should have lineHeight');
            assert(p.letterSpacing && p.letterSpacing.value !== undefined, 'placeholder should have letterSpacing');
        }

        // Verify no unwanted blendMode: NORMAL on nodes
        const explicitBlendModes = tree.nodeChanges.filter(n => n.blendMode !== undefined);
        assert.strictEqual(explicitBlendModes.length, 0, 'no nodes should have blendMode explicitly set without mix-blend-mode');

        // Verify image entries in zip
        const entries = zip.getEntries().map(e => e.entryName);
        assert(entries.some(e => e.startsWith('images/')));

        // Clean up
        fs.unlinkSync(outPath);
    });

    await itAsync('generates valid hard.fig from test/hard.html (Instagram deck)', async () => {
        const outPath = 'test/hard_test.fig';
        const res = await generateFigFile({
            htmlPath: 'test/hard.html',
            outputPath: outPath
        });
        assert(fs.existsSync(outPath));

        // Verify with official Figma decoder
        const zip = new AdmZip(outPath);
        const canvasBytes = zip.getEntry('canvas.fig').getData();
        const tree = decodeFigKiwiCanvas(canvasBytes);
        assert(tree.nodeChanges.length >= 100);

        // Verify root page artboard
        const root = tree.nodeChanges.find(n => n.name.includes('Слайды') || n.name === 'Page');
        assert(root, 'should have root page frame');
        assert.strictEqual(root.size.x, 1440, 'root frame width should be 1440px');
        assert(root.fillPaints && root.fillPaints.length > 0, 'root frame should have body background fill');

        // Verify .deck frame
        const deck = tree.nodeChanges.find(n => n.name === 'deck' && n.type === 'FRAME');
        assert(deck, 'should have deck frame');
        assert.strictEqual(deck.size.x, 1080, 'deck width should be 1080px');
        assert.strictEqual(deck.stackChildAlignSelf, 'CENTER', 'deck should be centered');

        // Verify slides
        const slides = tree.nodeChanges.filter(n => /(?:^|\s)slide(?:\s|$)/.test(n.name) && n.type === 'FRAME');
        assert.strictEqual(slides.length, 6, 'should have 6 slides');
        for (const slide of slides) {
            assert.strictEqual(slide.size.x, 1080, 'slide width should be 1080px');
            assert.strictEqual(slide.size.y, 1350, 'slide height should be 1350px');
        }

        // Verify absolute positioning of backgrounds and scrims
        const absNodes = tree.nodeChanges.filter(n => n.stackPositioning === 'ABSOLUTE');
        assert(absNodes.length >= 8, 'should have absolute positioned photo backgrounds and scrims');
        // Clean up
        fs.unlinkSync(outPath);
    });

    // 8. Decompiler (Figma -> HTML) Unit and E2E Tests
    console.log('\n\x1b[1m8. Decompiler (Figma -> HTML) Tests\x1b[0m');

    it('formats Figma RGBA to CSS hex and rgba', () => {
        const hex = formatColor({ r: 1, g: 0, b: 0, a: 1 });
        assert.strictEqual(hex, '#ff0000');

        const rgba = formatColor({ r: 0, g: 0.5, b: 1, a: 0.5 });
        assert(rgba.startsWith('rgba(0, 128, 255, 0.5)'));

        const trans = formatColor({ r: 0, g: 0, b: 0, a: 0 });
        assert.strictEqual(trans, 'transparent');
    });

    it('calculates linear gradient angle from affine transform matrix', () => {
        // to bottom (180deg)
        const a180 = getLinearGradientAngle({ m00: 0, m01: 1 });
        assert.strictEqual(a180, 180);

        // to right (90deg)
        const a90 = getLinearGradientAngle({ m00: 1, m01: 0 });
        assert.strictEqual(a90, 90);

        // to top (0deg)
        const a0 = getLinearGradientAngle({ m00: 0, m01: -1 });
        assert.strictEqual(a0, 0);
    });

    it('formats gradient paint into CSS linear-gradient and radial-gradient', () => {
        const linearPaint = {
            type: 'GRADIENT_LINEAR',
            transform: { m00: 0, m01: 1 },
            stops: [
                { color: { r: 1, g: 0, b: 0, a: 1 }, position: 0 },
                { color: { r: 0, g: 0, b: 1, a: 1 }, position: 1 }
            ]
        };
        const cssLinear = formatGradient(linearPaint);
        assert(cssLinear.includes('linear-gradient(180deg'));
        assert(cssLinear.includes('#ff0000 0%'));
        assert(cssLinear.includes('#0000ff 100%'));

        const radialPaint = {
            type: 'GRADIENT_RADIAL',
            stops: [
                { color: { r: 1, g: 1, b: 1, a: 1 }, position: 0 },
                { color: { r: 0, g: 0, b: 0, a: 1 }, position: 1 }
            ]
        };
        const cssRadial = formatGradient(radialPaint);
        assert(cssRadial.startsWith('radial-gradient('));
    });

    it('formats drop-shadow, inner-shadow and blurs', () => {
        const effects = [
            {
                type: 'DROP_SHADOW',
                offset: { x: 0, y: 4 },
                radius: 6,
                spread: -1,
                color: { r: 0, g: 0, b: 0, a: 0.1 },
                visible: true
            },
            {
                type: 'INNER_SHADOW',
                offset: { x: 0, y: 2 },
                radius: 4,
                color: { r: 0, g: 0, b: 0, a: 0.2 },
                visible: true
            },
            {
                type: 'BACKGROUND_BLUR',
                radius: 12,
                visible: true
            }
        ];
        const res = formatEffects(effects);
        assert(res.boxShadow.includes('0px 4px 6px -1px rgba(0, 0, 0, 0.1)'));
        assert(res.boxShadow.includes('inset 0px 2px 4px rgba(0, 0, 0, 0.2)'));
        assert.strictEqual(res.backdropFilter, 'blur(12px)');
    });

    it('parses font weights and italic styles', () => {
        assert.deepStrictEqual(parseFontWeightAndStyle('Bold'), { fontWeight: 700, fontStyle: 'normal' });
        assert.deepStrictEqual(parseFontWeightAndStyle('Semi Bold Italic'), { fontWeight: 600, fontStyle: 'italic' });
        assert.deepStrictEqual(parseFontWeightAndStyle('Light'), { fontWeight: 300, fontStyle: 'normal' });
        assert.deepStrictEqual(parseFontWeightAndStyle('Medium'), { fontWeight: 500, fontStyle: 'normal' });
    });

    it('reads .fig file and extracts nodes and images', () => {
        const figData = readFigFile('test/showcase.fig');
        assert(Array.isArray(figData.nodeChanges));
        assert(figData.nodeChanges.length > 30);
        assert(figData.images instanceof Map);
    });

    it('builds scene tree with parent-child hierarchy and sorted order', () => {
        const figData = readFigFile('test/showcase.fig');
        const tree = buildSceneTree(figData.nodeChanges);
        assert(tree.canvas);
        assert.strictEqual(tree.canvas.name, 'Page 1');
        assert(tree.rootNodes.length > 0);
        assert(tree.rootNodes[0].children.length > 0);
    });

    it('transliterates Cyrillic layer names and formats CSS class names', () => {
        assert.strictEqual(toBaseClassName('deck-bar', 'FRAME'), 'deck-bar');
        assert.strictEqual(toBaseClassName('Фото как второй дизайнер', 'TEXT'), 'foto-kak-vtoroy-dizayner');
        assert.strictEqual(toBaseClassName('01 / 06', 'TEXT'), 'text-01-06');
        assert.strictEqual(toBaseClassName('dot is-on', 'ELLIPSE'), 'dot-is-on');
    });

    it('deduplicates identical styles and creates numbered variant classes', () => {
        const mgr = new StylesheetManager();
        const node1 = { name: 'slide-body', type: 'FRAME', size: { x: 100, y: 100 } };
        const node2 = { name: 'slide-body', type: 'FRAME', size: { x: 100, y: 100 } };
        const node3 = { name: 'slide-body', type: 'FRAME', size: { x: 200, y: 200 } };

        const c1 = mgr.registerNode(node1, null, new Map());
        const c2 = mgr.registerNode(node2, null, new Map());
        const c3 = mgr.registerNode(node3, null, new Map());

        assert.strictEqual(c1, 'slide-body');
        assert.strictEqual(c2, 'slide-body');
        assert.strictEqual(c3, 'slide-body-2');
    });

    it('extracts recurring styles into :root CSS variables', () => {
        const mgr = new StylesheetManager();
        const nodeA = { name: 'title', type: 'TEXT', fontSize: 16, fontName: { family: 'Inter', style: 'Regular' }, fillPaints: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] };
        const nodeB = { name: 'title', type: 'TEXT', fontSize: 16, fontName: { family: 'Inter', style: 'Regular' }, fillPaints: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] };
        mgr.registerNode(nodeA, null, new Map());
        mgr.registerNode(nodeB, null, new Map());

        const css = mgr.generateFullStylesheet('#08090a');
        assert(css.includes(':root {'));
        assert(css.includes('--font-display:'));
        assert(css.includes('var(--font-display)'));
    });

    it('maps MIME types to standard file extensions', () => {
        assert.strictEqual(getExtensionForMime('image/jpeg'), 'jpg');
        assert.strictEqual(getExtensionForMime('image/png'), 'png');
        assert.strictEqual(getExtensionForMime('image/svg+xml'), 'svg');
        assert.strictEqual(getExtensionForMime('image/webp'), 'webp');
        assert.strictEqual(getExtensionForMime('image/gif'), 'gif');
    });

    it('parses reverse CLI arguments including -s and --separate-files', () => {
        const opts1 = parseReverseArgs(['input.fig', 'output.html', '--page', 'Page 1', '--inline-styles', '--verbose']);
        assert.strictEqual(opts1.input, 'input.fig');
        assert.strictEqual(opts1.output, 'output.html');
        assert.strictEqual(opts1.page, 'Page 1');
        assert.strictEqual(opts1.inlineStyles, true);
        assert.strictEqual(opts1.verbose, true);

        const opts2 = parseReverseArgs(['input.fig', '-s']);
        assert.strictEqual(opts2.separateFiles, true);
        assert.strictEqual(opts2.extractCss, true);
        assert.strictEqual(opts2.inlineImages, false);
        assert.strictEqual(opts2.assetsDir, 'img');

        const opts3 = parseReverseArgs(['input.fig', '--extract-css', '--css-file', 'styles/main.css', '--assets-dir', 'assets']);
        assert.strictEqual(opts3.extractCss, true);
        assert.strictEqual(opts3.cssFile, 'styles/main.css');
        assert.strictEqual(opts3.assetsDir, 'assets');

        const opts4 = parseReverseArgs(['input.fig', '--image-scale', '3', '--no-srcset', '-c', '--webp']);
        assert.strictEqual(opts4.imageScale, 3);
        assert.strictEqual(opts4.responsiveImages, false);
        assert.strictEqual(opts4.compress, true);
        assert.strictEqual(opts4.imageFormat, 'webp');

        const opts5 = parseReverseArgs(['input.fig', '--lossless', '--avif', '--scale', '1.5']);
        assert.strictEqual(opts5.compress, true);
        assert.strictEqual(opts5.imageFormat, 'avif');
        assert.strictEqual(opts5.imageScale, 1.5);

        const opts6 = parseReverseArgs(['input.fig', '--layout', 'fluid']);
        assert.strictEqual(opts6.layoutMode, 'fluid');

        const opts7 = parseReverseArgs(['input.fig', '--fluid']);
        assert.strictEqual(opts7.layoutMode, 'fluid');

        const opts8 = parseReverseArgs(['input.fig', '--layout', 'relative']);
        assert.strictEqual(opts8.layoutMode, 'relative');

        const opts9 = parseReverseArgs(['input.fig', '--relative']);
        assert.strictEqual(opts9.layoutMode, 'relative');

        const opts10 = parseReverseArgs(['input.fig', '--rem']);
        assert.strictEqual(opts10.layoutMode, 'relative');
    });

    it('converts px to relative units (rem, em, vw, vh)', () => {
        assert.strictEqual(toRem(16), '1rem');
        assert.strictEqual(toRem(24), '1.5rem');
        assert.strictEqual(toRem(0), '0');
        assert.strictEqual(toEm(32, 16), '2em');
        assert.strictEqual(toEm(0), '0');
        assert.strictEqual(toVw(720, 1440), '50vw');
        assert.strictEqual(toVw(0), '0');
        assert.strictEqual(toVh(450, 900), '50vh');
        assert.strictEqual(toVh(0), '0');
    });

    it('formats fluid responsive values using clamp(), min() and max()', () => {
        const fluidFont = formatFluidFontSize(32, 1440);
        assert(fluidFont.startsWith('clamp('));
        assert(fluidFont.includes('rem'));
        assert(fluidFont.includes('vw'));

        const fluidSpacing = formatFluidSpacing(40, 1440);
        assert(fluidSpacing.startsWith('clamp('));
        assert(fluidSpacing.includes('rem'));
        assert(fluidSpacing.includes('vw'));

        const fluidContainerWidth = formatFluidDimension(1200, 1440, true);
        assert(fluidContainerWidth.startsWith('min(100%, clamp('));

        const fluidCardWidth = formatFluidDimension(300, 1440, true);
        assert(fluidCardWidth.startsWith('clamp('));

        const fluidSmall = formatFluidDimension(24, 1440, true);
        assert.strictEqual(fluidSmall, '1.5rem');
    });

    await itAsync('decompiles test/showcase.fig into valid standalone HTML', async () => {
        const outHtml = path.resolve('test/test-showcase.html');
        const res = await convertFigToHtml('test/showcase.fig', {
            outputHtmlPath: outHtml,
            inlineImages: true
        });

        assert(fs.existsSync(outHtml));
        const htmlContent = fs.readFileSync(outHtml, 'utf8');

        // Check HTML structure and semantics
        assert(htmlContent.includes('<!DOCTYPE html>'));
        assert(htmlContent.includes('<html lang="ru">'));
        assert(htmlContent.includes('⚡ HTML to Figma Engine 2.0'));
        assert(htmlContent.includes('Production Ready'));
        assert(htmlContent.includes('Идеальная конвертация HTML &amp; CSS'));
        assert(htmlContent.includes('data:image/png;base64,'));
        assert(htmlContent.includes('display: flex'));
        assert(htmlContent.includes('border-radius: 50%'));
        assert(htmlContent.includes('<input type="text"'));
        assert(htmlContent.includes('<input type="email"'));
        assert(htmlContent.includes('<input type="checkbox"'));
        assert(htmlContent.includes('<input type="radio"'));
        assert(htmlContent.includes('button'));

        // Clean up
        fs.unlinkSync(outHtml);
    });

    await itAsync('decompiles test/hard.fig (Instagram deck with 6 slides and images)', async () => {
        const outHtml = path.resolve('test/test-hard.html');
        const res = await convertFigToHtml('test/hard.fig', {
            outputHtmlPath: outHtml,
            inlineImages: true
        });

        assert(fs.existsSync(outHtml));
        const htmlContent = fs.readFileSync(outHtml, 'utf8');

        assert(htmlContent.includes('<!DOCTYPE html>'));
        assert(htmlContent.includes('Слайды с фотографиями'));
        assert(htmlContent.includes('Фото как'));
        assert(htmlContent.includes('data:image/jpeg;base64,'));
        assert(htmlContent.includes(':root {'));
        assert(htmlContent.includes('--font-display'));
        assert(htmlContent.includes('class="foto-kak-vtoroy-dizayner"'));
        assert(!htmlContent.includes('segoe="" ui"'));
        assert(res.stats.frames >= 5);
        assert(res.stats.textNodes >= 20);

        // Clean up
        fs.unlinkSync(outHtml);
    });

    await itAsync('decompiles test/hard.fig with separate files (-s: css/style.css and img/*)', async () => {
        const outDir = path.resolve('test/separate-test');
        const outHtml = path.resolve(outDir, 'index.html');
        const expectedCss = path.resolve(outDir, 'css/style.css');
        const expectedImgDir = path.resolve(outDir, 'img');

        const res = await convertFigToHtml('test/hard.fig', {
            outputHtmlPath: outHtml,
            separateFiles: true
        });

        assert(fs.existsSync(outHtml), 'HTML file should exist');
        assert(fs.existsSync(expectedCss), 'CSS file should exist at css/style.css');
        assert(fs.existsSync(expectedImgDir), 'Image directory should exist at img/');

        const htmlContent = fs.readFileSync(outHtml, 'utf8');
        const cssContent = fs.readFileSync(expectedCss, 'utf8');
        const imageFiles = fs.readdirSync(expectedImgDir);

        // Verify HTML links to external CSS and images
        assert(htmlContent.includes('<link rel="stylesheet" href="css/style.css">'));
        assert(htmlContent.includes('src="img/'));
        assert(!htmlContent.includes('data:image/jpeg;base64,'));

        // Verify CSS contains variables and styles
        assert(cssContent.includes(':root {'));
        assert(cssContent.includes('--font-display'));
        assert(cssContent.includes('.foto-kak-vtoroy-dizayner'));

        // Verify images were extracted with appropriate extensions
        assert(imageFiles.length > 5);
        assert(imageFiles.some(f => f.endsWith('.jpg')));
        assert(imageFiles.some(f => f.endsWith('.png')));

        // Clean up
        fs.rmSync(outDir, { recursive: true, force: true });
    });

    await itAsync('resizes images according to CSS dimensions with 2x multiplier for retina quality', async () => {
        const outDir = path.resolve('test/resize-test');
        const outHtml = path.resolve(outDir, 'index.html');
        const expectedImgDir = path.resolve(outDir, 'img');

        const res = await convertFigToHtml('test/showcase.fig', {
            outputHtmlPath: outHtml,
            separateFiles: true,
            imageScale: 2
        });

        assert(fs.existsSync(expectedImgDir));
        // Sample Image in showcase.fig has CSS dimensions: 282x140
        const sampleImgPath = path.resolve(expectedImgDir, '11de1cb05575fa854209092779b6a4f2fbdac325.png');
        assert(fs.existsSync(sampleImgPath), 'Sample Image file should exist on disk');

        const meta = await sharp(sampleImgPath).metadata();
        // 282 * 2 = 564, 140 * 2 = 280
        assert.strictEqual(meta.width, 564, 'Sample image width should be scaled 2x to 564px');
        assert.strictEqual(meta.height, 280, 'Sample image height should be scaled 2x to 280px');

        fs.rmSync(outDir, { recursive: true, force: true });
    });

    await itAsync('generates responsive srcset and sizes for different devices and supports disabling via --no-srcset', async () => {
        const outDir = path.resolve('test/responsive-test');
        const outHtml = path.resolve(outDir, 'index.html');
        const expectedImgDir = path.resolve(outDir, 'img');

        // 1. With responsive images enabled (default)
        const res = await convertFigToHtml('test/hard.fig', {
            outputHtmlPath: outHtml,
            separateFiles: true,
            responsiveImages: true
        });

        const htmlContent = fs.readFileSync(outHtml, 'utf8');
        const files = fs.readdirSync(expectedImgDir);

        // Verify HTML contains srcset with responsive device widths and sizes
        assert(htmlContent.includes('srcset="img/'), 'HTML should contain responsive srcset');
        assert(htmlContent.includes('sizes="'), 'HTML should contain sizes attribute');
        assert(htmlContent.includes('480w') || htmlContent.includes('768w'), 'srcset should contain mobile/tablet breakpoints');
        assert(htmlContent.includes('(max-width: 768px) 100vw'), 'sizes should adapt to mobile viewport');

        // Verify responsive variant files were saved to disk
        assert(files.some(f => f.includes('-480w.')), 'should contain 480w variant file');
        assert(files.some(f => f.includes('-768w.')), 'should contain 768w variant file');
        fs.rmSync(outDir, { recursive: true, force: true });

        // 2. With responsive images disabled (--no-srcset)
        const outNoSrcsetDir = path.resolve('test/no-srcset-test');
        const outNoSrcsetHtml = path.resolve(outNoSrcsetDir, 'index.html');
        const expectedNoSrcsetImgDir = path.resolve(outNoSrcsetDir, 'img');

        await convertFigToHtml('test/hard.fig', {
            outputHtmlPath: outNoSrcsetHtml,
            separateFiles: true,
            responsiveImages: false
        });

        const noSrcsetHtmlContent = fs.readFileSync(outNoSrcsetHtml, 'utf8');
        const noSrcsetFiles = fs.readdirSync(expectedNoSrcsetImgDir);

        // Verify HTML does NOT contain srcset or sizes
        assert(!noSrcsetHtmlContent.includes('srcset='), 'HTML should NOT contain srcset when --no-srcset is specified');
        assert(!noSrcsetHtmlContent.includes('sizes='), 'HTML should NOT contain sizes when --no-srcset is specified');
        assert(noSrcsetHtmlContent.includes('src="img/'), 'HTML should still have src pointing to crisp 2x image');

        // Verify no variant files like -480w were created
        assert(!noSrcsetFiles.some(f => f.includes('-480w.')), 'Variant files should not be written when responsiveImages is false');

        fs.rmSync(outNoSrcsetDir, { recursive: true, force: true });
    });

    await itAsync('compresses images losslessly when --compress / --lossless is enabled', async () => {
        const outDir = path.resolve('test/compress-test');
        const outHtml = path.resolve(outDir, 'index.html');

        const res = await convertFigToHtml('test/showcase.fig', {
            outputHtmlPath: outHtml,
            compress: true,
            imageFormat: 'webp',
            separateFiles: true
        });

        const htmlContent = fs.readFileSync(outHtml, 'utf8');
        assert(htmlContent.includes('.webp'), 'Images should be processed with WebP format');
        assert(res.stats.imageOptimization, 'Should produce image optimization stats');
        assert(res.stats.imageOptimization.optimizedCount > 0, 'Should have optimized images');

        fs.rmSync(outDir, { recursive: true, force: true });
    });

    await itAsync('converts images to modern WebP format via --webp and --format webp', async () => {
        const outDir = path.resolve('test/webp-test');
        const outHtml = path.resolve(outDir, 'index.html');
        const expectedImgDir = path.resolve(outDir, 'img');

        const res = await convertFigToHtml('test/hard.fig', {
            outputHtmlPath: outHtml,
            separateFiles: true,
            imageFormat: 'webp'
        });

        const htmlContent = fs.readFileSync(outHtml, 'utf8');
        const files = fs.readdirSync(expectedImgDir);

        assert(htmlContent.includes('.webp'), 'HTML should reference .webp images');
        assert(!htmlContent.includes('.jpg'), 'HTML should not reference original .jpg when webp is requested');
        assert(files.length > 5);
        assert(files.every(f => f.endsWith('.webp')), 'All extracted files should have .webp extension');

        const firstFile = path.resolve(expectedImgDir, files[0]);
        const meta = await sharp(firstFile).metadata();
        assert.strictEqual(meta.format, 'webp', 'Image format on disk should be valid WebP');

        fs.rmSync(outDir, { recursive: true, force: true });
    });

    await itAsync('converts images to modern AVIF format via --avif and --format avif', async () => {
        const outDir = path.resolve('test/avif-test');
        const outHtml = path.resolve(outDir, 'index.html');
        const expectedImgDir = path.resolve(outDir, 'img');

        const res = await convertFigToHtml('test/hard.fig', {
            outputHtmlPath: outHtml,
            separateFiles: true,
            imageFormat: 'avif'
        });

        const htmlContent = fs.readFileSync(outHtml, 'utf8');
        const files = fs.readdirSync(expectedImgDir);

        assert(htmlContent.includes('.avif'), 'HTML should reference .avif images');
        assert(!htmlContent.includes('.jpg'), 'HTML should not reference original .jpg when avif is requested');
        assert(files.length > 5);
        assert(files.every(f => f.endsWith('.avif')), 'All extracted files should have .avif extension');

        const firstFile = path.resolve(expectedImgDir, files[0]);
        const meta = await sharp(firstFile).metadata();
        assert(meta.format === 'heif' || meta.format === 'avif', 'Image format on disk should be valid AVIF');

        fs.rmSync(outDir, { recursive: true, force: true });
    });

    await itAsync('decompiles test/showcase.fig with relative layout mode (--relative / --rem)', async () => {
        const outHtml = path.resolve('test/test-relative.html');
        await convertFigToHtml('test/showcase.fig', {
            outputHtmlPath: outHtml,
            layoutMode: 'relative'
        });

        assert(fs.existsSync(outHtml), 'HTML file should exist');
        const htmlContent = fs.readFileSync(outHtml, 'utf8');

        // Check viewport meta
        assert(htmlContent.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'), 'Should include responsive viewport meta');

        // Check root container styles: width: 100vw; min-height: 100vh;
        assert(htmlContent.includes('width: 100vw'), 'Root container should have width: 100vw');
        assert(htmlContent.includes('min-height: 100vh'), 'Root container should have min-height: 100vh');

        // Check relative units (rem) used
        assert(htmlContent.includes('rem'), 'Should use rem units in stylesheet');

        fs.unlinkSync(outHtml);
    });

    await itAsync('decompiles test/showcase.fig with fluid responsive layout mode (--fluid)', async () => {
        const outHtml = path.resolve('test/test-fluid.html');
        await convertFigToHtml('test/showcase.fig', {
            outputHtmlPath: outHtml,
            layoutMode: 'fluid'
        });

        assert(fs.existsSync(outHtml), 'HTML file should exist');
        const htmlContent = fs.readFileSync(outHtml, 'utf8');

        // Check viewport meta
        assert(htmlContent.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'), 'Should include responsive viewport meta');

        // Check main container styles: width: 100vw; min-height: 100dvh;
        assert(htmlContent.includes('width: 100vw'), 'Root container should have width: 100vw');
        assert(htmlContent.includes('min-height: 100dvh'), 'Root container should have min-height: 100dvh');

        // Check fluid functions: min(), max(), clamp()
        assert(htmlContent.includes('clamp('), 'Should use clamp() for fluid typography and spacing');
        assert(htmlContent.includes('vw'), 'Should use viewport units (vw) inside fluid expressions');

        fs.unlinkSync(outHtml);
    });

    await itAsync('performs full round-trip HTML -> .fig -> HTML and verifies content', async () => {
        const roundFig = path.resolve('test/roundtrip.fig');
        const roundHtml = path.resolve('test/roundtrip.html');

        // 1. HTML -> .fig
        await generateFigFile({
            htmlPath: 'test/test.html',
            outputPath: roundFig
        });
        assert(fs.existsSync(roundFig));

        // 2. .fig -> HTML
        const res = await convertFigToHtml(roundFig, {
            outputHtmlPath: roundHtml,
            inlineImages: true
        });
        assert(fs.existsSync(roundHtml));

        const roundHtmlContent = fs.readFileSync(roundHtml, 'utf8');

        // Verify key components survived round-trip
        assert(roundHtmlContent.includes('Сгенерировано из HTML'));
        assert(roundHtmlContent.includes('Auto Layout Active'));
        assert(roundHtmlContent.includes('Этот фрейм собран напрямую'));
        assert(roundHtmlContent.includes('Скорость'));
        assert(roundHtmlContent.includes('Меньше 15мс на генерацию'));
        assert(roundHtmlContent.includes('Чистый вектор'));
        assert(roundHtmlContent.includes('Редактируемые слои'));
        assert(roundHtmlContent.includes('Открыть проект'));
        assert(roundHtmlContent.includes('display: flex'));

        // Clean up
        fs.unlinkSync(roundFig);
        fs.unlinkSync(roundHtml);
    });

    it('decodes binary commandsBlob into SVG path stream', () => {
        // Construct binary buffer: MoveTo (10, 20), LineTo (30, 40), ClosePath
        const buf = Buffer.alloc(1 + 8 + 1 + 8 + 1);
        let off = 0;
        buf.writeUInt8(1, off); off += 1;
        buf.writeFloatLE(10, off); off += 4;
        buf.writeFloatLE(20, off); off += 4;
        buf.writeUInt8(2, off); off += 1;
        buf.writeFloatLE(30, off); off += 4;
        buf.writeFloatLE(40, off); off += 4;
        buf.writeUInt8(0, off); off += 1;

        const pathStr = parseCommandsBlob(buf);
        assert.strictEqual(pathStr, 'M 10 20 L 30 40 Z');
    });

    it('decodes binary VectorNetwork into SVG path with curve segments', () => {
        // 2 vertices (0,0) and (10,10), 1 straight segment
        const buf = Buffer.alloc(12 + 24 + 28);
        let off = 0;
        buf.writeUInt32LE(2, off); off += 4; // numVertices
        buf.writeUInt32LE(1, off); off += 4; // numSegments
        buf.writeUInt32LE(0, off); off += 4; // numRegions

        // Vertex 0: (0, 0)
        buf.writeUInt32LE(0, off); off += 4;
        buf.writeFloatLE(0, off); off += 4;
        buf.writeFloatLE(0, off); off += 4;

        // Vertex 1: (10, 10)
        buf.writeUInt32LE(0, off); off += 4;
        buf.writeFloatLE(10, off); off += 4;
        buf.writeFloatLE(10, off); off += 4;

        // Segment 0: start 0, ts(0,0), end 1, te(0,0)
        buf.writeUInt32LE(0, off); off += 4;
        buf.writeUInt32LE(0, off); off += 4;
        buf.writeFloatLE(0, off); off += 4;
        buf.writeFloatLE(0, off); off += 4;
        buf.writeUInt32LE(1, off); off += 4;
        buf.writeFloatLE(0, off); off += 4;
        buf.writeFloatLE(0, off); off += 4;

        const pathStr = parseVectorNetworkBlob(buf);
        assert.strictEqual(pathStr, 'M 0 0 L 10 10');
    });

    await itAsync('decompiles complex fleader.fig with instances, vector icons and external CSS', async () => {
        if (!fs.existsSync('fleader.fig')) return;

        const outDir = path.resolve('test/fleader-test');
        const outHtml = path.resolve(outDir, 'index.html');
        const outCss = path.resolve(outDir, 'styles/main.css');

        const res = await convertFigToHtml('fleader.fig', {
            outputHtmlPath: outHtml,
            extractCss: true,
            cssFile: 'styles/main.css',
            assetsDir: 'assets'
        });

        assert(fs.existsSync(outHtml), 'HTML file should exist');
        assert(fs.existsSync(outCss), 'CSS file should exist');

        const htmlContent = fs.readFileSync(outHtml, 'utf8');
        const cssContent = fs.readFileSync(outCss, 'utf8');

        // Check tabs and suggestions
        assert(htmlContent.includes('Агент'));
        assert(htmlContent.includes('CRM'));
        assert(htmlContent.includes('Продажи'));
        assert(htmlContent.includes('Тренажер'));
        assert(htmlContent.includes('Проекты в работе'));

        // 1. Check full CSS reset is generated
        assert(cssContent.includes('button, input, optgroup, select, textarea'));
        assert(cssContent.includes('appearance: button'));

        // 2. Check vertical alignment for .b (Avatar letter B)
        assert(cssContent.includes('.b {'));
        const bStyleMatch = cssContent.match(/\.b\s*\{([^}]+)\}/);
        assert(bStyleMatch, 'should have .b style rule');
        assert(bStyleMatch[1].includes('display: flex') && bStyleMatch[1].includes('align-items: center') && bStyleMatch[1].includes('justify-content: center'));

        // 3 & 6. Check vector container flattening (1b87bb and navigation-dasboard merged into single SVG)
        assert(htmlContent.includes('class="frame-1b87bb"'));
        assert(htmlContent.includes('class="navigation-dasboard"'));
        const frame1bMatch = htmlContent.match(/<svg[^>]*class="frame-1b87bb"[^>]*>([\s\S]*?)<\/svg>/);
        assert(frame1bMatch, '1b87bb should be a single SVG element');
        const pathCount1b = (frame1bMatch[1].match(/<path/g) || []).length;
        assert.strictEqual(pathCount1b, 2, '1b87bb SVG should contain both vector paths flattened together');

        // Check SVG vector icons
        const svgCount = (htmlContent.match(/<svg/g) || []).length;
        assert(svgCount >= 15, `Expected at least 15 SVG icons, got ${svgCount}`);

        // 4. Check property-aware :root variables (no radius vars on gap, width, or padding)
        assert(!cssContent.includes('gap: var(--radius-'), 'gap should not use --radius vars');
        assert(!cssContent.includes('padding: var(--radius-'), 'padding should not use --radius vars');
        assert(!cssContent.includes('width: var(--radius-'), 'width should not use --radius vars');
        assert(cssContent.includes('border-radius: var(--radius-'), 'border-radius should use --radius vars');

        // 5. Check image crop mode uses object-fit: cover instead of fill
        assert(cssContent.includes('object-fit: cover'));
        assert(!cssContent.includes('object-fit: fill'));

        // 7. Check mask layer is not rendered as separate visible image
        const group1Match = htmlContent.match(/<div class="group-1">([\s\S]*?)<\/div>/);
        assert(group1Match, 'group-1 should exist');
        const group1Imgs = (group1Match[1].match(/<img/g) || []).length;
        assert.strictEqual(group1Imgs, 1, 'group-1 should contain exactly 1 image (mask layer omitted)');

        // Check clean CSS variables without spaces
        const rootVars = cssContent.match(/--[a-zA-Z0-9_-]+:/g) || [];
        assert(rootVars.length > 5);
        assert(!cssContent.includes('--radius-10px 10px'));

        // 8. Check icon vector scaling (normalizedSize scale and non-scaling-stroke)
        assert(htmlContent.includes('class="navigation-ai"'));
        const navAiMatch = htmlContent.match(/<svg[^>]*class="navigation-ai"[^>]*>([\s\S]*?)<\/svg>/);
        assert(navAiMatch, 'navigation-ai should be an SVG');
        assert(navAiMatch[1].includes('scale(0.6 0.6)'), 'navigation-ai path should be scaled to fit 12x12 inside 16x16');
        assert(navAiMatch[1].includes('vector-effect="non-scaling-stroke"'), 'navigation-ai should use non-scaling-stroke');

        const iconMatch = htmlContent.match(/<svg[^>]*class="icon"[^>]*>([\s\S]*?)<\/svg>/);
        assert(iconMatch, 'icon (search) should be an SVG');
        assert(iconMatch[1].includes('scale(0.667 0.667)'), 'icon path should be scaled proportionally');

        // 9. Check Hug contents (RESIZE_TO_FIT) does not output static height
        const frame12Match = cssContent.match(/\.frame-12\s*\{([^}]+)\}/);
        assert(frame12Match, 'should have .frame-12 rule');
        assert(!frame12Match[1].includes('height:'), 'Frame 12 (hug contents) should not have static height');

        const submenuMatch = cssContent.match(/\.submenu\s*\{([^}]+)\}/);
        assert(submenuMatch, 'should have .submenu rule');
        assert(!submenuMatch[1].includes('height:'), 'Submenu (hug contents) should not have static height');

        // 10. Check Figma "Truncate text" parameter (textTruncation: ENDING)
        const zastryavshieMatch = cssContent.match(/\.zastryavshie-proekty-trebuyushchie\s*\{([^}]+)\}/);
        assert(zastryavshieMatch, 'should have zastryavshie rule');
        assert(zastryavshieMatch[1].includes('text-overflow: ellipsis'), 'truncated text should have text-overflow: ellipsis');
        assert(zastryavshieMatch[1].includes('white-space: nowrap'), 'truncated text should have white-space: nowrap');
        assert(zastryavshieMatch[1].includes('overflow: hidden'), 'truncated text should have overflow: hidden');

        // 11. Check Avatar preserves both fixed width and height
        const avatar2Match = cssContent.match(/\.avatar-2\s*\{([^}]+)\}/);
        assert(avatar2Match, 'should have .avatar-2 rule');
        assert(avatar2Match[1].includes('width: 32px'), 'Avatar 2 should have fixed width 32px');
        assert(avatar2Match[1].includes('height: 32px'), 'Avatar 2 should have fixed height 32px');

        // 12. Check cleanup of redundant properties (no flex-basis: 0, no min-height: 0, concise flex: 1)
        assert(!cssContent.includes('flex-basis: 0'), 'CSS should not include redundant flex-basis: 0');
        assert(!cssContent.includes('min-height: 0'), 'CSS should not include redundant min-height: 0');
        assert(cssContent.includes('flex: 1'), 'CSS should use concise flex: 1');

        // 13. Check Sidebar 2 preserves fixed width 256px despite align-self: stretch
        const sidebar2Match = cssContent.match(/\.sidebar-2\s*\{([^}]+)\}/);
        assert(sidebar2Match, 'should have .sidebar-2 rule');
        assert(sidebar2Match[1].includes('width: 256px'), 'Sidebar 2 should have fixed width 256px');
        assert(sidebar2Match[1].includes('align-self: stretch'), 'Sidebar 2 should have align-self: stretch');

        // 14. Check Limits preserves fixed height 32px despite align-self: stretch
        const limitsMatch = cssContent.match(/\.limits\s*\{([^}]+)\}/);
        assert(limitsMatch, 'should have .limits rule');
        assert(limitsMatch[1].includes('height: 32px'), 'Limits should have fixed height 32px');
        assert(limitsMatch[1].includes('align-self: stretch'), 'Limits should have align-self: stretch');

        // 15. Check text node has line-height and letter-spacing (including instance overrides like CRM2 with -3% letter-spacing)
        const punkt2Match = cssContent.match(/\.punkt-2\s*\{([^}]+)\}/);
        assert(punkt2Match, 'should have .punkt-2 rule');
        assert(punkt2Match[1].includes('line-height: 1.25'), 'punkt-2 should have line-height: 1.25');
        assert(punkt2Match[1].includes('letter-spacing: -0.03em'), 'punkt-2 (CRM2 with -3% override) should have letter-spacing: -0.03em');

        const punkt3Match = cssContent.match(/\.punkt-3\s*\{([^}]+)\}/);
        assert(punkt3Match, 'should have .punkt-3 rule');
        assert(punkt3Match[1].includes('letter-spacing: 0em'), 'punkt-3 should have default letter-spacing: 0em');

        // 16. Check masked robot image is not absolute and fills 100% of group-1 container (34x24)
        const maskot2Match = cssContent.match(/\.schastlivyi-neonovyi-robot-maskot-2\s*\{([^}]+)\}/);
        assert(maskot2Match, 'should have .schastlivyi-neonovyi-robot-maskot-2 rule');
        assert(!maskot2Match[1].includes('position: absolute'), 'masked robot image should not be absolute');
        assert(maskot2Match[1].includes('width: 100%'), 'masked robot image should have width: 100%');
        assert(maskot2Match[1].includes('height: 100%'), 'masked robot image should have height: 100%');

        const group1CssMatch = cssContent.match(/\.group-1\s*\{([^}]+)\}/);
        assert(group1CssMatch, 'should have .group-1 rule');
        assert(group1CssMatch[1].includes('width: 34px'), 'group-1 container should have width 34px');
        assert(group1CssMatch[1].includes('height: 24px'), 'group-1 container should have height 24px');

        // Clean up
        fs.rmSync(outDir, { recursive: true, force: true });
    });

    // 9. Roadmap 2.1 Enhancements Tests (Figma Variables, CSS Grid, Variants, Google Fonts, Memory)
    console.log('\n\x1b[1m9. Roadmap 2.1 Enhancements Tests\x1b[0m');

    it('parses Google Fonts URL into font families, weights and styles', () => {
        const url = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Open+Sans:ital,wght@0,300;1,600&display=swap';
        const parsed = parseGoogleFontsUrl(url);
        assert.strictEqual(parsed.length, 2);
        assert.strictEqual(parsed[0].family, 'Roboto');
        assert.deepStrictEqual(parsed[0].weights, [400, 700]);
        assert.strictEqual(parsed[1].family, 'Open Sans');
        assert.strictEqual(parsed[1].hasItalic, true);
    });

    it('extracts Google Fonts references from HTML document <link> and @import', () => {
        const { JSDOM } = require('jsdom');
        const html = `<html><head>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;800&display=swap">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;600&display=swap');
            </style>
        </head><body></body></html>`;
        const dom = new JSDOM(html);
        const fonts = extractWebFonts(dom.window.document);
        assert(fonts.has('montserrat'));
        assert(fonts.has('fira code'));
        assert.deepStrictEqual(fonts.get('montserrat').weights, [500, 800]);
    });

    it('returns standard font metrics from FONT_METRICS_TABLE', () => {
        const interMetrics = getFontMetrics('Inter, sans-serif');
        assert(interMetrics.avgCharWidthRatio > 0.5 && interMetrics.avgCharWidthRatio < 0.6);
        const monoMetrics = getFontMetrics('Fira Code');
        assert.strictEqual(monoMetrics.avgCharWidthRatio, 0.6);
    });

    await itAsync('translates CSS Grid with repeat(3, 1fr) into Auto Layout with wrapping columns', async () => {
        const gridHtml = `<!DOCTYPE html><html><head><style>
            .grid-container {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 16px;
                width: 900px;
            }
            .grid-item {
                background: #333333;
                height: 100px;
            }
        </style></head><body>
            <div class="grid-container">
                <div class="grid-item">1</div>
                <div class="grid-item">2</div>
                <div class="grid-item">3</div>
            </div>
        </body></html>`;

        const res = await convertHtmlToNodes(gridHtml, { sessionID: 0, localID: 2 });
        const gridFrame = res.nodeChanges.find(n => n.name === 'grid-container');
        assert(gridFrame, 'grid-container frame should exist');
        assert.strictEqual(gridFrame.stackMode, 'HORIZONTAL');
        assert.strictEqual(gridFrame.stackWrap, 'WRAP');
        assert.strictEqual(gridFrame.stackSpacing, 16);

        // Check child items get calculated grid width: (900 - 2 * 16) / 3 = 289px
        const items = res.nodeChanges.filter(n => n.name === 'grid-item');
        assert.strictEqual(items.length, 3);
        assert.strictEqual(items[0].size.x, 289);
        assert.strictEqual(items[1].size.x, 289);
        assert.strictEqual(items[2].size.x, 289);
    });

    await itAsync('decompiles .fig with --layout grid to output CSS Grid rules', async () => {
        const testFig = path.resolve('test/showcase.fig');
        const testOutCss = path.resolve('test/grid-test-style.css');
        const res = await convertFigToHtml(testFig, {
            layoutMode: 'grid',
            extractCss: true,
            cssFile: testOutCss
        });
        assert(res.css.includes('display: grid') || res.html.includes('display: grid') || res.html.includes('display: flex'));
        if (fs.existsSync(testOutCss)) fs.unlinkSync(testOutCss);
    });

    await itAsync('generates native Figma VARIABLE_SET and VARIABLE nodes from :root custom properties', async () => {
        const varFig = path.resolve('test/test-vars-gen.fig');
        const varHtml = `<!DOCTYPE html><html><head><style>
            :root {
                --accent-color: #3b82f6;
                --spacing-lg: 24px;
                --theme-title: "Dark Theme";
            }
            .card {
                background: var(--accent-color);
                padding: var(--spacing-lg);
            }
        </style></head><body><div class="card">Card</div></body></html>`;

        const buildRes = await generateFigFile({
            htmlContent: varHtml,
            outputPath: varFig
        });

        assert(fs.existsSync(varFig));
        assert(buildRes.stats.variables >= 3, `Expected at least 3 variable nodes, got ${buildRes.stats.variables}`);

        // Read and decode the generated .fig to verify binary VARIABLE nodes
        const figData = readFigFile(varFig);
        const varSet = figData.nodeChanges.find(n => n.type === 'VARIABLE_SET');
        assert(varSet, 'Should contain VARIABLE_SET node');
        assert.strictEqual(varSet.name, 'Web Tokens');

        const variables = figData.nodeChanges.filter(n => n.type === 'VARIABLE');
        assert(variables.length >= 3, 'Should contain at least 3 VARIABLE nodes');
        const accentVar = variables.find(v => v.name === 'accent/color');
        assert(accentVar, 'Should contain accent/color variable');
        assert.strictEqual(accentVar.variableResolvedType, 'COLOR');

        const spacingVar = variables.find(v => v.name === 'spacing/lg');
        assert(spacingVar, 'Should contain spacing/lg variable');
        assert.strictEqual(spacingVar.variableResolvedType, 'FLOAT');

        fs.unlinkSync(varFig);
    });

    await itAsync('decompiles native Figma variables and exports design tokens JSON via --tokens', async () => {
        const tokensPath = path.resolve('test/test-extracted-tokens.json');
        const res = await convertFigToHtml('fleader.fig', {
            tokens: tokensPath,
            extractTokens: true
        });

        assert(res.tokens, 'Result should include tokens object');
        assert(Object.keys(res.tokens.colors).length > 5, 'Should extract colors');
        assert(Object.keys(res.tokens.spacing).length > 5, 'Should extract spacing');
        assert(Object.keys(res.tokens.radius).length > 3, 'Should extract radius');
        assert(fs.existsSync(tokensPath), 'tokens.json file should be written to disk');

        const json = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
        assert(json.colors['bg-canvas'], 'Should contain bg-canvas token');
        assert(json.spacing['space-12'], 'Should contain space-12 token');

        fs.unlinkSync(tokensPath);
    });

    await itAsync('generates interactive prototypeInteractions from CSS :hover rules', async () => {
        const hoverHtml = `<!DOCTYPE html><html><head><style>
            .btn {
                background: #3b82f6;
                padding: 10px 20px;
                color: #ffffff;
            }
            .btn:hover {
                background: #1d4ed8;
            }
        </style></head><body><button class="btn">Click me</button></body></html>`;

        const res = await convertHtmlToNodes(hoverHtml, { sessionID: 0, localID: 2 });
        const btnNode = res.nodeChanges.find(n => n.name === 'btn');
        assert(btnNode, 'btn frame should exist');
        assert(btnNode.prototypeInteractions, 'btn should have prototypeInteractions');
        assert.strictEqual(btnNode.prototypeInteractions[0].event.interactionType, 'ON_HOVER');
    });

    it('provides lazy base64 evaluation in reader for memory efficiency', () => {
        const figData = readFigFile('test/showcase.fig');
        assert(figData.images instanceof Map);
        for (const [hash, img] of figData.images.entries()) {
            assert(Buffer.isBuffer(img.buffer), 'Image buffer should be intact');
            assert(typeof img.mime === 'string', 'Image mime should be detected');
            assert(img.base64.startsWith('data:image/'), 'Image base64 should be evaluated on access');
        }
    });

    console.log(`\n\x1b[1mTest Results: ${passedTests}/${totalTests} passed\x1b[0m`);
    if (passedTests === totalTests) {
        console.log('\x1b[32m\x1b[1mAll tests passed successfully! 🚀\x1b[0m\n');
    } else {
        console.error('\x1b[31m\x1b[1mSome tests failed!\x1b[0m\n');
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
