// Auto-generated test module
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StylesheetManager } from '../../src/decompiler/stylesheet.js';
import { convertFigToHtml } from '../../src/decompiler/index.js';
import {
    determineTextTag,
    generateFullHtmlDocument,
    renderNodeToHtml,
    detectDocumentLanguage,
    determineContainerTag,
    hasHeadingDescendant,
    getSectionAriaLabel
} from '../../src/decompiler/html.js';

export default async function run(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };


    it('deduplicates identical styles across distinct anonymous layers into single shared class', () => {
        const sm = new StylesheetManager();
        const n1 = { name: 'Frame 116047453', type: 'FRAME', size: { x: 300, y: 150 }, fillPaints: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3, a: 1 } }] };
        const n2 = { name: 'Frame 116047454', type: 'FRAME', size: { x: 300, y: 150 }, fillPaints: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3, a: 1 } }] };
        const n3 = { name: 'Frame 116047457', type: 'FRAME', size: { x: 300, y: 150 }, fillPaints: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3, a: 1 } }] };

        const c1 = sm.registerNode(n1, null, new Map());
        const c2 = sm.registerNode(n2, null, new Map());
        const c3 = sm.registerNode(n3, null, new Map());

        assert.strictEqual(c1, 'frame-116047453');
        assert.strictEqual(c2, 'frame-116047453', 'Second anonymous frame with identical styles must reuse first class');
        assert.strictEqual(c3, 'frame-116047453', 'Third anonymous frame with identical styles must reuse first class');
        assert.strictEqual(sm.uniqueRules.size, 1, 'Only one unique CSS rule should be generated');

        // Fourth element has a cleaner semantic name -> promote class name
        const nSemantic = { name: 'Feature Box', type: 'FRAME', size: { x: 300, y: 150 }, fillPaints: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3, a: 1 } }] };
        const cSemantic = sm.registerNode(nSemantic, null, new Map());
        assert.strictEqual(cSemantic, 'feature-box', 'Semantic name should promote anonymous class to clean identifier');
        assert.strictEqual(sm.uniqueRules.has('feature-box'), true);
        assert.strictEqual(sm.uniqueRules.has('frame-116047453'), false, 'Old anonymous class should be cleaned up');
    });

    it('extracts primitive spacing tokens (--space-*) into :root and substitutes in padding/margin/gap', () => {
        const sm = new StylesheetManager();
        for (let i = 0; i < 3; i++) {
            sm.registerNode({
                name: `item-${i}`,
                type: 'FRAME',
                stackMode: 'VERTICAL',
                size: { x: 200, y: 100 },
                cornerRadius: 16,
                stackVerticalPadding: 12,
                stackHorizontalPadding: 20,
                stackSpacing: 16
            }, null, new Map());
        }

        const css = sm.generateFullStylesheet('#ffffff');
        assert(css.includes('--space-3: 12px;'), ':root should declare --space-3: 12px');
        assert(css.includes('--space-4: 16px;'), ':root should declare --space-4: 16px');
        assert(css.includes('--space-5: 20px;'), ':root should declare --space-5: 20px');
        assert(css.includes('--radius-16px: 16px;'), ':root should declare --radius-16px: 16px without being overwritten by --space-4');
        assert(css.includes('border-radius: var(--radius-16px);'), 'border-radius should substitute var(--radius-16px)');
        assert(css.includes('gap: var(--space-4);'), 'itemSpacing: 16 should substitute var(--space-4)');
        assert(css.includes('padding: var(--space-3) var(--space-5);'), 'padding should substitute var(--space-3) var(--space-5)');

        const tokens = sm.exportDesignTokens();
        assert(tokens.spacing['space-4'], 'Tokens JSON should export spacing.space-4');
        assert.strictEqual(tokens.spacing['space-4'].value, '16px');
    });

    it('guarantees single <h1> per page and contextual <h2>-<h4> hierarchy while ignoring price/metrics', () => {

        const heroTitle = { name: 'Hero Title', type: 'TEXT', fontSize: 44, fontName: { family: 'Inter', style: 'Bold' }, textData: { characters: 'Future of Development' } };
        const sectionTitle = { name: 'Section Title', type: 'TEXT', fontSize: 36, fontName: { family: 'Inter', style: 'Bold' }, textData: { characters: 'Our Key Features' } };
        const priceMetric = { name: 'Price', type: 'TEXT', fontSize: 48, fontName: { family: 'Inter', style: 'Bold' }, textData: { characters: '$99 /mo' } };
        const statCounter = { name: 'Stat', type: 'TEXT', fontSize: 36, fontName: { family: 'Inter', style: 'Bold' }, textData: { characters: '100+' } };
        const cardTitle = { name: 'Card Title', type: 'TEXT', fontSize: 20, fontName: { family: 'Inter', style: 'Medium' }, textData: { characters: 'Blazing Fast Speed' } };
        const subTitle = { name: 'Widget Subtitle', type: 'TEXT', fontSize: 15, fontName: { family: 'Inter', style: 'SemiBold' }, textData: { characters: 'Version 2.0 release' } };

        const rootPage = {
            name: 'Landing Page',
            type: 'FRAME',
            size: { x: 1440, y: 2000 },
            children: [heroTitle, sectionTitle, priceMetric, statCounter, cardTitle, subTitle]
        };

        const html = generateFullHtmlDocument([rootPage], new Map());
        const h1Matches = html.match(/<h1\b/g) || [];
        assert.strictEqual(h1Matches.length, 1, 'Exactly ONE <h1> tag must exist on the entire page');
        assert(html.includes('<h1') && html.includes('Future of Development</h1>'), 'First major title should be <h1>');
        assert(html.includes('<h2') && html.includes('Our Key Features</h2>'), 'Second major title should become <h2>');
        assert(html.includes('<h3') && html.includes('Blazing Fast Speed</h3>'), 'Card title should be <h3>');
        assert(html.includes('<h4') && html.includes('Version 2.0 release</h4>'), 'Small bold subtitle should be <h4>');
        assert(!html.includes('<h1>$99 /mo</h1>'), 'Price metric must NOT become <h1>');
        assert(!html.includes('<h1>100+</h1>'), 'Counter metric must NOT become <h1>');
    });

    it('implements A11y as standard: decorative images/svg, icon button aria-labels, nav and focus-visible', () => {

        // 1. Icon-only button without text
        const closeBtn = {
            name: 'close-btn',
            type: 'FRAME',
            size: { x: 32, y: 32 },
            children: [
                { name: 'icon', type: 'VECTOR', size: { x: 16, y: 16 }, vectorData: { vectorNetworkBlob: { bytes: new Uint8Array([0, 0, 0, 0]) } } }
            ]
        };
        const btnHtml = renderNodeToHtml(closeBtn, null, new Map());
        assert(btnHtml.includes('<button type="button"'), 'Button must include type="button"');
        assert(btnHtml.includes('aria-label="Close"'), 'Icon button without text must have computed aria-label');

        // 2. Navigation container
        const navMenu = {
            name: 'nav-menu',
            type: 'FRAME',
            size: { x: 400, y: 40 },
            children: [
                { name: 'link-home', type: 'FRAME', size: { x: 60, y: 20 } }
            ]
        };
        const navHtmlRu = renderNodeToHtml(navMenu, null, new Map(), {}, { lang: 'ru' });
        assert(navHtmlRu.includes('<nav aria-label="Навигация"'), 'Russian nav container must render <nav aria-label="Навигация">');
        assert(navHtmlRu.includes('<a href="#"'), 'Navigation item named link must render <a href="#">');

        const navHtmlEn = renderNodeToHtml(navMenu, null, new Map(), {}, { lang: 'en' });
        assert(navHtmlEn.includes('<nav aria-label="Navigation"'), 'English nav container must render <nav aria-label="Navigation">');

        // 2.1 Language detection & HTML tag
        const enPage = {
            name: 'English Landing',
            type: 'FRAME',
            size: { x: 1440, y: 900 },
            children: [
                { name: 'Title', type: 'TEXT', textData: { characters: 'Welcome to our international platform' } }
            ]
        };
        const enHtml = generateFullHtmlDocument([enPage], new Map());
        assert(enHtml.includes('<html lang="en">'), 'English design should generate <html lang="en">');
        assert(enHtml.includes('<!DOCTYPE html>'));

        const ruPage = {
            name: 'Русская страница',
            type: 'FRAME',
            size: { x: 1440, y: 900 },
            children: [
                { name: 'Title', type: 'TEXT', textData: { characters: 'Добро пожаловать на наш сервис' } }
            ]
        };
        const ruHtml = generateFullHtmlDocument([ruPage], new Map());
        assert(ruHtml.includes('<html lang="ru">'), 'Russian design should generate <html lang="ru">');

        // 3. SVG vector accessible attributes
        const svgNode = {
            name: 'decor-icon',
            type: 'STAR',
            size: { x: 24, y: 24 }
        };
        const svgHtml = renderNodeToHtml(svgNode, null, new Map());
        assert(svgHtml.includes('aria-hidden="true" focusable="false"'), 'Decorative SVG must have aria-hidden and focusable="false"');

        // 4. Focus-visible in generated CSS
        const sm = new StylesheetManager();
        const css = sm.generateFullStylesheet();
        assert(css.includes(':focus-visible {'), 'Reset stylesheet must include :focus-visible for keyboard accessibility');
    });

    it('determines semantic container tags: header, footer, section, main, form', () => {

        assert.strictEqual(determineContainerTag({ name: 'Hero Section', children: [{}] }), 'section');
        assert.strictEqual(determineContainerTag({ name: 'Features Block', children: [{}] }), 'section');
        assert.strictEqual(determineContainerTag({ name: 'Pricing Section', children: [{}] }), 'section');
        assert.strictEqual(determineContainerTag({ name: 'Top Bar', children: [{}] }), 'header');
        assert.strictEqual(determineContainerTag({ name: 'Footer Links', children: [{}] }), 'footer');
        assert.strictEqual(determineContainerTag({ name: 'Subscribe Form', children: [{}] }), 'form');
        assert.strictEqual(determineContainerTag({ name: 'Main Content', children: [{}] }), 'main');
        assert.strictEqual(determineContainerTag({ name: 'Submit Button' }), 'button');

        // Nested children whose parent is not root must not be mistaken for page header or footer
        const nonRootParent = { name: 'Header', children: [], isRoot: false };
        const badgeChild = { name: 'Badge', y: 10, size: { y: 24 }, children: [{}] };
        assert.strictEqual(determineContainerTag(badgeChild, nonRootParent), 'div');

        // Single root container/wrapper must resolve to main (never footer)
        const singleChildRoot = { name: 'Page', size: { y: 1073 }, children: [], isRoot: true };
        const dashboardChild = { name: 'dashboard', y: 40, size: { y: 993 }, children: [{}] };
        singleChildRoot.children = [dashboardChild];
        assert.strictEqual(determineContainerTag(dashboardChild, singleChildRoot), 'main', 'Single root wrapper should be main, never footer');

        const jetlifeContainer = { name: 'Container', y: 12, size: { y: 12832 }, children: [{}] };
        const jetlifeRoot = { name: 'home', size: { y: 12832 }, children: [jetlifeContainer], isRoot: true };
        assert.strictEqual(determineContainerTag(jetlifeContainer, jetlifeRoot), 'main', 'Large page container should be main, never footer');

        // Multi-sibling artboard: header at top, section in middle, positional footer at bottom
        const multiRoot = { name: 'Artboard', size: { y: 1200 }, children: [], isRoot: true };
        const headerSibling = { name: 'TopBar', y: 0, size: { y: 70 }, children: [{}] };
        const contentSibling = { name: 'Hero', y: 70, size: { y: 800 }, children: [{}] };
        const footerSibling = { name: 'BottomBar', y: 950, size: { y: 250 }, children: [{}] };
        multiRoot.children = [headerSibling, contentSibling, footerSibling];

        assert.strictEqual(determineContainerTag(headerSibling, multiRoot), 'header', 'Top sibling should be header');
        assert.strictEqual(determineContainerTag(contentSibling, multiRoot), 'section', 'Middle sibling should be section');
        assert.strictEqual(determineContainerTag(footerSibling, multiRoot), 'footer', 'Bottom sibling should be positional footer');

        // Button containers must not be tagged as button
        assert.strictEqual(determineContainerTag({ name: 'btn-group', children: [{}] }), 'div', 'btn-group must not be a button');
        assert.strictEqual(determineContainerTag({ name: 'button-wrapper', children: [{}] }), 'div', 'button-wrapper must not be a button');

        // Sub-elements inside headers and footers must not nest illegal tags
        assert.strictEqual(determineContainerTag({ name: 'header-content', children: [{}] }, null, { inHeader: true }), 'div');
        assert.strictEqual(determineContainerTag({ name: 'footer-content', children: [{}] }, null, { inFooter: true }), 'div');
        assert.strictEqual(determineContainerTag({ name: 'submit-btn', children: [{}] }, null, { inButton: true }), 'div');
    });

    it('strictly conforms to W3C / WHATWG 2026-2027 semantic container guidelines: <article>, <aside>, <section aria-label>, <nav>, and clean layout divs', () => {

        // 1. Standalone self-contained compositions must be <article>
        assert.strictEqual(determineContainerTag({ name: 'card', children: [{}] }), 'article');
        assert.strictEqual(determineContainerTag({ name: 'product-card', children: [{}] }), 'article');
        assert.strictEqual(determineContainerTag({ name: 'review-card', children: [{}] }), 'article');
        assert.strictEqual(determineContainerTag({ name: 'testimonial-card', children: [{}] }), 'article');
        assert.strictEqual(determineContainerTag({ name: 'pricing-tier', children: [{}] }), 'article');
        assert.strictEqual(determineContainerTag({ name: 'slide is-cover', children: [{}] }), 'article');

        // 2. Grid, list, and multi-item wrappers must NOT be <article>
        assert.strictEqual(determineContainerTag({ name: 'cards-grid', children: [{}] }), 'div');
        assert.strictEqual(determineContainerTag({ name: 'card-list', children: [{}] }), 'div');
        assert.strictEqual(determineContainerTag({ name: 'pricing-grid', children: [{}] }), 'div');
        assert.strictEqual(determineContainerTag({ name: 'products-grid', children: [{}] }), 'div');
        assert.strictEqual(determineContainerTag({ name: 'slides-wrapper', children: [{}] }), 'div');

        // 3. Card sub-elements: header and footer inside an article
        assert.strictEqual(determineContainerTag({ name: 'card-header', children: [{}] }), 'header');
        assert.strictEqual(determineContainerTag({ name: 'card-footer', children: [{}] }), 'footer');
        assert.strictEqual(determineContainerTag({ name: 'card-body', children: [{}] }), 'div');
        assert.strictEqual(determineContainerTag({ name: 'slide-head', children: [{}] }), 'header');
        assert.strictEqual(determineContainerTag({ name: 'slide-foot', children: [{}] }), 'footer');

        // 4. Section sub-elements must NOT be nested sections
        assert.strictEqual(determineContainerTag({ name: 'hero-top', children: [{}] }), 'div');
        assert.strictEqual(determineContainerTag({ name: 'hero-inner', children: [{}] }), 'div');
        assert.strictEqual(determineContainerTag({ name: 'features-grid', children: [{}] }), 'div');

        // 5. Complementary content (<aside>)
        assert.strictEqual(determineContainerTag({ name: 'sidebar', children: [{}] }), 'aside');
        assert.strictEqual(determineContainerTag({ name: 'callout', children: [{}] }), 'aside');
        assert.strictEqual(determineContainerTag({ name: 'promo-banner', children: [{}] }), 'aside');

        // 6. Navigation landmarks: breadcrumb and pagination
        assert.strictEqual(determineContainerTag({ name: 'breadcrumbs', children: [{}] }), 'nav');
        assert.strictEqual(determineContainerTag({ name: 'pagination', children: [{}] }), 'nav');

        const breadcrumbsHtml = renderNodeToHtml({ name: 'breadcrumbs', type: 'FRAME', children: [{ name: 'link', type: 'FRAME' }] }, null, new Map());
        assert(breadcrumbsHtml.includes('<nav aria-label="Breadcrumb"'), 'Breadcrumbs should receive aria-label="Breadcrumb"');

        const paginationHtml = renderNodeToHtml({ name: 'pagination', type: 'FRAME', children: [{ name: 'link', type: 'FRAME' }] }, null, new Map());
        assert(paginationHtml.includes('<nav aria-label="Pagination"'), 'Pagination should receive aria-label="Pagination"');

        // 7. Section landmark accessible name computation (WCAG 2.2 / Axe-core)
        // 7a. Section with semantic name but without explicit heading gets aria-label
        const heroNoHeading = {
            name: 'Hero',
            type: 'FRAME',
            children: [{ name: 'logo', type: 'FRAME' }]
        };
        const heroHtml = renderNodeToHtml(heroNoHeading, null, new Map());
        assert(heroHtml.includes('<section') && heroHtml.includes('aria-label="Hero"'), 'Section without heading must get aria-label');

        // 7b. Section with explicit heading does NOT duplicate aria-label
        const heroWithHeading = {
            name: 'Hero Section',
            type: 'FRAME',
            children: [
                { name: 'hero-title', type: 'TEXT', fontSize: 36, fontName: { style: 'Bold' }, textData: { characters: 'Future Platform' } }
            ]
        };
        const heroHeadingHtml = renderNodeToHtml(heroWithHeading, null, new Map());
        assert(heroHeadingHtml.includes('<section'), 'Must be <section>');
        assert(!heroHeadingHtml.includes('aria-label="Hero Section"'), 'Section with heading should not duplicate aria-label');

        // 8. Anonymous top-level block without heading or section name remains <div>
        const rootContainer = { name: 'Root', size: { y: 2000 }, children: [], isRoot: true };
        const anonymousVisualStrip = { name: 'Frame 1597882032', y: 500, size: { y: 264 }, children: [{ name: 'logo-1' }, { name: 'logo-2' }] };
        rootContainer.children = [anonymousVisualStrip];
        assert.strictEqual(determineContainerTag(anonymousVisualStrip, rootContainer), 'div', 'Anonymous top-level block without heading must remain div');

        // 9. Interactive content boundaries: buttons and links must not contain sectioning content or articles
        assert.strictEqual(determineContainerTag({ name: 'card', children: [{}] }, null, { inButton: true }), 'div');
        assert.strictEqual(determineContainerTag({ name: 'hero-section', children: [{}] }, null, { inLink: true }), 'div');
        assert.strictEqual(determineContainerTag({ name: 'sidebar', children: [{}] }, null, { inButton: true }), 'div');
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
