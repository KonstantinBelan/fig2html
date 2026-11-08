// Auto-generated test module
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { convertFigToHtml } from '../../src/decompiler/index.js';

export default async function run(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };

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
