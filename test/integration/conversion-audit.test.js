// test/integration/conversion-audit.test.js
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFigFile } from '../../src/generator.js';
import { readFigFile } from '../../src/decompiler/reader.js';
import { convertFigToHtml } from '../../src/decompiler/index.js';
import { snapMaxWidth } from '../../src/decompiler/tailwind/scale-snapper.js';
import { transformHtmlToJsx, generateVueComponent } from '../../src/decompiler/tailwind/frameworks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const responsiveFigPath = path.resolve(__dirname, '../demo/demo-responsive/demo-responsive.fig');

export default async function ({ it, itAsync }) {
    await itAsync('preserves independent corner radii from border-radius shorthand (8px 0 0 8px)', async () => {
        const html = `<!DOCTYPE html><html><body><div style="border-radius: 8px 0 0 8px; width: 120px; height: 60px; background: #3b82f6;"></div></body></html>`;
        const outFig = path.resolve(__dirname, '../temp_corners.fig');

        try {
            await generateFigFile({ htmlContent: html, outputPath: outFig });
            const { nodeChanges } = readFigFile(outFig);
            const box = nodeChanges.find(n => n.type === 'FRAME' && n.size?.x === 120);

            assert.ok(box, 'Box frame should exist in generated .fig');
            assert.strictEqual(box.rectangleCornerRadiiIndependent, true, 'Corners must be flagged as independent');
            assert.strictEqual(box.rectangleTopLeftCornerRadius, 8);
            assert.strictEqual(box.rectangleTopRightCornerRadius, 0);
            assert.strictEqual(box.rectangleBottomRightCornerRadius, 0);
            assert.strictEqual(box.rectangleBottomLeftCornerRadius, 8);
        } finally {
            if (fs.existsSync(outFig)) fs.unlinkSync(outFig);
        }
    });

    await itAsync('supports directional border removal (border: 2px solid red; border-top: none; and border-t-0)', async () => {
        const html = `<!DOCTYPE html>
<html>
<body>
  <div style="border: 2px solid #ef4444; border-top: none; width: 100px; height: 50px;"></div>
  <div class="border border-t-0 w-24 h-12 bg-blue-500"></div>
</body>
</html>`;
        const outFig = path.resolve(__dirname, '../temp_borders.fig');

        try {
            await generateFigFile({ htmlContent: html, outputPath: outFig });
            const { nodeChanges } = readFigFile(outFig);

            const div1 = nodeChanges.find(n => n.type === 'FRAME' && n.size?.x === 100);
            assert.ok(div1, 'Inline styled div should exist');
            assert.strictEqual(div1.borderStrokeWeightsIndependent, true);
            assert.strictEqual(div1.borderTopWeight, 0, 'Top border should be 0');
            assert.strictEqual(div1.borderBottomWeight, 2, 'Bottom border should be 2');

            const div2 = nodeChanges.find(n => n.type === 'FRAME' && n.size?.x === 96);
            assert.ok(div2, 'Tailwind styled div should exist');
            assert.strictEqual(div2.borderStrokeWeightsIndependent, true);
            assert.strictEqual(div2.borderTopWeight, 0, 'border-t-0 must have 0 top border');
            assert.strictEqual(div2.borderBottomWeight, 1, 'Bottom border must be 1px');
            assert.strictEqual(div2.strokePaints.length, 1, 'Must have solid stroke paint');
        } finally {
            if (fs.existsSync(outFig)) fs.unlinkSync(outFig);
        }
    });

    await itAsync('encodes minSize and maxSize constraints into native Kiwi AST', async () => {
        const html = `<!DOCTYPE html><html><body><div class="max-w-md min-w-[200px] w-full h-20 bg-slate-800"></div></body></html>`;
        const outFig = path.resolve(__dirname, '../temp_constraints.fig');

        try {
            await generateFigFile({ htmlContent: html, outputPath: outFig });
            const { nodeChanges } = readFigFile(outFig);
            const card = nodeChanges.find(n => n.type === 'FRAME' && n.name.includes('max-w-md'));

            assert.ok(card, 'Card node should exist');
            assert.ok(card.maxSize?.value, 'maxSize must be encoded on the node');
            assert.strictEqual(card.maxSize.value.x, 448, 'max-w-md corresponds to 448px (28rem)');
            assert.strictEqual(card.maxSize.value.y, Infinity, 'maxSize.y must be Infinity when max-height is unconstrained to prevent height collapse in Figma');
            assert.ok(card.minSize?.value, 'minSize must be encoded on the node');
            assert.strictEqual(card.minSize.value.x, 200, 'min-w-[200px] corresponds to 200px');
        } finally {
            if (fs.existsSync(outFig)) fs.unlinkSync(outFig);
        }
    });

    await itAsync('compiles capsule badges to compact Auto Layout frames hugging text content', async () => {
        const html = `<!DOCTYPE html><html><body class="p-8"><span class="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold">Live</span></body></html>`;
        const outFig = path.resolve(__dirname, '../temp_capsule.fig');

        try {
            await generateFigFile({ htmlContent: html, outputPath: outFig });
            const { nodeChanges } = readFigFile(outFig);
            const badge = nodeChanges.find(n => n.type === 'FRAME' && n.name.includes('bg-emerald-500'));

            assert.ok(badge, 'Capsule badge frame should exist');
            assert.strictEqual(badge.stackMode, 'HORIZONTAL');
            assert.strictEqual(badge.stackPrimarySizing, 'RESIZE_TO_FIT');
            assert.strictEqual(badge.stackCounterSizing, 'RESIZE_TO_FIT');
            assert.strictEqual(badge.stackChildAlignSelf, 'MIN', 'Badge must not stretch across container width');
            assert.ok(badge.size.x < 100, `Badge width must be compact (< 100px), received ${badge.size.x}px`);
        } finally {
            if (fs.existsSync(outFig)) fs.unlinkSync(outFig);
        }
    });

    it('snaps standard Tailwind max-w scale values accurately', () => {
        assert.strictEqual(snapMaxWidth(448), 'md');
        assert.strictEqual(snapMaxWidth(672), '2xl');
        assert.strictEqual(snapMaxWidth(320), 'xs');
        assert.strictEqual(snapMaxWidth(1024), '5xl');
        assert.strictEqual(snapMaxWidth(1280), '7xl');
        assert.strictEqual(snapMaxWidth('100%'), 'full');
        assert.strictEqual(snapMaxWidth('none'), 'none');
    });

    await itAsync('scaffolds complete Tailwind project and framework components for responsive multi-breakpoint .fig', async () => {
        const tempScaffoldDir = path.resolve(__dirname, '../temp_responsive_scaffold');
        try {
            const res = await convertFigToHtml(responsiveFigPath, {
                scaffold: tempScaffoldDir,
                tailwind: true,
                framework: 'react',
                inlineImages: true
            });

            assert.ok(res.scaffoldFiles && res.scaffoldFiles.length > 0, 'Scaffold files must be generated');
            assert.ok(fs.existsSync(path.join(tempScaffoldDir, 'package.json')), 'package.json must be written');
            assert.ok(fs.existsSync(path.join(tempScaffoldDir, 'src/app.css')), 'src/app.css must be written');

            // Verify React component was written
            assert.ok(res.componentPath, 'Component path must be returned');
            assert.ok(fs.existsSync(res.componentPath), 'Component file must be written to disk');
            const compContent = fs.readFileSync(res.componentPath, 'utf8');
            assert.ok(compContent.includes('import React from \'react\';'), 'Component must be valid React TSX');
            assert.ok(compContent.includes('className='), 'Component must use className');
        } finally {
            if (fs.existsSync(tempScaffoldDir)) {
                fs.rmSync(tempScaffoldDir, { recursive: true, force: true });
            }
        }
    });

    it('transforms JSX SVG attributes and srcset to valid camelCase React props', () => {
        const html = '<img src="a.png" srcset="a.png 1x, b.png 2x" crossorigin="anonymous"><svg><path stroke-width="2" stroke-linecap="round" fill-rule="evenodd" clip-rule="evenodd" vector-effect="non-scaling-stroke" /></svg>';
        const jsx = transformHtmlToJsx(html);

        assert.ok(jsx.includes('srcSet='), 'srcset must be converted to srcSet');
        assert.ok(jsx.includes('crossOrigin='), 'crossorigin must be converted to crossOrigin');
        assert.ok(jsx.includes('strokeWidth="2"'), 'stroke-width must be converted to strokeWidth');
        assert.ok(jsx.includes('strokeLinecap="round"'), 'stroke-linecap must be converted to strokeLinecap');
        assert.ok(jsx.includes('fillRule="evenodd"'), 'fill-rule must be converted to fillRule');
        assert.ok(jsx.includes('clipRule="evenodd"'), 'clip-rule must be converted to clipRule');
        assert.ok(jsx.includes('vectorEffect="non-scaling-stroke"'), 'vector-effect must be converted to vectorEffect');
    });

    it('generates Vue 3 Single File Component with standard <template>, <script setup>, and <style scoped>', () => {
        const vue = generateVueComponent('<div>Hello Vue</div>', 'TestComp');
        assert.ok(vue.includes('<template>'), 'Must contain <template>');
        assert.ok(vue.includes('<script setup>'), 'Must contain <script setup>');
        assert.ok(vue.includes('<style scoped>'), 'Must contain <style scoped>');
    });
}
