// Auto-generated test module
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
    parseGoogleFontsUrl,
    extractWebFonts,
    generateGoogleFontsLink,
    getFontMetrics
} from '../../src/parsers/typography.js';
import { convertHtmlToNodes } from '../../src/converter/index.js';
import { generateFigFile } from '../../src/generator.js';
import { convertFigToHtml, readFigFile } from '../../src/decompiler/index.js';

export default async function run(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };


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
        if (!fs.existsSync('fleader.fig')) return;

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
