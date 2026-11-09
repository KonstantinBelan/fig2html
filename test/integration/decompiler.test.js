// Auto-generated test module
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
    formatColor,
    getColorFromPaint,
    getLinearGradientAngle,
    formatGradient,
    formatEffects,
    formatPaintFilter,
    parseFontWeightAndStyle,
    computeNodeStyles,
    getExtensionForMime
} from '../../src/decompiler/css/index.js';
import { getVectorFillAttribute, getVectorStrokeAttributes } from '../../src/decompiler/vector.js';
import { readFigFile, buildSceneTree, convertFigToHtml } from '../../src/decompiler/index.js';
import { StylesheetManager, toBaseClassName } from '../../src/decompiler/stylesheet.js';
import { parseArgs as parseReverseArgs } from '../../cli-reverse.js';

export default async function run(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };

    it('formats Figma RGBA to CSS hex and rgba', () => {
        const hex = formatColor({ r: 1, g: 0, b: 0, a: 1 });
        assert.strictEqual(hex, '#ff0000');

        const rgba = formatColor({ r: 0, g: 0.5, b: 1, a: 0.5 });
        assert(rgba.startsWith('rgba(0, 128, 255, 0.5)'));

        const trans = formatColor({ r: 0, g: 0, b: 0, a: 0 });
        assert.strictEqual(trans, 'transparent');
    });

    it('extracts solid fallback color from gradient paints and formats borders and vector fills', () => {
        // 1. getColorFromPaint with SOLID
        const solidColor = getColorFromPaint({
            type: 'SOLID',
            color: { r: 0, g: 0.7098, b: 0.4431, a: 1 },
            opacity: 1
        });
        assert.strictEqual(solidColor, '#00b571');

        // 2. getColorFromPaint with GRADIENT_LINEAR
        const gradColor = getColorFromPaint({
            type: 'GRADIENT_LINEAR',
            opacity: 1,
            stops: [
                { color: { r: 0, g: 0.7098, b: 0.4431, a: 1 }, position: 0.24 },
                { color: { r: 0.023, g: 0.7845, b: 0.4984, a: 1 }, position: 0.82 }
            ]
        });
        assert.strictEqual(gradColor, '#00b571');

        // 3. getVectorFillAttribute with gradient fill
        const vectorWithGrad = {
            type: 'VECTOR',
            fillPaints: [{
                type: 'GRADIENT_LINEAR',
                visible: true,
                opacity: 1,
                stops: [
                    { color: { r: 0, g: 0.7098, b: 0.4431, a: 1 }, position: 0 },
                    { color: { r: 0.023, g: 0.7845, b: 0.4984, a: 1 }, position: 1 }
                ]
            }]
        };
        assert.strictEqual(getVectorFillAttribute(vectorWithGrad), '#00b571');

        // 4. computeNodeStyles generating border from gradient stroke
        const cardWithGradStroke = {
            type: 'FRAME',
            strokeWeight: 1,
            strokePaints: [{
                type: 'GRADIENT_LINEAR',
                visible: true,
                opacity: 1,
                stops: [
                    { color: { r: 0, g: 0.7098, b: 0.4431, a: 1 }, position: 0 },
                    { color: { r: 0.023, g: 0.7845, b: 0.4984, a: 1 }, position: 1 }
                ]
            }]
        };
        const styles = computeNodeStyles(cardWithGradStroke);
        assert.strictEqual(styles['border'], '1px solid #00b571');
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

};

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
    let passed = 0, failed = 0;
    const itSync = (name, fn) => {
        try { fn(); console.log("  \x1b[32m✔\x1b[0m " + name); passed++; }
        catch (e) { failed++; console.error("  \x1b[31m✖\x1b[0m " + name + "\n    " + e.message); }
    };
    const itAsyncLocal = async (name, fn) => {
        try { await fn(); console.log("  \x1b[32m✔\x1b[0m " + name); passed++; }
        catch (e) { failed++; console.error("  \x1b[31m✖\x1b[0m " + name + "\n    " + (e.stack || e.message)); }
    };
    run(itSync, itAsyncLocal).then(() => {
        console.log("\nPassed: " + passed + ", Failed: " + failed);
        if (failed > 0) process.exit(1);
    }).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
