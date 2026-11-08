// Auto-generated test module
const assert = require("assert");
const path = require("path");
const fs = require("fs");
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
} = require("../../src/decompiler/page-detector");
const { convertFigToHtml } = require("../../src/decompiler");
const { StylesheetManager } = require("../../src/decompiler/stylesheet");
const { generateFigFile } = require("../../src/generator");
const { parseArgs: parseReverseArgs } = require("../../cli-reverse");

module.exports = async function(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };


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

};

if (require.main === module) {
    let passed = 0, failed = 0;
    const itSync = (name, fn) => {
        try { fn(); console.log("  \x1b[32m✔\x1b[0m " + name); passed++; }
        catch (e) { failed++; console.error("  \x1b[31m✖\x1b[0m " + name + "\n    " + e.message); }
    };
    const itAsyncLocal = async (name, fn) => {
        try { await fn(); console.log("  \x1b[32m✔\x1b[0m " + name); passed++; }
        catch (e) { failed++; console.error("  \x1b[31m✖\x1b[0m " + name + "\n    " + (e.stack || e.message)); }
    };
    module.exports(itSync, itAsyncLocal).then(() => {
        console.log("\nPassed: " + passed + ", Failed: " + failed);
        if (failed > 0) process.exit(1);
    }).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
