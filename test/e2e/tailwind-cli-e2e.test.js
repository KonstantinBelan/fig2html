// test/e2e/tailwind-cli-e2e.test.js
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertFigToHtml } from '../../src/decompiler/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const showcaseFigPath = path.resolve(__dirname, '../showcase.fig');

export default async function ({ it, itAsync }) {
    await itAsync('decompiles showcase.fig to HTML with Tailwind CSS utilities and CDN injection', async () => {
        const result = await convertFigToHtml(showcaseFigPath, {
            tailwind: true,
            tailwindVersion: 'v4',
            inlineImages: true
        });

        assert.strictEqual(result.tailwind, true);
        assert.ok(result.html.length > 0);
        assert.ok(result.html.includes('https://cdn.tailwindcss.com'), 'HTML should include Tailwind CDN script');
        // Verify Tailwind utility classes are present in output
        assert.ok(result.html.includes('class='), 'HTML must contain class attributes');
        assert.ok(
            result.html.includes('flex') || result.html.includes('grid') || result.html.includes('p-') || result.html.includes('rounded-') || result.html.includes('bg-'),
            'HTML must contain Tailwind utility classes'
        );
    });

    await itAsync('does not activate Tailwind when tailwind: false (CLI defaults) and emits no css/ in utility mode', async () => {
        const plain = await convertFigToHtml(showcaseFigPath, {
            tailwind: false,
            tailwindVersion: 'v4',
            tailwindMode: 'utility',
            framework: 'html',
            inlineImages: true
        });
        assert.strictEqual(plain.tailwind, false);
        assert.ok(!plain.html.includes('cdn.tailwindcss.com'), 'Plain mode must not inject Tailwind CDN');

        const tempDir = path.resolve(__dirname, '../temp_tailwind_no_css');
        try {
            const tw = await convertFigToHtml(showcaseFigPath, {
                tailwind: true,
                separateFiles: true,
                extractCss: true,
                outputHtmlPath: tempDir
            });
            assert.strictEqual(tw.cssPath, null);
            assert.ok(!fs.existsSync(path.join(tempDir, 'css')), 'Tailwind utility mode must not write css/');
            assert.ok(!tw.html.includes('css/style.css'), 'Tailwind utility mode must not link css/style.css');
        } finally {
            if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    await itAsync('decompiles showcase.fig to React TSX functional component with className', async () => {
        const result = await convertFigToHtml(showcaseFigPath, {
            tailwind: true,
            framework: 'react',
            componentName: 'ShowcaseCard'
        });

        assert.strictEqual(result.framework, 'react');
        assert.ok(result.componentCode, 'Must return componentCode');
        assert.ok(result.componentCode.includes("import React from 'react';"), 'Must import React');
        assert.ok(result.componentCode.includes('export interface ShowcaseCardProps'), 'Must declare TypeScript props interface');
        assert.ok(result.componentCode.includes('export const ShowcaseCard: React.FC<ShowcaseCardProps>'), 'Must export typed component');
        assert.ok(result.componentCode.includes('className='), 'Must use className instead of class');
        assert.ok(!result.componentCode.includes('class='), 'Must not use raw class attribute');
    });

    await itAsync('decompiles showcase.fig to Vue 3 Single File Component', async () => {
        const result = await convertFigToHtml(showcaseFigPath, {
            tailwind: true,
            framework: 'vue',
            componentName: 'ShowcaseVue'
        });

        assert.strictEqual(result.framework, 'vue');
        assert.ok(result.componentCode, 'Must return componentCode');
        assert.ok(result.componentCode.includes('<template>'), 'Must contain <template>');
        assert.ok(result.componentCode.includes('</template>'), 'Must contain </template>');
        assert.ok(result.componentCode.includes('<script setup>'), 'Must contain <script setup>');
    });

    await itAsync('decompiles showcase.fig to Svelte component', async () => {
        const result = await convertFigToHtml(showcaseFigPath, {
            tailwind: true,
            framework: 'svelte',
            componentName: 'ShowcaseSvelte'
        });

        assert.strictEqual(result.framework, 'svelte');
        assert.ok(result.componentCode, 'Must return componentCode');
        assert.ok(result.componentCode.includes('<script>'), 'Must contain <script>');
        assert.ok(result.componentCode.includes('export let className'), 'Must declare className prop');
    });

    await itAsync('scaffolds complete Tailwind v4 enterprise project on disk', async () => {
        const tempScaffoldDir = path.resolve(__dirname, '../temp_tailwind_e2e_scaffold');
        if (fs.existsSync(tempScaffoldDir)) {
            fs.rmSync(tempScaffoldDir, { recursive: true, force: true });
        }

        try {
            const result = await convertFigToHtml(showcaseFigPath, {
                tailwind: true,
                tailwindVersion: 'v4',
                scaffold: tempScaffoldDir
            });

            assert.strictEqual(result.scaffoldDir, tempScaffoldDir);
            assert.ok(Array.isArray(result.scaffoldFiles) && result.scaffoldFiles.length >= 3);
            assert.ok(fs.existsSync(path.join(tempScaffoldDir, 'package.json')), 'package.json must exist');
            assert.ok(fs.existsSync(path.join(tempScaffoldDir, 'src/app.css')), 'src/app.css must exist');
            assert.ok(fs.existsSync(path.join(tempScaffoldDir, 'dist/index.html')), 'dist/index.html must exist');

            const pkgJson = JSON.parse(fs.readFileSync(path.join(tempScaffoldDir, 'package.json'), 'utf8'));
            assert.ok(pkgJson.devDependencies['tailwindcss']);
            assert.ok(pkgJson.devDependencies['@tailwindcss/cli']);

            const appCss = fs.readFileSync(path.join(tempScaffoldDir, 'src/app.css'), 'utf8');
            assert.ok(appCss.includes('@import "tailwindcss";'));
        } finally {
            if (fs.existsSync(tempScaffoldDir)) {
                fs.rmSync(tempScaffoldDir, { recursive: true, force: true });
            }
        }
    });

    await itAsync('supports hybrid mode with @apply directives', async () => {
        const tempHybridDir = path.resolve(__dirname, '../temp_hybrid_e2e');
        try {
            const result = await convertFigToHtml(showcaseFigPath, {
                tailwind: true,
                tailwindMode: 'hybrid',
                extractCss: true,
                returnCss: true,
                outputHtmlPath: path.join(tempHybridDir, 'index.html')
            });

            assert.strictEqual(result.tailwind, true);
            assert.ok(result.css, 'CSS must be generated in hybrid mode');
            assert.ok(result.css.includes('@apply') || result.css.includes('@tailwind'), 'CSS must include @apply or @tailwind directives');
        } finally {
            if (fs.existsSync(tempHybridDir)) {
                fs.rmSync(tempHybridDir, { recursive: true, force: true });
            }
        }
    });
}
