// test/unit/tailwind-effects.test.js
import assert from 'node:assert';
import {
    mapGradientAngleToDirection,
    mapGradientToTailwind,
    mapBlendMode,
    mapSvgIconToTailwind,
    mapFontFamily,
    mapTextNodeToTailwind,
    resolveNodeTailwindClasses
} from '../../src/decompiler/tailwind/index.js';

export default function ({ it }) {
    it('maps gradient angles to Tailwind direction utilities', () => {
        assert.strictEqual(mapGradientAngleToDirection(0), 'bg-gradient-to-t');
        assert.strictEqual(mapGradientAngleToDirection(45), 'bg-gradient-to-tr');
        assert.strictEqual(mapGradientAngleToDirection(90), 'bg-gradient-to-r');
        assert.strictEqual(mapGradientAngleToDirection(135), 'bg-gradient-to-br');
        assert.strictEqual(mapGradientAngleToDirection(180), 'bg-gradient-to-b');
        assert.strictEqual(mapGradientAngleToDirection(270), 'bg-gradient-to-l');
    });

    it('translates linear gradient paint into Tailwind stops (from, via, to)', () => {
        const linearGrad = {
            type: 'GRADIENT_LINEAR',
            transform: { m00: 0, m01: 1, m02: 0, m10: 1, m11: 0, m12: 0 },
            stops: [
                { position: 0, color: { r: 0.23, g: 0.51, b: 0.96, a: 1 } }, // Blue 500
                { position: 0.5, color: { r: 0.39, g: 0.4, b: 0.95, a: 1 } }, // Indigo 500
                { position: 1, color: { r: 0.55, g: 0.36, b: 0.96, a: 1 } }  // Violet 500
            ]
        };

        const classes = mapGradientToTailwind(linearGrad);
        assert.ok(classes.some(c => c.startsWith('bg-gradient-to-')));
        assert.ok(classes.some(c => c.startsWith('from-')));
        assert.ok(classes.some(c => c.startsWith('via-')));
        assert.ok(classes.some(c => c.startsWith('to-')));
    });

    it('translates Text node with gradient into bg-clip-text text-transparent', () => {
        const textNode = {
            type: 'TEXT',
            name: 'Hero Title',
            textData: { characters: 'Gradient Heading' },
            fillPaints: [{
                type: 'GRADIENT_LINEAR',
                transform: { m00: 0, m01: 1, m02: 0, m10: 1, m11: 0, m12: 0 },
                stops: [
                    { position: 0, color: { r: 0.23, g: 0.51, b: 0.96, a: 1 } },
                    { position: 1, color: { r: 0.55, g: 0.36, b: 0.96, a: 1 } }
                ]
            }]
        };

        const classes = mapTextNodeToTailwind(textNode);
        assert.ok(classes.includes('bg-clip-text'));
        assert.ok(classes.includes('text-transparent'));
        assert.ok(classes.some(c => c.startsWith('bg-gradient-to-')));
        assert.ok(classes.some(c => c.startsWith('from-')));
        assert.ok(classes.some(c => c.startsWith('to-')));
    });

    it('translates text truncation and line clamping', () => {
        const singleLineTruncate = {
            type: 'TEXT',
            textTruncation: 'ENDING'
        };
        const singleClasses = mapTextNodeToTailwind(singleLineTruncate);
        assert.ok(singleClasses.includes('truncate'));

        const multiLineClamp = {
            type: 'TEXT',
            textTruncation: 'ENDING',
            maxLines: 3
        };
        const multiClasses = mapTextNodeToTailwind(multiLineClamp);
        assert.ok(multiClasses.includes('line-clamp-3'));
    });

    it('translates blend modes to Tailwind mix-blend utilities', () => {
        assert.strictEqual(mapBlendMode('MULTIPLY'), 'mix-blend-multiply');
        assert.strictEqual(mapBlendMode('SCREEN'), 'mix-blend-screen');
        assert.strictEqual(mapBlendMode('OVERLAY'), 'mix-blend-overlay');
        assert.strictEqual(mapBlendMode('NORMAL'), null);
    });

    it('translates semantic list text nodes (ordered / unordered)', () => {
        const listNode = {
            type: 'TEXT',
            textData: {
                characters: 'First item\nSecond item\nThird item',
                lines: [
                    { lineType: 'ORDERED_LIST' },
                    { lineType: 'ORDERED_LIST' },
                    { lineType: 'ORDERED_LIST' }
                ]
            },
            listSpacing: 8
        };

        const classes = mapTextNodeToTailwind(listNode);
        assert.ok(classes.includes('list-decimal'));
        assert.ok(classes.includes('pl-5'));
        assert.ok(classes.includes('space-y-2'));
    });

    it('maps font families to font-sans and font-mono', () => {
        assert.strictEqual(mapFontFamily('Inter'), 'font-sans');
        assert.strictEqual(mapFontFamily('Fira Code'), 'font-mono');
        assert.strictEqual(mapFontFamily('Merriweather'), 'font-serif');
    });

    it('maps SVG icons to Tailwind dimension and text-current utilities', () => {
        const iconNode = {
            type: 'VECTOR',
            name: 'Checkmark Icon',
            size: { x: 20, y: 20 }
        };

        const classes = mapSvgIconToTailwind(iconNode);
        assert.ok(classes.includes('w-5'));
        assert.ok(classes.includes('h-5'));
        assert.ok(classes.includes('shrink-0'));
        assert.ok(classes.includes('text-current'));
    });
}
