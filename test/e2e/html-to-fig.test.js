// Auto-generated test module
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { decodeFigKiwiCanvas } from '@open-pencil/kiwi/fig/parse';
import { generateFigFile } from '../../src/generator.js';

export default async function run(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };

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
