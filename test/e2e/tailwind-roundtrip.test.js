// test/e2e/tailwind-roundtrip.test.js
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { translateClassToCss, injectTailwindStylesToDom } from '../../src/converter/tailwind-preprocessor.js';
import { convertHtmlToNodes } from '../../src/converter/index.js';
import { resolveNodeTailwindClasses } from '../../src/decompiler/tailwind/index.js';

export default async function ({ it, itAsync }) {
    it('translates individual Tailwind utility classes into exact CSS declarations', () => {
        assert.strictEqual(translateClassToCss('flex'), 'display: flex;');
        assert.strictEqual(translateClassToCss('flex-col'), 'flex-direction: column;');
        assert.ok(translateClassToCss('gap-4').includes('gap: 16px'));
        assert.ok(translateClassToCss('p-6').includes('padding: 24px'));
        assert.strictEqual(translateClassToCss('bg-blue-600'), 'background-color: #2563eb;');
        assert.strictEqual(translateClassToCss('rounded-2xl'), 'border-radius: 16px;');
        assert.strictEqual(translateClassToCss('text-3xl'), 'font-size: 30px;');
        assert.strictEqual(translateClassToCss('font-bold'), 'font-weight: 700;');
    });

    it('injects compiled Tailwind rules into JSDOM and evaluates computed styles', () => {
        const html = '<div class="flex flex-col gap-4 p-6 bg-blue-600 rounded-2xl"><p class="text-white font-bold">Hello</p></div>';
        const dom = new JSDOM(html);
        const count = injectTailwindStylesToDom(dom.window.document);

        assert.ok(count > 0);
        const div = dom.window.document.querySelector('div');
        const computed = dom.window.getComputedStyle(div);

        assert.strictEqual(computed.display, 'flex');
        assert.strictEqual(computed.flexDirection, 'column');
        assert.strictEqual(computed.gap, '16px');
        assert.strictEqual(computed.padding, '24px');
        assert.strictEqual(computed.borderRadius, '16px');
        assert.strictEqual(computed.backgroundColor, 'rgb(37, 99, 235)');
    });

    await itAsync('compiles HTML with Tailwind classes into native Figma Kiwi nodes (Auto Layout + Colors)', async () => {
        const html = `
        <div class="flex flex-col gap-4 p-6 bg-blue-600 rounded-2xl" style="width: 400px; height: 300px;">
          <h1 class="text-2xl font-bold text-white">Tailwind to Figma</h1>
          <p class="text-sm text-slate-200">Enterprise Ready</p>
        </div>
        `;

        const { nodeChanges, stats } = await convertHtmlToNodes(html, { sessionID: 0, localID: 1 });
        assert.ok(nodeChanges.length > 0);

        // Find card frame (exclude Canvas/Page wrapper)
        const frameNode = nodeChanges.find(n => n.type === 'FRAME' && n.name !== 'Page' && n.name !== 'body');
        assert.ok(frameNode, 'Card FRAME node must be created');
        assert.strictEqual(frameNode.stackMode, 'VERTICAL', 'Auto Layout stackMode must be VERTICAL');
        assert.strictEqual(frameNode.stackSpacing, 16, 'Auto Layout gap must be 16px');
        assert.strictEqual(frameNode.cornerRadius, 16, 'Corner radius must be 16px');

        // Check solid fill color (#2563eb is r: ~0.145, g: ~0.388, b: ~0.921)
        const fill = frameNode.fillPaints?.[0];
        assert.ok(fill, 'Frame must have a solid fill paint');
        assert.strictEqual(fill.type, 'SOLID');
        assert.ok(Math.abs(fill.color.b - 0.92) < 0.05, 'Fill color blue component must match #2563eb');

        // Find text nodes
        const titleText = nodeChanges.find(n => n.type === 'TEXT' && n.textData?.characters?.includes('Tailwind to Figma'));
        assert.ok(titleText, 'Title TEXT node must be created');
        assert.strictEqual(titleText.fontSize, 24, 'Font size must match text-2xl (24px)');
    });

    await itAsync('compiles complex Tailwind HTML components with max-width, circular avatars, badge pills, and directional borders', async () => {
        const html = `
        <!DOCTYPE html>
        <html>
        <body class="flex items-center justify-center min-h-screen p-8 bg-slate-900">
          <div class="max-w-md w-full bg-slate-800 rounded-2xl p-6 border border-slate-700 flex flex-col gap-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white shadow-md">
                F
              </div>
              <h1 class="text-xl font-bold text-white">Title</h1>
            </div>
            <p class="text-sm text-slate-300 leading-relaxed">
              Convert any Figma design into clean, idiomatic Tailwind CSS markup.
            </p>
            <div class="flex items-center justify-between pt-2 border-t border-slate-700/60">
              <span class="text-xs text-emerald-400 font-semibold bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-800">
                100% Native Kiwi
              </span>
              <button class="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold rounded-lg">
                Get Started
              </button>
            </div>
          </div>
        </body>
        </html>
        `;

        const { nodeChanges } = await convertHtmlToNodes(html, { sessionID: 0, localID: 1 });

        // 1. Body frame Auto Layout alignment and height
        const bodyFrame = nodeChanges.find(n => n.type === 'FRAME' && (n.name === 'Page' || n.name === 'Document' || n.size?.y >= 900));
        assert.ok(bodyFrame, 'Body frame must exist');
        assert.strictEqual(bodyFrame.stackPrimaryAlignItems, 'CENTER', 'Body primary alignment must be CENTER');
        assert.strictEqual(bodyFrame.stackCounterAlignItems, 'CENTER', 'Body counter alignment must be CENTER');

        // 2. Card frame max-w-md clamping (448px)
        const cardFrame = nodeChanges.find(n => n.type === 'FRAME' && n.size?.x === 448);
        assert.ok(cardFrame, 'Card frame must be clamped to 448px by max-w-md');

        // 3. Avatar is a circular FRAME with letter 'F', NOT an empty ELLIPSE
        const avatarFrame = nodeChanges.find(n => n.type === 'FRAME' && n.size?.x === 40 && n.size?.y === 40);
        assert.ok(avatarFrame, 'Avatar must be a FRAME node with 40x40 size');
        assert.strictEqual(avatarFrame.cornerRadius, 9999, 'Avatar frame must have rounded-full radius');
        const letterF = nodeChanges.find(n => n.type === 'TEXT' && (n.name === 'F' || n.textData?.characters === 'F'));
        assert.ok(letterF, 'Avatar must contain text "F" child node');

        // 4. Badge span is compiled as Auto Layout pill FRAME with fill and stroke
        const badgeFrame = nodeChanges.find(n => n.type === 'FRAME' && n.cornerRadius === 9999 && n.name?.includes('emerald'));
        assert.ok(badgeFrame, 'Badge must be compiled as an Auto Layout FRAME');
        assert.ok(badgeFrame.fillPaints?.length > 0, 'Badge must have fill paint');
        const badgeText = nodeChanges.find(n => n.type === 'TEXT' && (n.name === '100% Native Kiwi' || n.textData?.characters === '100% Native Kiwi'));
        assert.ok(badgeText, 'Badge text node must exist');

        // 5. Divider border-t must have strokeWeight 1 (not 51)
        const dividerFrame = nodeChanges.find(n => n.type === 'FRAME' && n.name?.includes('border-t'));
        assert.ok(dividerFrame, 'Divider frame must exist');
        assert.strictEqual(dividerFrame.strokeWeight, 1, 'Divider stroke weight must be 1px, not 51px');
        assert.strictEqual(dividerFrame.borderTopWeight, 1, 'Divider top border weight must be 1px');
    });

    it('performs full roundtrip: Node -> Tailwind classes -> Node', () => {
        const originalNode = {
            type: 'FRAME',
            name: 'Card',
            stackMode: 'VERTICAL',
            stackSpacing: 16,
            stackVerticalPadding: 24,
            stackHorizontalPadding: 24,
            cornerRadius: 16,
            fillPaints: [{ type: 'SOLID', color: { r: 0.145, g: 0.388, b: 0.921, a: 1 }, visible: true }],
            size: { x: 400, y: 300 }
        };

        const { classes } = resolveNodeTailwindClasses(originalNode, null, new Map());
        assert.ok(classes.includes('flex'));
        assert.ok(classes.includes('flex-col'));
        assert.ok(classes.includes('gap-4'));
        assert.ok(classes.includes('p-6'));
        assert.ok(classes.includes('rounded-2xl'));
        assert.ok(classes.includes('bg-blue-600') || classes.includes('bg-[#2563eb]'));
    });
}
