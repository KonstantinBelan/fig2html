// test/integration/tailwind-layout.test.js
import assert from 'node:assert';
import {
    mapAutoLayoutToTailwind,
    resolveNodeTailwindClasses
} from '../../src/decompiler/tailwind/index.js';

export default function ({ it }) {
    it('translates Horizontal Auto Layout container to Flexbox classes', () => {
        const frameNode = {
            type: 'FRAME',
            stackMode: 'HORIZONTAL',
            stackSpacing: 16,
            stackPrimaryAlignItems: 'SPACE_BETWEEN',
            stackCounterAlignItems: 'CENTER',
            stackPaddingTop: 24,
            stackPaddingBottom: 24,
            stackPaddingLeft: 32,
            stackPaddingRight: 32,
            size: { x: 1200, y: 80 }
        };

        const classes = mapAutoLayoutToTailwind(frameNode);
        assert.ok(classes.includes('flex'));
        assert.ok(classes.includes('flex-row'));
        assert.ok(classes.includes('justify-between'));
        assert.ok(classes.includes('items-center'));
        assert.ok(classes.includes('gap-4'));
        assert.ok(classes.includes('py-6'));
        assert.ok(classes.includes('px-8'));
    });

    it('translates Vertical Auto Layout with Wrap', () => {
        const frameNode = {
            type: 'FRAME',
            stackMode: 'VERTICAL',
            stackWrap: 'WRAP',
            stackSpacing: 12,
            stackCounterSpacing: 24,
            stackPaddingVertical: 16,
            stackPaddingHorizontal: 16,
            size: { x: 800, y: 600 }
        };

        const classes = mapAutoLayoutToTailwind(frameNode);
        assert.ok(classes.includes('flex'));
        assert.ok(classes.includes('flex-col'));
        assert.ok(classes.includes('flex-wrap'));
        assert.ok(classes.includes('gap-3'));
        assert.ok(classes.includes('gap-x-6'));
        assert.ok(classes.includes('p-4'));
    });

    it('translates Grid container with explicit columns and gap', () => {
        const gridNode = {
            type: 'FRAME',
            isGrid: true,
            gridColumns: 3,
            gridColumnGap: 24,
            gridRowGap: 32,
            size: { x: 1200, y: 800 }
        };

        const classes = mapAutoLayoutToTailwind(gridNode);
        assert.ok(classes.includes('grid'));
        assert.ok(classes.includes('grid-cols-3'));
        assert.ok(classes.includes('gap-x-6'));
        assert.ok(classes.includes('gap-y-8'));
    });

    it('translates Auto Layout child sizing (flex-1, self-stretch, shrink-0)', () => {
        const parent = {
            type: 'FRAME',
            stackMode: 'HORIZONTAL',
            size: { x: 1000, y: 100 }
        };

        const growChild = {
            type: 'FRAME',
            layoutGrow: 1,
            layoutAlign: 'STRETCH',
            size: { x: 400, y: 100 }
        };

        const classes = mapAutoLayoutToTailwind(growChild, parent);
        assert.ok(classes.includes('flex-1'));
        assert.ok(classes.includes('self-stretch'));
    });

    it('translates absolutely positioned child inside Auto Layout', () => {
        const parent = {
            type: 'FRAME',
            stackMode: 'VERTICAL',
            size: { x: 400, y: 300 }
        };

        const absoluteBadge = {
            type: 'FRAME',
            stackPositioning: 'ABSOLUTE',
            transform: { m00: 1, m01: 0, m02: 360, m10: 0, m11: 1, m12: 16 },
            size: { x: 24, y: 24 }
        };

        const classes = mapAutoLayoutToTailwind(absoluteBadge, parent);
        assert.ok(classes.includes('absolute'));
        assert.ok(classes.includes('right-4'));
        assert.ok(classes.includes('top-4'));
    });

    it('resolves complete Tailwind utility classes via resolveNodeTailwindClasses', () => {
        const cardNode = {
            type: 'FRAME',
            name: 'Hero Card',
            stackMode: 'VERTICAL',
            stackSpacing: 16,
            stackPaddingVertical: 24,
            stackPaddingHorizontal: 24,
            cornerRadius: 16,
            fillPaints: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, visible: true }],
            strokePaints: [{ type: 'SOLID', color: { r: 0.88, g: 0.91, b: 0.94, a: 1 }, visible: true }],
            strokeWeight: 1,
            size: { x: 380, y: 400 }
        };

        const { classes, classString } = resolveNodeTailwindClasses(cardNode, null, new Map());
        assert.ok(classes.includes('flex'));
        assert.ok(classes.includes('flex-col'));
        assert.ok(classes.includes('gap-4'));
        assert.ok(classes.includes('p-6'));
        assert.ok(classes.includes('bg-white'));
        assert.ok(classes.includes('rounded-2xl'));
        assert.ok(classes.includes('border'));
        assert.ok(classes.includes('border-slate-200'));
        assert.ok(typeof classString === 'string' && classString.length > 0);
    });
}
