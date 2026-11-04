// test/run-tests.js
const assert = require('assert');
const path = require('path');
const fs = require('fs');
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
    parseTextTransform
} = require('../src/parsers/typography');
const { ImageRegistry, getImageDimensions } = require('../src/parsers/images');
const { generateFigFile } = require('../src/generator');
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

        // Check SVG vector icons
        const svgCount = (htmlContent.match(/<svg/g) || []).length;
        assert(svgCount >= 20, `Expected at least 20 SVG icons, got ${svgCount}`);

        // Check clean CSS variables without spaces
        const rootVars = cssContent.match(/--[a-zA-Z0-9_-]+:/g) || [];
        assert(rootVars.length > 5);
        assert(!cssContent.includes('--radius-10px 10px'));

        // Clean up
        fs.rmSync(outDir, { recursive: true, force: true });
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
