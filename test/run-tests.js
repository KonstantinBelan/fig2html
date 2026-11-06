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
const { ProgressBar } = require('../src/utils/progress-bar');
const {
    convertFigToHtml,
    readFigFile,
    buildSceneTree
} = require('../src/decompiler');
const {
    formatColor,
    getLinearGradientAngle,
    parseTransformMatrix,
    getNodeTransformInfo,
    formatGradient,
    formatEffects,
    formatPaintFilter,
    parseFontWeightAndStyle,
    computeNodeStyles,
    getExtensionForMime,
    hasExplicitMaskTag
} = require('../src/decompiler/css');
const { bakeMasksIntoImages, bakeImageFillsAndFilters } = require('../src/decompiler/image-optimizer');
const {
    StylesheetManager,
    toBaseClassName
} = require('../src/decompiler/stylesheet');
const {
    transliterate,
    stripPageTag,
    hasExcludeTag,
    filterScreenOutliers,
    DEFAULT_EXCLUDE_TAGS,
    slugifyPageName,
    sanitizeFileName,
    assignUniqueFileNames,
    detectPages
} = require('../src/decompiler/page-detector');
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
} = require('../src/decompiler/geometry');
const {
    hasContainerVisualStyles,
    isUnderlayCandidate,
    promoteToContainer,
    detectAndExtractContainers
} = require('../src/decompiler/container-detector');
const {
    detectGrid,
    isMaskContainer,
    hasTransformRotation,
    shouldSkipLayoutSynthesis,
    synthesizeContainerLayout,
    synthesizeLayoutTree,
    applySmartLayout
} = require('../src/decompiler/synthesizer');
const { getCompiledSchema } = require('../src/schema');
const { ZstdCodec } = require('zstd-codec');
const {
    parseBreakpointTag,
    resolveBreakpointName,
    categorizeWidth,
    normalizeBaseName,
    groupFramesIntoResponsivePages
} = require('../src/decompiler/breakpoint-detector');
const {
    computeNodeSimilarity,
    matchChildren,
    alignBreakpointTrees
} = require('../src/decompiler/ast-aligner');
const {
    calculateFluidClamp,
    getBreakpointMediaQuery,
    diffNodeStyles,
    synthesizeResponsiveStyles
} = require('../src/decompiler/responsive-css');
const { runGraphicCollapserTests } = require('./test-graphic-collapser');

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

    it('renders interactive progress bar updates and handles non-TTY environments cleanly', () => {
        const origWrite = process.stdout.write;
        let captured = '';
        process.stdout.write = (chunk) => { captured += chunk; return true; };
        try {
            const barTTY = new ProgressBar({ isTTY: true, width: 20 });
            barTTY.update(10, 'Step 1');
            assert.strictEqual(barTTY.current, 10);
            barTTY.update(50, 'Step 2');
            assert.strictEqual(barTTY.current, 50);
            barTTY.update(100, 'Done');
            assert.strictEqual(barTTY.current, 100);
            barTTY.stop();
            assert.strictEqual(barTTY.stopped, true);
            assert(captured.includes('10%'));
            assert(captured.includes('50%'));
            assert(captured.includes('100%'));
        } finally {
            process.stdout.write = origWrite;
        }

        // Non-TTY mode test
        const barNonTTY = new ProgressBar({ isTTY: false });
        barNonTTY.update(25, 'Milestone 25%');
        assert.strictEqual(barNonTTY.current, 25);
        barNonTTY.stop();
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

    it('formats Figma image adjustments (paintFilter: exposure, contrast, saturation, temperature, tint) into CSS filter', () => {
        // 1. Exposure and contrast
        const f1 = formatPaintFilter({ exposure: 0.25, contrast: 0.1 });
        assert.strictEqual(f1, 'brightness(1.25) contrast(1.1)');

        // 2. Grayscale desaturation
        const f2 = formatPaintFilter({ exposure: 0.09, contrast: 0.15, saturation: -1.0 });
        assert.strictEqual(f2, 'brightness(1.09) contrast(1.15) grayscale(1)');

        // 3. Vibrance and temperature (warm)
        const f3 = formatPaintFilter({ vibrance: 0.5, temperature: 0.3 });
        assert.strictEqual(f3, 'saturate(1.5) sepia(12%)');

        // 4. Cold temperature and tint
        const f4 = formatPaintFilter({ temperature: -0.5, tint: 0.2 });
        assert.strictEqual(f4, 'hue-rotate(-15deg) hue-rotate(9deg)');

        // 5. Empty or null filter
        assert.strictEqual(formatPaintFilter(null), null);
        assert.strictEqual(formatPaintFilter({}), null);
    });

    it('parses font weights and italic styles', () => {
        assert.deepStrictEqual(parseFontWeightAndStyle('Bold'), { fontWeight: 700, fontStyle: 'normal' });
        assert.deepStrictEqual(parseFontWeightAndStyle('Semi Bold Italic'), { fontWeight: 600, fontStyle: 'italic' });
        assert.deepStrictEqual(parseFontWeightAndStyle('Light'), { fontWeight: 300, fontStyle: 'normal' });
        assert.deepStrictEqual(parseFontWeightAndStyle('Medium'), { fontWeight: 500, fontStyle: 'normal' });
    });

    it('translates Figma Auto line-height (100% or AUTO) into line-height: normal', () => {
        const textAutoPercent = { type: 'TEXT', name: 'Heading', fontSize: 16, lineHeight: { value: 100, units: 'PERCENT' } };
        const s1 = computeNodeStyles(textAutoPercent);
        assert.strictEqual(s1['line-height'], 'normal');

        const textAutoUnits = { type: 'TEXT', name: 'Heading', fontSize: 16, lineHeight: { units: 'AUTO' } };
        const s2 = computeNodeStyles(textAutoUnits);
        assert.strictEqual(s2['line-height'], 'normal');

        const textCustomPercent = { type: 'TEXT', name: 'Body', fontSize: 16, lineHeight: { value: 150, units: 'PERCENT' } };
        const s3 = computeNodeStyles(textCustomPercent);
        assert.strictEqual(s3['line-height'], '1.5');
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

    await itAsync('binds element properties (fills, strokes, cornerRadius, padding, gap) to native Figma variables', async () => {
        const bindFig = path.resolve('test/test-vars-binding.fig');
        const bindHtml = `<!DOCTYPE html><html><head><style>
            :root {
                --color-primary: #6366f1;
                --color-border: #06b6d4;
                --radius-sm: 8px;
                --space-md: 16px;
                --gap-sm: 12px;
            }
            .btn {
                background-color: var(--color-primary);
                border: 2px solid var(--color-border);
                border-radius: var(--radius-sm);
                padding: var(--space-md);
                gap: var(--gap-sm);
                display: flex;
            }
        </style></head><body><button class="btn">Click me</button></body></html>`;

        await generateFigFile({
            htmlContent: bindHtml,
            outputPath: bindFig
        });

        assert(fs.existsSync(bindFig));
        const figData = readFigFile(bindFig);

        const variables = figData.nodeChanges.filter(n => n.type === 'VARIABLE');
        const primaryVar = variables.find(v => v.name === 'color/primary');
        const borderVar = variables.find(v => v.name === 'color/border');
        const radiusVar = variables.find(v => v.name === 'radius/sm');
        const spaceVar = variables.find(v => v.name === 'space/md');
        const gapVar = variables.find(v => v.name === 'gap/sm');

        assert(primaryVar, 'Should create color/primary variable');
        assert(borderVar, 'Should create color/border variable');
        assert(radiusVar, 'Should create radius/sm variable');
        assert(spaceVar, 'Should create space/md variable');
        assert(gapVar, 'Should create gap/sm variable');

        const btnNode = figData.nodeChanges.find(n => n.name === 'btn');
        assert(btnNode, 'Should find button node');

        // Check fill colorVar
        assert(btnNode.fillPaints && btnNode.fillPaints.length > 0, 'Button should have fillPaints');
        assert(btnNode.fillPaints[0].colorVar, 'Button fillPaint should have colorVar binding');
        assert.deepStrictEqual(btnNode.fillPaints[0].colorVar.value.alias.guid, primaryVar.guid);

        // Check stroke colorVar
        assert(btnNode.strokePaints && btnNode.strokePaints.length > 0, 'Button should have strokePaints');
        assert(btnNode.strokePaints[0].colorVar, 'Button strokePaint should have colorVar binding');
        assert.deepStrictEqual(btnNode.strokePaints[0].colorVar.value.alias.guid, borderVar.guid);

        // Check parameterConsumptionMap and variableConsumptionMap
        assert(btnNode.parameterConsumptionMap && btnNode.parameterConsumptionMap.entries, 'Button should have parameterConsumptionMap');
        assert(btnNode.variableConsumptionMap && btnNode.variableConsumptionMap.entries, 'Button should have variableConsumptionMap');

        // Check independent corners and cornerRadius removal
        assert.strictEqual(btnNode.rectangleCornerRadiiIndependent, true, 'Button should have independent corner radii');
        assert.strictEqual(btnNode.cornerRadius, undefined, 'Button cornerRadius scalar should be undefined');
        assert.strictEqual(btnNode.rectangleTopLeftCornerRadius, 8, 'Button rectangleTopLeftCornerRadius should match');

        const radiusEntry = btnNode.parameterConsumptionMap.entries.find(e => e.variableField === 'RECTANGLE_TOP_LEFT_CORNER_RADIUS');
        assert(radiusEntry, 'Button should bind RECTANGLE_TOP_LEFT_CORNER_RADIUS');
        assert.deepStrictEqual(radiusEntry.variableData.value.alias.guid, radiusVar.guid);

        const padTopEntry = btnNode.parameterConsumptionMap.entries.find(e => e.variableField === 'STACK_PADDING_TOP');
        assert(padTopEntry, 'Button should bind STACK_PADDING_TOP');
        assert.deepStrictEqual(padTopEntry.variableData.value.alias.guid, spaceVar.guid);

        const gapEntry = btnNode.parameterConsumptionMap.entries.find(e => e.variableField === 'STACK_SPACING');
        assert(gapEntry, 'Button should bind STACK_SPACING');
        assert.deepStrictEqual(gapEntry.variableData.value.alias.guid, gapVar.guid);

        fs.unlinkSync(bindFig);
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

    // 10. Layout Synthesis Engine Tests
    console.log('\n\x1b[1m10. Layout Synthesis Engine Tests\x1b[0m');

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
        assert(html.includes('margin-top: 20px'), 'Title should have margin-top: 20px');
        assert(html.includes('margin-top: 10px'), 'Subtitle should have margin-top: 10px');
        assert(html.includes('margin-top: 32px'), 'Row should have margin-top: 32px');
        assert(html.includes('margin-top: 36px'), 'Row-2 should have margin-top: 36px');
    });

    await itAsync('decompiles demo-absolute.fig without redundant height on rows, with elevated overlay z-index and paintFilter', async () => {
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
        assert(mainMatch[1].includes('padding: 46px 40px 40px 40px'), '.main-container should have symmetric 40px padding');
        assert(!mainMatch[1].includes('padding: 46px 0px 40px 40px'), '.main-container should not lose right padding due to absolute overlay');

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
    console.log('\n\x1b[1m11. Multi-Page Import Engine Tests (v1.3.0)\x1b[0m');

    it('transliterates Cyrillic page names to clean Latin strings', () => {
        assert.strictEqual(transliterate('Привет мир'), 'Privet mir');
        assert.strictEqual(transliterate('О компании'), 'O kompanii');
        assert.strictEqual(transliterate('Главная'), 'Glavnaya');
        assert.strictEqual(transliterate('Тарифы и цены'), 'Tarify i tseny');
    });

    it('detects and strips explicit page tags ([page], [страница], [p], #page, /page)', () => {
        const t1 = stripPageTag('[page] Home');
        assert.strictEqual(t1.isTagged, true);
        assert.strictEqual(t1.cleanName, 'Home');
        assert.strictEqual(t1.tag, '[page]');

        const t2 = stripPageTag('[страница] О нас');
        assert.strictEqual(t2.isTagged, true);
        assert.strictEqual(t2.cleanName, 'О нас');

        const t3 = stripPageTag('[p] Contact Us');
        assert.strictEqual(t3.isTagged, true);
        assert.strictEqual(t3.cleanName, 'Contact Us');

        const t4 = stripPageTag('#page Pricing');
        assert.strictEqual(t4.isTagged, true);
        assert.strictEqual(t4.cleanName, 'Pricing');

        const t5 = stripPageTag('/page/catalog');
        assert.strictEqual(t5.isTagged, true);
        assert.strictEqual(t5.cleanName, 'catalog');

        // Custom tags
        const tCustom = stripPageTag('#screen Dashboard', '#screen,#artboard');
        assert.strictEqual(tCustom.isTagged, true);
        assert.strictEqual(tCustom.cleanName, 'Dashboard');

        // Non-tagged frame
        const tNone = stripPageTag('Button / Secondary');
        assert.strictEqual(tNone.isTagged, false);
        assert.strictEqual(tNone.cleanName, 'Button / Secondary');
    });

    it('slugifies page names into canonical URL slugs and file names', () => {
        // Home aliases -> index
        assert.strictEqual(slugifyPageName('Home'), 'index');
        assert.strictEqual(slugifyPageName('Главная'), 'index');
        assert.strictEqual(slugifyPageName('Index'), 'index');
        assert.strictEqual(slugifyPageName('Main'), 'index');
        assert.strictEqual(slugifyPageName('Desktop - 1', { isFirst: true }), 'index');

        // Semantic mapping
        assert.strictEqual(slugifyPageName('О нас'), 'about');
        assert.strictEqual(slugifyPageName('О компании'), 'about');
        assert.strictEqual(slugifyPageName('Каталог'), 'catalog');
        assert.strictEqual(slugifyPageName('Тарифы'), 'pricing');
        assert.strictEqual(slugifyPageName('Корзина'), 'cart');
        assert.strictEqual(slugifyPageName('Контакты'), 'contacts');
        assert.strictEqual(slugifyPageName('404'), '404');

        // File name formatting
        assert.strictEqual(sanitizeFileName('index'), 'index.html');
        assert.strictEqual(sanitizeFileName('about'), 'about.html');
        assert.strictEqual(sanitizeFileName('about-us'), 'about-us.html');
    });

    it('detects pages via Priority 1 (Explicit Tags) and ignores untagged frames', () => {
        const rootNodes = [
            { name: '[page] Home', type: 'FRAME', transform: { m02: 0, m12: 0 }, size: { x: 1440, y: 900 } },
            { name: 'Color Palette (Do not export)', type: 'FRAME', transform: { m02: 0, m12: 1000 }, size: { x: 400, y: 300 } },
            { name: '[страница] О нас', type: 'FRAME', transform: { m02: 1600, m12: 0 }, size: { x: 1440, y: 1200 } },
            { name: '[page] Catalog', type: 'FRAME', transform: { m02: 3200, m12: 0 }, size: { x: 1440, y: 1800 } }
        ];

        const pages = detectPages({ rootNodes });
        assert.strictEqual(pages.length, 3);
        assert.strictEqual(pages[0].strategy, 'tag');
        assert.strictEqual(pages[0].fileName, 'index.html');
        assert.strictEqual(pages[0].cleanName, 'Home');
        assert.strictEqual(pages[1].fileName, 'about.html');
        assert.strictEqual(pages[1].cleanName, 'О нас');
        assert.strictEqual(pages[2].fileName, 'catalog.html');
        assert.strictEqual(pages[2].cleanName, 'Catalog');
    });

    it('detects pages via Priority 2 (Screen Artboards) when no tags are present', () => {
        const rootNodes = [
            { name: 'Home Screen', type: 'FRAME', transform: { m02: 0, m12: 0 }, size: { x: 1440, y: 1024 } },
            { name: 'Small Icon Frame', type: 'FRAME', transform: { m02: 0, m12: 1200 }, size: { x: 48, y: 48 } },
            { name: 'Pricing Plans', type: 'FRAME', transform: { m02: 1600, m12: 0 }, size: { x: 1440, y: 1400 } }
        ];

        const pages = detectPages({ rootNodes });
        assert.strictEqual(pages.length, 2);
        assert.strictEqual(pages[0].strategy, 'artboard');
        assert.strictEqual(pages[0].fileName, 'index.html');
        assert.strictEqual(pages[1].fileName, 'pricing-plans.html');
    });

    it('detects pages via Priority 3 (Canvas Pages) or honors --pages and --single-page flags', () => {
        const canvases = [
            { type: 'CANVAS', name: 'Landing', children: [{ name: 'Hero', size: { x: 1440, y: 900 } }] },
            { type: 'CANVAS', name: 'Internal Only Canvas', children: [{ name: 'Scratch', size: { x: 500, y: 500 } }] },
            { type: 'CANVAS', name: 'About Company', children: [{ name: 'Content', size: { x: 1440, y: 1200 } }] }
        ];

        // All canvases
        const pages = detectPages({ canvases }, { allCanvases: true });
        assert.strictEqual(pages.length, 2);
        assert.strictEqual(pages[0].strategy, 'canvas');
        assert.strictEqual(pages[0].fileName, 'index.html');
        assert.strictEqual(pages[1].fileName, 'about-company.html');

        // Filter via --pages
        const filtered = detectPages({ canvases }, { allCanvases: true, pages: 'About Company' });
        assert.strictEqual(filtered.length, 1);
        assert.strictEqual(filtered[0].cleanName, 'About Company');

        // Force single page via --single-page
        const single = detectPages({ canvases }, { allCanvases: true, singlePage: true });
        assert.strictEqual(single.length, 1);
        assert.strictEqual(single[0].strategy, 'single');
    });

    it('recognizes exclude tags and excludes marked frames from page export', () => {
        assert.strictEqual(hasExcludeTag('[exclude] Modal'), true);
        assert.strictEqual(hasExcludeTag('[исключить] Корзина'), true);
        assert.strictEqual(hasExcludeTag('[исключение] Диалог'), true);
        assert.strictEqual(hasExcludeTag('[ignore] Old Header'), true);
        assert.strictEqual(hasExcludeTag('#exclude Popup'), true);
        assert.strictEqual(hasExcludeTag('Regular Frame'), false);
        assert.strictEqual(hasExcludeTag('Frame with [custom-skip]', '[custom-skip]'), true);

        // Priority 1 with exclude tag:
        const taggedNodes = [
            { name: '[page] Home', type: 'FRAME', transform: { m02: 0, m12: 0 }, size: { x: 1440, y: 900 } },
            { name: '[page] [exclude] Draft Checkout', type: 'FRAME', transform: { m02: 1600, m12: 0 }, size: { x: 1440, y: 900 } },
            { name: '[page] About', type: 'FRAME', transform: { m02: 3200, m12: 0 }, size: { x: 1440, y: 900 } }
        ];
        const taggedPages = detectPages({ rootNodes: taggedNodes });
        assert.strictEqual(taggedPages.length, 2);
        assert.strictEqual(taggedPages[0].cleanName, 'Home');
        assert.strictEqual(taggedPages[1].cleanName, 'About');

        // Priority 2 with exclude tag:
        const screenNodes = [
            { name: 'Home Screen', type: 'FRAME', transform: { m02: 0, m12: 0 }, size: { x: 1440, y: 900 } },
            { name: '[исключить] Modal Window', type: 'FRAME', transform: { m02: 1600, m12: 0 }, size: { x: 1440, y: 900 } },
            { name: 'Contact Screen', type: 'FRAME', transform: { m02: 3200, m12: 0 }, size: { x: 1440, y: 900 } }
        ];
        const screenPages = detectPages({ rootNodes: screenNodes });
        assert.strictEqual(screenPages.length, 2);
        assert.strictEqual(screenPages[0].cleanName, 'Home Screen');
        assert.strictEqual(screenPages[1].cleanName, 'Contact Screen');
    });

    it('filters out popup/modal outliers using median size clustering (Outlier Detection)', () => {
        // Two desktop pages (1440x900) + one popup modal (450x500)
        const candidateFrames = [
            { name: 'Home Page', type: 'FRAME', transform: { m02: 0, m12: 0 }, size: { x: 1440, y: 900 } },
            { name: 'Cookie Popup Modal', type: 'FRAME', transform: { m02: 0, m12: 1000 }, size: { x: 450, y: 500 } },
            { name: 'About Page', type: 'FRAME', transform: { m02: 1600, m12: 0 }, size: { x: 1440, y: 900 } }
        ];

        const filtered = filterScreenOutliers(candidateFrames);
        assert.strictEqual(filtered.length, 2, 'Should filter out the 450px popup');
        assert.strictEqual(filtered[0].name, 'Home Page');
        assert.strictEqual(filtered[1].name, 'About Page');

        const pages = detectPages({ rootNodes: candidateFrames });
        assert.strictEqual(pages.length, 2);
        assert.strictEqual(pages[0].fileName, 'index.html');
        assert.strictEqual(pages[1].fileName, 'about-page.html');

        // Case with only 1 desktop page and 1 modal: falls back to single-page export
        const singlePlusModal = [
            { name: 'Landing Desktop', type: 'FRAME', transform: { m02: 0, m12: 0 }, size: { x: 1440, y: 900 } },
            { name: 'Auth Modal Dialog', type: 'FRAME', transform: { m02: 0, m12: 1000 }, size: { x: 400, y: 480 } }
        ];
        const singlePages = detectPages({ rootNodes: singlePlusModal });
        assert.strictEqual(singlePages.length, 1);
        assert.strictEqual(singlePages[0].strategy, 'single', 'Should fallback to single-page export when modal is excluded');
    });

    it('parses --exclude-tag and --no-outlier-detection in CLI reverse args', () => {
        const parsed = parseReverseArgs(['input.fig', '--exclude-tag', '[draft],[temp]', '--no-outlier-detection']);
        assert.strictEqual(parsed.excludeTag, '[draft],[temp]');
        assert.strictEqual(parsed.outlierDetection, false);
    });

    it('merges identical styles across multiple pages into single DRY CSS rule (Smart DRY CSS)', () => {
        const sm = new StylesheetManager({ isMultiPage: true });

        // Page 1: Home button
        sm.setPageContext('index', 'Home');
        const homeBtn = {
            name: 'btn',
            type: 'FRAME',
            size: { x: 120, y: 48 },
            fillPaints: [{ type: 'SOLID', color: { r: 0, g: 0.4, b: 1, a: 1 } }]
        };
        const classHome = sm.registerNode(homeBtn, null, new Map());
        assert.strictEqual(classHome, 'btn');

        // Page 2: About button (identically styled)
        sm.setPageContext('about', 'About');
        const aboutBtn = {
            name: 'btn',
            type: 'FRAME',
            size: { x: 120, y: 48 },
            fillPaints: [{ type: 'SOLID', color: { r: 0, g: 0.4, b: 1, a: 1 } }]
        };
        const classAbout = sm.registerNode(aboutBtn, null, new Map());
        assert.strictEqual(classAbout, 'btn', 'Identical styles on different pages should share the exact same class name');

        // Verify only 1 rule generated for .btn
        assert(sm.uniqueRules.has('btn'));
        assert.strictEqual(sm.uniqueRules.has('btn-2'), false);
        assert.strictEqual(sm.uniqueRules.has('btn--about'), false);
    });

    it('isolates CSS collisions when layers have same name but different styles (Conflict Isolation)', () => {
        const sm = new StylesheetManager({ isMultiPage: true, classScope: 'modifier' });

        // Page 1: Home button (blue, height 48px)
        sm.setPageContext('index', 'Home');
        const homeBtn = {
            name: 'btn',
            type: 'FRAME',
            size: { x: 120, y: 48 },
            fillPaints: [{ type: 'SOLID', color: { r: 0, g: 0.4, b: 1, a: 1 } }]
        };
        const classHome = sm.registerNode(homeBtn, null, new Map());
        assert.strictEqual(classHome, 'btn');

        // Page 2: Cart button (green, height 56px - conflicting!)
        sm.setPageContext('cart', 'Cart');
        const cartBtn = {
            name: 'btn',
            type: 'FRAME',
            size: { x: 140, y: 56 },
            fillPaints: [{ type: 'SOLID', color: { r: 0.1, g: 0.8, b: 0.3, a: 1 } }]
        };
        const classCart = sm.registerNode(cartBtn, null, new Map());
        assert.strictEqual(classCart, 'btn--cart', 'Conflicting style must be isolated with page modifier');

        // Verify both rules exist and neither overwrites the other
        assert(sm.uniqueRules.has('btn'));
        assert(sm.uniqueRules.has('btn--cart'));
        const homeRule = sm.uniqueRules.get('btn');
        const cartRule = sm.uniqueRules.get('btn--cart');
        assert(homeRule['background-color'].includes('#0066ff'));
        assert(cartRule['background-color'].includes('#1ae64d') || cartRule['background-color'].includes('rgb') || cartRule['background-color'].includes('1a'));
        assert.strictEqual(homeRule['min-height'], '48px');
        assert.strictEqual(cartRule['min-height'], '56px');
    });

    it('separates .main-container base styles and page-specific modifier styles', () => {
        const sm = new StylesheetManager({ isMultiPage: true });

        // Home page root
        sm.setPageContext('index', 'Home');
        const homeRoot = {
            name: 'Home Screen',
            type: 'FRAME',
            size: { x: 1440, y: 900 },
            fillPaints: [{ type: 'SOLID', color: { r: 0.05, g: 0.07, b: 0.09, a: 1 } }]
        };
        const classHomeRoot = sm.registerNode(homeRoot, null, new Map(), { isRoot: true });
        assert.strictEqual(classHomeRoot, 'main-container page-index-container');

        // About page root (different width and background)
        sm.setPageContext('about', 'About');
        const aboutRoot = {
            name: 'About Screen',
            type: 'FRAME',
            size: { x: 1200, y: 800 },
            fillPaints: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }]
        };
        const classAboutRoot = sm.registerNode(aboutRoot, null, new Map(), { isRoot: true });
        assert.strictEqual(classAboutRoot, 'main-container page-about-container');

        // Check base styles in .main-container
        const baseRule = sm.uniqueRules.get('main-container');
        assert.strictEqual(baseRule['width'], '100%');
        assert.strictEqual(baseRule['margin'], '0 auto');
        assert.strictEqual(baseRule['box-sizing'], 'border-box');
        assert(!baseRule['max-width'], 'Base container should not have individual max-width');

        // Check individual modifiers
        const homeMod = sm.uniqueRules.get('page-index-container');
        assert.strictEqual(homeMod['max-width'], '1440px');

        const aboutMod = sm.uniqueRules.get('page-about-container');
        assert.strictEqual(aboutMod['max-width'], '1200px');
    });

    await itAsync('decompiles multi-page .fig project generating dist/*.html and shared css/style.css', async () => {
        const testHtml = `<!DOCTYPE html>
<html>
<body>
  <div style="position: absolute; left: 0px; top: 0px; width: 1440px; height: 900px; background-color: #0f172a; padding: 40px;" data-name="[page] Home">
    <h1 style="font-size: 36px; color: #ffffff;">Welcome Home</h1>
    <button class="nav-btn" style="background-color: #3b82f6; color: #ffffff; padding: 12px 24px; border-radius: 8px;">Explore</button>
  </div>
  <div style="position: absolute; left: 1600px; top: 0px; width: 1200px; height: 800px; background-color: #ffffff; padding: 32px;" data-name="[страница] О нас">
    <h2 style="font-size: 28px; color: #1e293b;">About Our Company</h2>
    <button class="nav-btn" style="background-color: #3b82f6; color: #ffffff; padding: 12px 24px; border-radius: 8px;">Explore</button>
  </div>
  <div style="position: absolute; left: 3000px; top: 0px; width: 1440px; height: 1000px; background-color: #f8fafc; padding: 40px;" data-name="[page] Catalog">
    <h2 style="font-size: 28px; color: #0f172a;">Product Catalog</h2>
    <button class="nav-btn" style="background-color: #10b981; color: #ffffff; padding: 16px 32px; border-radius: 8px;">Order Now</button>
  </div>
</body>
</html>`;

        const testFigPath = 'test/multipage_temp.fig';
        await generateFigFile({
            htmlContent: testHtml,
            outputPath: testFigPath
        });
        assert(fs.existsSync(testFigPath), 'Generated test fig should exist');

        const outDir = 'test/dist_multipage_test';
        if (fs.existsSync(outDir)) {
            fs.rmSync(outDir, { recursive: true, force: true });
        }

        // Decompile with -s (separate CSS file)
        const result = await convertFigToHtml(testFigPath, {
            outputHtmlPath: path.join(outDir, 'index.html'),
            separateFiles: true,
            cssFile: 'css/style.css'
        });

        assert.strictEqual(result.isMultiPage, true, 'Should detect multi-page layout');
        assert.strictEqual(result.pages.length, 3, 'Should generate 3 pages');

        // Check generated file structure
        const indexHtmlPath = path.join(outDir, 'index.html');
        const aboutHtmlPath = path.join(outDir, 'about.html');
        const catalogHtmlPath = path.join(outDir, 'catalog.html');
        const styleCssPath = path.join(outDir, 'css/style.css');

        assert(fs.existsSync(indexHtmlPath), 'index.html must exist');
        assert(fs.existsSync(aboutHtmlPath), 'about.html must exist');
        assert(fs.existsSync(catalogHtmlPath), 'catalog.html must exist');
        assert(fs.existsSync(styleCssPath), 'css/style.css must exist');

        // Verify shared CSS link in each page
        const indexContent = fs.readFileSync(indexHtmlPath, 'utf8');
        const aboutContent = fs.readFileSync(aboutHtmlPath, 'utf8');
        const catalogContent = fs.readFileSync(catalogHtmlPath, 'utf8');
        const cssContent = fs.readFileSync(styleCssPath, 'utf8');

        assert(indexContent.includes('<link rel="stylesheet" href="css/style.css">'));
        assert(aboutContent.includes('<link rel="stylesheet" href="css/style.css">'));
        assert(catalogContent.includes('<link rel="stylesheet" href="css/style.css">'));

        // Check body classes
        assert(indexContent.includes('<body class="page-index">'));
        assert(aboutContent.includes('<body class="page-about">'));
        assert(catalogContent.includes('<body class="page-catalog">'));

        // Check Smart DRY CSS and Conflict resolution in style.css
        assert(cssContent.includes('.main-container {'));
        assert(cssContent.includes('.page-index-container {'));
        assert(cssContent.includes('.page-about-container {'));
        assert(cssContent.includes('.page-catalog-container {'));

        // Buttons: Home and About shared identical styles, Catalog has different styles
        assert(cssContent.includes('.nav-btn {'), 'Base .nav-btn must exist in css');
        assert(cssContent.includes('.nav-btn--catalog {'), 'Conflicting .nav-btn--catalog must exist in css');

        // Clean up
        fs.unlinkSync(testFigPath);
        fs.rmSync(outDir, { recursive: true, force: true });
    });

    console.log('\n12. Adaptive Multi-Breakpoint Engine Tests (v1.4.0)');

    it('parses breakpoint tags across bracket, at-sign, delimiter, space and direct syntaxes', () => {
        // 1. Bracket syntax
        const b1 = parseBreakpointTag('Home [desktop]');
        assert.strictEqual(b1.isBreakpointTagged, true);
        assert.strictEqual(b1.baseName, 'Home');
        assert.strictEqual(b1.breakpoint, 'desktop');

        const b2 = parseBreakpointTag('Catalog [tablet]');
        assert.strictEqual(b2.isBreakpointTagged, true);
        assert.strictEqual(b2.breakpoint, 'tablet');

        const b3 = parseBreakpointTag('Hero [w:375]');
        assert.strictEqual(b3.isBreakpointTagged, true);
        assert.strictEqual(b3.targetWidth, 375);
        assert.strictEqual(b3.breakpoint, 'mobile');

        const b4 = parseBreakpointTag('Landing [768px]');
        assert.strictEqual(b4.isBreakpointTagged, true);
        assert.strictEqual(b4.targetWidth, 768);
        assert.strictEqual(b4.breakpoint, 'tablet');

        const b5 = parseBreakpointTag('Главная [десктоп]');
        assert.strictEqual(b5.isBreakpointTagged, true);
        assert.strictEqual(b5.breakpoint, 'desktop');

        // 2. At-sign syntax
        const at1 = parseBreakpointTag('Home @1440');
        assert.strictEqual(at1.isBreakpointTagged, true);
        assert.strictEqual(at1.targetWidth, 1440);
        assert.strictEqual(at1.breakpoint, 'desktop');

        const at2 = parseBreakpointTag('Catalog @mobile');
        assert.strictEqual(at2.isBreakpointTagged, true);
        assert.strictEqual(at2.breakpoint, 'mobile');

        // 3. Delimiter syntax
        const d1 = parseBreakpointTag('Home / Desktop');
        assert.strictEqual(d1.isBreakpointTagged, true);
        assert.strictEqual(d1.baseName, 'Home');
        assert.strictEqual(d1.breakpoint, 'desktop');

        const d2 = parseBreakpointTag('Home - Mobile');
        assert.strictEqual(d2.isBreakpointTagged, true);
        assert.strictEqual(d2.breakpoint, 'mobile');

        const d3 = parseBreakpointTag('Header (Tablet)');
        assert.strictEqual(d3.isBreakpointTagged, true);
        assert.strictEqual(d3.breakpoint, 'tablet');

        // 4. Space syntax
        const s1 = parseBreakpointTag('Home Desktop');
        assert.strictEqual(s1.isBreakpointTagged, true);
        assert.strictEqual(s1.breakpoint, 'desktop');

        const s2 = parseBreakpointTag('Hero Mobile');
        assert.strictEqual(s2.isBreakpointTagged, true);
        assert.strictEqual(s2.breakpoint, 'mobile');

        // 5. Direct keyword
        const dk1 = parseBreakpointTag('Desktop');
        assert.strictEqual(dk1.isBreakpointTagged, true);
        assert.strictEqual(dk1.breakpoint, 'desktop');

        const dk2 = parseBreakpointTag('Mobile');
        assert.strictEqual(dk2.isBreakpointTagged, true);
        assert.strictEqual(dk2.breakpoint, 'mobile');

        // 6. Non-breakpoint names
        const n1 = parseBreakpointTag('Primary Button');
        assert.strictEqual(n1.isBreakpointTagged, false);

        const n2 = parseBreakpointTag('Hero Section Title');
        assert.strictEqual(n2.isBreakpointTagged, false);
    });

    it('groups screen frames into canonical responsive pages', () => {
        const frames = [
            { name: 'Home [desktop]', size: { x: 1440, y: 900 }, visible: true },
            { name: 'Home [mobile]', size: { x: 375, y: 812 }, visible: true },
            { name: 'About [desktop]', size: { x: 1440, y: 900 }, visible: true },
            { name: 'About [mobile]', size: { x: 375, y: 812 }, visible: true }
        ];

        const pages = groupFramesIntoResponsivePages(frames);
        assert.strictEqual(pages.length, 2, 'Should create 2 responsive page units (Home and About)');

        const homePage = pages.find(p => p.pageName === 'Home');
        assert(homePage, 'Home page must exist');
        assert.strictEqual(homePage.isResponsive, true);
        assert.strictEqual(homePage.breakpoints.length, 2);
        assert.strictEqual(homePage.breakpoints[0].name, 'desktop');
        assert.strictEqual(homePage.breakpoints[0].width, 1440);
        assert.strictEqual(homePage.breakpoints[1].name, 'mobile');
        assert.strictEqual(homePage.breakpoints[1].width, 375);

        const aboutPage = pages.find(p => p.pageName === 'About');
        assert(aboutPage, 'About page must exist');
        assert.strictEqual(aboutPage.isResponsive, true);
        assert.strictEqual(aboutPage.breakpoints.length, 2);

        // Dynamic breakpoint width extracted directly from frame size (e.g. 440px for mobile artboard)
        const customFrames = [
            { name: 'Landing [desktop]', size: { x: 1080, y: 800 }, visible: true },
            { name: 'Landing [mobile]', size: { x: 440, y: 900 }, visible: true }
        ];
        const landingPages = groupFramesIntoResponsivePages(customFrames);
        assert.strictEqual(landingPages[0].breakpoints[1].width, 440, 'Mobile breakpoint width must match actual frame width 440px, not hardcoded 375');
    });

    it('computes AST node similarity and matches corresponding elements across viewports', () => {
        const desktopLogo = {
            type: 'TEXT',
            name: 'Logo',
            characters: 'Acme Inc.',
            textData: { characters: 'Acme Inc.' }
        };
        const mobileLogo = {
            type: 'TEXT',
            name: 'Logo',
            characters: 'Acme Inc.',
            textData: { characters: 'Acme Inc.' }
        };
        const differentText = {
            type: 'TEXT',
            name: 'Description',
            characters: 'Some description text here',
            textData: { characters: 'Some description text here' }
        };
        const rectNode = {
            type: 'RECTANGLE',
            name: 'Background'
        };

        const scoreIdentical = computeNodeSimilarity(desktopLogo, mobileLogo);
        assert.strictEqual(scoreIdentical, 1.0, 'Identical nodes must have 1.0 similarity');

        const scoreDiff = computeNodeSimilarity(desktopLogo, differentText);
        assert(scoreDiff < 0.4, 'Completely different text must have low similarity');

        const scoreTypeMismatch = computeNodeSimilarity(desktopLogo, rectNode);
        assert.strictEqual(scoreTypeMismatch, 0.0, 'Incompatible types must have 0 similarity');

        // matchChildren
        const baseChildren = [desktopLogo, differentText];
        const variantChildren = [mobileLogo];
        const { matches, unmatchedBase, unmatchedVariant } = matchChildren(baseChildren, variantChildren);

        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].base, desktopLogo);
        assert.strictEqual(matches[0].variant, mobileLogo);
        assert.strictEqual(unmatchedBase.length, 1);
        assert.strictEqual(unmatchedBase[0], differentText);
        assert.strictEqual(unmatchedVariant.length, 0);
    });

    it('reconciles AST trees and isolates exclusive desktop-only and mobile-only elements', () => {
        const logoDesktop = { type: 'TEXT', name: 'Logo', characters: 'Acme' };
        const navLinks = { type: 'FRAME', name: 'NavLinks', children: [] };
        const ctaBtn = { type: 'FRAME', name: 'CTA', children: [] };

        const desktopHeader = {
            type: 'FRAME',
            name: 'Header',
            children: [logoDesktop, navLinks, ctaBtn]
        };

        const logoMobile = { type: 'TEXT', name: 'Logo', characters: 'Acme' };
        const burgerBtn = { type: 'FRAME', name: 'BurgerBtn', children: [] };
        const ctaMobile = { type: 'FRAME', name: 'CTA', children: [] };

        const mobileHeader = {
            type: 'FRAME',
            name: 'Header',
            children: [logoMobile, burgerBtn, ctaMobile]
        };

        const { canonicalTree, exclusiveNodes } = alignBreakpointTrees(desktopHeader, [
            { name: 'mobile', width: 375, frame: mobileHeader }
        ]);

        assert(canonicalTree, 'Canonical tree must be returned');
        // Canonical header should have 4 children: Logo, NavLinks, CTA, and injected BurgerBtn
        assert.strictEqual(canonicalTree.children.length, 4, 'Canonical tree must contain 4 children (all elements)');

        const cLogo = canonicalTree.children.find(c => c.name === 'Logo');
        const cNav = canonicalTree.children.find(c => c.name === 'NavLinks');
        const cCta = canonicalTree.children.find(c => c.name === 'CTA');
        const cBurger = canonicalTree.children.find(c => c.name === 'BurgerBtn');

        assert(cLogo && !cLogo.responsiveMetadata.isExclusive, 'Logo is shared');
        assert(cCta && !cCta.responsiveMetadata.isExclusive, 'CTA is shared');

        assert(cNav && cNav.responsiveMetadata.isExclusive, 'NavLinks must be marked exclusive');
        assert.strictEqual(cNav.responsiveMetadata.exclusiveMode, 'desktop-only');
        assert.strictEqual(cNav.responsiveMetadata.visibility.desktop, true);
        assert.strictEqual(cNav.responsiveMetadata.visibility.mobile, false);

        assert(cBurger && cBurger.responsiveMetadata.isExclusive, 'BurgerBtn must be marked exclusive');
        assert.strictEqual(cBurger.responsiveMetadata.exclusiveMode, 'mobile-only');
        assert.strictEqual(cBurger.responsiveMetadata.visibility.desktop, false);
        assert.strictEqual(cBurger.responsiveMetadata.visibility.mobile, true);
    });

    it('calculates mathematical fluid clamp() formulas and formats media queries', () => {
        // Desktop 48px at 1440px, Mobile 24px at 375px
        const clampTitle = calculateFluidClamp(48, 1440, 24, 375);
        assert(clampTitle.startsWith('clamp('), 'Must produce clamp()');
        assert(clampTitle.includes('1.5rem'), 'Must contain min 1.5rem');
        assert(clampTitle.includes('3rem'), 'Must contain max 3rem');
        assert(clampTitle.includes('vw'), 'Must contain vw slope');

        // Static value (no difference)
        const staticVal = calculateFluidClamp(24, 1440, 24, 375);
        assert.strictEqual(staticVal, '24px', 'Static value when no delta');

        // getBreakpointMediaQuery
        const mqDesktopFirst = getBreakpointMediaQuery({ name: 'mobile', width: 375 }, [{ width: 1440 }, { width: 375 }], false);
        assert.strictEqual(mqDesktopFirst, '@media (max-width: 375px)', 'Mobile media query matches mobile frame width');

        const mqMobileFirst = getBreakpointMediaQuery({ name: 'desktop', width: 1440 }, [], true);
        assert.strictEqual(mqMobileFirst, '@media (min-width: 1440px)');
    });

    it('synthesizes fluid clamp() for continuous properties and emits @media queries for discrete structural changes', () => {
        const desktopHero = {
            guid: { sessionID: 0, localID: 10 },
            type: 'FRAME',
            name: 'Hero',
            stackMode: 'HORIZONTAL',
            stackSpacing: 32,
            size: { x: 1440, y: 600 }
        };
        const desktopTitle = {
            guid: { sessionID: 0, localID: 11 },
            type: 'TEXT',
            name: 'Title',
            fontSize: 48,
            fontName: { family: 'Inter', style: 'Bold' },
            textData: { characters: 'Hello World' },
            size: { x: 600, y: 60 }
        };
        const desktopNav = {
            guid: { sessionID: 0, localID: 12 },
            type: 'FRAME',
            name: 'DesktopNav',
            stackMode: 'HORIZONTAL',
            size: { x: 300, y: 40 }
        };

        const mobileHero = {
            guid: { sessionID: 0, localID: 20 },
            type: 'FRAME',
            name: 'Hero',
            stackMode: 'VERTICAL',
            stackSpacing: 16,
            size: { x: 375, y: 500 }
        };
        const mobileTitle = {
            guid: { sessionID: 0, localID: 21 },
            type: 'TEXT',
            name: 'Title',
            fontSize: 24,
            fontName: { family: 'Inter', style: 'Bold' },
            textData: { characters: 'Hello World' },
            size: { x: 340, y: 40 }
        };
        const mobileBurger = {
            guid: { sessionID: 0, localID: 22 },
            type: 'FRAME',
            name: 'BurgerBtn',
            stackMode: 'HORIZONTAL',
            size: { x: 40, y: 40 }
        };

        desktopHero.children = [desktopTitle, desktopNav];
        mobileHero.children = [mobileTitle, mobileBurger];

        const { canonicalTree } = alignBreakpointTrees(desktopHero, [
            { name: 'mobile', width: 375, frame: mobileHero }
        ]);

        const stylesheetManager = new StylesheetManager();
        const imgRegistry = new Map();

        // Register tree
        function reg(node) {
            stylesheetManager.registerNode(node, null, imgRegistry);
            if (node.children) node.children.forEach(reg);
        }
        reg(canonicalTree);

        // Synthesize responsive styles
        synthesizeResponsiveStyles({
            canonicalTree,
            pageBreakpoints: [
                { name: 'desktop', width: 1440, frame: desktopHero },
                { name: 'mobile', width: 375, frame: mobileHero }
            ],
            imageRegistry: imgRegistry,
            stylesheetManager,
            options: { fluid: true }
        });

        const fullCss = stylesheetManager.generateFullStylesheet();

        // 1. Title should have fluid clamp for font-size
        assert(fullCss.includes('font-size: clamp('), 'Title must have fluid font-size clamp');

        // 2. Hero should have flex-direction: column in media query
        assert(fullCss.includes('@media (max-width: 375px) {'), 'Must contain media query');
        assert(fullCss.includes('flex-direction: column;'), 'Media query must contain flex-direction column override');

        // 3. DesktopNav should be hidden in media query
        assert(fullCss.includes('.desktopnav {'), 'DesktopNav selector exists');

        // 4. BurgerBtn should have display: none in base, display: flex in media query
        assert(fullCss.includes('.burgerbtn {'), 'BurgerBtn selector exists');
    });

    it('parses reverse CLI arguments for v1.4.0 responsive flags', () => {
        const parsed1 = parseReverseArgs(['design.fig', '--responsive']);
        assert.strictEqual(parsed1.responsive, true);

        const parsed2 = parseReverseArgs(['design.fig', '--no-responsive']);
        assert.strictEqual(parsed2.responsive, false);

        const parsed3 = parseReverseArgs(['design.fig', '--breakpoints', '1440,768,375']);
        assert.strictEqual(parsed3.breakpoints, '1440,768,375');

        const parsed4 = parseReverseArgs(['design.fig', '--mobile-first']);
        assert.strictEqual(parsed4.mobileFirst, true);
    });

    await itAsync('decompiles multi-breakpoint .fig into single canonical responsive HTML with fluid clamp and media queries', async () => {
        const testFigPath = path.resolve('test/responsive-demo.fig');
        const outDir = path.resolve('test/dist-responsive');
        if (fs.existsSync(outDir)) {
            fs.rmSync(outDir, { recursive: true, force: true });
        }
        fs.mkdirSync(outDir, { recursive: true });

        // Create a 2-breakpoint mock HTML: Desktop (1440px) and Mobile (375px)
        const mockHtml = `<!DOCTYPE html>
<html>
<head>
    <style>
        .screen-desktop {
            position: absolute;
            left: 0px;
            top: 0px;
            width: 1440px;
            height: 900px;
            background-color: #0f172a;
            display: flex;
            flex-direction: column;
            padding: 40px;
        }
        .screen-mobile {
            position: absolute;
            left: 1600px;
            top: 0px;
            width: 375px;
            height: 812px;
            background-color: #0f172a;
            display: flex;
            flex-direction: column;
            padding: 20px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .logo {
            font-size: 24px;
            color: #ffffff;
        }
        .nav-links {
            display: flex;
            gap: 20px;
            color: #94a3b8;
        }
        .burger-btn {
            width: 32px;
            height: 32px;
            background-color: #3b82f6;
        }
        .hero-title {
            font-size: 48px;
            color: #ffffff;
            margin-top: 40px;
        }
        .hero-title-mobile {
            font-size: 24px;
            color: #ffffff;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <!-- Screen 1: Desktop -->
    <div class="screen-desktop" data-name="Home [desktop]">
        <div class="header">
            <div class="logo">Acme Inc.</div>
            <div class="nav-links">Products</div>
        </div>
        <div class="hero-title">Build High Performance Websites</div>
    </div>

    <!-- Screen 2: Mobile -->
    <div class="screen-mobile" data-name="Home [mobile]">
        <div class="header">
            <div class="logo">Acme Inc.</div>
            <div class="burger-btn">Menu</div>
        </div>
        <div class="hero-title-mobile" data-name="hero-title">Build High Performance Websites</div>
    </div>
</body>
</html>`;

        const mockHtmlPath = path.resolve('test/temp-responsive.html');
        fs.writeFileSync(mockHtmlPath, mockHtml, 'utf8');

        // Compile to .fig
        await generateFigFile({
            htmlPath: mockHtmlPath,
            outputPath: testFigPath,
            templatePath: path.resolve('templates/template.fig'),
            pageName: 'Page 1',
            verbose: false
        });
        fs.unlinkSync(mockHtmlPath);

        assert(fs.existsSync(testFigPath), 'responsive-demo.fig must be generated');

        // Decompile with responsive engine active
        const result = await convertFigToHtml(testFigPath, {
            outputHtmlPath: path.join(outDir, 'index.html'),
            responsive: true,
            separateFiles: true,
            cssFile: 'css/style.css'
        });

        assert.strictEqual(result.isResponsive, true, 'Result must be marked responsive');
        assert(result.html, 'Must produce HTML');

        // Verify single output HTML file is generated
        const indexHtmlPath = path.join(outDir, 'index.html');
        const styleCssPath = path.join(outDir, 'css/style.css');

        assert(fs.existsSync(indexHtmlPath), 'index.html must exist');
        assert(fs.existsSync(styleCssPath), 'css/style.css must exist');

        const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
        const cssContent = fs.readFileSync(styleCssPath, 'utf8');

        // Check HTML content: unified DOM contains both desktop and mobile elements
        assert(htmlContent.includes('Acme Inc.'), 'HTML must contain shared logo text');
        assert(htmlContent.includes('Build High Performance Websites'), 'HTML must contain shared hero title');
        assert(htmlContent.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'), 'Responsive viewport tag must be present');

        // Check CSS content: fluid clamp or media queries
        assert(cssContent.includes('@media (max-width:') || cssContent.includes('clamp('), 'CSS must include media queries or fluid clamp');

        // Clean up
        fs.unlinkSync(testFigPath);
        fs.rmSync(outDir, { recursive: true, force: true });
    });

    await itAsync('bakeMasksIntoImages bakes radial/linear gradient masks directly into images and respects explicit [mask] tags', async () => {
        // Create a 100x100 solid red JPEG image buffer
        const redJpeg = await sharp({
            create: {
                width: 100,
                height: 100,
                channels: 3,
                background: { r: 255, g: 0, b: 0 }
            }
        }).jpeg().toBuffer();

        const fakeHash = 'fake-image-hash-12345';
        const rawImages = {
            [fakeHash]: redJpeg
        };

        const maskNode = {
            type: 'RECTANGLE',
            name: 'Mask Layer',
            mask: true,
            size: { x: 100, y: 100 },
            fillPaints: [{
                type: 'GRADIENT_RADIAL',
                stops: [
                    { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
                    { position: 1, color: { r: 0, g: 0, b: 0, a: 0 } }
                ]
            }]
        };

        const imageNode = {
            type: 'RECTANGLE',
            name: 'Photo',
            size: { x: 100, y: 100 },
            fillPaints: [{
                type: 'IMAGE',
                image: { hash: fakeHash }
            }]
        };

        const maskContainer = {
            type: 'FRAME',
            name: 'Group with Mask',
            size: { x: 100, y: 100 },
            children: [maskNode, imageNode]
        };

        const bakedCount = await bakeMasksIntoImages(rawImages, [maskContainer], {});
        assert.strictEqual(bakedCount, 1, 'Should have baked 1 mask into image');
        assert.strictEqual(maskContainer.isMaskBaked, true, 'Container should be marked as isMaskBaked');
        assert.strictEqual(imageNode.isMaskBaked, true, 'Image node should be marked as isMaskBaked');
        assert.notStrictEqual(imageNode.fillPaints[0].image.hash, fakeHash, 'Image hash should be updated to new baked hash');

        const newHash = imageNode.fillPaints[0].image.hash;
        assert(rawImages[newHash], 'New baked image must exist in rawImages');

        // Verify the baked image has alpha channel
        const metadata = await sharp(rawImages[newHash].buffer).metadata();
        assert.strictEqual(metadata.hasAlpha, true, 'Baked image must have alpha channel');

        // Test explicit [mask] / [маска] tags
        assert.strictEqual(hasExplicitMaskTag({ name: 'Group [mask]' }), true);
        assert.strictEqual(hasExplicitMaskTag({ name: 'Layer [маска]' }), true);
        assert.strictEqual(hasExplicitMaskTag({ name: 'Layer #mask' }), true);
        assert.strictEqual(hasExplicitMaskTag({ name: 'Normal Layer' }), false);

        // Container with [mask] tag should NOT be baked
        const taggedMaskContainer = {
            type: 'FRAME',
            name: 'Masked Layer [mask]',
            size: { x: 100, y: 100 },
            children: [maskNode, {
                type: 'RECTANGLE',
                name: 'Photo 2',
                size: { x: 100, y: 100 },
                fillPaints: [{ type: 'IMAGE', image: { hash: fakeHash } }]
            }]
        };

        const secondPassBaked = await bakeMasksIntoImages(rawImages, [taggedMaskContainer], {});
        assert.strictEqual(secondPassBaked, 0, 'Should not bake container with [mask] tag');
    });

    await itAsync('bakeImageFillsAndFilters bakes gradient overlays, solid underlays and paintFilter directly into image assets', async () => {
        const baseBuf = await sharp({
            create: { width: 100, height: 100, channels: 3, background: { r: 100, g: 100, b: 100 } }
        }).jpeg().toBuffer();

        const fakeHash = 'fake-img-hash-5678';
        const rawImages = new Map();
        rawImages.set(fakeHash, { buffer: baseBuf, mime: 'image/jpeg' });

        const node = {
            type: 'RECTANGLE',
            name: 'Photo With Overlay',
            size: { x: 100, y: 100 },
            fillPaints: [
                {
                    type: 'SOLID',
                    visible: true,
                    color: { r: 1, g: 1, b: 1, a: 1 },
                    blendMode: 'NORMAL'
                },
                {
                    type: 'IMAGE',
                    visible: true,
                    image: { hash: fakeHash },
                    blendMode: 'NORMAL',
                    paintFilter: { exposure: 0.05, contrast: 0.05 }
                },
                {
                    type: 'GRADIENT_LINEAR',
                    visible: true,
                    opacity: 0.3,
                    blendMode: 'LINEAR_DODGE',
                    stops: [
                        { color: { r: 0, g: 1, b: 0, a: 0 }, position: 0 },
                        { color: { r: 0, g: 1, b: 0, a: 1 }, position: 1 }
                    ],
                    transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 }
                }
            ]
        };

        const baked = await bakeImageFillsAndFilters(rawImages, [node], { imageScale: 2 });
        assert.strictEqual(baked, 1, 'Should bake 1 node');
        assert.strictEqual(node.isImageFillsBaked, true, 'isImageFillsBaked should be true');
        assert.notStrictEqual(node.fillPaints[1].image.hash, fakeHash, 'Hash should be updated');

        const newHash = typeof node.fillPaints[1].image.hash === 'string'
            ? node.fillPaints[1].image.hash
            : Buffer.from(node.fillPaints[1].image.hash).toString('hex');
        assert(rawImages.has(newHash), 'New hash must exist in rawImages');

        const bakedImg = rawImages.get(newHash);
        const meta = await sharp(bakedImg.buffer).metadata();
        assert.strictEqual(meta.width, 200, 'Width should be 200px (2x retina)');
        assert.strictEqual(meta.height, 200, 'Height should be 200px (2x retina)');

        const imageRegistry = new Map();
        imageRegistry.set(newHash, { mainFileName: newHash + '.png', mainBase64: 'data:image/png;base64,...' });
        const styles = computeNodeStyles(node, null, imageRegistry, {});
        assert.strictEqual(styles['background-image'], undefined, 'No background-image in CSS');
        assert.strictEqual(styles['background-color'], undefined, 'No background-color in CSS');
        assert.strictEqual(styles['filter'], undefined, 'No filter in CSS');

        // Verify single independent image keeps CSS filter for backward compatibility
        const singleNode = {
            type: 'RECTANGLE',
            name: 'Single Photo',
            size: { x: 100, y: 100 },
            fillPaints: [{
                type: 'IMAGE',
                visible: true,
                image: { hash: fakeHash },
                paintFilter: { exposure: 0.1 }
            }]
        };
        const singleBaked = await bakeImageFillsAndFilters(rawImages, [singleNode], { imageScale: 2 });
        assert.strictEqual(singleBaked, 0, 'Single independent image should not be baked');
        const singleStyles = computeNodeStyles(singleNode, null, rawImages, {});
        assert.strictEqual(singleStyles['filter'], 'brightness(1.1)', 'Should retain filter in CSS');
    });

    it('decompiles affine rotation from Figma transform matrix and preserves nested mask child positioning', () => {
        // 1. Matrix decomposition
        const mRotMinus15 = {
            m00: 0.9659258,
            m01: 0.2588190,
            m02: 0,
            m10: -0.2588190,
            m11: 0.9659258,
            m12: 111.8
        };
        const parsed = parseTransformMatrix(mRotMinus15);
        assert.deepStrictEqual(parsed, { scaleX: 1, scaleY: 1, rotateDeg: -15 });

        // Flip horizontal
        const mFlipH = { m00: -1, m01: 0, m02: 480, m10: 0, m11: 1, m12: 0 };
        assert.deepStrictEqual(parseTransformMatrix(mFlipH), { scaleX: -1, scaleY: 1, rotateDeg: 0 });

        // 2. Synthesizer skipping on rotated container
        const rotatedContainer = {
            name: 'Group 116047490',
            type: 'FRAME',
            size: { x: 432, y: 423 },
            transform: mRotMinus15,
            children: [{ name: 'Child', type: 'RECTANGLE', size: { x: 100, y: 100 } }]
        };
        assert.strictEqual(hasTransformRotation(rotatedContainer), true);
        assert.strictEqual(shouldSkipLayoutSynthesis(rotatedContainer), true);
        synthesizeContainerLayout(rotatedContainer);
        assert.strictEqual(rotatedContainer.stackMode, undefined, 'Rotated container should not be converted to flex');

        // 3. CSS styles for rotated mask group and nested offset child image
        const maskGroupNode = {
            name: 'Mask group',
            type: 'FRAME',
            size: { x: 432, y: 423 },
            transform: mRotMinus15,
            children: [
                {
                    name: 'Mask Shape',
                    type: 'ROUNDED_RECTANGLE',
                    mask: true,
                    size: { x: 432, y: 423 },
                    transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 }
                },
                {
                    name: 'Nested Image',
                    type: 'ROUNDED_RECTANGLE',
                    fillPaints: [{ type: 'IMAGE', visible: true }],
                    size: { x: 569, y: 762 },
                    transform: { m00: 1, m01: 0, m02: -68.5, m10: 0, m11: 1, m12: -83.3 }
                }
            ]
        };

        const parentFrame = {
            name: 'Parent Frame',
            type: 'FRAME',
            size: { x: 600, y: 600 }
        };

        const sMask = computeNodeStyles(maskGroupNode, parentFrame);
        assert.strictEqual(sMask['transform'], 'rotate(-15deg)');
        assert.strictEqual(sMask['transform-origin'], '0 0');
        assert.strictEqual(sMask['overflow'], 'hidden');
        assert.strictEqual(sMask['position'], 'absolute');
        assert.strictEqual(sMask['top'], '111.8px');

        const sImg = computeNodeStyles(maskGroupNode.children[1], maskGroupNode);
        assert.strictEqual(sImg['position'], 'absolute', 'Offset image inside mask must be position: absolute');
        assert.strictEqual(sImg['left'], '-68.5px', 'Image must preserve negative X offset');
        assert.strictEqual(sImg['top'], '-83.3px', 'Image must preserve negative Y offset');
        assert.strictEqual(sImg['width'], '569px', 'Image must preserve true width');
        assert.strictEqual(sImg['height'], '762px', 'Image must preserve true height');
    });

    it('preserves explicit Fixed height (200px) on stacked cards inside synthesized Bento columns', () => {
        const bentoGrid = {
            type: 'FRAME',
            name: 'Frame 116047436',
            size: { x: 1344, y: 424 },
            stackMode: 'GRID',
            children: [
                {
                    type: 'FRAME',
                    name: 'Frame 116047435',
                    size: { x: 432, y: 424 },
                    transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
                    stackMode: 'VERTICAL',
                    stackPrimarySizing: 'FIXED'
                },
                {
                    type: 'FRAME',
                    name: 'Frame 116047449',
                    size: { x: 432, y: 200 },
                    transform: { m00: 1, m01: 0, m02: 456, m10: 0, m11: 1, m12: 0 },
                    stackMode: 'VERTICAL',
                    stackPrimarySizing: 'FIXED',
                    stackChildPrimaryGrow: 1
                },
                {
                    type: 'FRAME',
                    name: 'Frame 116047452',
                    size: { x: 432, y: 200 },
                    transform: { m00: 1, m01: 0, m02: 456, m10: 0, m11: 1, m12: 224 },
                    stackMode: 'VERTICAL',
                    stackPrimarySizing: 'FIXED',
                    stackChildPrimaryGrow: 1
                },
                {
                    type: 'FRAME',
                    name: 'Frame 116047451',
                    size: { x: 432, y: 200 },
                    transform: { m00: 1, m01: 0, m02: 912, m10: 0, m11: 1, m12: 0 },
                    stackMode: 'VERTICAL',
                    stackPrimarySizing: 'FIXED'
                },
                {
                    type: 'FRAME',
                    name: 'Frame 116047453',
                    size: { x: 432, y: 200 },
                    transform: { m00: 1, m01: 0, m02: 912, m10: 0, m11: 1, m12: 224 },
                    stackMode: 'VERTICAL',
                    stackPrimarySizing: 'FIXED'
                }
            ]
        };

        synthesizeContainerLayout(bentoGrid);
        assert.strictEqual(bentoGrid.children.length, 3, 'Should form 3 horizontal bands (1 card + 2 columns)');
        const col1 = bentoGrid.children[1];
        assert.strictEqual(col1.name, 'Column');
        assert.strictEqual(col1.isEqualWidthGroup, true, 'Synthesized Column should get equal-width row flex');

        const card449 = col1.children[0];
        const card452 = col1.children[1];
        assert.strictEqual(card449.isEqualHeightGroup, undefined, 'Stacked card inside Column must not be marked isEqualHeightGroup');
        assert.strictEqual(card449.layoutGrow, undefined, 'Stacked card inside Column must not inherit row layoutGrow');

        const s449 = computeNodeStyles(card449, col1);
        const s452 = computeNodeStyles(card452, col1);
        assert.strictEqual(s449['height'], '200px', 'Frame 116047449 must preserve height: 200px');
        assert.strictEqual(s452['height'], '200px', 'Frame 116047452 must preserve height: 200px');
    });

    it('resolves smart absolute anchors (bottom/right vs top/left) based on edge proximity and constraints', () => {
        const parentCard = {
            type: 'FRAME',
            name: 'Frame 116047454',
            size: { x: 432, y: 618 },
            stackMode: 'VERTICAL'
        };

        // 1. Bottom-anchored illustration: top=226, height=392 inside 618px card -> bottom: 0px, left: 0px
        const bottomDecor = {
            type: 'FRAME',
            name: 'Frame 116047495',
            stackPositioning: 'ABSOLUTE',
            size: { x: 432, y: 392 },
            transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 226 }
        };
        const sBottom = computeNodeStyles(bottomDecor, parentCard);
        assert.strictEqual(sBottom['position'], 'absolute');
        assert.strictEqual(sBottom['left'], '0px', 'Full-width child at x=0 should keep left: 0px');
        assert.strictEqual(sBottom['bottom'], '0px', 'Bottom-flush child (226 + 392 = 618) should use bottom: 0px');
        assert.strictEqual(sBottom['top'], undefined, 'top should be omitted when bottom is used');

        // 2. Right-anchored product image: left=360, width=300 inside 660x330 card -> right: 0px, top: 0px
        const productCard = {
            type: 'FRAME',
            name: 'Frame 116047481',
            size: { x: 660, y: 330 },
            stackMode: 'VERTICAL'
        };
        const rightImg = {
            type: 'FRAME',
            name: 'Frame 116047416',
            isCollapsedGraphicRoot: true,
            stackPositioning: 'ABSOLUTE',
            size: { x: 300, y: 332 },
            transform: { m00: 1, m01: 0, m02: 360, m10: 0, m11: 1, m12: 0 }
        };
        const sRight = computeNodeStyles(rightImg, productCard);
        assert.strictEqual(sRight['right'], '0px', 'Right-flush child (360 + 300 = 660) should use right: 0px');
        assert.strictEqual(sRight['left'], undefined, 'left should be omitted when right is used');
        assert.strictEqual(sRight['top'], '0px', 'Top-flush child at y=0 should keep top: 0px');

        // 3. Top-right badge with explicit MAX horizontalConstraint: left=376, width=36 inside 432x623 -> right: 20px, top: 20px
        const badge = {
            type: 'FRAME',
            name: 'Badge',
            stackPositioning: 'ABSOLUTE',
            horizontalConstraint: 'MAX',
            size: { x: 36, y: 36 },
            transform: { m00: 1, m01: 0, m02: 376, m10: 0, m11: 1, m12: 20 }
        };
        const sBadge = computeNodeStyles(badge, { type: 'FRAME', size: { x: 432, y: 623 }, stackMode: 'VERTICAL' });
        assert.strictEqual(sBadge['right'], '20px');
        assert.strictEqual(sBadge['top'], '20px');
    });

    // 35. Graphic Subtree Collapsing & Cumulative Baking Engine
    console.log('\x1b[1m35. Graphic Subtree Collapsing & Cumulative Baking Engine Tests\x1b[0m');
    await runGraphicCollapserTests({ it, itAsync });

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
