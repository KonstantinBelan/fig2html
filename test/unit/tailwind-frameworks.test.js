// test/unit/tailwind-frameworks.test.js
import assert from 'node:assert';
import {
    convertStyleStringToJsx,
    transformHtmlToJsx,
    generateReactComponent,
    generateVueComponent,
    generateSvelteComponent
} from '../../src/decompiler/tailwind/index.js';

export default function ({ it }) {
    it('converts CSS style string to React JSX style object', () => {
        const styleStr = 'color: #3b82f6; margin-top: 16px; -webkit-background-clip: text;';
        const jsxStyle = convertStyleStringToJsx(styleStr);
        assert.ok(jsxStyle.includes('color: "#3b82f6"'));
        assert.ok(jsxStyle.includes('marginTop: "16px"'));
        assert.ok(jsxStyle.includes('WebkitBackgroundClip: "text"'));
    });

    it('transforms HTML attributes and void tags to valid React JSX', () => {
        const html = '<div class="p-4" tabindex="0"><label for="email">Email</label><input type="text" class="border"><img src="avatar.png"><hr></div>';
        const jsx = transformHtmlToJsx(html);

        assert.ok(jsx.includes('className="p-4"'));
        assert.ok(jsx.includes('tabIndex="0"'));
        assert.ok(jsx.includes('htmlFor="email"'));
        assert.ok(jsx.includes('<input type="text" className="border" />'));
        assert.ok(jsx.includes('<img src="avatar.png" />'));
        assert.ok(jsx.includes('<hr />'));
        assert.ok(!jsx.includes('class='));
        assert.ok(!jsx.includes('for='));
    });

    it('generates complete TypeScript React functional component', () => {
        const snippet = '<section class="p-8 bg-slate-900 text-white rounded-2xl"><h1 class="text-4xl font-bold">Welcome</h1></section>';
        const tsx = generateReactComponent(snippet, 'HeroSection', { typescript: true });

        assert.ok(tsx.includes("import React from 'react';"));
        assert.ok(tsx.includes('export interface HeroSectionProps {'));
        assert.ok(tsx.includes('export const HeroSection: React.FC<HeroSectionProps> = ('));
        assert.ok(tsx.includes('className="p-8 bg-slate-900 text-white rounded-2xl"'));
        assert.ok(tsx.includes('export default HeroSection;'));
    });

    it('generates clean Vue 3 Single File Component', () => {
        const snippet = '<div class="flex gap-4 p-6 bg-white rounded-xl shadow-md"><p>Hello Vue</p></div>';
        const vue = generateVueComponent(snippet, 'CardComponent');

        assert.ok(vue.includes('<template>'));
        assert.ok(vue.includes('<div class="flex gap-4 p-6 bg-white rounded-xl shadow-md">'));
        assert.ok(vue.includes('</template>'));
        assert.ok(vue.includes('<script setup>'));
    });

    it('generates clean Svelte component', () => {
        const snippet = '<button class="px-4 py-2 bg-blue-600 text-white rounded-lg">Click</button>';
        const svelte = generateSvelteComponent(snippet, 'Button');

        assert.ok(svelte.includes('<script>'));
        assert.ok(svelte.includes('export let className ='));
        assert.ok(svelte.includes('<button class="px-4 py-2 bg-blue-600 text-white rounded-lg">'));
    });
}
