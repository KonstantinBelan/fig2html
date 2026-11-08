// Auto-generated test module
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../../cli.js';
import { ProgressBar } from '../../src/utils/progress-bar.js';

export default async function run(arg1, arg2) {
    const { it, itAsync } = (arg1 && arg1.it) ? arg1 : { it: arg1, itAsync: arg2 };

    it('parses positional and flag arguments', () => {
        const opt1 = parseArgs(['index.html', 'out.fig']);
        assert.strictEqual(opt1.input, 'index.html');
        assert.strictEqual(opt1.output, 'out.fig');

        const opt2 = parseArgs(['-i', 'src.html', '-o', 'dest.fig', '-w', '-p', 'Design', '-v']);
        assert.strictEqual(opt2.input, 'src.html');
        assert.strictEqual(opt2.output, 'dest.fig');
        assert.strictEqual(opt2.watch, true);
        assert.strictEqual(opt2.page, 'Design');
        assert.strictEqual(opt2.verbose, true);
    });

    it('renders interactive progress bar updates and handles non-TTY environments cleanly', () => {
        const origWrite = process.stdout.write;
        let captured = '';
        process.stdout.write = (chunk) => { captured += chunk; return true; };
        try {
            const barTTY = new ProgressBar({ isTTY: true, width: 20 });
            barTTY.update(10, 'Step 1');
            assert.strictEqual(barTTY.current, 10);
            barTTY.update(50, 'Step 2');
            assert.strictEqual(barTTY.current, 50);
            barTTY.update(100, 'Done');
            assert.strictEqual(barTTY.current, 100);
            barTTY.stop();
            assert.strictEqual(barTTY.stopped, true);
            assert(captured.includes('10%'));
            assert(captured.includes('50%'));
            assert(captured.includes('100%'));
        } finally {
            process.stdout.write = origWrite;
        }

        // Non-TTY mode test
        const barNonTTY = new ProgressBar({ isTTY: false });
        barNonTTY.update(25, 'Milestone 25%');
        assert.strictEqual(barNonTTY.current, 25);
        barNonTTY.stop();
    });

    // 7. End-to-End Generation & Kiwi Verification
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
