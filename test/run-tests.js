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

        const lhMult = parseLineHeight('1.5');
        assert.deepStrictEqual(lhMult, { value: 150, units: 'PERCENT' });
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
    await itAsync('generates valid output.fig from test.html', async () => {
        const outPath = 'test/test_out.fig';
        const res = await generateFigFile({
            htmlPath: 'test.html',
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

        // Verify image entries in zip
        const entries = zip.getEntries().map(e => e.entryName);
        assert(entries.some(e => e.startsWith('images/')));

        // Clean up
        fs.unlinkSync(outPath);
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
