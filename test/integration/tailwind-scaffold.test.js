// test/integration/tailwind-scaffold.test.js
import assert from 'node:assert';
import {
    extractFigmaVariablesTheme,
    generateTailwindV3Config,
    generateTailwindV4ThemeCss,
    generateHybridApplyStylesheet,
    generateTailwindScaffold,
    injectTailwindCdn
} from '../../src/decompiler/tailwind/index.js';

export default function ({ it }) {
    const mockVariables = [
        { name: 'Colors/Brand/Primary', type: 'COLOR', value: { r: 0.14, g: 0.38, b: 0.92, a: 1 } },
        { name: 'Colors/Neutral/Dark', type: 'COLOR', value: { r: 0.06, g: 0.09, b: 0.16, a: 1 } },
        { name: 'Spacing/Padding/Card', type: 'FLOAT', value: 24 },
        { name: 'Radius/Button', type: 'FLOAT', value: 12 },
        { name: 'Typography/Font/Display', type: 'STRING', value: 'Inter' }
    ];

    it('extracts Figma variables into structured theme data', () => {
        const theme = extractFigmaVariablesTheme(mockVariables);
        assert.ok(theme.colors['colors-brand-primary']);
        assert.ok(theme.colors['colors-neutral-dark']);
        assert.strictEqual(theme.spacing['spacing-padding-card'], '24px');
        assert.strictEqual(theme.radii['radius-button'], '12px');
        assert.strictEqual(theme.fonts['typography-font-display'], 'Inter');
    });

    it('generates valid Tailwind v3 configuration file', () => {
        const theme = extractFigmaVariablesTheme(mockVariables);
        const config = generateTailwindV3Config(theme);
        assert.ok(config.includes('module.exports = {'));
        assert.ok(config.includes('content: ['));
        assert.ok(config.includes('colors-brand-primary'));
        assert.ok(config.includes('radius-button'));
    });

    it('generates valid Tailwind v4 CSS-first @theme directive', () => {
        const theme = extractFigmaVariablesTheme(mockVariables);
        const css = generateTailwindV4ThemeCss(theme);
        assert.ok(css.includes('@import "tailwindcss";'));
        assert.ok(css.includes('@theme {'));
        assert.ok(css.includes('--color-colors-brand-primary:'));
        assert.ok(css.includes('--radius-radius-button: 12px;'));
    });

    it('generates Hybrid BEM + @apply stylesheet from CSS rule map', () => {
        const rules = {
            'btn-primary': {
                'display': 'inline-flex',
                'align-items': 'center',
                'justify-content': 'center',
                'padding': '12px 24px',
                'background-color': '#2563eb',
                'color': '#ffffff',
                'border-radius': '12px'
            },
            'card-hero': {
                'display': 'flex',
                'flex-direction': 'column',
                'gap': '16px',
                'padding': '24px',
                'background-color': '#ffffff',
                'border-radius': '16px'
            }
        };

        const css = generateHybridApplyStylesheet(rules);
        assert.ok(css.includes('@tailwind base;'));
        assert.ok(css.includes('.btn-primary {'));
        assert.ok(css.includes('@apply'));
        assert.ok(css.includes('bg-blue-600') || css.includes('bg-[#2563eb]'));
        assert.ok(css.includes('.card-hero {'));
        assert.ok(css.includes('flex flex-col gap-4 p-6'));
    });

    it('generates full project scaffolding file structure for v4', () => {
        const scaffold = generateTailwindScaffold({
            projectName: 'my-awesome-app',
            version: 'v4',
            htmlContent: '<html><head></head><body><h1>Hello</h1></body></html>'
        });

        assert.ok(scaffold['package.json']);
        assert.ok(scaffold['package.json'].includes('@tailwindcss/cli'));
        assert.ok(scaffold['src/app.css']);
        assert.ok(scaffold['src/app.css'].includes('@import "tailwindcss";'));
        assert.ok(scaffold['dist/index.html']);
        assert.ok(scaffold['dist/index.html'].includes('output.css'));
    });

    it('generates full project scaffolding file structure for v3', () => {
        const scaffold = generateTailwindScaffold({
            projectName: 'my-v3-app',
            version: 'v3',
            htmlContent: '<html><head></head><body><h1>Hello</h1></body></html>'
        });

        assert.ok(scaffold['package.json']);
        assert.ok(scaffold['package.json'].includes('tailwindcss'));
        assert.ok(scaffold['tailwind.config.js']);
        assert.ok(scaffold['postcss.config.js']);
        assert.ok(scaffold['src/input.css']);
        assert.ok(scaffold['dist/index.html']);
    });

    it('injects zero-dependency Tailwind Play CDN script for standalone HTML preview', () => {
        const rawHtml = '<!DOCTYPE html><html><head><title>Test</title></head><body><div class="p-4 bg-blue-500">Test</div></body></html>';
        const injected = injectTailwindCdn(rawHtml, { colors: { 'brand-accent': '#ff0055' } });

        assert.ok(injected.includes('https://cdn.tailwindcss.com'));
        assert.ok(injected.includes('tailwind.config = {'));
        assert.ok(injected.includes('brand-accent'));

        const fontInjected = injectTailwindCdn(rawHtml, { fontFamily: { sans: ['Poppins', 'sans-serif'] } });
        assert.ok(fontInjected.includes('tailwind.config = {'));
        assert.ok(fontInjected.includes('Poppins'));
    });
}
