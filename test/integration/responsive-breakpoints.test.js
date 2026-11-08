// Auto-generated test module
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const {
    parseBreakpointTag,
    resolveBreakpointName,
    categorizeWidth,
    normalizeBaseName,
    groupFramesIntoResponsivePages
} = require("../../src/decompiler/breakpoint-detector");
const {
    computeNodeSimilarity,
    matchChildren,
    alignBreakpointTrees
} = require("../../src/decompiler/ast-aligner");
const {
    calculateFluidClamp,
    getBreakpointMediaQuery,
    diffNodeStyles,
    synthesizeResponsiveStyles
} = require("../../src/decompiler/responsive-css");
const { convertFigToHtml } = require("../../src/decompiler");
const { StylesheetManager } = require("../../src/decompiler/stylesheet");
const { generateFigFile } = require("../../src/generator");
const { hasTransformRotation, synthesizeContainerLayout, shouldSkipLayoutSynthesis } = require("../../src/decompiler/synthesizer");
const { parseArgs: parseReverseArgs } = require("../../cli-reverse");
const { bakeMasksIntoImages, bakeImageFillsAndFilters, bakeMultiplyImages } = require("../../src/decompiler/image-optimizer");
const { parseTransformMatrix, resolveSmartAbsoluteAnchors, computeNodeStyles, hasExplicitMaskTag } = require("../../src/decompiler/css");

module.exports = async function(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };


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

    await itAsync('bakeMultiplyImages bakes raster images with MULTIPLY blend mode into genuine alpha transparency and skips non-white images', async () => {
        // 1. Create a 40x40 raster image with white background and black 20x20 center
        const testImageBuf = await sharp({
            create: {
                width: 40,
                height: 40,
                channels: 3,
                background: { r: 255, g: 255, b: 255 }
            }
        }).composite([
            {
                input: await sharp({
                    create: {
                        width: 20,
                        height: 20,
                        channels: 3,
                        background: { r: 0, g: 0, b: 0 }
                    }
                }).png().toBuffer(),
                left: 10,
                top: 10
            }
        ]).jpeg().toBuffer();

        const rawImages = new Map();
        const rawHash = 'test-logo-hash';
        rawImages.set(rawHash, { buffer: testImageBuf, mime: 'image/jpeg' });

        const node = {
            type: 'RECTANGLE',
            name: 'Logo',
            blendMode: 'MULTIPLY',
            size: { x: 40, y: 40 },
            fillPaints: [
                {
                    type: 'IMAGE',
                    blendMode: 'NORMAL',
                    image: { hash: rawHash },
                    visible: true
                }
            ]
        };

        const count = await bakeMultiplyImages(rawImages, [node]);
        assert.strictEqual(count, 1, 'Should bake 1 multiply image');
        assert.strictEqual(node.isMultiplyBaked, true, 'Node should be marked isMultiplyBaked: true');
        assert.notStrictEqual(node.fillPaints[0].image.hash, rawHash, 'Node image hash should be updated to new baked hash');

        // Verify the newly baked image has genuine alpha
        const bakedItem = rawImages.get(node.fillPaints[0].image.hash);
        assert(bakedItem, 'Baked image should be stored in rawImages map');
        const meta = await sharp(bakedItem.buffer).metadata();
        assert.strictEqual(meta.hasAlpha, true, 'Baked image must have alpha channel');
        assert.strictEqual(meta.channels, 4);

        const { data } = await sharp(bakedItem.buffer).raw().toBuffer({ resolveWithObject: true });
        // Corner pixel (0, 0): white transformed to transparent (alpha = 0)
        assert.strictEqual(data[3], 0, 'Corner pixel alpha must be 0 (fully transparent)');
        // Center pixel (20, 20): black remains opaque (alpha = 255)
        const centerIdx = (20 * 40 + 20) * 4;
        assert.strictEqual(data[centerIdx + 3], 255, 'Center pixel alpha must be 255 (opaque)');

        // 2. Protect against false positives: image with dark corners should NOT be baked
        const darkImageBuf = await sharp({
            create: {
                width: 40,
                height: 40,
                channels: 3,
                background: { r: 30, g: 30, b: 30 }
            }
        }).jpeg().toBuffer();

        const darkHash = 'test-dark-photo';
        rawImages.set(darkHash, { buffer: darkImageBuf, mime: 'image/jpeg' });
        const darkNode = {
            type: 'RECTANGLE',
            name: 'Dark Photo',
            blendMode: 'MULTIPLY',
            fillPaints: [
                {
                    type: 'IMAGE',
                    blendMode: 'NORMAL',
                    image: { hash: darkHash },
                    visible: true
                }
            ]
        };

        const darkCount = await bakeMultiplyImages(rawImages, [darkNode]);
        assert.strictEqual(darkCount, 0, 'Should not bake dark photos without white background');
        assert.strictEqual(darkNode.isMultiplyBaked, undefined);
    });

    it('handles MULTIPLY and LUMINOSITY blend modes in CSS decompilation', () => {
        // 1. When isMultiplyBaked is true, mix-blend-mode: multiply is omitted
        const bakedNode = {
            type: 'RECTANGLE',
            name: 'image 8',
            blendMode: 'MULTIPLY',
            isMultiplyBaked: true,
            size: { x: 160, y: 53 }
        };
        const sBaked = computeNodeStyles(bakedNode, { type: 'FRAME' });
        assert.strictEqual(sBaked['mix-blend-mode'], undefined, 'mix-blend-mode must be omitted when isMultiplyBaked is true');

        // 2. Normal MULTIPLY (non-baked) preserves mix-blend-mode: multiply
        const normalMult = {
            type: 'RECTANGLE',
            name: 'Multiply Box',
            blendMode: 'MULTIPLY',
            size: { x: 100, y: 100 }
        };
        const sNormal = computeNodeStyles(normalMult, { type: 'FRAME' });
        assert.strictEqual(sNormal['mix-blend-mode'], 'multiply');

        // 3. LUMINOSITY generates both mix-blend-mode: luminosity and filter: grayscale(1)
        const lumContainer = {
            type: 'FRAME',
            name: 'Frame 116047420',
            blendMode: 'LUMINOSITY',
            opacity: 0.5,
            size: { x: 160, y: 80 }
        };
        const sLum = computeNodeStyles(lumContainer, { type: 'FRAME' });
        assert.strictEqual(sLum['mix-blend-mode'], 'luminosity');
        assert.strictEqual(sLum['opacity'], '0.5');
        assert.strictEqual(sLum['filter'], 'grayscale(1)');

        // 4. Bleeding absolute child vertical range gating prevents marking far-away siblings
        const sectionContainer = {
            type: 'FRAME',
            stackMode: 'VERTICAL',
            size: { x: 1344, y: 3000 },
            children: [
                {
                    type: 'FRAME',
                    name: 'Hero',
                    transform: { m12: 0 },
                    size: { x: 1344, y: 500 },
                    children: [
                        {
                            type: 'VECTOR',
                            stackPositioning: 'ABSOLUTE',
                            transform: { m02: 100, m12: 200 },
                            size: { x: 200, y: 400 } // bottom = 0 + 200 + 400 = 600 (bleeding 100px past 500)
                        }
                    ]
                },
                {
                    type: 'FRAME',
                    name: 'Section 2',
                    transform: { m12: 520 }, // 600 > 520 -> overlaps!
                    size: { x: 1344, y: 400 }
                },
                {
                    type: 'FRAME',
                    name: 'Section 3 Far Away',
                    transform: { m12: 2000 }, // 600 is NOT > 2000 -> does not overlap!
                    size: { x: 1344, y: 400 }
                }
            ]
        };
        const sSec2 = computeNodeStyles(sectionContainer.children[1], sectionContainer);
        assert.strictEqual(sSec2['position'], 'relative', 'Section 2 overlapping bleeding child should receive position: relative');
        assert.strictEqual(sSec2['z-index'], '1');

        const sSec3 = computeNodeStyles(sectionContainer.children[2], sectionContainer);
        assert.strictEqual(sSec3['position'], undefined, 'Far-away Section 3 must not receive position: relative');
        assert.strictEqual(sSec3['z-index'], undefined);
    });

    // 35. Graphic Subtree Collapsing & Cumulative Baking Engine
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
