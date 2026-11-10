// Auto-generated test module
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    parseFontStyle,
    parseLineHeight,
    parseLetterSpacing,
    parseTextDecoration,
    parseTextTransform,
    parseTextAlign
} from '../../src/parsers/typography.js';

export default async function run(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };

    it('parses font weights and styles correctly', () => {
        const bold = parseFontStyle('bold', 'normal', 'Inter');
        assert.strictEqual(bold.styleName, 'Bold');
        assert.strictEqual(bold.postscript, 'Inter-Bold');

        const italic = parseFontStyle('600', 'italic', 'Roboto');
        assert.strictEqual(italic.styleName, 'Semi Bold Italic');
        assert.strictEqual(italic.postscript, 'Roboto-SemiBoldItalic');
    });
    it('parses line-height (% and px)', () => {
        const lhAuto = parseLineHeight('normal');
        assert.deepStrictEqual(lhAuto, { value: 100, units: 'PERCENT' });

        const lhPx = parseLineHeight('24px');
        assert.deepStrictEqual(lhPx, { value: 24, units: 'PIXELS' });

        const lhMult = parseLineHeight('1.5', 16);
        assert.deepStrictEqual(lhMult, { value: 24, units: 'PIXELS' });
    });
    it('parses letter-spacing and text decorations', () => {
        const ls = parseLetterSpacing('0.05em', 16);
        assert.strictEqual(ls.struct.value, 5);
        assert.strictEqual(ls.struct.units, 'PERCENT');

        assert.strictEqual(parseTextDecoration('underline'), 'UNDERLINE');
        assert.strictEqual(parseTextDecoration('line-through'), 'STRIKETHROUGH');
        assert.strictEqual(parseTextTransform('uppercase'), 'UPPER');
    });

    it('parses text-align into valid Figma TextAlignHorizontal enum values', () => {
        assert.strictEqual(parseTextAlign('center'), 'CENTER');
        assert.strictEqual(parseTextAlign('right'), 'RIGHT');
        assert.strictEqual(parseTextAlign('end'), 'RIGHT');
        assert.strictEqual(parseTextAlign('justify'), 'JUSTIFIED');
        assert.strictEqual(parseTextAlign('left'), 'LEFT');
        assert.strictEqual(parseTextAlign('start'), 'LEFT');
        assert.strictEqual(parseTextAlign('-webkit-match-parent'), 'LEFT');
        assert.strictEqual(parseTextAlign('inherit'), 'LEFT');
        assert.strictEqual(parseTextAlign(null), 'LEFT');
    });

    // 5. Image Registry & Dimensions
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
