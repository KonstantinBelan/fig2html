// Auto-generated test module
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    toRem,
    toEm,
    toVw,
    toVh,
    formatFluidFontSize,
    formatFluidSpacing,
    formatFluidDimension
} from '../../src/decompiler/units.js';

export default async function run(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };

    it('converts px to relative units (rem, em, vw, vh)', () => {
        assert.strictEqual(toRem(16), '1rem');
        assert.strictEqual(toRem(24), '1.5rem');
        assert.strictEqual(toRem(0), '0');
        assert.strictEqual(toEm(32, 16), '2em');
        assert.strictEqual(toEm(0), '0');
        assert.strictEqual(toVw(720, 1440), '50vw');
        assert.strictEqual(toVw(0), '0');
        assert.strictEqual(toVh(450, 900), '50vh');
        assert.strictEqual(toVh(0), '0');
    });

    it('formats fluid responsive values using clamp(), min() and max()', () => {
        const fluidFont = formatFluidFontSize(32, 1440);
        assert(fluidFont.startsWith('clamp('));
        assert(fluidFont.includes('rem'));
        assert(fluidFont.includes('vw'));

        const fluidSpacing = formatFluidSpacing(40, 1440);
        assert(fluidSpacing.startsWith('clamp('));
        assert(fluidSpacing.includes('rem'));
        assert(fluidSpacing.includes('vw'));

        const fluidContainerWidth = formatFluidDimension(1200, 1440, true);
        assert(fluidContainerWidth.startsWith('min(100%, clamp('));

        const fluidCardWidth = formatFluidDimension(300, 1440, true);
        assert(fluidCardWidth.startsWith('clamp('));

        const fluidSmall = formatFluidDimension(24, 1440, true);
        assert.strictEqual(fluidSmall, '1.5rem');
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
